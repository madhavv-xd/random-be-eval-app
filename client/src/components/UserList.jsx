import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import Avatar from './Avatar';
import FollowButton from './FollowButton';
import { Sheet } from './Modal';
import { Empty, ErrorState, RowSkeleton } from './Ui';

// Modal list of users (followers, following, likes) with follow buttons. `path` returns { users }.
export default function UserList({ title, path, onClose, emptyText = 'Nobody here yet.' }) {
  const { user: me } = useAuth();
  const { data, error, loading, reload } = useFetch(path);

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="max-h-[60vh] overflow-y-auto p-3">
        {loading && !data && <div className="px-2"><RowSkeleton rows={4} /></div>}
        {error && <ErrorState plain message={error} onRetry={reload} />}
        {data?.users.length === 0 && <Empty plain icon={Users} title="No one yet" text={emptyText} />}
        {data?.users.map((u) => (
          <div key={u._id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
            <Link to={`/u/${u.username}`} onClick={onClose} tabIndex={-1} aria-hidden="true"><Avatar user={u} size={42} /></Link>
            <Link to={`/u/${u.username}`} onClick={onClose} className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{u.username}</p>
              <p className="truncate text-xs text-muted">{u.name}</p>
            </Link>
            {u._id !== me._id && <FollowButton userId={u._id} status={u.followStatus} isPrivate={u.isPrivate} className="px-3 py-1.5 text-xs" />}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
