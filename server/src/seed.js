import path from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
  Block, Comment, CommentLike, Conversation, Follow, FollowRequest, Highlight, Like, Message,
  Notification, Post, Report, Save, Story, StoryView, User,
} from './models.js';
import { parseTags } from './lib.js';

// Royalty-free media: photos from picsum.photos (Unsplash licence), portraits from randomuser.me,
// clips from MDN's CC0 samples and test-videos.co.uk (Blender Foundation, CC BY).
const photo = (seed, w = 900, h = 1125) => `https://picsum.photos/seed/pulse-${seed}/${w}/${h}`;
const VIDEOS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4',
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4',
];

// [name, username, bio, portrait, private?]
const PEOPLE = [
  ['Maya Chen', 'maya', 'Film photographer · chasing golden hour', 'women/44', false],
  ['Leo Hart', 'leo', 'Climber, coffee, code.', 'men/32', false],
  ['Aria Patel', 'aria', 'Plant person 🌿 ceramics on weekends', 'women/68', false],
  ['Kai Nakamura', 'kai', 'Skating through the city', 'men/75', false],
  ['Zoe Martin', 'zoe', 'Travel & food diaries', 'women/12', false],
  ['Sam Rivera', 'sam', 'Making music, mostly at night 🔒', 'men/46', true],
];
const CAPTIONS = [
  'Sunday light hits different #goldenhour #film', 'Found this spot by accident #travel', 'New week, new plans ☕ #coffee',
  'Can’t stop thinking about this view #travel #mountains', 'Small moments, big mood #film', 'Took the long way home with @leo #citylife',
  'Weekend recap ✨ #weekend', 'Colors of the season #autumn #goldenhour', 'Back at it #climbing', 'One more from last trip, thanks @aria #travel',
];
const LOCATIONS = ['Lisbon, Portugal', 'Kyoto, Japan', 'Brooklyn, NY', 'Cape Town', 'Reykjavík', 'Bali'];
const COMMENTS = ['This is stunning 😍', 'Where is this??', 'Love the colors', 'Need to go here', 'So good!', 'Frame this 🔥', 'Wow'];

const HOUR = 60 * 60 * 1000;
const ago = (hours) => new Date(Date.now() - hours * HOUR);

export async function seed() {
  await Promise.all([
    User, Follow, FollowRequest, Block, Post, Like, Save, Comment, CommentLike,
    Story, StoryView, Highlight, Conversation, Message, Notification, Report,
  ].map((M) => M.deleteMany({})));

  const passwordHash = await bcrypt.hash('password123', 10);
  const users = await User.insertMany(PEOPLE.map(([name, username, bio, avatar, isPrivate]) => ({
    name, username, bio, isPrivate, passwordHash,
    email: `${username}@pulse.dev`,
    avatarUrl: `https://randomuser.me/api/portraits/${avatar}.jpg`,
  })));
  const [maya, leo, aria, , , sam] = users;

  // Everyone follows the next 3 people in the list, so each user has 3 followers and 3 following.
  // Maya doesn't follow Sam (private), so his profile shows as locked until she requests and he accepts.
  const follows = users.flatMap((u, i) => [1, 2, 3].map((k) => ({ followerId: u._id, followingId: users[(i + k) % users.length]._id })));
  await Follow.insertMany(follows);
  await User.updateMany({}, { followerCount: 3, followingCount: 3 });
  await FollowRequest.create({ fromId: leo._id, toId: sam._id, createdAt: ago(3) });

  // 4 photos per user (every 4th one a 3-photo carousel) + 5 videos, spread over the last ~6 days.
  const postDocs = [];
  for (let round = 0; round < 4; round++) {
    users.forEach((u) => postDocs.push({ authorId: u._id, mediaType: 'image', mediaUrl: photo(`${u.username}-${round}`) }));
  }
  VIDEOS.forEach((url, i) => postDocs.splice(i * 5, 0, { authorId: users[i]._id, mediaType: 'video', mediaUrl: url }));
  postDocs.forEach((p, i) => {
    const caption = CAPTIONS[i % CAPTIONS.length];
    Object.assign(p, { caption, tags: parseTags(caption), createdAt: ago((i + 1) * 5), location: i % 2 ? '' : LOCATIONS[(i / 2) % LOCATIONS.length] });
    if (p.mediaType === 'image' && i % 4 === 1) p.extraMedia = [photo(`extra-${i}-a`), photo(`extra-${i}-b`)];
  });
  const posts = await Post.insertMany(postDocs);

  // Likes, comments, replies from the post author, and comment likes.
  const likes = [];
  const comments = [];
  posts.forEach((post, p) => {
    users.forEach((u, i) => {
      if (u._id.equals(post.authorId)) return;
      if ((p + i) % 3 !== 0) likes.push({ postId: post._id, userId: u._id });
      if ((p + i) % 5 === 0) {
        comments.push({
          _id: new mongoose.Types.ObjectId(), postId: post._id, userId: u._id,
          body: COMMENTS[(p + i) % COMMENTS.length], createdAt: new Date(post.createdAt.getTime() + HOUR),
        });
      }
    });
  });
  const replies = comments.filter((c, i) => i % 2 === 0).map((c) => {
    const author = posts.find((p) => p._id.equals(c.postId)).authorId;
    const username = users.find((u) => u._id.equals(c.userId)).username;
    return { postId: c.postId, userId: author, parentId: c._id, body: `@${username} thank you!`, createdAt: new Date(c.createdAt.getTime() + HOUR) };
  });
  const commentLikes = replies.map((r) => ({ commentId: r.parentId, userId: r.userId }));
  await Like.insertMany(likes);
  await Comment.insertMany([...comments, ...replies].map((c) => ({ ...c, likeCount: commentLikes.filter((l) => l.commentId === c._id).length })));
  await CommentLike.insertMany(commentLikes);
  const allComments = [...comments, ...replies];
  await Post.bulkWrite(posts.map((post) => ({
    updateOne: {
      filter: { _id: post._id },
      update: {
        likeCount: likes.filter((l) => l.postId.equals(post._id)).length,
        commentCount: allComments.filter((c) => c.postId.equals(post._id)).length,
      },
    },
  })));
  await Save.insertMany([1, 3, 6].map((i) => ({ postId: posts[i]._id, userId: maya._id })));

  // Stories for Leo, Aria and Zoe (Aria's already seen by Maya), plus highlights on Maya's profile.
  const stories = await Story.insertMany([1, 2, 4].flatMap((i, n) => [0, 1].map((k) => ({
    authorId: users[i]._id,
    mediaUrl: photo(`story-${i}-${k}`, 720, 1280),
    createdAt: ago(n * 2 + k + 1),
  }))));
  await StoryView.insertMany(stories.filter((s) => s.authorId.equals(aria._id)).map((s) => ({ storyId: s._id, viewerId: maya._id })));
  await Highlight.insertMany([
    { authorId: maya._id, title: 'Travel', items: [0, 1, 2].map((k) => ({ mediaUrl: photo(`hl-travel-${k}`, 720, 1280), createdAt: ago(200 + k) })) },
    { authorId: maya._id, title: 'Film', items: [0, 1].map((k) => ({ mediaUrl: photo(`hl-film-${k}`, 720, 1280), createdAt: ago(300 + k) })) },
  ]);

  // Two chats for Maya; Leo's last message is still unread.
  const chats = [
    [leo, [[leo, 'Are you coming climbing on Saturday?'], [maya, 'Yes! What time?'], [leo, '9am at the north wall'], [leo, 'Bring snacks 🍫']]],
    [aria, [[maya, 'Your new ceramics are gorgeous'], [aria, 'Thank you!! Kiln day was chaos'], [maya, 'Haha I can imagine']]],
  ];
  for (const [n, [other, lines]] of chats.entries()) {
    const convo = await Conversation.create({ key: [maya._id, other._id].map(String).sort().join(':'), members: [maya._id, other._id] });
    const messages = await Message.insertMany(lines.map(([from, body], k) => ({
      conversationId: convo._id, senderId: from._id, body, createdAt: ago(lines.length - k + n * 20),
    })));
    const last = messages.at(-1);
    const mayaUnread = last.senderId.equals(maya._id) ? 0 : 1;
    await Conversation.updateOne({ _id: convo._id }, {
      lastMessage: { body: last.body, senderId: last.senderId, createdAt: last.createdAt },
      unread: { [maya._id]: mayaUnread, [other._id]: 0 },
      readAt: { [maya._id]: mayaUnread ? messages.at(-2).createdAt : last.createdAt, [other._id]: last.createdAt },
    });
  }

  // Notifications for the seeded follows and comments, so every inbox has something in it.
  const authorOf = new Map(posts.map((p) => [String(p._id), p.authorId]));
  await Notification.insertMany([
    ...follows.map((f) => ({ userId: f.followingId, actorId: f.followerId, type: 'follow', isRead: true, createdAt: ago(7 * 24) })),
    ...comments.map((c) => ({ userId: authorOf.get(String(c.postId)), actorId: c.userId, type: 'comment', postId: c.postId, isRead: true, createdAt: c.createdAt })),
    { userId: sam._id, actorId: leo._id, type: 'follow_request', createdAt: ago(3) },
  ]);

  console.log(`Seeded ${users.length} users, ${posts.length} posts, ${likes.length} likes, ${allComments.length} comments. Password: password123`);
}

// `npm run seed` (only meaningful with a real MONGO_URI; in-memory mode seeds on start).
if (path.resolve(process.argv[1]) === import.meta.filename) {
  if (!process.env.MONGO_URI) {
    console.log('No MONGO_URI set: the in-memory database is seeded automatically by `npm run dev`.');
    process.exit(0);
  }
  await mongoose.connect(process.env.MONGO_URI);
  await seed();
  await mongoose.disconnect();
}
