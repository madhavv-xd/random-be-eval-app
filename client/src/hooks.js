import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './api';

// Loads one endpoint with loading / error / retry state. `path = null` skips loading.
export function useFetch(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const [attempt, setAttempt] = useState(0);
  const lastPath = useRef(path);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    // Keep old data on retry/reload, clear it when switching to a different path.
    setState((s) => ({ data: lastPath.current === path ? s.data : null, error: null, loading: true }));
    lastPath.current = path;
    api(path)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((err) => alive && setState((s) => ({ ...s, error: err.message, loading: false })));
    return () => { alive = false; };
  }, [path, attempt]);

  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), []);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, setData, reload };
}

// Cursor-paginated list + infinite scroll. Attach `sentinel` to an element after the list.
// `key` is the array field in the response ('posts', 'notifications', …).
export function usePaged(path, limit = 10, key = 'posts') {
  const [state, setState] = useState({ items: [], loading: true, error: null, done: false });
  const cursor = useRef(''); // '' = first page, null = no more pages
  const busy = useRef(false);
  const generation = useRef(0); // bumps when `path` changes, so stale responses are ignored
  const sentinel = useRef(null);

  const loadMore = useCallback(async () => {
    if (busy.current || cursor.current === null) return;
    busy.current = true;
    const gen = generation.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const sep = path.includes('?') ? '&' : '?';
      const data = await api(`${path}${sep}limit=${limit}${cursor.current ? `&cursor=${encodeURIComponent(cursor.current)}` : ''}`);
      if (gen !== generation.current) return;
      cursor.current = data.nextCursor;
      setState((s) => ({ items: [...s.items, ...data[key]], loading: false, error: null, done: data.nextCursor === null }));
    } catch (err) {
      if (gen === generation.current) setState((s) => ({ ...s, loading: false, error: err.message }));
    } finally {
      if (gen === generation.current) busy.current = false;
    }
  }, [path, limit, key]);

  useEffect(() => {
    generation.current++;
    cursor.current = '';
    busy.current = false;
    setState({ items: [], loading: true, error: null, done: false });
    loadMore();
  }, [loadMore]);

  // Re-created after every page so a sentinel that is still on screen triggers the next load.
  useEffect(() => {
    if (!sentinel.current) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && loadMore(), { rootMargin: '600px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [loadMore, state.items.length]);

  const setItems = useCallback((fn) => setState((s) => ({ ...s, items: fn(s.items) })), []);
  return { ...state, setItems, loadMore, sentinel };
}

// Browser online/offline status (native events, no polling).
const subscribe = (cb) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine);
