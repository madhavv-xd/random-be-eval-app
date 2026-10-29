import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eye, Plus, SendHorizontal, Star, Trash2, X } from 'lucide-react';
import { api, timeAgo } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { compressImage } from '../compress';
import { useToast } from '../toast';
import Avatar from './Avatar';
import Modal, { Confirm, Sheet } from './Modal';
import { RowSkeleton } from './Ui';

export default function Stories() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, reload, setData } = useFetch('/stories');
  const [viewing, setViewing] = useState(null); // index into `flat`
  const [uploading, setUploading] = useState(false);
  const groups = data?.groups;

  // One flat list so the viewer can auto-advance from one person's stories to the next.
  const flat = (groups ?? []).flatMap((g) => g.stories.map((s) => ({ ...s, author: g.author })));

  function markSeen(storyId) {
    setData((d) => ({
      groups: d.groups.map((g) => {
        const stories = g.stories.map((s) => (s._id === storyId ? { ...s, viewed: true } : s));
        return { ...g, stories, allViewed: stories.every((s) => s.viewed) };
      }),
    }));
  }

  async function upload(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const form = new FormData();
    setUploading(true);
    try {
      form.append('media', await compressImage(file));
      await api('/stories', { method: 'POST', body: form });
      toast('Story shared for 24 hours', 'success');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  if (error) {
    return <button onClick={reload} className="card w-full p-4 text-sm text-muted">Couldn’t load stories. <span className="text-coral">Try again</span></button>;
  }

  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <label className={`relative flex h-44 w-28 shrink-0 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-card text-center transition hover:border-coral/60 ${uploading ? 'animate-pulse' : ''}`}>
        <input type="file" accept="image/*" onChange={upload} disabled={uploading} className="sr-only" />
        <div className="relative">
          <Avatar user={user} size={48} />
          <span className="absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-lg bg-coral text-bg ring-4 ring-card"><Plus size={14} strokeWidth={3} /></span>
        </div>
        <span className="text-xs font-semibold">{uploading ? 'Uploading…' : 'Add story'}</span>
      </label>

      {!groups && Array.from({ length: 4 }, (_, i) => <div key={i} className="h-44 w-28 shrink-0 animate-pulse rounded-2xl bg-raised" />)}

      {groups?.map((g) => (
        <button key={g.author._id} onClick={() => setViewing(flat.findIndex((s) => s.author._id === g.author._id && (!s.viewed || g.allViewed)))}
          className={`group relative h-44 w-28 shrink-0 overflow-hidden rounded-2xl border-2 text-left focus-visible:outline-2 focus-visible:outline-coral ${g.allViewed ? 'border-line opacity-70' : 'border-coral'}`}>
          <img src={g.stories.at(-1).mediaUrl} alt="" className="absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-105" />
          <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/10 to-transparent" />
          <Avatar user={g.author} size={34} className={`absolute top-2.5 left-2.5 ring-2 ${g.allViewed ? 'ring-line' : 'ring-coral'}`} />
          <span className="absolute inset-x-2.5 bottom-2.5 truncate text-xs font-semibold">
            {g.author._id === user._id ? 'Your story' : g.author.name.split(' ')[0]}
          </span>
        </button>
      ))}

      {viewing !== null && <StoryViewer stories={flat} start={viewing} onSeen={markSeen} onClose={() => setViewing(null)} />}
    </div>
  );
}

// Full-screen viewer, used for stories and for profile highlights (mode="highlight").
export function StoryViewer({ stories, start, onClose, onSeen, mode = 'story', onDeleteHighlight }) {
  const { user } = useAuth();
  const toast = useToast();
  const [index, setIndex] = useState(start);
  const [paused, setPaused] = useState(false);
  const [panel, setPanel] = useState(null); // 'viewers' | 'highlight' | 'delete'
  const [reply, setReply] = useState('');
  const story = stories[index];
  const isMine = story.author._id === user._id;
  const isStory = mode === 'story';

  const next = () => (index + 1 < stories.length ? setIndex(index + 1) : onClose());
  const prev = () => setIndex(Math.max(0, index - 1));

  // Record the view (other people's stories only).
  useEffect(() => {
    if (!isStory || isMine || story.viewed) return;
    api(`/stories/${story._id}/view`, { method: 'POST' }).then(() => onSeen?.(story._id)).catch(() => {});
  }, [story._id]);

  async function sendReply(e) {
    e.preventDefault();
    try {
      await api(`/stories/${story._id}/reply`, { method: 'POST', body: { body: reply } });
      setReply('');
      toast('Reply sent', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // Progress bars show only the current person's stories.
  const siblings = stories.filter((s) => s.author._id === story.author._id);
  const position = siblings.findIndex((s) => s._id === story._id);
  const isPaused = paused || panel !== null;

  return (
    <Modal onClose={onClose} className="h-dvh max-h-none w-full max-w-none sm:h-[88vh] sm:w-auto">
      <div className="relative h-full overflow-hidden bg-black sm:aspect-[9/16] sm:rounded-3xl">
        <img src={story.mediaUrl} alt="" className="size-full object-cover" />
        <div className="absolute inset-x-0 top-0 h-28 bg-linear-to-b from-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-black/70 to-transparent" />

        <div className="absolute inset-x-3 top-3 flex gap-1">
          {siblings.map((s, i) => (
            <div key={s._id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              {/* key={story._id} restarts the animation; when it finishes we advance. */}
              <div key={story._id} onAnimationEnd={next} style={{ animationPlayState: isPaused ? 'paused' : 'running' }}
                className={`h-full bg-white ${i < position ? 'w-full' : i === position ? 'animate-fill' : 'w-0'}`} />
            </div>
          ))}
        </div>

        <div className="absolute inset-x-3 top-7 z-10 flex items-center gap-2.5">
          <Link to={`/u/${story.author.username}`} onClick={onClose} aria-label={`${story.author.username}’s profile`}><Avatar user={story.author} size={34} /></Link>
          <span className="text-sm font-semibold">{mode === 'highlight' ? story.title : story.author.username}</span>
          <span className="text-xs text-white/60">{timeAgo(story.createdAt)}</span>
          <button onClick={onClose} className="icon-btn ml-auto text-white" aria-label="Close"><X size={22} /></button>
        </div>

        <button onClick={prev} className="absolute top-20 bottom-24 left-0 flex w-1/3 items-center" aria-label="Previous">
          <ChevronLeft className="ml-2 hidden opacity-70 sm:block" />
        </button>
        <button onClick={next} className="absolute top-20 right-0 bottom-24 flex w-2/3 items-center justify-end" aria-label="Next">
          <ChevronRight className="mr-2 hidden opacity-70 sm:block" />
        </button>

        <div className="absolute inset-x-3 bottom-4 flex items-center gap-2">
          {isStory && !isMine && (
            <form onSubmit={sendReply} className="flex flex-1 gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
                maxLength={1000} placeholder={`Reply to ${story.author.username}…`} aria-label="Reply to story"
                className="input rounded-full border-white/25 bg-black/40 backdrop-blur" />
              <button disabled={!reply.trim()} className="btn btn-primary rounded-full px-3" aria-label="Send reply"><SendHorizontal size={18} /></button>
            </form>
          )}
          {isStory && isMine && (
            <>
              <button onClick={() => setPanel('viewers')} className="btn rounded-full bg-black/45 text-white backdrop-blur"><Eye size={16} /> Viewers</button>
              <button onClick={() => setPanel('highlight')} className="btn ml-auto rounded-full bg-black/45 text-white backdrop-blur"><Star size={16} /> Highlight</button>
            </>
          )}
          {mode === 'highlight' && isMine && (
            <button onClick={() => setPanel('delete')} className="btn ml-auto rounded-full bg-black/45 text-red-300 backdrop-blur"><Trash2 size={16} /> Delete highlight</button>
          )}
        </div>
      </div>

      {panel === 'viewers' && <ViewersSheet storyId={story._id} onClose={() => setPanel(null)} />}
      {panel === 'highlight' && <HighlightSheet storyId={story._id} onClose={() => setPanel(null)} />}
      {panel === 'delete' && (
        <Confirm title={`Delete “${story.title}”?`} text="The highlight is removed from your profile." confirmLabel="Delete"
          onClose={() => setPanel(null)} onConfirm={async () => { await onDeleteHighlight(story.highlightId); onClose(); }} />
      )}
    </Modal>
  );
}

function ViewersSheet({ storyId, onClose }) {
  const { data, loading } = useFetch(`/stories/${storyId}/viewers`);
  return (
    <Sheet title={data ? `Seen by ${data.viewers.length}` : 'Viewers'} onClose={onClose}>
      <div className="max-h-[50vh] overflow-y-auto p-3">
        {loading && <RowSkeleton rows={2} />}
        {data?.viewers.length === 0 && <p className="p-4 text-center text-sm text-muted">No views yet.</p>}
        {data?.viewers.map(({ user, viewedAt }) => (
          <div key={user._id} className="flex items-center gap-3 px-2 py-2">
            <Avatar user={user} size={38} />
            <span className="flex-1 text-sm font-semibold">{user.username}</span>
            <span className="text-xs text-muted">{timeAgo(viewedAt)}</span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function HighlightSheet({ storyId, onClose }) {
  const toast = useToast();
  const { data } = useFetch('/highlights');
  const [title, setTitle] = useState('');

  async function save(request) {
    try {
      await request;
      toast('Added to highlights', 'success');
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <Sheet title="Add to highlight" onClose={onClose}>
      <div className="p-4">
        {data?.highlights.map((h) => (
          <button key={h._id} onClick={() => save(api(`/highlights/${h._id}/items`, { method: 'POST', body: { storyId } }))}
            className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-raised">
            <img src={h.items.at(-1)?.mediaUrl} alt="" className="size-10 rounded-xl object-cover" />
            <span className="text-sm font-semibold">{h.title}</span>
            <span className="ml-auto text-xs text-muted">{h.items.length}</span>
          </button>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); save(api('/highlights', { method: 'POST', body: { title, storyId } })); }} className="mt-3 flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={30} required placeholder="New highlight name" className="input" aria-label="New highlight name" />
          <button className="btn btn-primary">Create</button>
        </form>
      </div>
    </Sheet>
  );
}
