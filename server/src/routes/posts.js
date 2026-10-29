import mongoose from 'mongoose';
import { Router } from 'express';
import { Comment, CommentLike, Follow, Like, Notification, Post, Report, Save, User, followingIds } from '../models.js';
import { fileUrl, httpError, parseMentions, parseTags, removeFiles, str, toggle, upload } from '../lib.js';
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
export function findPosts(userId, { match, sort = { createdAt: -1 }, limit = 60 }) {
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

// Cursor pagination: cursor = createdAt of the last post you received.
// ponytail: posts sharing the exact same millisecond can be skipped at a page edge; use (createdAt, _id) as the cursor if that matters.
async function page(req, match) {
  const limit = pageSize(req);
  if (req.query.cursor) {
    const cursor = new Date(req.query.cursor);
    if (isNaN(cursor)) throw httpError(400, 'Invalid cursor');
    match.createdAt = { $lt: cursor };
  }
  const posts = await findPosts(req.userId, { match, limit });
  return { posts, nextCursor: posts.length === limit ? posts.at(-1).createdAt : null };
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
    const slice = ids.slice(offset, offset + limit);
    const order = new Map(slice.map((id, i) => [String(id), i]));
    const posts = (await findPosts(req.userId, { match: { _id: { $in: slice } }, limit }))
      .sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
    return res.json({ posts, nextCursor: offset + limit < ids.length ? String(offset + limit) : null });
  }
  res.json(await page(req, { authorId: { $in: [...(await followingIds(req.userId)), oid(req.userId)] } }));
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
    await removeFiles(files.map(fileUrl));
    throw httpError(400, files.length ? 'A video post can only contain that one video' : 'Please attach an image or video');
  }
  const caption = str(req.body.caption);
  const post = await Post.create({
    authorId: req.userId,
    caption,
    location: str(req.body.location).slice(0, 60),
    tags: parseTags(caption),
    mediaUrl: fileUrl(files[0]),
    mediaType: hasVideo ? 'video' : 'image',
    extraMedia: files.slice(1).map(fileUrl),
  });
  // My followers' cached "For you" lists are now stale.
  const followers = await Follow.find({ followingId: req.userId }).distinct('followerId');
  invalidate(...[...followers, req.userId].map((id) => `ranked:${id}`));
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
  await removeFiles([post.mediaUrl, ...post.extraMedia]);
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
