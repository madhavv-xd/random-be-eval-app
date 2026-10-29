import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Block, FollowRequest, Highlight, Post, User, followingIds } from '../models.js';
import { fileUrl, httpError, str, upload } from '../lib.js';
import { canSeeContent, excludedAuthors, hiddenIds, withFollowStatus } from '../access.js';
import { deleteAccount } from '../deleteAccount.js';
import { findPosts } from './posts.js';
import { acceptRequest } from './social.js';

const router = Router();

// Must be registered before /users/:username so "suggestions" isn't treated as a username.
router.get('/users/suggestions', async (req, res) => {
  const exclude = [...(await followingIds(req.userId)), ...(await hiddenIds(req.userId)), req.userId];
  const users = await User.find({ _id: { $nin: exclude } }).sort({ followerCount: -1 }).limit(6);
  res.json({ users: await withFollowStatus(users, req.userId) });
});

router.patch('/users/me', upload('avatar', ['image']), async (req, res) => {
  const update = {};
  if (req.body.name !== undefined) {
    update.name = str(req.body.name);
    if (!update.name || update.name.length > 50) throw httpError(400, 'Name must be 1-50 characters');
  }
  if (req.body.bio !== undefined) {
    update.bio = str(req.body.bio);
    if (update.bio.length > 160) throw httpError(400, 'Bio must be 160 characters or less');
  }
  if (req.body.isPrivate !== undefined) update.isPrivate = req.body.isPrivate === true || req.body.isPrivate === 'true';
  if (req.files?.[0]) update.avatarUrl = fileUrl(req.files[0]);

  const user = await User.findByIdAndUpdate(req.userId, update, { new: true });
  // Going public accepts everyone who was waiting.
  if (update.isPrivate === false) {
    for (const request of await FollowRequest.find({ toId: req.userId })) await acceptRequest(request);
  }
  res.json({ user: await User.findById(user._id) });
});

router.patch('/users/me/password', async (req, res) => {
  const user = await User.findById(req.userId).select('+passwordHash');
  if (!(await bcrypt.compare(String(req.body.currentPassword ?? ''), user.passwordHash))) {
    throw httpError(400, 'Current password is wrong');
  }
  const next = String(req.body.newPassword ?? '');
  if (next.length < 6) throw httpError(400, 'New password must be at least 6 characters');
  user.passwordHash = await bcrypt.hash(next, 10);
  await user.save();
  res.json({ ok: true });
});

router.delete('/users/me', async (req, res) => {
  const user = await User.findById(req.userId).select('+passwordHash');
  if (!user || !(await bcrypt.compare(String(req.body.password ?? ''), user.passwordHash))) {
    throw httpError(400, 'Wrong password');
  }
  await deleteAccount(user._id);
  res.json({ ok: true });
});

router.get('/users/:username', async (req, res) => {
  const user = await User.findOne({ username: req.params.username.toLowerCase() });
  // If they blocked me, they don't exist as far as I'm concerned.
  if (!user || (await Block.exists({ blockerId: user._id, blockedId: req.userId }))) throw httpError(404, 'User not found');

  const blockedByMe = !!(await Block.exists({ blockerId: req.userId, blockedId: user._id }));
  const canSee = await canSeeContent(req.userId, user);
  const [[withStatus], posts, highlights] = await Promise.all([
    withFollowStatus([user], req.userId),
    // ponytail: profile grid capped at 60 posts; reuse the cursor pager if profiles get bigger.
    canSee ? findPosts(req.userId, { match: { authorId: user._id }, limit: 60 }) : [],
    canSee ? Highlight.find({ authorId: user._id }).sort({ createdAt: 1 }) : [],
  ]);
  res.json({
    user,
    followStatus: withStatus.followStatus,
    blockedByMe,
    isLocked: !canSee,
    posts,
    highlights,
  });
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ?type=user (default) | post (caption or location) | hashtag (prefix match, with post counts).
// ponytail: case-insensitive regex scans; switch to a text/Atlas Search index past ~100k documents.
router.get('/search', async (req, res) => {
  const type = req.query.type ?? 'user';
  const q = str(req.query.q).replace(/^[#@]/, '').slice(0, 50);
  if (!q) return res.json({ users: [], posts: [], tags: [] });
  const re = new RegExp(escapeRegex(q), 'i');

  if (type === 'post') {
    const match = { $or: [{ caption: re }, { location: re }], authorId: { $nin: await excludedAuthors(req.userId) } };
    return res.json({ posts: await findPosts(req.userId, { match, limit: 30 }) });
  }
  if (type === 'hashtag') {
    const prefix = new RegExp(`^${escapeRegex(q.toLowerCase())}`);
    const tags = await Post.aggregate([
      { $match: { tags: prefix } },
      { $unwind: '$tags' },
      { $match: { tags: prefix } },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);
    return res.json({ tags: tags.map((t) => ({ tag: t._id, count: t.count })) });
  }
  const users = await User.find({ $or: [{ username: re }, { name: re }], _id: { $nin: await hiddenIds(req.userId) } }).limit(20);
  res.json({ users });
});

export default router;
