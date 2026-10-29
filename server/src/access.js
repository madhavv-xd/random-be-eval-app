// All privacy and blocking rules live here, so every route applies them the same way.
import { Block, Follow, FollowRequest, User, followingIds } from './models.js';
import { httpError } from './lib.js';

// Users I blocked plus users who blocked me: the two sides never see each other.
export async function hiddenIds(userId) {
  const blocks = await Block.find({ $or: [{ blockerId: userId }, { blockedId: userId }] }).lean();
  return blocks.map((b) => (String(b.blockerId) === String(userId) ? b.blockedId : b.blockerId));
}

export const isBlocked = (a, b) => Block.exists({ $or: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] });

// Authors to leave out of public lists (explore, reels, tags): blocked either way, or private and not followed.
// ponytail: loads every private account id on each request; precompute it if private accounts become common.
export async function excludedAuthors(userId) {
  const [hidden, following] = await Promise.all([hiddenIds(userId), followingIds(userId)]);
  const privateIds = await User.find({ isPrivate: true, _id: { $nin: [...following, userId] } }).distinct('_id');
  return [...hidden, ...privateIds];
}

// Can the viewer see this user's posts, stories, highlights and follower lists?
export async function canSeeContent(viewerId, owner) {
  if (String(owner._id) === String(viewerId)) return true;
  if (await isBlocked(viewerId, owner._id)) return false;
  return !owner.isPrivate || !!(await Follow.exists({ followerId: viewerId, followingId: owner._id }));
}

export async function assertCanSeePost(viewerId, post) {
  const author = await User.findById(post.authorId);
  if (!author || !(await canSeeContent(viewerId, author))) throw httpError(404, 'Post not found');
}

// Adds followStatus ('following' | 'requested' | 'none') to a list of users, using 2 queries.
export async function withFollowStatus(users, viewerId) {
  const ids = users.map((u) => u._id);
  const [following, requested] = await Promise.all([
    Follow.find({ followerId: viewerId, followingId: { $in: ids } }).distinct('followingId'),
    FollowRequest.find({ fromId: viewerId, toId: { $in: ids } }).distinct('toId'),
  ]);
  const has = (list, id) => list.some((x) => x.equals(id));
  return users.map((u) => ({
    ...(u.toJSON?.() ?? u),
    followStatus: has(following, u._id) ? 'following' : has(requested, u._id) ? 'requested' : 'none',
  }));
}
