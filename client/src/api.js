// Where the API lives. Empty in dev (Vite proxies /api, /uploads and /socket.io to localhost:4000).
// In production set VITE_API_URL, e.g. https://pulse-api.onrender.com
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

// Tiny fetch wrapper: adds the JWT, sends JSON or FormData, throws the server's { error } message.
export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('token');
  const isForm = body instanceof FormData;
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body && !isForm && { 'Content-Type': 'application/json' }),
    },
    body: isForm ? body : body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export function timeAgo(date) {
  const seconds = (Date.now() - new Date(date)) / 1000;
  for (const [unit, size] of [['d', 86400], ['h', 3600], ['m', 60]]) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${unit}`;
  }
  return 'now';
}

// Media URLs from the API are either local uploads ("/uploads/…"), Cloudinary URLs, or remote seed URLs.
// - local uploads are prefixed with the API origin (the web app and API are on different domains in production)
// - Cloudinary URLs get f_auto (AVIF/WebP when supported), q_auto and a width, so the CDN serves the
//   smallest file that still looks sharp; that's what makes mobile data usage reasonable.
const CLOUDINARY = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/)(.*)$/;
export function media(url, width) {
  if (!url) return url;
  if (url.startsWith('/uploads/')) return API_URL + url;
  const m = url.match(CLOUDINARY);
  if (!m) return url;
  const t = m[2] === 'video' ? 'q_auto' : ['f_auto', 'q_auto', width && `w_${width}`, width && 'c_limit'].filter(Boolean).join(',');
  return `${m[1]}${t}/${m[3]}`;
}

// Responsive srcset for Cloudinary images (others get none and the browser uses src).
const WIDTHS = [320, 480, 640, 960, 1280];
export function srcSet(url) {
  if (!CLOUDINARY.test(url ?? '') || url.includes('/video/')) return undefined;
  return WIDTHS.map((w) => `${media(url, w)} ${w}w`).join(', ');
}
