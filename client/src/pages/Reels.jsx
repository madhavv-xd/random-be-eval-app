import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clapperboard, Heart, MessageCircle, Send, Volume2, VolumeX } from 'lucide-react';
import { usePaged } from '../hooks';
import { useToast } from '../toast';
import { copyLink, usePostActions } from '../components/PostCard';
import Avatar from '../components/Avatar';
import Comments from '../components/Comments';
import { Sheet } from '../components/Modal';
import { Empty, ErrorState, RichText } from '../components/Ui';

export default function Reels() {
  const { items, loading, error, loadMore } = usePaged('/reels', 5);

  if (error && !items.length) return <ErrorState message={error} onRetry={loadMore} />;
  if (!loading && items.length === 0) {
    return <Empty icon={Clapperboard} title="No reels yet" text="Post a short video and it will show up here." />;
  }

  return (
    // Scroll-snap does the "one reel per swipe" behaviour; no JS carousel needed.
    <div className="no-scrollbar mx-auto h-[calc(100dvh-11rem)] max-w-md snap-y snap-mandatory overflow-y-scroll rounded-3xl md:h-[calc(100dvh-8rem)]">
      {items.map((post, i) => (
        <Reel key={post._id} post={post} onVisible={i === items.length - 1 ? loadMore : undefined} />
      ))}
      {loading && <div className="h-full snap-start animate-pulse rounded-3xl bg-raised" />}
    </div>
  );
}

function Reel({ post: initial, onVisible }) {
  const video = useRef(null);
  const [muted, setMuted] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const { post, toggleLike, setCommentCount } = usePostActions(initial);
  const toast = useToast();
  const author = post.authorId;

  // Play when at least 60% on screen, pause otherwise. The last reel also asks for the next page.
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        video.current.play().catch(() => {});
        onVisible?.();
      } else {
        video.current.pause();
      }
    }, { threshold: 0.6 });
    observer.observe(video.current);
    return () => observer.disconnect();
  }, [onVisible]);

  const action = 'flex flex-col items-center gap-1 text-xs font-semibold';
  const bubble = 'grid size-12 place-items-center rounded-2xl bg-white/10 backdrop-blur-md transition hover:bg-white/20';

  return (
    <section className="relative h-full snap-start snap-always overflow-hidden rounded-3xl bg-black">
      <video ref={video} src={post.mediaUrl} loop muted={muted} playsInline preload="metadata"
        onClick={() => setMuted(!muted)} className="size-full cursor-pointer object-cover" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-black/85 to-transparent" />

      <div className="absolute right-20 bottom-5 left-4">
        <Link to={`/u/${author.username}`} className="flex items-center gap-2.5">
          <Avatar user={author} size={36} className="ring-2 ring-white/20" />
          <span className="font-semibold">{author.username}</span>
        </Link>
        {post.caption && <p className="mt-2 line-clamp-2 text-sm text-white/90"><RichText text={post.caption} /></p>}
      </div>

      <div className="absolute right-3 bottom-5 flex flex-col gap-4">
        <button onClick={toggleLike} aria-pressed={post.likedByMe} aria-label="Like" className={action}>
          <span className={`${bubble} ${post.likedByMe ? 'text-coral' : ''}`}><Heart key={String(post.likedByMe)} size={24} fill={post.likedByMe ? 'currentColor' : 'none'} className={post.likedByMe ? 'animate-pop' : ''} /></span>
          {post.likeCount}
        </button>
        <button onClick={() => setShowComments(true)} aria-label="Comments" className={action}>
          <span className={bubble}><MessageCircle size={24} /></span>
          {post.commentCount}
        </button>
        <button onClick={() => copyLink(`/p/${post._id}`, toast)} aria-label="Share" className={action}>
          <span className={bubble}><Send size={22} /></span>
        </button>
        <button onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'} className={action}>
          <span className={bubble}>{muted ? <VolumeX size={22} /> : <Volume2 size={22} />}</span>
        </button>
      </div>

      {showComments && (
        <Sheet title="Comments" onClose={() => setShowComments(false)} width="w-[min(94vw,28rem)]">
          <Comments postId={post._id} postAuthorId={author._id} onCount={setCommentCount} />
        </Sheet>
      )}
    </section>
  );
}
