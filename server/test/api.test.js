// Smoke test of the core flows against a real (in-memory) MongoDB: `npm test`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { server } from '../src/app.js';
import { Post } from '../src/models.js';
import { parseMentions, parseTags } from '../src/lib.js';

let mongo, base;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
});

async function call(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, ...(await res.json()) };
}

const register = (username) => call('/auth/register', {
  method: 'POST',
  body: { name: username, username, email: `${username}@t.dev`, password: 'secret1' },
});

const makePosts = (authorId, n, caption = '') => Post.insertMany(Array.from({ length: n }, (_, i) => ({
  authorId, mediaUrl: `/x${i}.jpg`, mediaType: 'image', caption, tags: parseTags(caption), createdAt: new Date(Date.now() - i * 1000),
})));

test('caption parsing', () => {
  assert.deepEqual(parseTags('#Sunset at the #beach #sunset'), ['sunset', 'beach']);
  assert.deepEqual(parseMentions('hi @Leo and @aria.p.'), ['leo', 'aria.p']);
});

test('auth, follow, feed pagination, likes, comments, replies', async () => {
  const a = await register('alice');
  const b = await register('bob');
  assert.equal(a.status, 201);
  assert.equal(a.user.passwordHash, undefined);
  assert.equal((await register('alice')).status, 409);
  assert.equal((await call('/feed')).status, 401);
  assert.equal((await call('/auth/login', { method: 'POST', body: { login: 'alice', password: 'nope' } })).status, 401);

  await makePosts(b.user._id, 25, 'hello #pulse');
  assert.equal((await call('/feed', { token: a.token })).posts.length, 0, 'not following yet');
  const follow = await call(`/users/${b.user._id}/follow`, { token: a.token, method: 'POST' });
  assert.deepEqual([follow.status, follow.followerCount], ['following', 1]);

  const page1 = await call('/feed?limit=50', { token: a.token });
  assert.equal(page1.posts.length, 20, 'limit is capped at 20');
  const page2 = await call(`/feed?limit=20&cursor=${page1.nextCursor}`, { token: a.token });
  assert.equal(page2.posts.length, 5);
  assert.equal(page2.nextCursor, null);
  assert.equal((await call('/tags/pulse?limit=20', { token: a.token })).posts.length, 20);

  const postId = page1.posts[0]._id;
  const like1 = await call(`/posts/${postId}/like`, { token: a.token, method: 'POST' });
  const like2 = await call(`/posts/${postId}/like`, { token: a.token, method: 'POST' });
  assert.deepEqual([like1.liked, like1.likeCount, like2.liked, like2.likeCount], [true, 1, false, 0]);

  const comment = await call(`/posts/${postId}/comments`, { token: a.token, method: 'POST', body: { body: 'hi @bob' } });
  const reply = await call(`/posts/${postId}/comments`, { token: b.token, method: 'POST', body: { body: 'thanks', parentId: comment.comment._id } });
  assert.equal(reply.commentCount, 2);
  const removed = await call(`/comments/${comment.comment._id}`, { token: b.token, method: 'DELETE' });
  assert.deepEqual([removed.removedIds.length, removed.commentCount], [2, 0], 'post author deletes a comment and its reply');

  const inbox = await call('/notifications', { token: b.token });
  assert.deepEqual(inbox.notifications.map((n) => n.type).sort(), ['comment', 'follow', 'like']);
  assert.equal((await call(`/posts/${postId}`, { token: a.token, method: 'DELETE' })).status, 403);
});

test('private accounts, blocking and messages', async () => {
  const c = await register('carol');
  const d = await register('dave');
  await call('/users/me', { token: d.token, method: 'PATCH', body: { isPrivate: true } });
  const [davePost] = await makePosts(d.user._id, 1);

  // Private: locked until the request is accepted.
  assert.equal((await call('/users/dave', { token: c.token })).isLocked, true);
  assert.equal((await call(`/posts/${davePost._id}`, { token: c.token })).status, 404);
  assert.equal((await call(`/users/${d.user._id}/follow`, { token: c.token, method: 'POST' })).status, 'requested');
  const { requests } = await call('/follow-requests', { token: d.token });
  await call(`/follow-requests/${requests[0]._id}/accept`, { token: d.token, method: 'POST' });
  assert.equal((await call('/users/dave', { token: c.token })).followStatus, 'following');
  assert.equal((await call(`/posts/${davePost._id}`, { token: c.token })).status, 200);

  // Messages: unread count goes up, then back to 0 when read.
  const { conversation } = await call('/conversations', { token: c.token, method: 'POST', body: { userId: d.user._id } });
  await call(`/conversations/${conversation._id}/messages`, { token: c.token, method: 'POST', body: { body: 'hey' } });
  assert.equal((await call('/counts', { token: d.token })).messages, 1);
  assert.equal((await call(`/conversations/${conversation._id}/read`, { token: d.token, method: 'PATCH' })).unreadMessages, 0);

  // Blocking removes the follow and hides the profile from the blocked side.
  assert.equal((await call(`/users/${c.user._id}/block`, { token: d.token, method: 'POST' })).blocked, true);
  assert.equal((await call('/users/dave', { token: c.token })).status, 404);
  assert.equal((await call('/users/carol', { token: d.token })).user.followingCount, 0);
  assert.equal((await call(`/conversations/${conversation._id}/messages`, { token: c.token, method: 'POST', body: { body: 'hi?' } })).status, 403);
});

test('ranked feed, search and live caching', async () => {
  const e = await register('erin');
  const f = await register('frank');
  await call(`/users/${f.user._id}/follow`, { token: e.token, method: 'POST' });
  // Older but popular vs newer with no engagement: the ranking should prefer engagement.
  const [popular, fresh] = await Post.insertMany([
    { authorId: f.user._id, mediaUrl: '/p.jpg', mediaType: 'image', caption: 'sunset #beachday', tags: ['beachday'], location: 'Lisbon', likeCount: 50, createdAt: new Date(Date.now() - 6 * 3600e3) },
    { authorId: f.user._id, mediaUrl: '/f.jpg', mediaType: 'image', caption: 'just posted', createdAt: new Date() },
  ]);
  const ranked = await call('/feed?sort=ranked&limit=1', { token: e.token });
  assert.equal(ranked.posts[0]._id, String(popular._id));
  const next = await call(`/feed?sort=ranked&limit=1&cursor=${ranked.nextCursor}`, { token: e.token });
  assert.equal(next.posts[0]._id, String(fresh._id));
  assert.equal(next.posts[0].authorId.username, 'frank', '$lookup fills in the author');

  // Unfollowing invalidates the cached follow list, so the feed changes immediately.
  await call(`/users/${f.user._id}/follow`, { token: e.token, method: 'POST' });
  assert.equal((await call('/feed', { token: e.token })).posts.length, 0);

  assert.equal((await call('/search?type=post&q=lisbon', { token: e.token })).posts.length, 1);
  assert.deepEqual((await call('/search?type=hashtag&q=%23beach', { token: e.token })).tags, [{ tag: 'beachday', count: 1 }]);
});
