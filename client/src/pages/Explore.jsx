import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Hash, ImageOff, Lock, Search, TrendingUp, UserX } from 'lucide-react';
import { useFetch, usePaged } from '../hooks';
import Avatar from '../components/Avatar';
import PostGrid from '../components/PostGrid';
import { Empty, ErrorState, GridSkeleton, RowSkeleton } from '../components/Ui';

const TYPES = [['user', 'People'], ['post', 'Posts'], ['hashtag', 'Tags']];

export default function Explore() {
  // Search state lives in the URL (?q=&type=), so the navbar search and location links land here.
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const type = params.get('type') ?? 'user';
  const setSearch = (next) => setParams(Object.fromEntries(Object.entries({ q, type, ...next }).filter(([, v]) => v)), { replace: true });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setSearch({ q: e.target.value })}
          className="input rounded-2xl py-3.5 pl-11 text-base"
          placeholder="Search people, posts, places or #tags"
          aria-label="Search"
        />
      </div>

      {q.trim() ? (
        <>
          <div role="tablist" className="flex gap-2">
            {TYPES.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={type === id} onClick={() => setSearch({ type: id })}
                className={`btn rounded-full ${type === id ? 'bg-fg text-bg' : 'text-muted hover:bg-raised hover:text-fg'}`}>
                {label}
              </button>
            ))}
          </div>
          <SearchResults q={q.trim()} type={type} />
        </>
      ) : (
        <Discover />
      )}
    </div>
  );
}

function SearchResults({ q, type }) {
  // A tiny debounce: only search once typing pauses for 250ms.
  const debounced = useDebounced(`/search?type=${type}&q=${encodeURIComponent(q)}`, 250);
  const { data, error, loading, reload } = useFetch(debounced);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data || debounced !== `/search?type=${type}&q=${encodeURIComponent(q)}`) {
    return type === 'post' ? <GridSkeleton count={6} /> : <div className="card px-5 py-3"><RowSkeleton rows={3} /></div>;
  }

  if (type === 'post') {
    return data.posts.length
      ? <PostGrid posts={data.posts} />
      : <Empty icon={ImageOff} title="No posts found" text={`No captions or places match “${q}”.`} />;
  }
  if (type === 'hashtag') {
    return data.tags.length ? (
      <div className="card divide-y divide-line">
        {data.tags.map(({ tag, count }) => (
          <Link key={tag} to={`/tags/${tag}`} className="flex items-center gap-3 px-4 py-3 hover:bg-raised/60">
            <span className="grid size-10 place-items-center rounded-2xl bg-coral/10 text-coral"><Hash size={18} /></span>
            <span className="flex-1 font-semibold">#{tag}</span>
            <span className="text-sm text-muted">{count} {count === 1 ? 'post' : 'posts'}</span>
          </Link>
        ))}
      </div>
    ) : <Empty icon={Hash} title="No tags found" text={`No hashtags start with “${q.replace(/^#/, '')}”.`} />;
  }
  return data.users.length ? (
    <section className="card p-3">
      {data.users.map((u) => (
        <Link key={u._id} to={`/u/${u.username}`} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-raised">
          <Avatar user={u} size={44} />
          <div className="min-w-0 leading-tight">
            <p className="flex items-center gap-1 truncate font-semibold">{u.name}{u.isPrivate && <Lock size={13} className="text-muted" />}</p>
            <p className="truncate text-sm text-muted">@{u.username} · {u.followerCount} followers</p>
          </div>
        </Link>
      ))}
    </section>
  ) : <Empty icon={UserX} title="No one found" text={`Nobody matches “${q}”.`} />;
}

function Discover() {
  const trending = useFetch('/explore/trending');
  const { items: posts, loading, error, loadMore, sentinel } = usePaged('/explore', 18);
  return (
    <>
      {trending.data?.tags.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><TrendingUp size={20} className="text-coral" /> Trending this week</h2>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {trending.data.tags.map(({ tag, count }) => (
              <Link key={tag} to={`/tags/${tag}`} className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold hover:border-coral/50">
                <Hash size={14} className="text-coral" />{tag}<span className="font-normal text-muted">{count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="mb-3 text-lg font-bold">Fresh from everyone</h2>
        {posts.length > 0 && <PostGrid posts={posts} />}
        {loading && <div className={posts.length ? 'mt-3' : ''}><GridSkeleton count={posts.length ? 3 : 9} /></div>}
        {error && <ErrorState message={error} onRetry={loadMore} />}
        {!loading && !error && posts.length === 0 && <Empty icon={ImageOff} title="Nothing here yet" text="Be the first to post something." />}
        <div ref={sentinel} />
      </section>
    </>
  );
}

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
