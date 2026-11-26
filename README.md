# Pulse

**Pulse is a full-stack social app**: photo, carousel and video posts, reels, 24-hour stories with highlights,
private accounts, threaded comments, hashtags and mentions, real-time chat and notifications, blocking and reporting.

React 19 + Vite + Tailwind CSS on the front end; Node + Express + MongoDB + Socket.io on the back end, with Redis, Cloudinary and Sentry in production.
It runs locally with **zero setup**: no database to install, demo data is seeded automatically, and every external service has a local fallback.

![Pulse home feed](docs/screenshots/feed.jpg)

| Login | Profile | Explore |
|---|---|---|
| ![Login](docs/screenshots/login.jpg) | ![Profile](docs/screenshots/profile.jpg) | ![Explore](docs/screenshots/explore.jpg) |

| Light theme | Notifications (light) |
|---|---|
| ![Light theme feed](docs/screenshots/feed-light.jpg) | ![Notifications](docs/screenshots/notifications.jpg) |

| Messages | Mobile (feed · reels · profile) |
|---|---|
| ![Messages](docs/screenshots/messages.jpg) | ![Mobile](docs/screenshots/mobile.jpg) |

---

## Quick start

Requires **Node 22+**.

```bash
npm install      # installs root, server and client (npm workspaces)
npm run dev      # API on http://localhost:4000, web app on http://localhost:5173
```

Open **http://localhost:5173** and click **Try the demo account**.

| Demo user | Password | Notes |
|---|---|---|
| `maya` | `password123` | Main demo account: has highlights, saved posts, two chats (one unread) |
| `leo`, `aria`, `kai`, `zoe` | `password123` | Regular accounts with posts, stories and comments |
| `sam` | `password123` | **Private** account with a pending follow request from `leo` |

**How the database works.** With no `MONGO_URI` set, the API starts an in-memory MongoDB (`mongodb-memory-server`) and re-seeds it on every start. The first run downloads a MongoDB binary (about 600 MB, cached afterwards). Data resets whenever the server restarts.

To use a real database instead:

```bash
cp server/.env.example server/.env   # set MONGO_URI and JWT_SECRET (REDIS_URL, CLOUDINARY_URL, SENTRY_DSN are optional)
npm run seed                          # wipes and reseeds that database
npm run dev
```

The demo photos and videos are loaded from public URLs (see [credits](#media-credits)), so the demo needs an internet connection.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API (auto-restarts on change) and the Vite dev server together |
| `npm test` | API integration tests against an in-memory MongoDB (`node:test`); add `REDIS_URL=…` to run them against Redis too |
| `npm run seed` | Re-seeds a real database (only with `MONGO_URI`) |
| `npm run bench -w server` | Load-tests the feed endpoints with autocannon (start the API first) |
| `npm run explain -w server` | Prints the query plan for every hot query, to prove each one uses an index |
| `npm run build -w client` | Production build of the web app |

## Features

| Area | What you can do |
|---|---|
| **Posts** | Up to 10 photos in a swipeable carousel, or one video; caption with `#tags` and `@mentions`; optional location; edit caption; delete; copy link; report |
| **Feeds** | **Following**: chronological, cursor-paginated infinite scroll. **For you**: ranked by engagement and recency |
| **Explore** | Trending hashtags, a grid of everyone's recent posts, and search across people, posts and places, and tags |
| **Reels** | Full-height, scroll-snap video feed that autoplays the reel on screen |
| **Engagement** | Like, comment, reply (one level), like comments, save; counts update live on every open screen |
| **Social graph** | Follow and unfollow, private accounts with follow requests, followers/following/likes lists, suggested people |
| **Stories** | 24-hour image stories (MongoDB TTL index), seen/unseen rings, viewer list, replies that arrive as DMs, profile highlights |
| **Messages** | Real-time 1:1 chat with unread badges, typing indicator, "Seen" receipts, and loading older messages |
| **Notifications** | Live over Socket.io: likes, comments, replies, mentions, comment likes, follows, requests, accepted requests |
| **Safety** | Block (hides both people from each other everywhere and removes follows), report posts with a reason |
| **Account** | Edit avatar, name and bio; private toggle; blocked list; change password; delete account (cleans up everything) |
| **Media** | Photos are resized to ≤1600px WebP in the browser before upload, then stored on Cloudinary and served with `f_auto,q_auto` and a responsive `srcset` |
| **Appearance** | Light, dark or follow-the-system theme (no flash on load); sidebar navigation on desktop, icon rail on tablets, bottom tabs on phones; `/` jumps to search |

## Tech stack

| Layer | Choices |
|---|---|
| Front end | React 19, Vite 6, React Router 7, Tailwind CSS 4, lucide-react, socket.io-client. Auth state in React Context; no Redux |
| Back end | Node 22, Express 5, Mongoose 8, Socket.io 4, JWT (`jsonwebtoken`) + `bcryptjs`, multer for uploads |
| Database | MongoDB Atlas, with `mongodb-memory-server` when no `MONGO_URI` is set |
| Cache and realtime | Upstash Redis via `ioredis` (feed cache, rate limits) and `@socket.io/redis-adapter`; an in-process `Map` when no `REDIS_URL` is set |
| Media | Cloudinary (`f_auto`, `q_auto`, width transforms); local `server/uploads` when no `CLOUDINARY_URL` is set |
| Monitoring | Sentry (`@sentry/node`, when `SENTRY_DSN` is set), `/api/health` for UptimeRobot |
| Hosting | Web app on Vercel (`client/vercel.json`); API on Render (`render.yaml`) |
| Tooling | npm workspaces, `concurrently`, `node:test`, autocannon |

## Project structure

```
pulse/
├─ package.json              npm workspaces; "dev" runs API + web together
├─ server/
│  ├─ src/
│  │  ├─ index.js            connect DB → seed (in-memory mode) → listen
│  │  ├─ app.js              Express app: middleware order and route mounting
│  │  ├─ db.js               MONGO_URI or in-memory MongoDB
│  │  ├─ models.js           all Mongoose schemas and indexes
│  │  ├─ access.js           every privacy + blocking rule in one place
│  │  ├─ instrument.js       Sentry (imported first; no-op without SENTRY_DSN)
│  │  ├─ cache.js            TTL cache: Redis when REDIS_URL is set, otherwise an in-process Map
│  │  ├─ media.js            Cloudinary uploads (or local disk) and file cleanup
│  │  ├─ socket.js           JWT-authenticated Socket.io, private rooms, Redis adapter, notify()
│  │  ├─ lib.js              auth middleware, uploads, rate limit, errors, caption parsing
│  │  ├─ deleteAccount.js    removes a user and fixes the counters they contributed to
│  │  ├─ seed.js             demo data
│  │  └─ routes/             auth · users · social · posts · comments · stories · messages · notifications
│  ├─ test/api.test.js       integration tests
│  ├─ bench.js               autocannon load test
│  ├─ explain.js             query plans for the hot queries
│  └─ uploads/               uploaded media in local mode, served at /uploads
├─ render.yaml               Render blueprint for the API
└─ client/src/
   ├─ api.js  hooks.js       fetch wrapper, media URLs + srcset; useFetch / usePaged / useOnline
   ├─ auth.jsx  toast.jsx    session, live socket and badge counts; toasts
   ├─ theme.js               light / dark / system theme
   ├─ compress.js            in-browser image compression
   ├─ components/            PostCard, Comments, Stories, Layout, Modal, UserList, Ui, …
   └─ pages/                 Home, Explore, Reels, Create, Profile, PostPage, TagPage, Messages, Notifications, Settings, Auth
```

## Architecture

```
Browser ──REST /api──────────▶ Express ──▶ MongoDB
   │     ◀─ /uploads (static) ──┤
   └──── Socket.io (JWT) ◀─────▶ per-user rooms "user:<id>"
```

In development, Vite proxies `/api`, `/uploads` and `/socket.io` to the API, so the client calls relative URLs.
In production the web app and API live on different domains: the client reads `VITE_API_URL`, and the API allows that origin with CORS (`CLIENT_ORIGIN`) for both REST and Socket.io.

**Request pipeline** (`app.js`): CORS → JSON body → static `/uploads` → `/api/health` → write rate limit → public auth routes → JWT `auth` → feature routes → Sentry → `{ "error": "message" }` error handler.

**Rate limits.** Writes are limited per user (per IP when logged out): 120 per minute overall, and 30 per minute for each spam-prone action (posting, liking, commenting, following). With Redis the counters are shared by every instance (`INCR` + `PEXPIRE`). Responses over the limit are `429` with `Retry-After`.

**Key design decisions**

- **One privacy layer.** `access.js` decides who can see what: blocked either way, private and not followed, and so on. Every route calls it, and anything hidden returns `404`, so private content never leaks through a different status code.
- **One query for every post list.** `findPosts()` is a single aggregation that every list goes through (feed, explore, reels, tags, profile, saved, search). See [Interview notes](#interview-notes).
- **Denormalised counters.** `likeCount`, `commentCount`, `followerCount` and the per-user unread message counts live on the documents and are updated with atomic `$inc`. Compound unique indexes (`{ postId, userId }` and similar) make double-likes and double-follows impossible.
- **Real-time over rooms.** Every socket authenticates with the same JWT and joins `user:<id>`. Notifications, messages, read receipts and typing go only to the people involved. Like and comment *counts* are broadcast to everyone, but they contain only ids and numbers, never comment text.
- **Optimistic UI.** Likes, saves, follows and comment likes flip instantly, then take the server's answer, or roll back with an error toast.
- **Native platform first.** `<dialog>` for modals, `<details>` for menus, a `popover` for toasts, CSS scroll-snap for reels and carousels, a CSS animation's `animationend` for story auto-advance, `IntersectionObserver` for infinite scroll and autoplay, and `<canvas>` for image compression.

### Data model

| Collection | Key fields | Indexes |
|---|---|---|
| `User` | name, username, email, passwordHash, avatarUrl, bio, isPrivate, followerCount, followingCount | unique username, unique email |
| `Follow` | followerId, followingId | unique `{followerId, followingId}` |
| `FollowRequest` | fromId, toId | unique `{fromId, toId}`, toId |
| `Block` | blockerId, blockedId | unique `{blockerId, blockedId}` |
| `Post` | authorId, caption, mediaUrl, mediaType, extraMedia[], location, tags[], likeCount, commentCount, editedAt, createdAt | `{authorId, createdAt, _id}`, `{createdAt, _id}`, `{tags, createdAt, _id}` |
| `Like` / `Save` | postId, userId | unique `{postId, userId}` |
| `Comment` | postId, userId, parentId, body, likeCount | `{postId, createdAt}`, parentId (partial) |
| `CommentLike` | commentId, userId | unique `{commentId, userId}` |
| `Story` | authorId, mediaUrl, createdAt | **TTL 24h** on createdAt, `{authorId, createdAt}` |
| `StoryView` | storyId, viewerId | unique pair, TTL 24h |
| `Highlight` | authorId, title, items[] | authorId |
| `Conversation` | key, members[], lastMessage, unread{userId: n}, readAt{userId: date} | unique key |
| `Message` | conversationId, senderId, body, storyMediaUrl | `{conversationId, createdAt}` |
| `Notification` | userId, type, actorId, postId, isRead | `{userId, createdAt, _id}`, `{userId, isRead}` |
| `Report` | reporterId, postId, reason | unique `{reporterId, postId}` |

**Every hot query is an index range scan.** `npm run explain -w server` on the seeded data:

```
query                               examined  returned  plan
feed (following, newest first)            10        10  LIMIT ← FETCH ← SORT_MERGE ← IXSCAN(authorId_1_createdAt_-1__id_-1)
explore (everyone, newest first)          10        10  LIMIT ← FETCH ← IXSCAN(createdAt_-1__id_-1)
tag page                                   8         8  LIMIT ← FETCH ← IXSCAN(tags_1_createdAt_-1__id_-1)
notifications list                         8         8  LIMIT ← FETCH ← IXSCAN(userId_1_createdAt_-1__id_-1)
unread badge count                         0         0  FETCH ← IXSCAN(userId_1_isRead_1)
comments for a post                        2         2  FETCH ← IXSCAN(postId_1_createdAt_1)
```

Documents examined equals documents returned, and there's no in-memory `SORT` stage: the feed's `$in` over followed authors is answered by merging one already-sorted index range per author (`SORT_MERGE`).

Follow requests are a separate collection rather than a `status` field on `Follow`. That keeps every feed and follower query a plain lookup, with no `status: 'accepted'` filter to forget.

## Interview notes

**Fan-out on write or fan-out on read? Which did you build, and why?**
Fan-out on write copies each new post id into every follower's feed. Reads are cheap, but one post costs one write per follower, and follows, unfollows, blocks and deletes all need backfill and cleanup. **Pulse uses fan-out on read**: at request time it looks up who I follow and runs `Post.find({ authorId: { $in: [...following, me] } }).sort({ createdAt: -1 })` against the `authorId` and `createdAt` indexes. That's one query, no extra collection, and every graph change shows up immediately.

**A user with 1 million followers posts. What breaks?**
With fan-out on write, that's 1M inserts per post: queues back up and feeds lag. With fan-out on read, nothing happens at post time, but users who follow thousands of accounts run a big `$in`. Real systems go hybrid: fan-out on write for normal accounts, and celebrity posts pulled and merged at read time. Pulse's per-user cache of the ranked feed already keeps repeated reads cheap.

**Why cursor pagination instead of page numbers?**
New posts keep arriving at the top. With `?page=2` everything shifts, so you get duplicates or skipped posts, and `skip()` gets slower the deeper you go. A cursor is stable and walks the index directly.
Pulse's cursor is `"<createdAt>_<_id>"` and the next page is `createdAt < t OR (createdAt = t AND _id < id)`, sorted by `(createdAt, _id)`. With a timestamp alone, two posts created in the same millisecond can be skipped at a page edge (a test inserts 15 posts with one timestamp and pages through them 4 at a time). The ranked feed pages by offset, but into a cached snapshot of the ranking, so it's stable too.

**Walk me through the `$lookup` aggregation. What does it cost?**
`findPosts()` (in `routes/posts.js`) runs `$match → $sort → $limit` first, then `$lookup` for the author, `$lookup` for "did I like it" and `$lookup` for "did I save it". The last two hit the `{ postId, userId }` unique indexes with `$limit: 1`. Because `$limit` comes before the lookups, a page costs one index scan plus at most 3 × 20 point lookups. Putting `$lookup` before `$limit` would join every matching post, and that's the mistake to avoid.

**Why store `likeCount` on the post instead of counting likes?**
Reads vastly outnumber writes. Counting on every render is one `countDocuments` per post per viewer; storing the count is one atomic `$inc` per like. The unique index keeps it honest.

**How does "For you" rank posts?**
`score = (likes + 2 × comments + 1) / (ageHours + 2)^1.5`, computed in an aggregation over the last 14 days of posts from people you follow. It's the Hacker News idea: engagement pushes a post up, and age pulls it down.

**What did you cache, with what TTL, and how do you invalidate it?**

| Key | Holds | TTL | Invalidated when |
|---|---|---|---|
| `feed:<userId>` | ids of the newest 20 posts in their Following feed (the first page) | 30 s | Someone they follow posts or deletes a post, or their follows change |
| `ranked:<userId>` | ids of their ranked "For you" list (up to 200) | 2 min | Same as above |
| `following:<userId>` | ids of who they follow | 60 s | That user follows, unfollows, has a request accepted, blocks or is blocked |
| `trending` | top 10 hashtags | 5 min | Never; trending tags may be a few minutes old |

Only **ids** are cached for feeds. Each request still runs the `$lookup` for the author, `likedByMe` and `savedByMe` and reads `likeCount`/`commentCount` from the posts, so counters and like state are never stale. That's also why the "hot counters" don't need their own cache: they're denormalised onto the post and read by `_id`.

When a user posts, Pulse fans out the **invalidation** (a `DEL` of each follower's `feed:` and `ranked:` keys), not the post itself. That's cheap until an account has a very large following, which is where the hybrid model above comes in.

`cache.js` has two backends behind the same functions: with `REDIS_URL` it uses Redis (`GET`, `SET … PX`, `DEL`), so every API instance shares the cache, and the Socket.io Redis adapter carries events between instances. Without it, an in-process `Map`. ObjectIds are tagged when serialised to Redis and revived on read, because aggregation pipelines don't cast strings.

**Benchmark.** `npm run bench -w server`: 20 connections for 8 s per endpoint, seeded in-memory MongoDB, one laptop. Same machine and data for all three runs.

| Endpoint | No cache: req/s · p99 | In-process cache: req/s · p99 | Redis cache: req/s · p99 |
|---|---|---|---|
| `/api/feed` | 731 · 94 ms | 1171 · 43 ms | 1031 · 41 ms |
| `/api/feed?sort=ranked` | 943 · 43 ms | 1340 · 28 ms | 1174 · 35 ms |
| `/api/explore` | 827 · 65 ms | 922 · 45 ms | 835 · 46 ms |
| `/api/explore/trending` | 4848 · 8 ms | 9441 · 4 ms | 8107 · 4 ms |
| `/api/notifications` (not cached) | 914 · 36 ms | 851 · 44 ms | 892 · 40 ms |

Caching the feed's first page cut its p99 latency by more than half and raised throughput by about 60%. Redis costs one network round trip per lookup but is shared across instances; in the Redis run there were 97,511 cache hits to 102 misses. Explore and notifications aren't cached, so their numbers only move with run-to-run noise.
autocannon reports p90, p97.5 and p99 but not p95. The bench prints all three.

To reproduce: start the API with `NO_CACHE=1` (bash: `NO_CACHE=1 npm run dev`; PowerShell: `$env:NO_CACHE=1; npm run dev`), run the bench, then restart without it (and once with `REDIS_URL`) and run it again. After deploying, point it at the live API with `BENCH_URL=https://your-api.onrender.com npm run bench -w server`.

## API reference

All routes live under `/api`, use JSON, and require `Authorization: Bearer <token>` except register, login and health.
Lists default to 10 items with a hard maximum of 20, so the API can't be used to dump the database. `nextCursor` is `null` on the last page.
Errors always look like `{ "error": "message" }`: `400` validation, `401` not logged in, `403` not allowed, `404` not found (also used for private or blocked content), `409` duplicate, `429` rate limited.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{ ok, db, cache: redis \| memory, media: cloudinary \| local, uptime }`; 503 if MongoDB is down |
| POST | `/auth/register` | `{ name, username, email, password }` → `{ token, user }` |
| POST | `/auth/login` | `{ login, password }` (login = username or email) → `{ token, user }` |
| GET | `/auth/me` | Current user |
| GET | `/users/:username` | `{ user, followStatus, blockedByMe, isLocked, posts, highlights }` |
| PATCH | `/users/me` | multipart or JSON: `name`, `bio`, `avatar`, `isPrivate` |
| PATCH | `/users/me/password` | `{ currentPassword, newPassword }` |
| DELETE | `/users/me` | `{ password }`; deletes the account and all of its data |
| GET | `/users/suggestions` | Up to 6 people I don't follow |
| GET | `/search?q=&type=user\|post\|hashtag` | People (name/username), posts (caption/location) or hashtags (prefix, with counts) |
| POST | `/users/:id/follow` | Toggle → `{ status: following \| requested \| none, followerCount }` |
| DELETE | `/users/:id/follower` | Remove one of my followers |
| GET | `/users/:id/followers` · `/users/:id/following` | Lists with `followStatus` per user |
| GET | `/follow-requests` | Requests to my private account |
| POST or PATCH | `/follow-requests/:id/accept` · `/decline` | Respond to a request |
| POST | `/users/:id/block` | Toggle → `{ blocked }` |
| GET | `/blocks` | People I've blocked |
| GET | `/feed?cursor=&limit=` | Following feed: me + people I follow, newest first |
| GET | `/feed?sort=ranked&cursor=&limit=` | "For you" feed (cursor = offset into the cached ranking) |
| GET | `/explore?cursor=&limit=` | Everyone's posts, minus private and blocked accounts |
| GET | `/reels?cursor=&limit=` | Video posts |
| GET | `/tags/:tag?cursor=&limit=` | Posts with a hashtag |
| GET | `/explore/trending` | Top 10 hashtags of the last 7 days |
| GET | `/saved` | My saved posts |
| POST | `/posts` | multipart: `media` (≤10 images or 1 video, ≤50 MB each), `caption`, `location` |
| GET · PATCH · DELETE | `/posts/:id` | Read · edit caption/location · delete (own posts only) |
| POST | `/posts/:id/like` | Toggle → `{ liked, likeCount }` |
| GET | `/posts/:id/likes` | Who liked a post |
| POST | `/posts/:id/save` | Toggle → `{ saved }` |
| POST | `/posts/:id/report` | `{ reason: spam \| inappropriate \| harassment \| other }` |
| GET | `/posts/:id/comments` | Flat list with `parentId`, `likeCount`, `likedByMe` |
| POST | `/posts/:id/comments` | `{ body, parentId? }` → `{ comment, commentCount }` |
| DELETE | `/comments/:id` | Deletes a comment and its replies → `{ removedIds, commentCount }` |
| POST | `/comments/:id/like` | Toggle → `{ liked, likeCount }` |
| GET · POST | `/stories` | Grouped by author with `viewed` flags · upload `media` (image) |
| POST | `/stories/:id/view` | Mark a story as seen |
| GET | `/stories/:id/viewers` | Who saw my story |
| POST | `/stories/:id/reply` | `{ body }`; arrives as a DM with the story thumbnail |
| GET · POST | `/highlights` | My highlights · create `{ title, storyId }` |
| POST | `/highlights/:id/items` | Add a story `{ storyId }` |
| DELETE | `/highlights/:id` | Delete a highlight |
| GET | `/conversations` | Inbox → `{ conversations, unreadMessages }` |
| POST | `/conversations` | `{ userId }` → find or create a chat |
| GET | `/conversations/:id/messages?before=` | 30 messages; older ones with `before` |
| POST | `/conversations/:id/messages` | `{ body }` |
| PATCH | `/conversations/:id/read` | Mark read → `{ unreadMessages }` |
| GET | `/notifications?cursor=` | 20 per page → `{ notifications, nextCursor, unreadCount }` |
| PATCH | `/notifications/:id/read` | Mark one read (when it's opened) → `{ unreadCount }` |
| PATCH | `/notifications/read-all` | Mark all read |
| GET | `/counts` | Badge numbers `{ notifications, messages, requests }` |

**Socket.io events.** Server → client: `notification:new`, `message:new`, `conversation:read`, `typing`, `post:liked`, `comment:new`, `comment:deleted`. Client → server: `typing { conversationId }`.

### Try it with curl

```bash
B=http://localhost:4000/api
TOKEN=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' \
  -d '{"login":"maya","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
H="Authorization: Bearer $TOKEN"

curl -s "$B/feed?limit=2" -H "$H"
curl -s "$B/feed?sort=ranked&limit=2" -H "$H"
curl -s -X POST $B/posts -H "$H" -F caption="sunset #travel with @leo" -F location="Lisbon" -F media=@a.jpg -F media=@b.jpg
curl -s -X POST $B/posts/<postId>/comments -H "$H" -H 'Content-Type: application/json' -d '{"body":"nice","parentId":"<commentId>"}'
curl -s "$B/search?type=hashtag&q=tr" -H "$H"
curl -s -X POST $B/conversations -H "$H" -H 'Content-Type: application/json' -d '{"userId":"<userId>"}'
curl -s $B/counts -H "$H"
```

## Deployment

Web app on **Vercel**, API on **Render** (it supports WebSockets), database on **MongoDB Atlas**, cache on **Upstash Redis**, media on **Cloudinary**, errors in **Sentry**, uptime from **UptimeRobot**. Every service has a free tier.

1. **MongoDB Atlas.** Create a free cluster, add a database user, allow `0.0.0.0/0` under Network Access (Render's IPs change), and copy the `mongodb+srv://…` string. Seed it once from your machine: `MONGO_URI=… npm run seed`.
2. **Upstash Redis.** Create a database and copy the `rediss://…` URL (the TCP one, not REST; Socket.io's adapter needs pub/sub).
3. **Cloudinary.** Copy `CLOUDINARY_URL` from the dashboard.
4. **Sentry** (optional). Create a Node project and copy the DSN.
5. **API on Render.** New → Blueprint → this repo. `render.yaml` sets the root directory, start command, health check and `NODE_ENV=production`, and generates `JWT_SECRET`. Fill in `MONGO_URI`, `REDIS_URL`, `CLOUDINARY_URL`, `SENTRY_DSN`, and set `CLIENT_ORIGIN` after step 6. Then check `https://<api>/api/health`: it should say `"cache":"redis","media":"cloudinary"`.
6. **Web app on Vercel.** Import the repo with **Root Directory = `client`** (Vite is auto-detected), set `VITE_API_URL=https://<api>.onrender.com`, and deploy. `client/vercel.json` rewrites routes to `index.html` and caches hashed assets forever. Put the Vercel URL into the API's `CLIENT_ORIGIN` and redeploy the API.
7. **UptimeRobot.** Add an HTTP monitor on `https://<api>/api/health` every 5 minutes. It also stops a free Render instance from sleeping.
8. **Load test.** `BENCH_URL=https://<api>.onrender.com npm run bench -w server`, once with the env var `NO_CACHE=1` set on Render and once without, and record the p99 numbers.

Production safety checks: the API refuses to start without `JWT_SECRET` or `MONGO_URI` when `NODE_ENV=production`, `mongodb-memory-server` is a dev dependency (so it isn't installed on Render), and `trust proxy` is on so rate limits see the real client IP.

To verify the rubric's "real-time between two accounts on separate devices": open the Vercel URL on a phone as **leo** and on a laptop as **maya**, then run steps 1 and 2 of the demo script below.

## Demo script (two browser windows)

Open a normal window as **maya** and a private/incognito window as **leo**. Incognito has separate storage, so it's a separate session. Put them side by side.

1. **Live counts and notifications.** As leo, like one of maya's posts and comment `@maya nice!`. In maya's window, the post's like and comment counts change in place, the bell badge goes up, and toasts appear. Nobody refreshes.
2. **Messages.** Maya opens **Messages → Leo**. As leo, start typing: maya sees *typing…*, then the message arrives instantly. Maya replies; when leo opens the chat, maya sees **Seen**.
3. **Stories.** As maya, open Leo's story and reply to it; the reply lands in Leo's messages with the story thumbnail. As leo, open your own story → **Viewers** lists maya.
4. **Private accounts.** As maya, open `/u/sam`: the profile is locked. Click **Follow** (it changes to *Requested*). Log in as sam → **Notifications → Follow requests → Confirm**. Maya's view of sam unlocks.
5. **For you vs Following.** Switch tabs on Home. *For you* puts the most-engaged recent posts first; *Following* is newest first.
6. **Blocking.** On any profile, open **⋯ → Block**. That person's posts, stories, comments and messages disappear for both sides.

## Quality checks

What's verified, and how to re-run it:

| Check | How | Result |
|---|---|---|
| API behaviour | `npm test` covers auth, feed paging and the 20-item cap, same-millisecond cursor ties, likes, comments and replies, private accounts, blocking, DMs, ranked feed, search, feed-cache invalidation on post and delete, health check | 7/7 passing, both with and without `REDIS_URL` |
| Indexes | `npm run explain -w server` | Every hot query is an `IXSCAN`, examined = returned |
| Production build | `npm run build -w client` | Builds clean |
| Runtime errors | Every route opened in a headless browser, including the 404 page, in light and dark | No console errors |
| Accessibility | Every button and link has an accessible name; images have `alt`; inputs have labels; one visible focus ring everywhere; native `<dialog>` handles focus trapping and Escape | Checked on all main pages |
| Touch and motion | Icon buttons are 44 px on touch screens; all motion is 150–320 ms with ease-out; `prefers-reduced-motion` turns off decorative motion | — |
| Load | `npm run bench -w server` | See [benchmark](#interview-notes) |

## UI design notes

- **Theme.** Dark warm-black surfaces with a single coral accent (`#ff6a4d`), used only for actions, active states and unread markers. Amber marks saved items and mentions. One typeface (Plus Jakarta Sans) in multiple weights.
- **Light mode.** The same roles re-tuned, not inverted: coral and amber are darker so text in them still passes 4.5:1 on white, and coral buttons switch to white text (`on-accent`). Every color is a token in `index.css`. The saved choice is applied by an inline script before first paint, so there's no flash, and switching cross-fades.
- **Shapes.** Rounded "squircle" avatars and story *cards* (not circles) set Pulse apart from Instagram. Media sits inset inside cards with its own radius.
- **Layout.** Desktop: a labelled sidebar (badges for messages and notifications, a Create button, and the account menu with the theme switch at the bottom), a centred feed column and a sticky "Suggested people" panel. Tablet: the sidebar collapses to an icon rail with dot badges. Mobile: a compact top bar plus a bottom tab bar (Home, Explore, Create, Reels, Profile).
- **Notifications.** Grouped into Today, This week and Earlier. A small badge on each avatar shows the kind (like, comment, mention, follow) before you read the text, and opening one marks it read.
- **States.** Every async view has a skeleton, an empty state that says what to do next, and an error state with **Try again**. An offline banner appears when the connection drops, broken images fall back to a placeholder, and toasts replace `alert()`.
- **Motion.** Purposeful only: dialog fade-and-lift, toast slide-in, a heart "pop" on like, press feedback on buttons, and a CSS-timed story progress bar.

## Known limits and next steps

- **Redis is optional by design.** Without `REDIS_URL`, the cache, rate limiter and Socket.io rooms live in one process, which is fine for one instance. Set it before scaling to several.
- **Expired stories keep their media**, because highlights may still use it.
- **Not built yet:** group chats, media in messages, video stories, automated moderation, push notifications (FCM), and a background worker (BullMQ) for notification fan-out and email digests.
- Deliberate shortcuts are marked in the code with `ponytail:` comments: regex search, capped profile grids and follower lists, and global count broadcasts.

## Media credits

Seed photos come from [picsum.photos](https://picsum.photos) (Unsplash licence) and portraits from [randomuser.me](https://randomuser.me).
Video clips are MDN's CC0 samples and clips from [test-videos.co.uk](https://test-videos.co.uk) (Blender Foundation, CC BY 3.0).
