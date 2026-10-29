import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import multer from 'multer';

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

// ponytail: in-memory fixed window per IP; resets on restart and isn't shared between processes.
// Use express-rate-limit with a Redis store if this ever runs on more than one instance.
const hits = new Map();
export function writeLimit(req, res, next) {
  if (req.method === 'GET') return next();
  const now = Date.now();
  const entry = hits.get(req.ip);
  if (!entry || now > entry.resetAt) hits.set(req.ip, { count: 1, resetAt: now + 60_000 });
  else if (++entry.count > 120) return next(httpError(429, 'Too many requests, slow down a little'));
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

export const fileUrl = (file) => `/uploads/${file.filename}`;

// Deletes local uploads (remote seed URLs are ignored).
export const removeFiles = (urls) => Promise.all(urls
  .filter((u) => u?.startsWith('/uploads/'))
  .map((u) => fs.unlink(path.join(UPLOADS_DIR, path.basename(u))).catch(() => {})));

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
