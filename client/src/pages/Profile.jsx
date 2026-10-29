import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Ban, Bookmark, Clapperboard, Ellipsis, Grid3x3, ImageOff, Link2, Lock, MessageCircleMore, Settings, UserX } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { useToast } from '../toast';
import Avatar from '../components/Avatar';
import FollowButton from '../components/FollowButton';
import { Confirm } from '../components/Modal';
import PostGrid from '../components/PostGrid';
import { copyLink } from '../components/PostCard';
import { StoryViewer } from '../components/Stories';
import UserList from '../components/UserList';
import { Empty, ErrorState, GridSkeleton, Menu, MenuItem } from '../components/Ui';

// Each profile gets its own warm gradient banner, derived from the username.
function bannerFor(username) {
  const hue = 330 + ([...username].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 70);
  return `radial-gradient(circle at 20% 120%, hsl(${hue + 30} 95% 60% / .9), transparent 55%),
          linear-gradient(135deg, hsl(${hue} 70% 32%), hsl(${hue + 45} 90% 52%))`;
}

// key={username} resets tabs and dialogs when you navigate from one profile to another.
export default function Profile() {
  const { username } = useParams();
  return <ProfileView key={username} username={username} />;
}

function ProfileView({ username }) {
  const { user: me } = useAuth();
  const { data, error, loading, reload, setData } = useFetch(`/users/${username}`);
  const [tab, setTab] = useState('posts');
  const [dialog, setDialog] = useState(null); // 'followers' | 'following' | 'block'
  const [highlight, setHighlight] = useState(null);
  const saved = useFetch(tab === 'saved' ? '/saved' : null);
  const banner = useMemo(() => bannerFor(username), [username]);
  const navigate = useNavigate();
  const toast = useToast();

  const isMe = me.username === username.toLowerCase();
  const user = data?.user;

  if (error === 'User not found') return <Empty icon={UserX} title="User not found" text={`There’s no one called @${username} here.`} />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  async function message() {
    try {
      const { conversation } = await api('/conversations', { method: 'POST', body: { userId: user._id } });
      navigate(`/messages/${conversation._id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function toggleBlock() {
    const res = await api(`/users/${user._id}/block`, { method: 'POST' });
    toast(res.blocked ? `Blocked @${user.username}` : `Unblocked @${user.username}`, 'success');
    reload();
  }

  async function deleteHighlight(id) {
    await api(`/highlights/${id}`, { method: 'DELETE' });
    setData((d) => ({ ...d, highlights: d.highlights.filter((h) => h._id !== id) }));
    toast('Highlight deleted', 'success');
  }

  const locked = data?.isLocked;
  const posts = tab === 'saved' ? saved.data?.posts : tab === 'reels' ? data?.posts.filter((p) => p.mediaType === 'video') : data?.posts;
  const tabs = [['posts', 'Posts', Grid3x3], ['reels', 'Reels', Clapperboard], ...(isMe ? [['saved', 'Saved', Bookmark]] : [])];
  const stat = (label, value, onClick) => (
    <button key={label} onClick={onClick} disabled={!onClick} className="py-4 enabled:hover:bg-raised/60">
      <span className="block text-xl font-extrabold">{value ?? '–'}</span>
      <span className="text-xs text-muted">{label}</span>
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="h-36 rounded-3xl border border-line sm:h-52" style={{ background: banner }} />

      <div className="px-4 sm:px-8">
        <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-16">
          {user
            ? <Avatar user={user} size={112} className="ring-[6px] ring-bg" />
            : <div className="size-28 animate-pulse rounded-[35%] bg-raised ring-[6px] ring-bg" />}
          {user && (isMe ? (
            <div className="flex gap-2">
              <Link to="/settings" className="btn btn-ghost"><Settings size={16} /> Edit profile</Link>
              <button onClick={() => copyLink(`/u/${user.username}`, toast)} className="btn btn-ghost px-3" aria-label="Copy profile link"><Link2 size={16} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {data.blockedByMe
                ? <button onClick={() => setDialog('block')} className="btn btn-ghost">Unblock</button>
                : <>
                    <FollowButton key={user._id} userId={user._id} status={data.followStatus} isPrivate={user.isPrivate}
                      onChange={({ status, followerCount }) => (status === 'following' || data.followStatus === 'following'
                        ? reload() // access to posts may have changed
                        : setData((d) => ({ ...d, user: { ...d.user, followerCount } })))} />
                    <button onClick={message} className="btn btn-ghost"><MessageCircleMore size={16} /> Message</button>
                  </>}
              <Menu label="More options" icon={<Ellipsis size={20} />}>
                <MenuItem icon={Link2} onClick={() => copyLink(`/u/${user.username}`, toast)}>Copy profile link</MenuItem>
                <MenuItem icon={Ban} danger onClick={() => setDialog('block')}>{data.blockedByMe ? 'Unblock' : 'Block'}</MenuItem>
              </Menu>
            </div>
          ))}
        </div>

        {user ? (
          <div className="mt-4">
            <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
              {user.name} {user.isPrivate && <Lock size={18} className="text-muted" aria-label="Private account" />}
            </h1>
            <p className="text-sm text-muted">@{user.username}</p>
            {user.bio && <p className="mt-3 max-w-lg text-sm leading-relaxed">{user.bio}</p>}
          </div>
        ) : (
          <div className="mt-4 animate-pulse space-y-2"><div className="h-6 w-48 rounded bg-raised" /><div className="h-4 w-24 rounded bg-raised" /></div>
        )}

        <div className="card mt-6 grid grid-cols-3 divide-x divide-line overflow-hidden text-center">
          {stat('Posts', locked ? '–' : data?.posts.length)}
          {stat('Followers', user?.followerCount, user && !locked ? () => setDialog('followers') : null)}
          {stat('Following', user?.followingCount, user && !locked ? () => setDialog('following') : null)}
        </div>

        {data?.highlights.length > 0 && (
          <div className="no-scrollbar mt-6 flex gap-4 overflow-x-auto">
            {data.highlights.map((h) => (
              <button key={h._id} onClick={() => setHighlight(h)} className="flex w-20 shrink-0 flex-col items-center gap-1.5">
                <img src={h.items.at(-1)?.mediaUrl} alt="" className="size-18 rounded-[35%] border-2 border-line object-cover p-0.5" />
                <span className="w-full truncate text-center text-xs font-medium">{h.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {data?.blockedByMe ? (
        <div className="mt-8"><Empty icon={Ban} title={`You blocked @${user.username}`} text="They can’t see your profile, posts or stories, or message you." /></div>
      ) : locked ? (
        <div className="mt-8"><Empty icon={Lock} title="This account is private" text="Follow this account to see their photos and videos." /></div>
      ) : (
        <>
          <div role="tablist" className="mx-4 mt-8 flex gap-2 sm:mx-8">
            {tabs.map(([id, label, Icon]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`btn rounded-full ${tab === id ? 'bg-fg text-bg' : 'text-muted hover:bg-raised hover:text-fg'}`}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
          <div className="mt-4">
            {(loading || (tab === 'saved' && saved.loading)) && !posts && <GridSkeleton />}
            {tab === 'saved' && saved.error && <ErrorState message={saved.error} onRetry={saved.reload} />}
            {posts?.length === 0 && (tab === 'saved'
              ? <Empty icon={Bookmark} title="Nothing saved" text="Tap the bookmark on any post to keep it here." />
              : <Empty icon={tab === 'reels' ? Clapperboard : ImageOff} title={tab === 'reels' ? 'No reels yet' : 'No posts yet'}
                  text={isMe ? 'Share your first photo or video.' : 'Nothing posted yet.'}>
                  {isMe && <Link to="/create" className="btn btn-primary">Create a post</Link>}
                </Empty>)}
            {posts?.length > 0 && <PostGrid posts={posts} />}
          </div>
        </>
      )}

      {(dialog === 'followers' || dialog === 'following') && (
        <UserList title={dialog === 'followers' ? 'Followers' : 'Following'} path={`/users/${user._id}/${dialog}`} onClose={() => setDialog(null)} />
      )}
      {dialog === 'block' && (
        <Confirm
          title={data.blockedByMe ? `Unblock @${user.username}?` : `Block @${user.username}?`}
          text={data.blockedByMe
            ? 'They’ll be able to see your posts and follow you again.'
            : 'They won’t be able to find your profile, see your posts or message you. They won’t be told.'}
          confirmLabel={data.blockedByMe ? 'Unblock' : 'Block'} danger={!data.blockedByMe}
          onConfirm={toggleBlock} onClose={() => setDialog(null)} />
      )}
      {highlight && (
        <StoryViewer mode="highlight" start={0} onClose={() => setHighlight(null)} onDeleteHighlight={deleteHighlight}
          stories={highlight.items.map((item) => ({ ...item, author: user, title: highlight.title, highlightId: highlight._id }))} />
      )}
    </div>
  );
}
