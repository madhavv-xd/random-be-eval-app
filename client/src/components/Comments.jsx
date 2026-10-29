import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, SendHorizontal, X } from 'lucide-react';
import { api, timeAgo } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { useToast } from '../toast';
import Avatar from './Avatar';
import { ErrorState, RichText, RowSkeleton } from './Ui';

export default function Comments({ postId, postAuthorId, onCount }) {
  const { data, error, loading, reload, setData } = useFetch(`/posts/${postId}/comments`);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(null); // { id, username }
  const [sending, setSending] = useState(false);
  const input = useRef(null);
  const toast = useToast();
  const comments = data?.comments;
  const setComments = (fn) => setData((d) => ({ ...d, comments: fn(d.comments) }));

  useEffect(() => { if (replyTo) input.current?.focus(); }, [replyTo]);

  // Live: when anyone comments on (or deletes from) this post, refetch the list through the REST API,
  // which re-applies the privacy and block rules. ponytail: one refetch per event per open list.
  const { socket } = useAuth();
  useEffect(() => {
    if (!socket) return;
    const onChange = (e) => e.postId === postId && reload();
    socket.on('comment:new', onChange);
    socket.on('comment:deleted', onChange);
    return () => {
      socket.off('comment:new', onChange);
      socket.off('comment:deleted', onChange);
    };
  }, [socket, postId, reload]);

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const res = await api(`/posts/${postId}/comments`, { method: 'POST', body: { body, parentId: replyTo?.id } });
      setComments((list) => [...list, res.comment]);
      onCount(res.commentCount);
      setBody('');
      setReplyTo(null);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  }

  function startReply(comment) {
    setReplyTo({ id: comment.parentId ?? comment._id, username: comment.userId.username });
    setBody(`@${comment.userId.username} `);
  }

  const top = comments?.filter((c) => !c.parentId) ?? [];
  const repliesOf = (id) => comments.filter((c) => c.parentId === id);
  const rowProps = { postAuthorId, onReply: startReply, setComments, onCount };

  return (
    <div className="border-t border-line p-4">
      <div className="max-h-96 space-y-4 overflow-y-auto">
        {loading && !comments && <RowSkeleton rows={2} />}
        {error && <ErrorState plain message={error} onRetry={reload} />}
        {comments?.length === 0 && <p className="py-2 text-sm text-muted">No comments yet. Start the conversation.</p>}
        {top.map((c) => (
          <div key={c._id}>
            <CommentRow comment={c} {...rowProps} />
            {repliesOf(c._id).length > 0 && (
              <div className="mt-3 ml-11 space-y-3 border-l border-line pl-3">
                {repliesOf(c._id).map((r) => <CommentRow key={r._id} comment={r} small {...rowProps} />)}
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="mt-3">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-raised px-3 py-1.5 text-xs text-muted">
            Replying to @{replyTo.username}
            <button type="button" onClick={() => { setReplyTo(null); setBody(''); }} aria-label="Cancel reply"><X size={14} /></button>
          </div>
        )}
        <div className="flex gap-2">
          <input ref={input} value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} className="input" placeholder="Add a comment…" aria-label="Add a comment" />
          <button disabled={sending || !body.trim()} className="btn btn-primary px-3" aria-label="Send comment"><SendHorizontal size={18} /></button>
        </div>
      </form>
    </div>
  );
}

function CommentRow({ comment: c, small, postAuthorId, onReply, setComments, onCount }) {
  const { user } = useAuth();
  const toast = useToast();
  const canDelete = c.userId._id === user._id || postAuthorId === user._id;
  const update = (change) => setComments((list) => list.map((x) => (x._id === c._id ? { ...x, ...change } : x)));

  async function like() {
    update({ likedByMe: !c.likedByMe, likeCount: c.likeCount + (c.likedByMe ? -1 : 1) }); // optimistic
    try {
      const data = await api(`/comments/${c._id}/like`, { method: 'POST' });
      update({ likedByMe: data.liked, likeCount: data.likeCount });
    } catch (err) {
      update({ likedByMe: c.likedByMe, likeCount: c.likeCount });
      toast(err.message, 'error');
    }
  }

  async function remove() {
    try {
      const data = await api(`/comments/${c._id}`, { method: 'DELETE' });
      setComments((list) => list.filter((x) => !data.removedIds.includes(x._id)));
      onCount(data.commentCount);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="flex gap-3">
      <Link to={`/u/${c.userId.username}`} tabIndex={-1} aria-hidden="true"><Avatar user={c.userId} size={small ? 26 : 32} /></Link>
      <div className="min-w-0 flex-1 text-sm">
        <p className="break-words">
          <Link to={`/u/${c.userId.username}`} className="mr-1.5 font-semibold">{c.userId.username}</Link>
          <RichText text={c.body} />
        </p>
        <div className="mt-1 flex gap-4 text-xs font-medium text-muted">
          <span>{timeAgo(c.createdAt)}</span>
          {c.likeCount > 0 && <span>{c.likeCount} {c.likeCount === 1 ? 'like' : 'likes'}</span>}
          <button onClick={() => onReply(c)} className="hover:text-fg">Reply</button>
          {canDelete && <button onClick={remove} className="hover:text-red-300">Delete</button>}
        </div>
      </div>
      <button onClick={like} aria-pressed={c.likedByMe} aria-label={c.likedByMe ? 'Unlike comment' : 'Like comment'} className={`self-start pt-1 ${c.likedByMe ? 'text-coral' : 'text-muted hover:text-fg'}`}>
        <Heart size={14} fill={c.likedByMe ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}
