import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useFetch } from '../hooks';
import Avatar from './Avatar';
import FollowButton from './FollowButton';
import { ErrorState, RowSkeleton } from './Ui';

export default function Suggestions() {
  const { data, error, loading, reload } = useFetch('/users/suggestions');

  return (
    <aside className="card sticky top-24 p-5">
      <h2 className="font-bold">Suggested people</h2>
      <p className="mb-3 text-xs text-muted">People you don’t follow yet</p>
      {loading && !data && <RowSkeleton rows={3} />}
      {error && <ErrorState plain message={error} onRetry={reload} />}
      {data?.users.length === 0 && <p className="text-sm text-muted">You follow everyone. Impressive.</p>}
      <ul className="space-y-1">
        {data?.users.map((u) => (
          <li key={u._id} className="flex items-center gap-3 py-2">
            <Link to={`/u/${u.username}`} tabIndex={-1} aria-hidden="true"><Avatar user={u} /></Link>
            <Link to={`/u/${u.username}`} className="min-w-0 flex-1 leading-tight">
              <span className="flex items-center gap-1 truncate text-sm font-semibold">{u.name}{u.isPrivate && <Lock size={12} className="text-muted" />}</span>
              <span className="text-xs text-muted">@{u.username} · {u.followerCount} followers</span>
            </Link>
            <FollowButton userId={u._id} status={u.followStatus} isPrivate={u.isPrivate} className="px-3 py-1.5 text-xs" />
          </li>
        ))}
      </ul>
    </aside>
  );
}
