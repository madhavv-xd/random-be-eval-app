import { Router } from 'express';
import { FollowRequest, Notification } from '../models.js';
import { hiddenIds } from '../access.js';
import { unreadTotal } from './messages.js';
import { cursorFilter, encodeCursor } from './posts.js';

const router = Router();

// Cursor-paginated (20 per page, same (createdAt, _id) cursor as the feeds).
// Served by the { userId, createdAt, _id } index.
router.get('/notifications', async (req, res) => {
  let filter = { userId: req.userId, actorId: { $nin: await hiddenIds(req.userId) } };
  if (req.query.cursor) filter = { $and: [filter, cursorFilter(req.query.cursor)] };
  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .populate('actorId', 'name username avatarUrl')
      .populate('postId', 'mediaUrl mediaType'),
    Notification.countDocuments({ userId: req.userId, isRead: false }),
  ]);
  res.json({
    notifications: notifications.filter((n) => n.actorId),
    nextCursor: notifications.length === 20 ? encodeCursor(notifications.at(-1)) : null,
    unreadCount,
  });
});

// Mark one notification read (when it's clicked).
router.patch('/notifications/:id/read', async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, userId: req.userId }, { isRead: true });
  res.json({ unreadCount: await Notification.countDocuments({ userId: req.userId, isRead: false }) });
});

router.patch('/notifications/read-all', async (req, res) => {
  await Notification.updateMany({ userId: req.userId, isRead: false }, { isRead: true });
  res.json({ ok: true });
});

// Badge numbers for the navbar, fetched once after login (then kept live over Socket.io).
router.get('/counts', async (req, res) => {
  const [notifications, messages, requests] = await Promise.all([
    Notification.countDocuments({ userId: req.userId, isRead: false }),
    unreadTotal(req.userId),
    FollowRequest.countDocuments({ toId: req.userId }),
  ]);
  res.json({ notifications, messages, requests });
});

export default router;
