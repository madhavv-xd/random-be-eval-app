import { Router } from 'express';
import { Conversation, Message, User } from '../models.js';
import { httpError, str } from '../lib.js';
import { isBlocked } from '../access.js';
import { emitTo } from '../socket.js';

const router = Router();
const keyOf = (a, b) => [String(a), String(b)].sort().join(':');

// Find-or-create the single conversation between two users.
const conversationBetween = (a, b) => Conversation.findOneAndUpdate(
  { key: keyOf(a, b) },
  { $setOnInsert: { members: [a, b] } },
  { upsert: true, new: true },
);

// Shape a conversation for one viewer: who the other person is and their own unread count.
function forViewer(convo, userId) {
  const get = (map, key) => (map instanceof Map ? map.get(key) : map?.[key]);
  const other = convo.members.find((m) => String(m._id ?? m) !== String(userId));
  return {
    _id: convo._id,
    other,
    lastMessage: convo.lastMessage?.body ? convo.lastMessage : null,
    unread: get(convo.unread, String(userId)) ?? 0,
    otherReadAt: get(convo.readAt, String(other?._id ?? other)) ?? null,
    updatedAt: convo.updatedAt,
  };
}

export async function unreadTotal(userId) {
  const convos = await Conversation.find({ members: userId }).select('unread').lean();
  return convos.reduce((sum, c) => sum + (c.unread?.[String(userId)] ?? 0), 0);
}

// Used by DMs and by story replies.
export async function sendMessage({ from, to, body, storyMediaUrl }) {
  body = str(body);
  if (!body || body.length > 1000) throw httpError(400, 'Message must be 1-1000 characters');
  if (await isBlocked(from, to)) throw httpError(403, "You can't message this account");

  const convo = await conversationBetween(from, to);
  const message = await Message.create({ conversationId: convo._id, senderId: from, body, storyMediaUrl });
  await Conversation.updateOne({ _id: convo._id }, {
    $inc: { [`unread.${to}`]: 1 },
    $set: { lastMessage: { body, senderId: from, createdAt: message.createdAt }, [`readAt.${from}`]: message.createdAt },
  });
  const sender = await User.findById(from).select('name username avatarUrl');
  // Both sides get it: the recipient's tabs, and the sender's other tabs.
  emitTo([from, to], 'message:new', { ...message.toObject(), sender });
  return message;
}

async function findMyConversation(id, userId) {
  const convo = await Conversation.findOne({ _id: id, members: userId }).populate('members', 'name username avatarUrl');
  if (!convo) throw httpError(404, 'Conversation not found');
  return convo;
}

router.get('/conversations', async (req, res) => {
  const convos = await Conversation.find({ members: req.userId, 'lastMessage.body': { $exists: true } })
    .sort({ 'lastMessage.createdAt': -1 }).limit(50).populate('members', 'name username avatarUrl').lean();
  const conversations = convos.map((c) => forViewer(c, req.userId)).filter((c) => c.other);
  res.json({ conversations, unreadMessages: conversations.reduce((sum, c) => sum + c.unread, 0) });
});

// Open (or create) a chat with someone: { userId }.
router.post('/conversations', async (req, res) => {
  const other = await User.findById(req.body.userId);
  if (!other || other._id.equals(req.userId)) throw httpError(400, 'Pick someone to message');
  if (await isBlocked(req.userId, other._id)) throw httpError(403, "You can't message this account");
  const convo = await conversationBetween(req.userId, other._id);
  res.json({ conversation: { _id: convo._id } });
});

// Latest 30 messages, or 30 older than ?before=<createdAt> for "load older".
router.get('/conversations/:id/messages', async (req, res) => {
  const convo = await findMyConversation(req.params.id, req.userId);
  const filter = { conversationId: convo._id };
  if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };
  const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(30).lean();
  res.json({
    conversation: forViewer(convo, req.userId),
    messages: messages.reverse(),
    hasMore: messages.length === 30,
  });
});

router.post('/conversations/:id/messages', async (req, res) => {
  const convo = await findMyConversation(req.params.id, req.userId);
  const other = convo.members.find((m) => !m._id.equals(req.userId));
  if (!other) throw httpError(404, 'This account no longer exists');
  res.status(201).json({ message: await sendMessage({ from: req.userId, to: other._id, body: req.body.body }) });
});

// Mark read: clears my unread count and tells the other person (for their "Seen" label).
router.patch('/conversations/:id/read', async (req, res) => {
  const convo = await findMyConversation(req.params.id, req.userId);
  const readAt = new Date();
  await Conversation.updateOne({ _id: convo._id }, { $set: { [`unread.${req.userId}`]: 0, [`readAt.${req.userId}`]: readAt } });
  const other = convo.members.find((m) => !m._id.equals(req.userId));
  if (other) emitTo([other._id], 'conversation:read', { conversationId: convo._id, readAt });
  res.json({ unreadMessages: await unreadTotal(req.userId) });
});

export default router;
