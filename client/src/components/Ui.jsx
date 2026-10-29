// Small shared pieces: skeletons, empty/error states, rich text, safe images and a dropdown menu.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff, RotateCw, WifiOff } from 'lucide-react';

export function PostSkeleton() {
  return (
    <div className="card animate-pulse p-4">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-[35%] bg-raised" />
        <div className="space-y-2">
          <div className="h-3 w-28 rounded bg-raised" />
          <div className="h-2.5 w-16 rounded bg-raised" />
        </div>
      </div>
      <div className="mt-4 aspect-[4/5] rounded-2xl bg-raised" />
      <div className="mt-4 h-3 w-2/3 rounded bg-raised" />
    </div>
  );
}

export function GridSkeleton({ count = 9 }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
      {Array.from({ length: count }, (_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-raised" />)}
    </div>
  );
}

export function RowSkeleton({ rows = 1 }) {
  return Array.from({ length: rows }, (_, i) => (
    <div key={i} className="flex animate-pulse items-center gap-3 py-2">
      <div className="size-10 rounded-[35%] bg-raised" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/2 rounded bg-raised" />
        <div className="h-2.5 w-1/3 rounded bg-raised" />
      </div>
    </div>
  ));
}

export function Empty({ icon: Icon, title, text, children, plain = false }) {
  return (
    <div className={`flex flex-col items-center px-6 py-14 text-center ${plain ? '' : 'card'}`}>
      <div className="grid size-14 place-items-center rounded-2xl bg-coral/10 text-coral">
        <Icon size={26} />
      </div>
      <h3 className="mt-4 font-bold">{title}</h3>
      {text && <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

// Shown when a request fails: says what happened and offers a retry.
export function ErrorState({ message, onRetry, plain }) {
  const offline = !navigator.onLine;
  return (
    <Empty plain={plain} icon={offline ? WifiOff : RotateCw}
      title={offline ? 'You’re offline' : 'Couldn’t load this'}
      text={offline ? 'Check your connection and try again.' : message}>
      {onRetry && <button onClick={onRetry} className="btn btn-ghost"><RotateCw size={16} /> Try again</button>}
    </Empty>
  );
}

// Turns #tags and @mentions into links.
export function RichText({ text }) {
  return text.split(/([#@][\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)*)/u).map((part, i) => {
    if (part.startsWith('#')) return <Link key={i} to={`/tags/${part.slice(1).toLowerCase()}`} className="font-medium text-coral hover:underline">{part}</Link>;
    if (part.startsWith('@')) return <Link key={i} to={`/u/${part.slice(1).toLowerCase()}`} className="font-medium text-amber hover:underline">{part}</Link>;
    return part;
  });
}

// <img> that shows a placeholder instead of a broken-image icon.
export function SafeImg({ src, alt = '', className = '', ...props }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className={`grid place-items-center bg-raised text-muted ${className}`} role="img" aria-label={alt || 'Image unavailable'}><ImageOff size={24} /></div>;
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} className={className} {...props} />;
}

// Dropdown built on native <details>; closes on item click or outside click.
export function Menu({ label, icon, children, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && (ref.current.open = false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  return (
    <details ref={ref} className={`relative ${className}`}>
      <summary className="icon-btn cursor-pointer list-none [&::-webkit-details-marker]:hidden" aria-label={label} title={label}>{icon}</summary>
      <div onClick={() => (ref.current.open = false)} className="absolute right-0 z-20 mt-1 w-52 rounded-2xl border border-line bg-card p-1.5 shadow-xl shadow-black/40">
        {children}
      </div>
    </details>
  );
}

export function MenuItem({ icon: Icon, children, danger, ...props }) {
  return (
    <button {...props} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm hover:bg-raised ${danger ? 'text-red-300' : ''}`}>
      <Icon size={16} /> {children}
    </button>
  );
}
