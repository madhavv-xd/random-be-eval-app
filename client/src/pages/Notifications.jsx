import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AtSign, BellOff, CheckCheck, Heart, MessageCircle, UserCheck, UserPlus } from 'lucide-react';
import { api, timeAgo } from '../api';
import { NOTIFICATION_TEXT, useAuth } from '../auth';
import { useFetch, usePaged } from '../hooks';
import { useToast } from '../toast';
import Avatar from '../components/Avatar';
import { Empty, ErrorState, RowSkeleton, SafeImg, Video } from '../components/Ui';

// Small icon on the avatar says what kind of notification it is, before you read the text.
const KIND = {
  like: [Heart, 'bg-coral text-on-accent'],
  comment_like: [Heart, 'bg-coral text-on-accent'],
  comment: [MessageCircle, 'bg-fg text-bg'],
  reply: [MessageCircle, 'bg-fg text-bg'],
  mention: [AtSign, 'bg-amber text-on-accent'],
  follow: [UserPlus, 'bg-fg text-bg'],
  follow_request: [UserPlus, 'bg-amber text-on-accent'],
  follow_accept: [UserCheck, 'bg-fg text-bg'],
};

// Today / This week / Earlier, keeping the server's newest-first order.
function groupByAge(items) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const weekAgo = startOfToday - 6 * 86400e3;
  const groups = [['Today', []], ['This week', []], ['Earlier', []]];
  for (const n of items) {
    const t = new Date(n.createdAt).getTime();
    groups[t >= startOfToday ? 0 : t >= weekAgo ? 1 : 2][1].push(n);
  }
  return groups.filter(([, list]) => list.length);
}

export default function Notifications() {
  const { socket, setUnread } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  // Cursor-paginated: 20 at a time, more load as you scroll.
  const { items, setItems, loading, error, loadMore, sentinel } = usePaged('/notifications', 20, 'notifications');
  const requests = useFetch('/follow-requests');
  const reloadRequests = requests.reload;

  useEffect(() => { api('/counts').then((c) => setUnread(c.notifications)).catch(() => {}); }, [setUnread]);

  // New notifications slide in at the top while this page is open.
  useEffect(() => {
    if (!socket) return;
    const prepend = (n) => {
      setItems((list) => [n, ...list]);
      if (n.type === 'follow_request') reloadRequests();
    };
    socket.on('notification:new', prepend);
    return () => socket.off('notification:new', prepend);
  }, [socket, setItems, reloadRequests]);

  async function markAllRead() {
    try {
      await api('/notifications/read-all', { method: 'PATCH' });
      setItems((list) => list.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
      toast('All caught up', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const unreadCount = items.filter((n) => !n.isRead).length;
  function open(n) {
    if (!n.isRead) {
      setItems((list) => list.map((x) => (x._id === n._id ? { ...x, isRead: true } : x)));
      api(`/notifications/${n._id}/read`, { method: 'PATCH' }).then((r) => setUnread(r.unreadCount)).catch(() => {});
    }
    navigate(n.postId ? `/p/${n.postId._id}` : `/u/${n.actorId.username}`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Notifications</h1>
          <p className="mt-0.5 text-sm text-muted">{unreadCount ? `${unreadCount} new` : 'You’re all caught up'}</p>
        </div>
        <button onClick={markAllRead} disabled={!unreadCount} className="btn btn-ghost"><CheckCheck size={16} /> Mark all read</button>
      </div>

      {requests.data?.requests.length > 0 && <FollowRequests list={requests.data.requests} onDone={requests.reload} />}

      {error && <ErrorState message={error} onRetry={loadMore} />}
      {!loading && !error && items.length === 0 && <Empty icon={BellOff} title="Nothing yet" text="Likes, comments, mentions and new followers show up here in real time." />}
      {groupByAge(items).map(([label, list]) => (
        <section key={label} aria-labelledby={`n-${label}`}>
          <h2 id={`n-${label}`} className="mb-2 px-1 text-sm font-semibold text-muted">{label}</h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {list.map((n) => {
              const [Icon, tone] = KIND[n.type] ?? KIND.follow;
              return (
                <li key={n._id}>
                  <button onClick={() => open(n)}
                    className={`flex w-full items-center gap-3.5 px-4 py-3 text-left transition duration-150 hover:bg-raised/60 ${n.isRead ? '' : 'bg-coral/[0.06]'}`}>
                    <span className="relative shrink-0">
                      <Avatar user={n.actorId} size={44} />
                      <span className={`absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full ring-2 ring-card ${tone}`}>
                        <Icon size={11} strokeWidth={2.75} fill={Icon === Heart ? 'currentColor' : 'none'} />
                      </span>
                    </span>
                    <p className="min-w-0 flex-1 text-sm leading-snug">
                      <span className="font-semibold">{n.actorId.username}</span> {NOTIFICATION_TEXT[n.type]}
                      <span className="mt-0.5 block text-xs text-muted">{timeAgo(n.createdAt)}{timeAgo(n.createdAt) !== 'now' && ' ago'}</span>
                    </p>
                    {n.postId && (n.postId.mediaType === 'video'
                      ? <Video src={n.postId.mediaUrl} muted preload="metadata" className="size-11 shrink-0 rounded-xl object-cover" />
                      : <SafeImg src={n.postId.mediaUrl} width={120} sizes="44px" className="size-11 shrink-0 rounded-xl object-cover" />)}
                    {!n.isRead && <span className="size-2 shrink-0 rounded-full bg-coral"><span className="sr-only">Unread</span></span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {loading && <div className="card px-4 py-2"><RowSkeleton rows={items.length ? 2 : 4} /></div>}
      <div ref={sentinel} />
    </div>
  );
}

function FollowRequests({ list, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);

  async function respond(id, action) {
    setBusy(id);
    try {
      await api(`/follow-requests/${id}/${action}`, { method: 'POST' });
      toast(action === 'accept' ? 'Request accepted' : 'Request removed', 'success');
      onDone();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card p-4">
      <h2 className="mb-2 flex items-center gap-2 font-bold"><UserPlus size={18} className="text-coral" /> Follow requests <span className="text-muted">{list.length}</span></h2>
      {list.map((r) => (
        <div key={r._id} className="flex items-center gap-3 py-2">
          <Link to={`/u/${r.fromId.username}`} tabIndex={-1} aria-hidden="true"><Avatar user={r.fromId} size={42} /></Link>
          <Link to={`/u/${r.fromId.username}`} className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold">{r.fromId.username}</p>
            <p className="truncate text-xs text-muted">{r.fromId.name}</p>
          </Link>
          <button onClick={() => respond(r._id, 'accept')} disabled={busy === r._id} className="btn btn-primary px-3 py-1.5 text-xs">Confirm</button>
          <button onClick={() => respond(r._id, 'decline')} disabled={busy === r._id} className="btn btn-ghost px-3 py-1.5 text-xs">Delete</button>
        </div>
      ))}
    </section>
  );
}
