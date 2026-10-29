import { createServer } from 'node:http';
import express from 'express';
import { auth, errorHandler, writeLimit, UPLOADS_DIR } from './lib.js';
import { initSocket } from './socket.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import postRoutes from './routes/posts.js';
import commentRoutes from './routes/comments.js';
import socialRoutes from './routes/social.js';
import storyRoutes from './routes/stories.js';
import messageRoutes from './routes/messages.js';
import notificationRoutes from './routes/notifications.js';

export const app = express();
app.use(express.json());
app.use((req, res, next) => { req.body ??= {}; next(); });
app.use('/uploads', express.static(UPLOADS_DIR));

app.use('/api', writeLimit);
app.use('/api', authRoutes); // register + login are public
app.use('/api', auth, userRoutes, socialRoutes, postRoutes, commentRoutes, storyRoutes, messageRoutes, notificationRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

export const server = createServer(app);
initSocket(server);
