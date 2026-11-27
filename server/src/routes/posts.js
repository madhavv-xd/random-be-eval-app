import mongoose from 'mongoose';
import { Router } from 'express';
import { Comment, CommentLike, Follow, Like, Notification, Post, Report, Save, User, followingIds } from '../models.js';
import { httpError, parseMentions, parseTags, str, toggle, upload } from '../lib.js';
import { discardUploads, removeFiles, storeFiles } from '../media.js';
import { assertCanSeePost, excludedAuthors, hiddenIds, withFollowStatus } from '../access.js';
import { cached, invalidate } from '../cache.js';
import { broadcast, notify } from '../socket.js';

const router = Router();
export const AUTHOR = 'name username avatarUrl isPrivate';
const DAY = 24 * 60 * 60 * 1000;
export const oid = (id) => new mongoose.Types.ObjectId(String(id));
const pageSize = (req) => Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 20);

// Every post list goes through this one aggregation:
//   $match → $sort → $limit → $lookup author → $lookup "did I like it" → $lookup "did I save it".
// The lookups run after $limit, so the cost is 3 indexed lookups per returned post (at most 20),
// not per matching post. Likes and saves use their { postId, userId } unique indexes.
// Note: aggregate() doesn't cast types the way find() does, so `match` must use ObjectIds and Dates.
export function findPosts(userId, { match, sort = { createdAt: -1, _id: -1 }, limit = 60 }) {
  const me = oid(userId);
  const mine = (from, as) => ({
    $lookup: { from, localField: '_id', foreignField: 'postId', as, pipeline: [{ $match: { userId: me } }, { $limit: 1 }, { $project: { _id: 1 } }] },
  });
  return Post.aggregate([
    { $match: match },
    { $sort: sort },
    { $limit: limit },
    { $lookup: { from: 'users', localField: 'authorId', foreignField: '_id', as: 'authorId', pipeline: [{ $project: { name: 1, username: 1, avatarUrl: 1, isPrivate: 1 } }] } },
    { $unwind: '$authorId' },
    mine('likes', 'myLike'),
    mine('saves', 'mySave'),
    { $addFields: { likedByMe: { $gt: [{ $size: '$myLike' }, 0] }, savedByMe: { $gt: [{ $size: '$mySave' }, 0] } } },
    { $project: { myLike: 0, mySave: 0, __v: 0 } },
  ]);
}

// Cursor pagination. The cursor is "<createdAt ISO>_<_id>" of the last post you received.
// Sorting and filtering on (createdAt, _id) means two posts created in the same millisecond can't be
// skipped or repeated at a page edge, and each page is an index range scan instead of a skip().
export const encodeCursor = (post) => `${new Date(post.createdAt).toISOString()}_${post._id}`;
export function cursorFilter(cursor) {
  const [iso, id] = String(cursor).split('_');
  const date = new Date(iso);
  if (isNaN(date) || (id && !mongoose.isValidObjectId(id))) throw httpError(400, 'Invalid cursor');
  if (!id) return { createdAt: { $lt: date } }; // plain date cursor (older clients)
  return { $or: [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: oid(id) } }] };
}

async function page(req, match) {
  const limit = pageSize(req);
  if (req.query.cursor) match = { $and: [match, cursorFilter(req.query.cursor)] };
  const posts = await findPosts(req.userId, { match, limit });
  return { posts, nextCursor: posts.length === limit ? encodeCursor(posts.at(-1)) : null };
}

// Post ids in the order they were given (aggregate + $in returns them in index order).
async function hydrate(userId, ids) {
  const order = new Map(ids.map((id, i) => [String(id), i]));
  const posts = await findPosts(userId, { match: { _id: { $in: ids } }, limit: ids.length || 1 });
  return posts.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
}

// Cache keys that go stale when `authorId` posts or deletes: every follower's feeds, and the author's own.
export async function feedKeysFor(authorId) {
  const followers = await Follow.find({ followingId: authorId }).distinct('followerId');
  return [...followers, authorId].flatMap((id) => [`ranked:${id}`, `feed:${id}`]);
}

// "For you": posts from people I follow (and mine) in the last 14 days, ranked by engagement with a time decay
// (Hacker News style): score = (likes + 2 × comments + 1) / (ageHours + 2)^1.5
// The ranked id list is cached per user for 2 minutes, so paging through it stays stable while scores move.
// It's invalidated when someone I follow posts.
function rankedIds(userId) {
  return cached(`ranked:${userId}`, 120_000, async () => {
    const rows = await Post.aggregate([
      { $match: { authorId: { $in: [...(await followingIds(userId)), oid(userId)] }, createdAt: { $gt: new Date(Date.now() - 14 * DAY) } } },
      { $addFields: { ageHours: { $divide: [{ $subtract: ['$$NOW', '$createdAt'] }, 3_600_000] } } },
      { $addFields: { score: { $divide: [{ $add: ['$likeCount', { $multiply: ['$commentCount', 2] }, 1] }, { $pow: [{ $add: ['$ageHours', 2] }, 1.5] }] } } },
      { $sort: { score: -1 } },
      { $limit: 200 },
      { $project: { _id: 1 } },
    ]);
    return rows.map((r) => r._id);
  });
}

// Finds a post the current user is allowed to see (404 otherwise, so private posts don't leak).
export async function findVisiblePost(id, userId) {
  const post = await Post.findById(id);
  if (!post) throw httpError(404, 'Post not found');
  await assertCanSeePost(userId, post);
  return post;
}

const findOne = async (postId, userId) => (await findPosts(userId, { match: { _id: oid(postId) }, limit: 1 }))[0];

// Sends a "mention" notification to every @username in the text, except `skip` (already notified).
export async function notifyMentions(text, actorId, postId, skip = []) {
  const users = await User.find({ username: { $in: parseMentions(text) } }).select('_id');
  const skipSet = new Set(skip.map(String));
  await Promise.all(users
    .filter((u) => !skipSet.has(String(u._id)))
    .map((u) => notify({ userId: u._id, actorId, type: 'mention', postId })));
}

// Fan-out on read: build the feed at request time from "who I follow" (see README).
// ?sort=ranked switches to the "For you" ranking; its cursor is an offset into the cached ranked list.
router.get('/feed', async (req, res) => {
  if (req.query.sort === 'ranked') {
    const ids = await rankedIds(req.userId);
    const limit = pageSize(req);
    const offset = Math.max(parseInt(req.query.cursor) || 0, 0);
    const posts = await hydrate(req.userId, ids.slice(offset, offset + limit));
    return res.json({ posts, nextCursor: offset + limit < ids.length ? String(offset + limit) : null });
  }

  const authors = { authorId: { $in: [...(await followingIds(req.userId)), oid(req.userId)] } };
  if (req.query.cursor) return res.json(await page(req, authors));

  // First page: the hottest read in the app (every app open, every pull-to-refresh).
  // The ids of the newest 20 posts are cached for 30s per user and invalidated when anyone they follow posts.
  // Only ids are cached: counts and "liked by me" are looked up fresh, so they're never stale.
  const limit = pageSize(req);
  const ids = await cached(`feed:${req.userId}`, 30_000, async () =>
    (await Post.find(authors).sort({ createdAt: -1, _id: -1 }).limit(20).select('_id').lean()).map((p) => p._id));
  const posts = await hydrate(req.userId, ids.slice(0, limit));
  res.json({ posts, nextCursor: posts.length === limit ? encodeCursor(posts.at(-1)) : null });
});
router.get('/explore', async (req, res) => {
  res.json(await page(req, { authorId: { $nin: await excludedAuthors(req.userId) } }));
});
router.get('/reels', async (req, res) => {
  res.json(await page(req, { mediaType: 'video', authorId: { $nin: await excludedAuthors(req.userId) } }));
});
router.get('/tags/:tag', async (req, res) => {
  res.json(await page(req, { tags: req.params.tag.toLowerCase(), authorId: { $nin: await excludedAuthors(req.userId) } }));
});

// Most used tags in the last 7 days. Same answer for everyone, so it's cached globally for 5 minutes.
router.get('/explore/trending', async (req, res) => {
  const tags = await cached('trending', 5 * 60_000, () => Post.aggregate([
    { $match: { createdAt: { $gt: new Date(Date.now() - 7 * DAY) } } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 10 },
  ]));
  res.json({ tags: tags.map((t) => ({ tag: t._id, count: t.count })) });
});

router.get('/saved', async (req, res) => {
  const postIds = await Save.find({ userId: req.userId }).distinct('postId');
  res.json({ posts: await findPosts(req.userId, { match: { _id: { $in: postIds }, authorId: { $nin: await hiddenIds(req.userId) } } }) });
});

// Up to 10 images (carousel) or exactly 1 video.
router.post('/posts', upload('media', ['image', 'video'], 10), async (req, res) => {
  const files = req.files ?? [];
  const hasVideo = files.some((f) => f.mimetype.startsWith('video/'));
  if (!files.length || (hasVideo && files.length > 1)) {
    await discardUploads(files);
    throw httpError(400, files.length ? 'A video post can only contain that one video' : 'Please attach an image or video');
  }
  const caption = str(req.body.caption);
  const urls = await storeFiles(files);
  const post = await Post.create({
    authorId: req.userId,
    caption,
    location: str(req.body.location).slice(0, 60),
    tags: parseTags(caption),
    mediaUrl: urls[0],
    mediaType: hasVideo ? 'video' : 'image',
    extraMedia: urls.slice(1),
  });
  // Fan-out of the *invalidation* (not the post): my followers' cached feeds are now stale.
  await invalidate(...(await feedKeysFor(req.userId)));
  await notifyMentions(caption, req.userId, post._id);
  res.status(201).json({ post: await findOne(post._id, req.userId) });
});

router.get('/posts/:id', async (req, res) => {
  const post = await findVisiblePost(req.params.id, req.userId);
  res.json({ post: await findOne(post._id, req.userId) });
});

router.patch('/posts/:id', async (req, res) => {
  const post = await findVisiblePost(req.params.id, req.userId);
  if (!post.authorId.equals(req.userId)) throw httpError(403, 'You can only edit your own posts');
  post.caption = str(req.body.caption);
  if (req.body.location !== undefined) post.location = str(req.body.location).slice(0, 60);
  post.tags = parseTags(post.caption);
  post.editedAt = new Date();
  await post.save(); // ponytail: no mention notifications on edit, to avoid re-notifying people
  res.json({ post: await findOne(post._id, req.userId) });
});

router.delete('/posts/:id', async (req, res) => {
  const post = await findVisiblePost(req.params.id, req.userId);
  if (!post.authorId.equals(req.userId)) throw httpError(403, 'You can only delete your own posts');
  const postId = post._id;
  const commentIds = await Comment.find({ postId }).distinct('_id');
  await Promise.all([
    post.deleteOne(),
    CommentLike.deleteMany({ commentId: { $in: commentIds } }),
    ...[Like, Save, Comment, Notification, Report].map((Model) => Model.deleteMany({ postId })),
  ]);
  await Promise.all([removeFiles([post.mediaUrl, ...post.extraMedia]), invalidate(...(await feedKeysFor(post.authorId)))]);
  res.json({ ok: true });
});

router.post('/posts/:id/like', async (req, res) => {
  const post = await findVisiblePost(req.params.id, req.userId);
  const liked = await toggle(Like, { postId: post._id, userId: req.userId });
  const { likeCount } = await Post.findByIdAndUpdate(post._id, { $inc: { likeCount: liked ? 1 : -1 } }, { new: true });
  broadcast('post:liked', { postId: post._id, likeCount });
  if (liked) await notify({ userId: post.authorId, actorId: req.userId, type: 'like', postId: post._id });
  res.json({ liked, likeCount });
});

// Who liked this post (newest first), with follow buttons.
router.get('/posts/:id/likes', async (req, res) => {
  const post = await findVisiblePost(req.params.id, req.userId);
  const hidden = await hiddenIds(req.userId);
  const likes = await Like.find({ postId: post._id, userId: { $nin: hidden } }).sort({ _id: -1 }).limit(100).populate('userId', AUTHOR);
  res.json({ users: await withFollowStatus(likes.map((l) => l.userId), req.userId) });
});

router.post('/posts/:id/save', async (req, res) => {
  const post = await findVisiblePost(req.params.id, req.userId);
  res.json({ saved: await toggle(Save, { postId: post._id, userId: req.userId }) });
});

router.post('/posts/:id/report', async (req, res) => {
  const post = await findVisiblePost(req.params.id, req.userId);
  const reason = str(req.body.reason);
  if (!['spam', 'inappropriate', 'harassment', 'other'].includes(reason)) throw httpError(400, 'Pick a reason');
  await Report.updateOne({ reporterId: req.userId, postId: post._id }, { reason }, { upsert: true });
  res.json({ ok: true });
});

export default router;
