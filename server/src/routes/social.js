// Follows, follow requests (private accounts) and blocking.
import { Router } from 'express';
import { Block, Follow, FollowRequest, User } from '../models.js';
import { httpError } from '../lib.js';
import { canSeeContent, withFollowStatus } from '../access.js';
import { notify } from '../socket.js';
import { invalidate } from '../cache.js';
import { AUTHOR } from './posts.js';

const router = Router();

// A changed follow makes the follower's cached "who I follow" and "For you" lists stale.
const invalidateFeed = (userId) => invalidate(`following:${userId}`, `ranked:${userId}`);

async function follow(followerId, followingId) {
  await Follow.create({ followerId, followingId });
  invalidateFeed(followerId);
  await User.updateOne({ _id: followerId }, { $inc: { followingCount: 1 } });
  await User.updateOne({ _id: followingId }, { $inc: { followerCount: 1 } });
}

// Returns true if there was a follow to remove.
async function unfollow(followerId, followingId) {
  if (!(await Follow.findOneAndDelete({ followerId, followingId }))) return false;
  invalidateFeed(followerId);
  await User.updateOne({ _id: followerId }, { $inc: { followingCount: -1 } });
  await User.updateOne({ _id: followingId }, { $inc: { followerCount: -1 } });
  return true;
}

export async function acceptRequest(request) {
  await FollowRequest.deleteOne({ _id: request._id });
  await follow(request.fromId, request.toId);
  await notify({ userId: request.fromId, actorId: request.toId, type: 'follow_accept' });
}

// Toggle: following → unfollow; requested → cancel; otherwise follow (or request, if the account is private).
router.post('/users/:id/follow', async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target || (await Block.exists({ blockerId: target._id, blockedId: req.userId }))) throw httpError(404, 'User not found');
  if (target._id.equals(req.userId)) throw httpError(400, "You can't follow yourself");
  if (await Block.exists({ blockerId: req.userId, blockedId: target._id })) throw httpError(400, 'Unblock them first');

  let status;
  if (await unfollow(req.userId, target._id)) status = 'none';
  else if (await FollowRequest.findOneAndDelete({ fromId: req.userId, toId: target._id })) status = 'none';
  else if (target.isPrivate) {
    await FollowRequest.create({ fromId: req.userId, toId: target._id });
    await notify({ userId: target._id, actorId: req.userId, type: 'follow_request' });
    status = 'requested';
  } else {
    await follow(req.userId, target._id);
    await notify({ userId: target._id, actorId: req.userId, type: 'follow' });
    status = 'following';
  }
  const { followerCount } = await User.findById(target._id);
  res.json({ status, followerCount });
});

// Remove someone who follows you.
router.delete('/users/:id/follower', async (req, res) => {
  await unfollow(req.params.id, req.userId);
  res.json({ ok: true });
});

router.get('/follow-requests', async (req, res) => {
  const requests = await FollowRequest.find({ toId: req.userId }).sort({ createdAt: -1 }).populate('fromId', AUTHOR);
  res.json({ requests });
});

router.post('/follow-requests/:id/:action', async (req, res) => {
  if (!['accept', 'decline'].includes(req.params.action)) throw httpError(404, 'Not found');
  const request = await FollowRequest.findOne({ _id: req.params.id, toId: req.userId });
  if (!request) throw httpError(404, 'Request not found');
  if (req.params.action === 'accept') await acceptRequest(request);
  else await request.deleteOne();
  res.json({ ok: true });
});

// Followers / following lists. Private accounts only show them to followers.
for (const [path, match, field] of [['followers', 'followingId', 'followerId'], ['following', 'followerId', 'followingId']]) {
  router.get(`/users/:id/${path}`, async (req, res) => {
    const owner = await User.findById(req.params.id);
    if (!owner || !(await canSeeContent(req.userId, owner))) throw httpError(403, 'This account is private');
    // ponytail: first 200 only; paginate with a cursor if lists get long.
    const rows = await Follow.find({ [match]: owner._id }).sort({ _id: -1 }).limit(200).populate(field, AUTHOR);
    const users = rows.map((r) => r[field]).filter(Boolean);
    res.json({ users: await withFollowStatus(users, req.userId) });
  });
}

// Toggle block. Blocking also removes follows and follow requests in both directions.
router.post('/users/:id/block', async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) throw httpError(404, 'User not found');
  if (target._id.equals(req.userId)) throw httpError(400, "You can't block yourself");

  if (await Block.findOneAndDelete({ blockerId: req.userId, blockedId: target._id })) return res.json({ blocked: false });
  await Block.create({ blockerId: req.userId, blockedId: target._id });
  await unfollow(req.userId, target._id);
  await unfollow(target._id, req.userId);
  await FollowRequest.deleteMany({ $or: [{ fromId: req.userId, toId: target._id }, { fromId: target._id, toId: req.userId }] });
  res.json({ blocked: true });
});

router.get('/blocks', async (req, res) => {
  const blocks = await Block.find({ blockerId: req.userId }).populate('blockedId', AUTHOR);
  res.json({ users: blocks.map((b) => b.blockedId).filter(Boolean) });
});

export default router;
