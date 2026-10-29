import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bookmark, ChevronLeft, ChevronRight, Ellipsis, Flag, Heart, Link2, MapPin, MessageCircle, Pencil, Send, SquareArrowOutUpRight, Trash2 } from 'lucide-react';
import { api, timeAgo } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import Avatar from './Avatar';
import Comments from './Comments';
import { Confirm, Sheet } from './Modal';
import UserList from './UserList';
import { Menu, MenuItem, RichText, SafeImg } from './Ui';

// Like / save with optimistic UI, shared by PostCard and Reels.
// The UI flips instantly; the server's answer then sets the real count (or we roll back on error).
export function usePostActions(initial) {
  const [post, setPost] = useState(initial);
  const { socket } = useAuth();
  const toast = useToast();

  // Live counts: other people's likes and comments arrive over Socket.io.
  useEffect(() => {
    if (!socket) return;
    const onCounts = ({ postId, likeCount, commentCount }) => {
      if (postId !== initial._id) return;
      setPost((p) => ({ ...p, likeCount: likeCount ?? p.likeCount, commentCount: commentCount ?? p.commentCount }));
    };
    const events = ['post:liked', 'comment:new', 'comment:deleted'];
    events.forEach((e) => socket.on(e, onCounts));
    return () => events.forEach((e) => socket.off(e, onCounts));
  }, [socket, initial._id]);

  async function optimistic(change, request, apply) {
    const before = post;
    setPost({ ...post, ...change });
    try {
      const data = await request();
      setPost((p) => ({ ...p, ...apply(data) }));
    } catch (err) {
      setPost(before);
      toast(err.message, 'error');
    }
  }

  const toggleLike = () => optimistic(
    { likedByMe: !post.likedByMe, likeCount: post.likeCount + (post.likedByMe ? -1 : 1) },
    () => api(`/posts/${post._id}/like`, { method: 'POST' }),
    (d) => ({ likedByMe: d.liked, likeCount: d.likeCount }),
  );
  const toggleSave = () => optimistic(
    { savedByMe: !post.savedByMe },
    () => api(`/posts/${post._id}/save`, { method: 'POST' }),
    (d) => ({ savedByMe: d.saved }),
  );
  const setCommentCount = (commentCount) => setPost((p) => ({ ...p, commentCount }));

  return { post, setPost, toggleLike, toggleSave, setCommentCount };
}

export function copyLink(path, toast) {
  navigator.clipboard.writeText(window.location.origin + path)
    .then(() => toast('Link copied', 'success'))
    .catch(() => toast('Couldn’t copy the link', 'error'));
}

// Single image, video, or a swipeable carousel (CSS scroll-snap) for multi-photo posts.
export function Media({ post, className = '' }) {
  const urls = [post.mediaUrl, ...(post.extraMedia ?? [])];
  const [index, setIndex] = useState(0);
  const [track, setTrack] = useState(null);

  if (post.mediaType === 'video') {
    return <video src={post.mediaUrl} controls muted loop playsInline preload="metadata" className={`bg-black object-cover ${className}`} />;
  }
  const alt = post.caption || `Post by ${post.authorId.username}`;
  if (urls.length === 1) return <SafeImg src={post.mediaUrl} alt={alt} loading="lazy" className={`bg-raised object-cover ${className}`} />;

  const go = (i) => track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
  const arrow = 'absolute top-1/2 hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur sm:grid';
  return (
    <div className="relative">
      <div ref={setTrack} onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className={`no-scrollbar flex snap-x snap-mandatory overflow-x-auto ${className}`}>
        {urls.map((url, i) => (
          <SafeImg key={url} src={url} alt={`${alt} (${i + 1} of ${urls.length})`} loading="lazy" className="size-full shrink-0 snap-center bg-raised object-cover" />
        ))}
      </div>
      <span className="absolute top-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold backdrop-blur">{index + 1}/{urls.length}</span>
      {index > 0 && <button onClick={() => go(index - 1)} className={`${arrow} left-3`} aria-label="Previous photo"><ChevronLeft size={18} /></button>}
      {index < urls.length - 1 && <button onClick={() => go(index + 1)} className={`${arrow} right-3`} aria-label="Next photo"><ChevronRight size={18} /></button>}
      <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
        {urls.map((url, i) => <span key={url} className={`size-1.5 rounded-full transition ${i === index ? 'bg-white' : 'bg-white/45'}`} />)}
      </div>
    </div>
  );
}

const REASONS = [['spam', 'Spam'], ['inappropriate', 'Nudity or inappropriate'], ['harassment', 'Bullying or harassment'], ['other', 'Something else']];

export default function PostCard({ post: initial, onDeleted, commentsOpen = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { post, setPost, toggleLike, toggleSave, setCommentCount } = usePostActions(initial);
  const [showComments, setShowComments] = useState(commentsOpen);
  const [dialog, setDialog] = useState(null); // 'delete' | 'report' | 'likes'
  const [draft, setDraft] = useState(null); // caption being edited
  const author = post.authorId;
  const isMine = author._id === user._id;
  const link = `/p/${post._id}`;

  async function saveCaption() {
    try {
      const data = await api(`/posts/${post._id}`, { method: 'PATCH', body: { caption: draft } });
      setPost((p) => ({ ...p, caption: data.post.caption, editedAt: data.post.editedAt }));
      setDraft(null);
      toast('Caption updated', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function report(reason) {
    try {
      await api(`/posts/${post._id}/report`, { method: 'POST', body: { reason } });
      toast('Thanks, we’ll take a look', 'success');
      setDialog(null);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <article className="card overflow-hidden">
      <header className="flex items-center gap-3 p-4">
        <Link to={`/u/${author.username}`} tabIndex={-1} aria-hidden="true"><Avatar user={author} /></Link>
        <div className="min-w-0 flex-1 leading-tight">
          <Link to={`/u/${author.username}`} className="block truncate font-semibold hover:underline">{author.name}</Link>
          <Link to={link} className="text-xs text-muted hover:underline">
            @{author.username} · {timeAgo(post.createdAt)}{post.editedAt && ' · edited'}
          </Link>
          {post.location && (
            <Link to={`/explore?type=post&q=${encodeURIComponent(post.location)}`} className="flex items-center gap-1 text-xs text-muted hover:text-fg">
              <MapPin size={12} /> {post.location}
            </Link>
          )}
        </div>
        <Menu label="Post options" icon={<Ellipsis size={20} />}>
          <MenuItem icon={SquareArrowOutUpRight} onClick={() => navigate(link)}>Open post</MenuItem>
          <MenuItem icon={Link2} onClick={() => copyLink(link, toast)}>Copy link</MenuItem>
          {isMine && <MenuItem icon={Pencil} onClick={() => setDraft(post.caption)}>Edit caption</MenuItem>}
          {isMine && <MenuItem icon={Trash2} danger onClick={() => setDialog('delete')}>Delete</MenuItem>}
          {!isMine && <MenuItem icon={Flag} danger onClick={() => setDialog('report')}>Report</MenuItem>}
        </Menu>
      </header>

      <div className="px-3">
        <Media post={post} className="aspect-[4/5] w-full rounded-2xl" />
      </div>

      <div className="flex items-center gap-2 px-4 pt-3">
        {/* Heart toggles the like; the number opens the list of who liked it. */}
        <div className={`flex items-center rounded-full border text-sm font-semibold transition duration-150 ${post.likedByMe ? 'border-coral/40 bg-coral/10 text-coral' : 'border-line bg-raised hover:border-muted/40'}`}>
          <button onClick={toggleLike} aria-pressed={post.likedByMe} aria-label={post.likedByMe ? 'Unlike' : 'Like'} className="rounded-l-full py-2 pr-1.5 pl-3.5">
            <Heart key={String(post.likedByMe)} size={18} fill={post.likedByMe ? 'currentColor' : 'none'} className={post.likedByMe ? 'animate-pop' : ''} />
          </button>
          <button onClick={() => setDialog('likes')} disabled={!post.likeCount} aria-label={`See who liked this (${post.likeCount})`}
            className="rounded-r-full py-2 pr-3.5 pl-0.5 tabular-nums enabled:hover:underline">
            {post.likeCount}
          </button>
        </div>
        <button onClick={() => setShowComments(!showComments)} aria-expanded={showComments} aria-label="Comments" className="btn btn-ghost rounded-full px-3.5">
          <MessageCircle size={18} /> <span className="tabular-nums">{post.commentCount}</span>
        </button>
        <button onClick={() => copyLink(link, toast)} className="icon-btn" aria-label="Share"><Send size={19} /></button>
        <button onClick={toggleSave} aria-pressed={post.savedByMe} aria-label={post.savedByMe ? 'Unsave' : 'Save'} className={`icon-btn ml-auto ${post.savedByMe ? 'text-amber' : ''}`}>
          <Bookmark size={20} fill={post.savedByMe ? 'currentColor' : 'none'} />
        </button>
      </div>

      {draft !== null ? (
        <div className="px-4 pt-3 pb-4">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2200} rows={3} autoFocus className="input resize-none" aria-label="Caption" />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className="btn btn-ghost">Cancel</button>
            <button onClick={saveCaption} className="btn btn-primary">Save</button>
          </div>
        </div>
      ) : (
        <p className="px-4 pt-3 pb-4 text-sm leading-relaxed break-words">
          {post.caption && <><Link to={`/u/${author.username}`} className="font-semibold">{author.username}</Link> <RichText text={post.caption} /></>}
          {!showComments && post.commentCount > 0 && (
            <button onClick={() => setShowComments(true)} className="mt-1 block text-muted hover:text-fg">View all {post.commentCount} comments</button>
          )}
        </p>
      )}

      {showComments && <Comments postId={post._id} postAuthorId={author._id} onCount={setCommentCount} />}

      {dialog === 'likes' && <UserList title="Likes" path={`/posts/${post._id}/likes`} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && (
        <Confirm title="Delete this post?" text="It will be gone for good, along with its likes and comments." confirmLabel="Delete"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await api(`/posts/${post._id}`, { method: 'DELETE' });
            toast('Post deleted', 'success');
            onDeleted?.(post._id);
          }} />
      )}
      {dialog === 'report' && (
        <Sheet title="Why are you reporting this?" onClose={() => setDialog(null)}>
          <div className="p-2">
            {REASONS.map(([id, label]) => (
              <button key={id} onClick={() => report(id)} className="w-full rounded-xl px-4 py-3 text-left text-sm hover:bg-raised">{label}</button>
            ))}
          </div>
        </Sheet>
      )}
    </article>
  );
}
