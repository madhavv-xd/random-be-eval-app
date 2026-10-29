import { Router } from 'express';
import { FollowRequest, Notification } from '../models.js';
import { hiddenIds } from '../access.js';
import { unreadTotal } from './messages.js';

const router = Router();

// Cursor-paginated (20 per page, cursor = createdAt of the last one you got).
router.get('/notifications', async (req, res) => {
  const filter = { userId: req.userId, actorId: { $nin: await hiddenIds(req.userId) } };
  if (req.query.cursor) filter.createdAt = { $lt: new Date(req.query.cursor) };
  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('actorId', 'name username avatarUrl')
      .populate('postId', 'mediaUrl mediaType'),
    Notification.countDocuments({ userId: req.userId, isRead: false }),
  ]);
  res.json({
    notifications: notifications.filter((n) => n.actorId),
    nextCursor: notifications.length === 20 ? notifications.at(-1).createdAt : null,
    unreadCount,
  });
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
