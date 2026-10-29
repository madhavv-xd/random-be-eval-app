import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ImageOff } from 'lucide-react';
import { useFetch } from '../hooks';
import PostCard from '../components/PostCard';
import { Empty, ErrorState, PostSkeleton } from '../components/Ui';

// Shareable /p/:id page: the full post with comments open.
export default function PostPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useFetch(`/posts/${id}`);
  const notFound = error === 'Post not found' || error === 'Invalid id';

  return (
    <div className="mx-auto max-w-xl">
      <button onClick={() => navigate(-1)} className="btn btn-ghost mb-4 px-3"><ArrowLeft size={16} /> Back</button>
      {loading && !data && <PostSkeleton />}
      {notFound && (
        <Empty icon={ImageOff} title="Post unavailable" text="It may have been deleted, or it’s from a private account you don’t follow.">
          <Link to="/" className="btn btn-primary">Back home</Link>
        </Empty>
      )}
      {error && !notFound && <ErrorState message={error} onRetry={reload} />}
      {data && <PostCard key={data.post._id} post={data.post} commentsOpen onDeleted={() => navigate('/', { replace: true })} />}
    </div>
  );
}
