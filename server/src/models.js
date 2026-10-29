import mongoose from 'mongoose';
import { cached } from './cache.js';

const { Schema, model } = mongoose;
const ref = (name, extra = {}) => ({ type: Schema.Types.ObjectId, ref: name, required: true, ...extra });
const pairIndex = (schema, a, b) => schema.index({ [a]: 1, [b]: 1 }, { unique: true });

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 50 },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  avatarUrl: { type: String, default: '' },
  bio: { type: String, default: '', maxlength: 160 },
  isPrivate: { type: Boolean, default: false },
  followerCount: { type: Number, default: 0 },
  followingCount: { type: Number, default: 0 },
}, {
  timestamps: true,
  // Never leak credentials or emails in API responses.
  toJSON: { transform: (doc, ret) => { delete ret.passwordHash; delete ret.email; return ret; } },
});
export const User = model('User', userSchema);

const followSchema = new Schema({ followerId: ref('User'), followingId: ref('User') });
pairIndex(followSchema, 'followerId', 'followingId');
export const Follow = model('Follow', followSchema);

// Pending follows for private accounts. Accepting one turns it into a Follow.
const followRequestSchema = new Schema({ fromId: ref('User'), toId: ref('User', { index: true }), createdAt: { type: Date, default: Date.now } });
pairIndex(followRequestSchema, 'fromId', 'toId');
export const FollowRequest = model('FollowRequest', followRequestSchema);

const blockSchema = new Schema({ blockerId: ref('User'), blockedId: ref('User', { index: true }) });
pairIndex(blockSchema, 'blockerId', 'blockedId');
export const Block = model('Block', blockSchema);

export const Post = model('Post', new Schema({
  authorId: ref('User', { index: true }),
  caption: { type: String, default: '', maxlength: 2200 },
  mediaUrl: { type: String, required: true }, // cover (first item)
  mediaType: { type: String, enum: ['image', 'video'], required: true },
  extraMedia: { type: [String], default: [] }, // more images for carousel posts
  location: { type: String, default: '', maxlength: 60 },
  tags: { type: [String], index: true },
  likeCount: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
  editedAt: Date,
  createdAt: { type: Date, default: Date.now, index: true },
}));

const likeSchema = new Schema({ postId: ref('Post'), userId: ref('User') });
pairIndex(likeSchema, 'postId', 'userId');
export const Like = model('Like', likeSchema);

const saveSchema = new Schema({ postId: ref('Post'), userId: ref('User') });
pairIndex(saveSchema, 'postId', 'userId');
export const Save = model('Save', saveSchema);

export const Comment = model('Comment', new Schema({
  postId: ref('Post', { index: true }),
  userId: ref('User'),
  parentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null }, // replies are one level deep
  body: { type: String, required: true, trim: true, maxlength: 500 },
  likeCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
}));

const commentLikeSchema = new Schema({ commentId: ref('Comment'), userId: ref('User') });
pairIndex(commentLikeSchema, 'commentId', 'userId');
export const CommentLike = model('CommentLike', commentLikeSchema);

// TTL index: MongoDB deletes each story ~24h after createdAt.
export const Story = model('Story', new Schema({
  authorId: ref('User'),
  mediaUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: '24h' },
}));

const storyViewSchema = new Schema({ storyId: ref('Story'), viewerId: ref('User'), createdAt: { type: Date, default: Date.now, expires: '24h' } });
pairIndex(storyViewSchema, 'storyId', 'viewerId');
export const StoryView = model('StoryView', storyViewSchema);

// Highlights copy the story media, because the stories themselves expire.
export const Highlight = model('Highlight', new Schema({
  authorId: ref('User', { index: true }),
  title: { type: String, required: true, trim: true, maxlength: 30 },
  items: [{ mediaUrl: String, createdAt: Date }],
  createdAt: { type: Date, default: Date.now },
}));

// 1:1 chats. `key` is the two sorted user ids, so each pair has exactly one conversation.
// `unread` and `readAt` are keyed by user id: unread badge counts and "Seen" receipts.
export const Conversation = model('Conversation', new Schema({
  key: { type: String, required: true, unique: true },
  members: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], index: true },
  lastMessage: { body: String, senderId: Schema.Types.ObjectId, createdAt: Date },
  unread: { type: Map, of: Number, default: {} },
  readAt: { type: Map, of: Date, default: {} },
}, { timestamps: true }));

export const Message = model('Message', new Schema({
  conversationId: ref('Conversation', { index: true }),
  senderId: ref('User'),
  body: { type: String, required: true, trim: true, maxlength: 1000 },
  storyMediaUrl: String, // set when the message is a reply to a story
  createdAt: { type: Date, default: Date.now },
}));

export const Notification = model('Notification', new Schema({
  userId: ref('User', { index: true }),
  type: {
    type: String,
    required: true,
    enum: ['like', 'comment', 'reply', 'mention', 'comment_like', 'follow', 'follow_request', 'follow_accept'],
  },
  actorId: ref('User'),
  postId: { type: Schema.Types.ObjectId, ref: 'Post' },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}));

const reportSchema = new Schema({
  reporterId: ref('User'),
  postId: ref('Post'),
  reason: { type: String, enum: ['spam', 'inappropriate', 'harassment', 'other'], required: true },
  createdAt: { type: Date, default: Date.now },
});
pairIndex(reportSchema, 'reporterId', 'postId');
export const Report = model('Report', reportSchema);

// Read on almost every request (feed, stories, suggestions), so it's cached for 60s.
// social.js invalidates it whenever a follow is created or removed.
export const followingIds = (userId) =>
  cached(`following:${userId}`, 60_000, () => Follow.find({ followerId: userId }).distinct('followingId'));
