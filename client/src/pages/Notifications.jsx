import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BellOff, CheckCheck, UserPlus } from 'lucide-react';
import { api, timeAgo } from '../api';
import { NOTIFICATION_TEXT, useAuth } from '../auth';
import { useFetch, usePaged } from '../hooks';
import { useToast } from '../toast';
import Avatar from '../components/Avatar';
import { Empty, ErrorState, RowSkeleton, SafeImg } from '../components/Ui';

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

  const hasUnread = items.some((n) => !n.isRead);
  const open = (n) => navigate(n.postId ? `/p/${n.postId._id}` : `/u/${n.actorId.username}`);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Notifications</h1>
        <button onClick={markAllRead} disabled={!hasUnread} className="btn btn-ghost"><CheckCheck size={16} /> Mark all read</button>
      </div>

      {requests.data?.requests.length > 0 && <FollowRequests list={requests.data.requests} onDone={requests.reload} />}

      {error && <ErrorState message={error} onRetry={loadMore} />}
      {!loading && !error && items.length === 0 && <Empty icon={BellOff} title="Nothing yet" text="Likes, comments, mentions and new followers show up here in real time." />}
      {items.length > 0 && (
        <ul className="card divide-y divide-line overflow-hidden">
          {items.map((n) => (
            <li key={n._id}>
              <button onClick={() => open(n)} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-raised/60 ${n.isRead ? '' : 'bg-coral/[0.06]'}`}>
                <span className={`size-2 shrink-0 rounded-full ${n.isRead ? 'bg-transparent' : 'bg-coral'}`} aria-label={n.isRead ? undefined : 'Unread'} />
                <Avatar user={n.actorId} size={42} />
                <p className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">{n.actorId.username}</span> {NOTIFICATION_TEXT[n.type]}
                  <span className="ml-1.5 text-xs text-muted">{timeAgo(n.createdAt)}</span>
                </p>
                {n.postId && (n.postId.mediaType === 'video'
                  ? <video src={n.postId.mediaUrl} muted preload="metadata" className="size-11 rounded-xl object-cover" />
                  : <SafeImg src={n.postId.mediaUrl} className="size-11 rounded-xl object-cover" />)}
              </button>
            </li>
          ))}
        </ul>
      )}
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
