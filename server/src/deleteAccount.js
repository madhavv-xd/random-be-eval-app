// Removes a user and everything they own, and fixes the counters they contributed to elsewhere
// (like/comment counts on other people's posts, follower counts of people they followed).
import {
  Block, Comment, CommentLike, Conversation, Follow, FollowRequest, Highlight, Like, Message,
  Notification, Post, Report, Save, Story, StoryView, User,
} from './models.js';
import { removeFiles } from './lib.js';
import { clearCache } from './cache.js';

// Applies -1 per occurrence: [a, a, b] → a: -2, b: -1.
function decrementAll(Model, ids, field) {
  const counts = {};
  for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  const ops = Object.entries(counts).map(([_id, n]) => ({ updateOne: { filter: { _id }, update: { $inc: { [field]: -n } } } }));
  return ops.length ? Model.bulkWrite(ops) : null;
}

export async function deleteAccount(userId) {
  const me = { userId };

  // 1. My posts and everything attached to them.
  const posts = await Post.find({ authorId: userId }).lean();
  const postIds = posts.map((p) => p._id);
  const commentsOnMyPosts = await Comment.find({ postId: { $in: postIds } }).distinct('_id');
  await Promise.all([
    CommentLike.deleteMany({ commentId: { $in: commentsOnMyPosts } }),
    ...[Like, Save, Comment, Notification, Report].map((M) => M.deleteMany({ postId: { $in: postIds } })),
    Post.deleteMany({ _id: { $in: postIds } }),
  ]);

  // 2. My likes and comments on other posts (a deleted comment takes its replies with it).
  const likes = await Like.find(me).lean();
  await decrementAll(Post, likes.map((l) => String(l.postId)), 'likeCount');

  const myComments = await Comment.find(me).distinct('_id');
  const removedComments = await Comment.find({ $or: [{ _id: { $in: myComments } }, { parentId: { $in: myComments } }] }).lean();
  await decrementAll(Post, removedComments.map((c) => String(c.postId)), 'commentCount');

  const commentLikes = await CommentLike.find(me).lean();
  await decrementAll(Comment, commentLikes.map((l) => String(l.commentId)), 'likeCount');

  // 3. Follows in both directions.
  const following = await Follow.find({ followerId: userId }).lean();
  const followers = await Follow.find({ followingId: userId }).lean();
  await decrementAll(User, following.map((f) => String(f.followingId)), 'followerCount');
  await decrementAll(User, followers.map((f) => String(f.followerId)), 'followingCount');

  // 4. Delete the rest.
  const removedIds = removedComments.map((c) => c._id);
  const conversations = await Conversation.find({ members: userId }).distinct('_id');
  const stories = await Story.find({ authorId: userId }).lean();
  const highlights = await Highlight.find({ authorId: userId }).lean();
  const user = await User.findById(userId);
  await Promise.all([
    Like.deleteMany(me), Save.deleteMany(me), CommentLike.deleteMany(me),
    CommentLike.deleteMany({ commentId: { $in: removedIds } }),
    Comment.deleteMany({ _id: { $in: removedIds } }),
    Follow.deleteMany({ $or: [{ followerId: userId }, { followingId: userId }] }),
    FollowRequest.deleteMany({ $or: [{ fromId: userId }, { toId: userId }] }),
    Block.deleteMany({ $or: [{ blockerId: userId }, { blockedId: userId }] }),
    Notification.deleteMany({ $or: [{ userId }, { actorId: userId }] }),
    Story.deleteMany({ authorId: userId }), StoryView.deleteMany({ viewerId: userId }),
    Highlight.deleteMany({ authorId: userId }), Report.deleteMany({ reporterId: userId }),
    Message.deleteMany({ conversationId: { $in: conversations } }),
    Conversation.deleteMany({ _id: { $in: conversations } }),
    User.deleteOne({ _id: userId }),
  ]);
  clearCache(); // other users' cached follow lists may include this account
  await removeFiles([...posts.flatMap((p) => [p.mediaUrl, ...p.extraMedia]), ...stories.map((s) => s.mediaUrl),
    ...highlights.flatMap((h) => h.items.map((i) => i.mediaUrl)), user?.avatarUrl]);
}
