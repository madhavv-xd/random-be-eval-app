import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImagePlus, MapPin, Plus, X } from 'lucide-react';
import { api } from '../api';
import { compressImage, formatBytes } from '../compress';
import { useToast } from '../toast';

const MAX_MB = 50;
const MAX_PHOTOS = 10;

export default function Create() {
  const [files, setFiles] = useState([]);
  const [current, setCurrent] = useState(0);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [originalSize, setOriginalSize] = useState(0); // before compression, to show the saving
  const [optimizing, setOptimizing] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  const isVideo = files[0]?.type.startsWith('video/');

  // Rules: up to 10 photos, or exactly one video. Photos are compressed in the browser as they're added.
  async function pick(e) {
    const chosen = [...e.target.files];
    e.target.value = '';
    if (chosen.some((f) => f.size > MAX_MB * 1024 * 1024)) return toast(`Files must be under ${MAX_MB} MB`, 'error');
    const video = chosen.find((f) => f.type.startsWith('video/'));
    if (video) {
      if (chosen.length > 1 || (files.length && !isVideo)) toast('A video post holds just that one video');
      setFiles([video]);
      setOriginalSize(video.size);
      return setCurrent(0);
    }
    const kept = isVideo ? [] : files;
    const room = MAX_PHOTOS - kept.length;
    if (chosen.length > room) toast(`Up to ${MAX_PHOTOS} photos per post`);
    const added = chosen.slice(0, room);
    setOptimizing(true);
    const compressed = await Promise.all(added.map((f) => compressImage(f)));
    setOptimizing(false);
    setFiles([...kept, ...compressed]);
    setOriginalSize((n) => (isVideo ? 0 : n) + added.reduce((sum, f) => sum + f.size, 0));
  }

  function remove(i) {
    if (files.length === 1) setOriginalSize(0);
    setFiles(files.filter((_, k) => k !== i));
    setCurrent(Math.max(0, Math.min(current, files.length - 2)));
  }

  async function submit(e) {
    e.preventDefault();
    const form = new FormData();
    files.forEach((f) => form.append('media', f));
    form.append('caption', caption);
    form.append('location', location);
    setBusy(true);
    try {
      const { post } = await api('/posts', { method: 'POST', body: form });
      toast(post.mediaType === 'video' ? 'Reel posted' : 'Posted', 'success');
      navigate(post.mediaType === 'video' ? '/reels' : `/p/${post._id}`);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mx-auto max-w-xl p-5 sm:p-6">
      <h1 className="text-xl font-bold">New post</h1>
      <p className="mt-1 text-sm text-muted">Up to {MAX_PHOTOS} photos, or one short video (it also shows up in Reels). Use #tags and @mentions in the caption.</p>

      {files.length > 0 ? (
        <>
          <div className="relative mt-5 overflow-hidden rounded-2xl bg-black">
            {isVideo
              ? <video src={previews[0]} controls muted className="max-h-[55vh] w-full" />
              : <img src={previews[current]} alt="Preview" className="max-h-[55vh] w-full object-contain" />}
            <button type="button" onClick={() => remove(current)} className="icon-btn absolute top-3 right-3 bg-black/60 text-white" aria-label="Remove this file"><X size={18} /></button>
          </div>
          {!isVideo && (
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
              {previews.map((url, i) => (
                <button type="button" key={url} onClick={() => setCurrent(i)} aria-label={`Photo ${i + 1}`}
                  className={`size-16 shrink-0 overflow-hidden rounded-xl border-2 ${i === current ? 'border-coral' : 'border-transparent'}`}>
                  <img src={url} alt="" className="size-full object-cover" />
                </button>
              ))}
              {files.length < MAX_PHOTOS && (
                <label className="grid size-16 shrink-0 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-line text-muted hover:border-coral/60" aria-label="Add more photos">
                  <input type="file" accept="image/*" multiple onChange={pick} className="sr-only" />
                  <Plus size={20} />
                </label>
              )}
            </div>
          )}
        </>
      ) : (
        <label className="mt-5 flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-raised/50 text-center transition hover:border-coral/60">
          <input type="file" accept="image/*,video/*" multiple onChange={pick} className="sr-only" />
          <span className="grid size-14 place-items-center rounded-2xl bg-coral/10 text-coral"><ImagePlus size={26} /></span>
          <span className="font-semibold">Choose photos or a short video</span>
          <span className="text-xs text-muted">JPG, PNG, MP4 · up to {MAX_MB} MB each</span>
        </label>
      )}

      {optimizing && <p className="mt-3 animate-pulse text-xs text-muted">Optimizing photos…</p>}
      {!optimizing && !isVideo && files.length > 0 && originalSize > 0 && (
        <p className="mt-3 text-xs text-muted">
          Optimized for upload: {formatBytes(originalSize)} → <span className="font-semibold text-coral">{formatBytes(files.reduce((sum, f) => sum + f.size, 0))}</span>
        </p>
      )}

      <label className="mt-5 block">
        <span className="mb-1.5 flex justify-between text-xs font-semibold text-muted">Caption <span>{caption.length}/2200</span></span>
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} maxLength={2200} className="input resize-none" placeholder="Say something about it… #weekend with @friend" />
      </label>

      <label className="relative mt-4 block">
        <MapPin size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={60} className="input pl-10" placeholder="Add location (optional)" aria-label="Location" />
      </label>

      {busy && <div className="mt-5 h-1 overflow-hidden rounded-full bg-raised"><div className="h-full w-1/3 animate-pulse rounded-full bg-coral" /></div>}
      <button disabled={!files.length || busy || optimizing} className="btn btn-primary mt-5 w-full py-3">
        {busy ? 'Uploading…' : `Share${files.length > 1 ? ` ${files.length} photos` : ''}`}
      </button>
    </form>
  );
}
