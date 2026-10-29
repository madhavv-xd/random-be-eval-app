import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Users } from 'lucide-react';
import { usePaged } from '../hooks';
import PostCard from '../components/PostCard';
import Stories from '../components/Stories';
import Suggestions from '../components/Suggestions';
import { Empty, ErrorState, PostSkeleton } from '../components/Ui';

// Two feeds over the same posts: "Following" is newest-first; "For you" is ranked by engagement and recency.
const FEEDS = [
  { id: 'following', label: 'Following', icon: Users, path: '/feed' },
  { id: 'ranked', label: 'For you', icon: Sparkles, path: '/feed?sort=ranked' },
];

export default function Home() {
  const [feed, setFeed] = useState(FEEDS[0]);
  const { items: posts, setItems, loading, error, done, loadMore, sentinel } = usePaged(feed.path);
  const removePost = (id) => setItems((list) => list.filter((p) => p._id !== id));

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="mx-auto w-full max-w-xl min-w-0 space-y-6">
        <Stories />

        <div role="tablist" aria-label="Feed" className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-card p-1">
          {FEEDS.map((f) => (
            <button key={f.id} role="tab" aria-selected={feed.id === f.id} onClick={() => setFeed(f)}
              className={`btn rounded-xl ${feed.id === f.id ? 'bg-raised text-fg' : 'text-muted hover:text-fg'}`}>
              <f.icon size={16} className={feed.id === f.id ? 'text-coral' : ''} /> {f.label}
            </button>
          ))}
        </div>

        {posts.map((post) => <PostCard key={post._id} post={post} onDeleted={removePost} />)}
        {loading && <><PostSkeleton />{posts.length === 0 && <PostSkeleton />}</>}
        {error && <ErrorState message={error} onRetry={loadMore} />}
        {!loading && !error && posts.length === 0 && (
          <Empty icon={Users} title="Your feed is quiet" text="Follow a few people and their posts will show up here.">
            <Link to="/explore" className="btn btn-primary">Find people</Link>
          </Empty>
        )}
        {done && posts.length > 0 && <p className="py-4 text-center text-sm text-muted">You’re all caught up ✨</p>}
        <div ref={sentinel} />
      </div>
      <div className="hidden lg:block"><Suggestions /></div>
    </div>
  );
}
