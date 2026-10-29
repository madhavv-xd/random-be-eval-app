import { useState } from 'react';
import { api } from '../api';
import { useToast } from '../toast';

const LABELS = { following: 'Following', requested: 'Requested', none: 'Follow' };

// status: 'following' | 'requested' (private account, waiting) | 'none'
export default function FollowButton({ userId, status: initial = 'none', isPrivate, onChange, className = '' }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function click() {
    const before = status;
    setBusy(true);
    setStatus(status !== 'none' ? 'none' : isPrivate ? 'requested' : 'following'); // optimistic
    try {
      const data = await api(`/users/${userId}/follow`, { method: 'POST' });
      setStatus(data.status);
      if (data.status === 'requested') toast('Follow request sent');
      onChange?.(data);
    } catch (err) {
      setStatus(before);
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={click} disabled={busy} className={`btn ${status === 'none' ? 'btn-primary' : 'btn-ghost'} ${className}`}>
      {LABELS[status]}
    </button>
  );
}
