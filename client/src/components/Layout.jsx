import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, Bell, Clapperboard, Compass, House, LogOut, MessageCircleMore, PlusSquare, Search, Settings, UserRound, WifiOff } from 'lucide-react';
import { useAuth } from '../auth';
import { useOnline } from '../hooks';
import Avatar from './Avatar';
import { Menu } from './Ui';

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="Pulse home">
      <span className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-coral to-amber text-bg">
        <Activity size={20} strokeWidth={2.6} />
      </span>
      <span className="text-xl font-extrabold tracking-tight">pulse</span>
    </Link>
  );
}

const navClass = ({ isActive }) => `icon-btn ${isActive ? 'bg-raised !text-coral' : ''}`;

function Badge({ count }) {
  if (!count) return null;
  return (
    <span className="absolute top-1 right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-bg">
      {count > 9 ? '9+' : count}
    </span>
  );
}

export default function Layout() {
  const { user, unread, unreadMessages, logout } = useAuth();
  const navigate = useNavigate();
  const online = useOnline();

  function search(e) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get('q').trim();
    navigate(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
  }

  const tabs = [
    { to: '/', label: 'Home', icon: House },
    { to: '/explore', label: 'Explore', icon: Compass },
    { to: '/create', label: 'Create', icon: PlusSquare },
    { to: '/reels', label: 'Reels', icon: Clapperboard },
    { to: `/u/${user.username}`, label: 'Profile', icon: UserRound },
  ];
  const menuLink = 'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm hover:bg-raised';

  return (
    <>
      {!online && (
        <div role="status" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber px-4 py-1.5 text-xs font-semibold text-bg">
          <WifiOff size={14} /> You’re offline. Changes won’t be saved until you reconnect.
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Logo />

          <form onSubmit={search} role="search" className="relative ml-6 hidden max-w-sm flex-1 md:block">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
            <input name="q" className="input rounded-full pl-10" placeholder="Search Pulse" aria-label="Search people, posts and tags" />
          </form>

          <nav className="ml-auto flex items-center gap-1">
            {tabs.slice(0, 4).map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end className={(s) => `${navClass(s)} hidden md:grid`} aria-label={label} title={label}>
                <Icon size={21} />
              </NavLink>
            ))}
            <NavLink to="/messages" className={navClass} aria-label={`Messages${unreadMessages ? `, ${unreadMessages} unread` : ''}`} title="Messages">
              <MessageCircleMore size={21} />
              <Badge count={unreadMessages} />
            </NavLink>
            <NavLink to="/notifications" className={navClass} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} title="Notifications">
              <Bell size={21} />
              <Badge count={unread} />
            </NavLink>

            <Menu label="Account menu" className="ml-1" icon={<Avatar user={user} size={34} />}>
              <div className="px-3 py-2">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-muted">@{user.username}</p>
              </div>
              <Link to={`/u/${user.username}`} className={menuLink}><UserRound size={16} /> Profile</Link>
              <Link to="/settings" className={menuLink}><Settings size={16} /> Settings</Link>
              <button onClick={logout} className={`${menuLink} w-full text-red-300`}><LogOut size={16} /> Log out</button>
            </Menu>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 md:pb-12">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden">
        <div className="grid grid-cols-5">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? 'text-coral' : 'text-muted'}`}>
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
