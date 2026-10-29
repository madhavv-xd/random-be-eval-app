import { Router } from 'express';
import { Highlight, Story, StoryView, User, followingIds } from '../models.js';
import { fileUrl, httpError, str, upload } from '../lib.js';
import { canSeeContent } from '../access.js';
import { sendMessage } from './messages.js';

const router = Router();
const DAY = 24 * 60 * 60 * 1000;

async function findStory(id) {
  const story = await Story.findById(id);
  if (!story || story.createdAt < Date.now() - DAY) throw httpError(404, 'This story has expired');
  return story;
}

// Stories from me + people I follow, grouped per author: mine first, then unseen, then seen.
router.get('/stories', async (req, res) => {
  const stories = await Story.find({
    authorId: { $in: [req.userId, ...(await followingIds(req.userId))] },
    createdAt: { $gt: new Date(Date.now() - DAY) }, // TTL cleanup runs ~every 60s, so filter too
  }).sort({ createdAt: 1 }).populate('authorId', 'name username avatarUrl').lean();

  const viewed = new Set((await StoryView.find({ viewerId: req.userId, storyId: { $in: stories.map((s) => s._id) } })
    .distinct('storyId')).map(String));

  const groups = Object.values(Object.groupBy(stories, (s) => String(s.authorId._id))).map((items) => {
    const mine = String(items[0].authorId._id) === req.userId;
    const withSeen = items.map((s) => ({ ...s, viewed: mine || viewed.has(String(s._id)) }));
    return { author: items[0].authorId, stories: withSeen, allViewed: withSeen.every((s) => s.viewed), mine };
  });
  groups.sort((a, b) => b.mine - a.mine || a.allViewed - b.allViewed);
  res.json({ groups });
});

router.post('/stories', upload('media', ['image']), async (req, res) => {
  if (!req.files?.[0]) throw httpError(400, 'Please attach an image');
  const story = await Story.create({ authorId: req.userId, mediaUrl: fileUrl(req.files[0]) });
  res.status(201).json({ story });
});

router.post('/stories/:id/view', async (req, res) => {
  const story = await findStory(req.params.id);
  if (!story.authorId.equals(req.userId)) {
    await StoryView.updateOne({ storyId: story._id, viewerId: req.userId }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  }
  res.json({ ok: true });
});

router.get('/stories/:id/viewers', async (req, res) => {
  const story = await findStory(req.params.id);
  if (!story.authorId.equals(req.userId)) throw httpError(403, 'Only the author can see viewers');
  const views = await StoryView.find({ storyId: story._id }).sort({ createdAt: -1 }).populate('viewerId', 'name username avatarUrl');
  res.json({ viewers: views.filter((v) => v.viewerId).map((v) => ({ user: v.viewerId, viewedAt: v.createdAt })) });
});

// Replying to a story sends a DM that shows the story thumbnail.
router.post('/stories/:id/reply', async (req, res) => {
  const story = await findStory(req.params.id);
  if (story.authorId.equals(req.userId)) throw httpError(400, "You can't reply to your own story");
  const author = await User.findById(story.authorId);
  if (!(await canSeeContent(req.userId, author))) throw httpError(404, 'This story has expired');
  await sendMessage({ from: req.userId, to: story.authorId, body: req.body.body, storyMediaUrl: story.mediaUrl });
  res.status(201).json({ ok: true });
});

// --- Highlights: saved copies of my stories, shown on my profile ---

router.get('/highlights', async (req, res) => {
  res.json({ highlights: await Highlight.find({ authorId: req.userId }).sort({ createdAt: 1 }) });
});

async function myStoryItem(storyId, userId) {
  const story = await findStory(storyId);
  if (!story.authorId.equals(userId)) throw httpError(403, 'You can only highlight your own stories');
  return { mediaUrl: story.mediaUrl, createdAt: story.createdAt };
}

// New highlight from a story: { title, storyId }
router.post('/highlights', async (req, res) => {
  const title = str(req.body.title);
  if (!title || title.length > 30) throw httpError(400, 'Title must be 1-30 characters');
  const item = await myStoryItem(req.body.storyId, req.userId);
  res.status(201).json({ highlight: await Highlight.create({ authorId: req.userId, title, items: [item] }) });
});

// Add a story to an existing highlight: { storyId }
router.post('/highlights/:id/items', async (req, res) => {
  const highlight = await Highlight.findOne({ _id: req.params.id, authorId: req.userId });
  if (!highlight) throw httpError(404, 'Highlight not found');
  const item = await myStoryItem(req.body.storyId, req.userId);
  if (highlight.items.some((i) => i.mediaUrl === item.mediaUrl)) throw httpError(409, 'Already in this highlight');
  highlight.items.push(item);
  await highlight.save();
  res.json({ highlight });
});

router.delete('/highlights/:id', async (req, res) => {
  const { deletedCount } = await Highlight.deleteOne({ _id: req.params.id, authorId: req.userId });
  if (!deletedCount) throw httpError(404, 'Highlight not found');
  res.json({ ok: true });
});

export default router;
