import { useCallback, useSyncExternalStore } from 'react';

// Theme preference: 'system' (default), 'light' or 'dark', stored in localStorage.
// index.html applies it before first paint (no flash); this keeps it in sync afterwards.
const media = window.matchMedia('(prefers-color-scheme: light)');
const listeners = new Set();

export const getPreference = () => localStorage.getItem('theme') || 'system';
const resolve = (pref) => (pref === 'system' ? (media.matches ? 'light' : 'dark') : pref);

function apply(pref, animate) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theme-fade');
    setTimeout(() => root.classList.remove('theme-fade'), 250);
  }
  const theme = resolve(pref);
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#fafaf9' : '#0d0c0e');
}

media.addEventListener('change', () => {
  if (getPreference() === 'system') apply('system', true);
  listeners.forEach((l) => l());
});

const subscribe = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useTheme() {
  const preference = useSyncExternalStore(subscribe, getPreference);
  const setPreference = useCallback((pref) => {
    localStorage.setItem('theme', pref);
    apply(pref, true);
    listeners.forEach((l) => l());
  }, []);
  return { preference, theme: resolve(preference), setPreference };
}
