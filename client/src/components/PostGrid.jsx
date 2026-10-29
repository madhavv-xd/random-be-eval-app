import { Link } from 'react-router-dom';
import { Copy, Heart, MessageCircle, Play } from 'lucide-react';
import { SafeImg } from './Ui';

// Grid of post tiles linking to /p/:id. Icons mark videos and multi-photo posts.
export default function PostGrid({ posts }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
      {posts.map((post) => (
        <Link key={post._id} to={`/p/${post._id}`} aria-label={`Open post by ${post.authorId.username}`}
          className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-raised focus-visible:outline-2 focus-visible:outline-coral">
          {post.mediaType === 'video'
            ? <video src={`${post.mediaUrl}#t=0.5`} muted playsInline preload="metadata" className="size-full object-cover" />
            : <SafeImg src={post.mediaUrl} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-105" />}
          {post.mediaType === 'video' && <Play size={18} fill="currentColor" className="absolute top-2.5 right-2.5 drop-shadow" />}
          {post.extraMedia?.length > 0 && <Copy size={18} className="absolute top-2.5 right-2.5 drop-shadow" />}
          <div className="absolute inset-0 hidden items-center justify-center gap-4 bg-black/45 text-sm font-semibold group-hover:flex">
            <span className="flex items-center gap-1"><Heart size={16} fill="currentColor" />{post.likeCount}</span>
            <span className="flex items-center gap-1"><MessageCircle size={16} fill="currentColor" />{post.commentCount}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
