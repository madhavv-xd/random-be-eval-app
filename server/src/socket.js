import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './lib.js';
import { Conversation, Notification } from './models.js';
import { isBlocked } from './access.js';

let io;

export function initSocket(server) {
  io = new Server(server);
  // Same JWT as the REST API, sent in the handshake: io({ auth: { token } }).
  io.use((socket, next) => {
    try {
      socket.userId = jwt.verify(socket.handshake.auth.token, JWT_SECRET).id;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });
  io.on('connection', (socket) => {
    // One private room per user; every open tab of that user joins it.
    socket.join(`user:${socket.userId}`);

    // "typing…" indicator: relay to the other member of the conversation.
    socket.on('typing', async ({ conversationId } = {}) => {
      const convo = await Conversation.findOne({ _id: conversationId, members: socket.userId }).catch(() => null);
      const other = convo?.members.find((m) => !m.equals(socket.userId));
      if (other) emitTo([other], 'typing', { conversationId, userId: socket.userId });
    });
  });
}

export function emitTo(userIds, event, payload) {
  for (const id of userIds) io?.to(`user:${id}`).emit(event, payload);
}

// Live like/comment counts go to every connected client; each card updates if it shows that post.
// Payloads carry only ids and counts, never comment text, so private posts don't leak.
// ponytail: global broadcast; switch to per-post rooms (join while a post is on screen) at real traffic.
export function broadcast(event, payload) {
  io?.emit(event, payload);
}

export async function notify({ userId, actorId, type, postId }) {
  if (String(userId) === String(actorId)) return; // no notifications for your own actions
  if (await isBlocked(userId, actorId)) return;
  const notification = await Notification.create({ userId, actorId, type, postId });
  await notification.populate([
    { path: 'actorId', select: 'name username avatarUrl' },
    { path: 'postId', select: 'mediaUrl mediaType' },
  ]);
  emitTo([userId], 'notification:new', notification);
}
