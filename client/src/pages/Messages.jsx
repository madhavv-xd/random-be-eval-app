import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircleMore, PenSquare, SendHorizontal } from 'lucide-react';
import { api, timeAgo } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { useToast } from '../toast';
import Avatar from '../components/Avatar';
import { Sheet } from '../components/Modal';
import { Empty, ErrorState, RowSkeleton } from '../components/Ui';

// Two panes on desktop (inbox + chat); on mobile the inbox and the chat are separate screens.
export default function Messages() {
  const { id } = useParams();
  return (
    <div className="card mx-auto grid h-[calc(100dvh-11rem)] max-w-5xl overflow-hidden md:h-[calc(100dvh-8rem)] md:grid-cols-[320px_minmax(0,1fr)]">
      <Inbox activeId={id} className={id ? 'hidden md:flex' : 'flex'} />
      {id ? <Thread key={id} id={id} /> : (
        <div className="hidden place-items-center md:grid">
          <Empty plain icon={MessageCircleMore} title="Your messages" text="Pick a conversation, or start a new one." />
        </div>
      )}
    </div>
  );
}

function Inbox({ activeId, className }) {
  const { user, socket } = useAuth();
  const { data, error, loading, reload } = useFetch('/conversations');
  const [composing, setComposing] = useState(false);

  // Re-sort and refresh previews whenever a message arrives.
  useEffect(() => {
    if (!socket) return;
    socket.on('message:new', reload);
    return () => socket.off('message:new', reload);
  }, [socket, reload]);

  return (
    <aside className={`${className} min-h-0 flex-col border-line md:border-r`}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h1 className="text-lg font-bold">Messages</h1>
        <button onClick={() => setComposing(true)} className="icon-btn" aria-label="New message" title="New message"><PenSquare size={20} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && !data && <div className="px-2"><RowSkeleton rows={4} /></div>}
        {error && <ErrorState plain message={error} onRetry={reload} />}
        {data?.conversations.length === 0 && (
          <Empty plain icon={MessageCircleMore} title="No messages yet" text="Say hi to someone you follow.">
            <button onClick={() => setComposing(true)} className="btn btn-primary">New message</button>
          </Empty>
        )}
        {data?.conversations.map((c) => {
          const unread = c._id === activeId ? 0 : c.unread;
          const mine = c.lastMessage?.senderId === user._id;
          return (
            <Link key={c._id} to={`/messages/${c._id}`}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${c._id === activeId ? 'bg-raised' : 'hover:bg-raised/60'}`}>
              <Avatar user={c.other} size={46} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold">{c.other.name}</p>
                <p className={`truncate text-sm ${unread ? 'font-semibold text-fg' : 'text-muted'}`}>
                  {mine && 'You: '}{c.lastMessage?.body} · {timeAgo(c.lastMessage?.createdAt)}
                </p>
              </div>
              {unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1.5 text-[11px] font-bold text-bg">{unread}</span>}
            </Link>
          );
        })}
      </div>
      {composing && <NewMessage onClose={() => setComposing(false)} />}
    </aside>
  );
}

function NewMessage({ onClose }) {
  const [q, setQ] = useState('');
  const { data, loading } = useFetch(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/users/suggestions');
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  async function start(userId) {
    try {
      const { conversation } = await api('/conversations', { method: 'POST', body: { userId } });
      onClose();
      navigate(`/messages/${conversation._id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <Sheet title="New message" onClose={onClose}>
      <div className="p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search people" className="input" aria-label="Search people" />
        <div className="mt-2 max-h-[50vh] overflow-y-auto">
          {loading && !data && <RowSkeleton rows={3} />}
          {data?.users.filter((u) => u._id !== me._id).map((u) => (
            <button key={u._id} onClick={() => start(u._id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-raised">
              <Avatar user={u} size={40} />
              <div className="leading-tight"><p className="text-sm font-semibold">{u.name}</p><p className="text-xs text-muted">@{u.username}</p></div>
            </button>
          ))}
          {data?.users.length === 0 && <p className="p-4 text-center text-sm text-muted">No one found.</p>}
        </div>
      </div>
    </Sheet>
  );
}

function Thread({ id }) {
  const { user, socket, setUnreadMessages } = useAuth();
  const { data, error, loading, reload, setData } = useFetch(`/conversations/${id}/messages`);
  const [body, setBody] = useState('');
  const [typing, setTyping] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const bottom = useRef(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef(null);
  const toast = useToast();

  const markRead = useCallback(() => {
    api(`/conversations/${id}/read`, { method: 'PATCH' }).then((d) => setUnreadMessages(d.unreadMessages)).catch(() => {});
  }, [id, setUnreadMessages]);

  useEffect(() => { markRead(); }, [markRead]);

  const append = useCallback((m) => setData((d) => (d && !d.messages.some((x) => x._id === m._id) ? { ...d, messages: [...d.messages, m] } : d)), [setData]);

  // Live: new messages, "Seen" receipts and the typing indicator.
  useEffect(() => {
    if (!socket) return;
    const onMessage = (m) => {
      if (m.conversationId !== id) return;
      append(m);
      if (m.senderId !== user._id) { setTyping(false); markRead(); }
    };
    const onRead = (r) => r.conversationId === id && setData((d) => d && { ...d, conversation: { ...d.conversation, otherReadAt: r.readAt } });
    const onTyping = (t) => {
      if (t.conversationId !== id) return;
      setTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(false), 3000);
    };
    socket.on('message:new', onMessage);
    socket.on('conversation:read', onRead);
    socket.on('typing', onTyping);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('conversation:read', onRead);
      socket.off('typing', onTyping);
    };
  }, [socket, id, user._id, append, markRead, setData]);

  // Stick to the bottom when the newest message changes (not when older ones load).
  const lastId = data?.messages.at(-1)?._id;
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [lastId, typing]);

  function onType(e) {
    setBody(e.target.value);
    if (Date.now() - lastTypingSent.current > 2000) { // throttle: at most one event every 2s
      socket?.emit('typing', { conversationId: id });
      lastTypingSent.current = Date.now();
    }
  }

  async function send(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBody('');
    try {
      const { message } = await api(`/conversations/${id}/messages`, { method: 'POST', body: { body: text } });
      append(message);
    } catch (err) {
      setBody(text);
      toast(err.message, 'error');
    }
  }

  async function loadOlder() {
    setLoadingOlder(true);
    try {
      const older = await api(`/conversations/${id}/messages?before=${encodeURIComponent(data.messages[0].createdAt)}`);
      setData((d) => ({ ...d, messages: [...older.messages, ...d.messages], hasMore: older.hasMore }));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoadingOlder(false);
    }
  }

  if (error && !data) return <div className="grid place-items-center"><ErrorState plain message={error} onRetry={reload} /></div>;

  const other = data?.conversation.other;
  const messages = data?.messages ?? [];
  const last = messages.at(-1);
  const seen = last?.senderId === user._id && data.conversation.otherReadAt && new Date(data.conversation.otherReadAt) >= new Date(last.createdAt);

  return (
    <section className="flex min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <Link to="/messages" className="icon-btn md:hidden" aria-label="Back to inbox"><ArrowLeft size={20} /></Link>
        {other ? (
          <Link to={`/u/${other.username}`} className="flex items-center gap-3">
            <Avatar user={other} size={38} />
            <div className="leading-tight">
              <p className="text-sm font-semibold">{other.name}</p>
              <p className="text-xs text-muted">{typing ? <span className="text-coral">typing…</span> : `@${other.username}`}</p>
            </div>
          </Link>
        ) : <div className="h-9 w-40 animate-pulse rounded-xl bg-raised" />}
      </header>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-4">
        {loading && !data && <RowSkeleton rows={3} />}
        {data?.hasMore && (
          <div className="pb-2 text-center">
            <button onClick={loadOlder} disabled={loadingOlder} className="btn btn-ghost px-3 py-1.5 text-xs">{loadingOlder ? 'Loading…' : 'Load older messages'}</button>
          </div>
        )}
        {data && messages.length === 0 && (
          <div className="py-10 text-center">
            <Avatar user={other} size={72} className="mx-auto" />
            <p className="mt-3 font-semibold">{other?.name}</p>
            <p className="text-sm text-muted">Say hi 👋</p>
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.senderId === user._id;
          const gap = i === 0 || new Date(m.createdAt) - new Date(messages[i - 1].createdAt) > 60 * 60 * 1000;
          return (
            <div key={m._id}>
              {gap && <p className="py-2 text-center text-[11px] font-medium text-muted">{new Date(m.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div title={new Date(m.createdAt).toLocaleTimeString()} className={`max-w-[75%] rounded-3xl px-4 py-2 text-sm break-words ${mine ? 'rounded-br-lg bg-coral text-bg' : 'rounded-bl-lg bg-raised'}`}>
                  {m.storyMediaUrl && (
                    <div className="mb-2">
                      <p className={`mb-1 text-[11px] ${mine ? 'text-bg/70' : 'text-muted'}`}>{mine ? 'You replied to their story' : 'Replied to your story'}</p>
                      <img src={m.storyMediaUrl} alt="Story" className="h-32 w-20 rounded-xl object-cover" />
                    </div>
                  )}
                  {m.body}
                </div>
              </div>
            </div>
          );
        })}
        {seen && <p className="pr-1 text-right text-[11px] text-muted">Seen</p>}
        {typing && <div className="flex"><span className="animate-pulse rounded-3xl bg-raised px-4 py-2 text-sm text-muted">•••</span></div>}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
        <input value={body} onChange={onType} maxLength={1000} placeholder="Message…" aria-label="Message" className="input rounded-full" disabled={!data} />
        <button disabled={!body.trim()} className="btn btn-primary rounded-full px-3" aria-label="Send"><SendHorizontal size={18} /></button>
      </form>
    </section>
  );
}
