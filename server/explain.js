// Proves the hot queries use indexes: prints the winning plan and docs examined vs returned.
// `npm run explain -w server` (uses MONGO_URI if set, otherwise a seeded in-memory DB).
import mongoose from 'mongoose';
import { connectDB } from './src/db.js';
import { seed } from './src/seed.js';
import { Follow, Notification, Post, User, Comment } from './src/models.js';

const inMemory = await connectDB();
if (inMemory) await seed();
await Promise.all([Post, Notification, Comment].map((m) => m.syncIndexes()));

const maya = await User.findOne({ username: 'maya' });
const following = await Follow.find({ followerId: maya._id }).distinct('followingId');
const anyPost = await Post.findOne();

const stages = (plan) => {
  const out = [];
  for (let p = plan; p; p = p.inputStage ?? p.inputStages?.[0]) out.push(p.indexName ? `${p.stage}(${p.indexName})` : p.stage);
  return out.join(' ← ');
};

const queries = [
  ['feed (following, newest first)', Post.find({ authorId: { $in: [...following, maya._id] } }).sort({ createdAt: -1, _id: -1 }).limit(10)],
  ['explore (everyone, newest first)', Post.find({}).sort({ createdAt: -1, _id: -1 }).limit(10)],
  ['tag page', Post.find({ tags: 'travel' }).sort({ createdAt: -1, _id: -1 }).limit(10)],
  ['notifications list', Notification.find({ userId: maya._id }).sort({ createdAt: -1, _id: -1 }).limit(20)],
  ['unread badge count', Notification.find({ userId: maya._id, isRead: false })],
  ['comments for a post', Comment.find({ postId: anyPost._id }).sort({ createdAt: 1 })],
];

console.log(`${'query'.padEnd(34)} ${'examined'.padStart(9)} ${'returned'.padStart(9)}  plan`);
for (const [name, query] of queries) {
  const { executionStats: s, queryPlanner } = await query.explain('executionStats');
  console.log(`${name.padEnd(34)} ${String(s.totalDocsExamined).padStart(9)} ${String(s.nReturned).padStart(9)}  ${stages(queryPlanner.winningPlan)}`);
}
await mongoose.disconnect();
process.exit(0);
