import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { redis } from './cache.js';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
export const JWT_SECRET = process.env.JWT_SECRET || 'pulse-dev-secret';
export const UPLOADS_DIR = path.resolve(import.meta.dirname, '../uploads');

export const signToken = (userId) => jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
export const httpError = (status, message) => Object.assign(new Error(message), { status });
export const str = (v) => (typeof v === 'string' ? v.trim() : '');

// "#Sunset at the #beach" → ['sunset', 'beach']
export const parseTags = (text) =>
  [...new Set([...text.matchAll(/#([\p{L}\p{N}_]{1,50})/gu)].map((m) => m[1].toLowerCase()))].slice(0, 30);
// "thanks @leo and @aria.p" → ['leo', 'aria.p']
export const parseMentions = (text) =>
  [...new Set([...text.matchAll(/@([a-z0-9_]+(?:\.[a-z0-9_]+)*)/gi)].map((m) => m[1].toLowerCase()))].slice(0, 20);

export function auth(req, res, next) {
  try {
    req.userId = jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT_SECRET).id;
    next();
  } catch {
    next(httpError(401, 'Please log in'));
  }
}

// Shared by like / save / comment-like: delete the doc if it exists, otherwise create it.
// Returns the new state (true = now liked/saved).
export async function toggle(Model, doc) {
  if (await Model.findOneAndDelete(doc)) return false;
  await Model.create(doc);
  return true;
}

// Fixed-window rate limit for writes (POST/PATCH/DELETE), keyed by user when logged in, else by IP.
// General writes: 120/min. Spam-prone actions (post, like, follow, comment): 30/min each.
// With REDIS_URL the counters live in Redis (INCR + PEXPIRE), so every API instance shares them.
const hits = new Map();
async function hit(key, windowMs) {
  if (redis) {
    const count = await redis.incr(key);
    if (count === 1) await redis.pexpire(key, windowMs);
    return count;
  }
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  return ++entry.count;
}

const STRICT = /^\/(posts(\/[^/]+\/(like|comments))?|users\/[^/]+\/follow)$/;
const whoIs = (req) => {
  try {
    return jwt.verify(req.headers.authorization?.replace('Bearer ', ''), JWT_SECRET).id;
  } catch {
    return req.ip;
  }
};

export async function writeLimit(req, res, next) {
  if (req.method === 'GET' || req.method === 'OPTIONS') return next();
  try {
    const who = whoIs(req);
    const minute = 60_000;
    const strict = STRICT.test(req.path) && req.method === 'POST';
    const [all, action] = await Promise.all([
      hit(`rl:${who}`, minute),
      strict ? hit(`rl:${who}:${req.path.replace(/[0-9a-f]{24}/g, ':id')}`, minute) : 0,
    ]);
    if (all > 120 || action > 30) {
      res.set('Retry-After', '60');
      return next(httpError(429, 'Too many requests, slow down a little'));
    }
  } catch {
    // Rate limiter unavailable (e.g. Redis blip): let the request through rather than fail it.
  }
  next();
}

// Uploaded files land in req.files (always an array).
export const upload = (field, kinds, maxCount = 1) => multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => kinds.includes(file.mimetype.split('/')[0])
    ? cb(null, true)
    : cb(httpError(400, `Only ${kinds.join(' or ')} files are allowed`)),
}).array(field, maxCount);


// Every error leaves the API as { error: "message" }.
export function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message;
  if (err.name === 'CastError') [status, message] = [400, 'Invalid id'];
  if (err.name === 'ValidationError') status = 400;
  if (err.name === 'MulterError') [status, message] = [400, err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Too many files' : err.message];
  if (err.code === 11000) [status, message] = [409, `That ${Object.keys(err.keyValue)[0]} is already taken`];
  if (status >= 500) {
    console.error(err);
    message = 'Something went wrong';
  }
  res.status(status).json({ error: message });
}
