import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { Sentry } from './instrument.js';
import { auth, errorHandler, writeLimit, UPLOADS_DIR } from './lib.js';
import { cacheBackend } from './cache.js';
import { useCloudinary } from './media.js';
import { initSocket } from './socket.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import postRoutes from './routes/posts.js';
import commentRoutes from './routes/comments.js';
import socialRoutes from './routes/social.js';
import storyRoutes from './routes/stories.js';
import messageRoutes from './routes/messages.js';
import notificationRoutes from './routes/notifications.js';

// Allowed browser origins, comma-separated (e.g. "https://pulse.vercel.app"). Unset = allow any (dev).
export const CLIENT_ORIGINS = process.env.CLIENT_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
export const corsOptions = { origin: CLIENT_ORIGINS?.length ? CLIENT_ORIGINS : true };

export const app = express();
app.set('trust proxy', 1); // behind Render/Railway/Fly's proxy: req.ip is the real client IP (rate limiting)
app.use(cors(corsOptions));
app.use(express.json());
app.use((req, res, next) => { req.body ??= {}; next(); });
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d', immutable: true }));

// Uptime check for UptimeRobot / the platform's health probe. Public and cheap.
app.get('/api/health', (req, res) => {
  const db = mongoose.connection.readyState === 1;
  res.status(db ? 200 : 503).json({ ok: db, db, cache: cacheBackend, media: useCloudinary ? 'cloudinary' : 'local', uptime: Math.round(process.uptime()) });
});

app.use('/api', writeLimit);
app.use('/api', authRoutes); // register + login are public
app.use('/api', auth, userRoutes, socialRoutes, postRoutes, commentRoutes, storyRoutes, messageRoutes, notificationRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
if (process.env.SENTRY_DSN) Sentry.setupExpressErrorHandler(app); // reports 5xx errors, then passes them on
app.use(errorHandler);

export const server = createServer(app);
initSocket(server, corsOptions);
