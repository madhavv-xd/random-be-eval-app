import { Router } from 'express';
import { Comment, CommentLike, Post } from '../models.js';
import { httpError, str, toggle } from '../lib.js';
import { hiddenIds } from '../access.js';
import { broadcast, notify } from '../socket.js';
import { AUTHOR, findVisiblePost, notifyMentions } from './posts.js';

const router = Router();

// Flat list (oldest first); the client nests replies under their parentId.
router.get('/posts/:id/comments', async (req, res) => {
  const post = await findVisiblePost(req.params.id, req.userId);
  const comments = await Comment.find({ postId: post._id, userId: { $nin: await hiddenIds(req.userId) } })
    .sort({ createdAt: 1 }).limit(300).populate('userId', AUTHOR).lean();
  const liked = new Set((await CommentLike.find({
    userId: req.userId, commentId: { $in: comments.map((c) => c._id) },
  }).distinct('commentId')).map(String));
  res.json({ comments: comments.map((c) => ({ ...c, likedByMe: liked.has(String(c._id)) })) });
});

router.post('/posts/:id/comments', async (req, res) => {
  const body = str(req.body.body);
  if (!body || body.length > 500) throw httpError(400, 'Comment must be 1-500 characters');
  const post = await findVisiblePost(req.params.id, req.userId);

  let parent = null;
  if (req.body.parentId) {
    parent = await Comment.findOne({ _id: req.body.parentId, postId: post._id });
    if (!parent) throw httpError(404, 'The comment you replied to is gone');
    if (parent.parentId) parent = await Comment.findById(parent.parentId); // keep replies one level deep
  }

  const comment = await Comment.create({ postId: post._id, userId: req.userId, body, parentId: parent?._id ?? null });
  const { commentCount } = await Post.findByIdAndUpdate(post._id, { $inc: { commentCount: 1 } }, { new: true });
  await comment.populate('userId', AUTHOR);
  broadcast('comment:new', { postId: post._id, commentCount });

  await notify({ userId: post.authorId, actorId: req.userId, type: 'comment', postId: post._id });
  if (parent && !parent.userId.equals(post.authorId)) {
    await notify({ userId: parent.userId, actorId: req.userId, type: 'reply', postId: post._id });
  }
  await notifyMentions(body, req.userId, post._id, [post.authorId, parent?.userId].filter(Boolean));

  res.status(201).json({ comment: { ...comment.toObject(), likedByMe: false }, commentCount });
});

// The comment's author or the post's author can delete it. Deleting a comment also deletes its replies.
router.delete('/comments/:id', async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) throw httpError(404, 'Comment not found');
  const post = await Post.findById(comment.postId);
  if (!comment.userId.equals(req.userId) && !post?.authorId.equals(req.userId)) {
    throw httpError(403, 'You can only delete your own comments');
  }
  const ids = [comment._id, ...(await Comment.find({ parentId: comment._id }).distinct('_id'))];
  await Promise.all([Comment.deleteMany({ _id: { $in: ids } }), CommentLike.deleteMany({ commentId: { $in: ids } })]);
  const updated = await Post.findByIdAndUpdate(comment.postId, { $inc: { commentCount: -ids.length } }, { new: true });
  broadcast('comment:deleted', { postId: comment.postId, commentCount: updated?.commentCount ?? 0 });
  res.json({ removedIds: ids, commentCount: updated?.commentCount ?? 0 });
});

router.post('/comments/:id/like', async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) throw httpError(404, 'Comment not found');
  await findVisiblePost(comment.postId, req.userId);
  const liked = await toggle(CommentLike, { commentId: comment._id, userId: req.userId });
  const { likeCount } = await Comment.findByIdAndUpdate(comment._id, { $inc: { likeCount: liked ? 1 : -1 } }, { new: true });
  if (liked) await notify({ userId: comment.userId, actorId: req.userId, type: 'comment_like', postId: comment.postId });
  res.json({ liked, likeCount });
});

export default router;
