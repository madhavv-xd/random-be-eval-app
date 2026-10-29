import { useParams } from 'react-router-dom';
import { Hash } from 'lucide-react';
import { usePaged } from '../hooks';
import PostGrid from '../components/PostGrid';
import { Empty, ErrorState, GridSkeleton } from '../components/Ui';

export default function TagPage() {
  const { tag } = useParams();
  const { items: posts, loading, error, done, loadMore, sentinel } = usePaged(`/tags/${encodeURIComponent(tag)}`, 18);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center gap-4">
        <span className="grid size-16 place-items-center rounded-3xl bg-linear-to-br from-coral to-amber text-bg"><Hash size={30} strokeWidth={2.5} /></span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">#{tag}</h1>
          <p className="text-sm text-muted">{done ? `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}` : 'Recent posts'}</p>
        </div>
      </header>
      {posts.length > 0 && <PostGrid posts={posts} />}
      {loading && <div className={posts.length ? 'mt-3' : ''}><GridSkeleton count={posts.length ? 3 : 9} /></div>}
      {error && <ErrorState message={error} onRetry={loadMore} />}
      {!loading && !error && posts.length === 0 && <Empty icon={Hash} title="No posts yet" text={`Use #${tag} in a caption to start this tag.`} />}
      <div ref={sentinel} />
    </div>
  );
}
