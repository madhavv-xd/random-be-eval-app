import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, Bell, Clapperboard, Compass, House, LogOut, MessageCircleMore, Monitor, Moon, PlusSquare, Settings, Sun, UserRound, WifiOff } from 'lucide-react';
import { useAuth } from '../auth';
import { useOnline } from '../hooks';
import { useTheme } from '../theme';
import Avatar from './Avatar';
import { Menu } from './Ui';

export function Logo({ compact = false }) {
  return (
    <Link to="/" className="flex items-center gap-2 rounded-xl" aria-label="Pulse home">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-coral to-amber text-on-accent">
        <Activity size={20} strokeWidth={2.6} />
      </span>
      {!compact && <span className="text-xl font-extrabold tracking-tight">pulse</span>}
    </Link>
  );
}

function Badge({ count, dot = false }) {
  if (!count) return null;
  if (dot) return <span className="absolute top-2 right-2 size-2.5 rounded-full bg-coral ring-2 ring-sidebar" />;
  return (
    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1.5 text-[11px] font-bold text-on-accent tabular-nums">
      {count > 99 ? '99+' : count}
    </span>
  );
}

const THEMES = [['system', 'System', Monitor], ['light', 'Light', Sun], ['dark', 'Dark', Moon]];

// Three-way theme switch. Lives inside the account menu; clicks don't close the menu.
export function ThemeSwitch({ className = '' }) {
  const { preference, setPreference } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" onClick={(e) => e.stopPropagation()} className={`grid grid-cols-3 gap-1 rounded-xl bg-raised p-1 ${className}`}>
      {THEMES.map(([id, label, Icon]) => (
        <button key={id} role="radio" aria-checked={preference === id} onClick={() => setPreference(id)} title={label}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition duration-150 ${preference === id ? 'bg-card text-fg shadow-sm shadow-shade' : 'text-muted hover:text-fg'}`}>
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  );
}

function AccountMenuItems({ user, logout }) {
  const item = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm hover:bg-raised';
  return (
    <>
      <div className="px-3 pt-2 pb-2.5">
        <p className="truncate text-sm font-semibold">{user.name}</p>
        <p className="truncate text-xs text-muted">@{user.username}</p>
      </div>
      <Link to={`/u/${user.username}`} className={item}><UserRound size={16} /> Profile</Link>
      <Link to="/settings" className={item}><Settings size={16} /> Settings</Link>
      <p className="px-3 pt-2.5 pb-1.5 text-xs font-semibold text-muted">Appearance</p>
      <ThemeSwitch className="mx-1.5 mb-1.5" />
      <div className="my-1 border-t border-line" />
      <button onClick={logout} className={`${item} text-danger`}><LogOut size={16} /> Log out</button>
    </>
  );
}

export default function Layout() {
  const { user, unread, unreadMessages, logout } = useAuth();
  const navigate = useNavigate();
  const online = useOnline();

  // "/" jumps to search from anywhere (unless you're typing).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      navigate('/explore', { state: { focusSearch: true } });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);

  const nav = [
    { to: '/', label: 'Home', icon: House, end: true },
    { to: '/explore', label: 'Search & explore', short: 'Explore', icon: Compass },
    { to: '/reels', label: 'Reels', icon: Clapperboard },
    { to: '/messages', label: 'Messages', icon: MessageCircleMore, count: unreadMessages },
    { to: '/notifications', label: 'Notifications', icon: Bell, count: unread },
    { to: `/u/${user.username}`, label: 'Profile', icon: UserRound },
  ];
  const tabs = [nav[0], nav[1], { to: '/create', label: 'Create', icon: PlusSquare }, nav[2], nav[5]];

  return (
    <>
      {/* ── Desktop / tablet: side navigation (icon rail on md, labelled on lg+) ── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col border-r border-line bg-sidebar px-3 py-5 md:flex lg:w-[248px] lg:px-4">
        <div className="mb-7 flex justify-center lg:justify-start lg:px-2.5">
          <span className="lg:hidden"><Logo compact /></span>
          <span className="hidden lg:block"><Logo /></span>
        </div>

        <nav aria-label="Main" className="flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon, end, count }) => (
            <NavLink key={to} to={to} end={end} title={label}
              aria-label={count ? `${label}, ${count} unread` : label}
              className={({ isActive }) => `group relative flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-[15px] transition duration-150 max-lg:justify-center
                ${isActive ? 'bg-raised font-semibold text-fg' : 'font-medium text-muted hover:bg-raised/70 hover:text-fg'}`}>
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.4 : 2} className={`shrink-0 transition duration-150 group-active:scale-90 ${isActive ? 'text-coral' : ''}`} />
                  <span className="hidden flex-1 truncate lg:block">{label}</span>
                  <span className="hidden lg:block"><Badge count={count} /></span>
                  <span className="lg:hidden"><Badge count={count} dot /></span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <Link to="/create" className="btn btn-primary mt-5 py-2.5 max-lg:size-11 max-lg:self-center max-lg:p-0" title="Create a post" aria-label="Create a post">
          <PlusSquare size={19} /> <span className="hidden lg:inline">Create</span>
        </Link>

        <div className="mt-auto">
          <Menu label="Account menu" up align="left" className="w-full"
            trigger="flex w-full items-center gap-3 rounded-xl p-2 text-left transition duration-150 hover:bg-raised max-lg:justify-center"
            icon={<>
              <Avatar user={user} size={36} />
              <span className="hidden min-w-0 flex-1 leading-tight lg:block">
                <span className="block truncate text-sm font-semibold">{user.name}</span>
                <span className="block truncate text-xs text-muted">@{user.username}</span>
              </span>
            </>}>
            <AccountMenuItems user={user} logout={logout} />
          </Menu>
        </div>
      </aside>

      {/* ── Mobile: compact top bar ── */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-lg md:hidden">
        <div className="flex h-14 items-center gap-1 px-3">
          <Logo />
          <NavLink to="/notifications" className="icon-btn ml-auto" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Bell size={22} /><Badge count={unread} dot />
          </NavLink>
          <NavLink to="/messages" className="icon-btn" aria-label={`Messages${unreadMessages ? `, ${unreadMessages} unread` : ''}`}>
            <MessageCircleMore size={22} /><Badge count={unreadMessages} dot />
          </NavLink>
          <Menu label="Account menu" icon={<Avatar user={user} size={30} />}>
            <AccountMenuItems user={user} logout={logout} />
          </Menu>
        </div>
      </header>

      <div className="md:pl-[76px] lg:pl-[248px]">
        {!online && (
          <div role="status" className="sticky top-14 z-30 flex items-center justify-center gap-2 bg-amber px-4 py-1.5 text-xs font-semibold text-on-accent md:top-0">
            <WifiOff size={14} /> You’re offline. Changes won’t be saved until you reconnect.
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 pt-5 pb-28 sm:px-6 md:pt-8 md:pb-12">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile: bottom tab bar ── */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden">
        <div className="grid grid-cols-5">
          {tabs.map(({ to, label, short, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition duration-150 ${isActive ? 'text-coral' : 'text-muted'}`}>
              <Icon size={22} />
              {short ?? label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
