// Shrinks photos in the browser before upload: longest side ≤ 1600px, re-encoded as WebP.
// Uses the native canvas API, so no image library is needed. Small files, GIFs and videos are left alone,
// and so is any photo that doesn't actually get smaller (e.g. browsers that can't encode WebP).
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 300 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file); // respects EXIF rotation in modern browsers
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob || blob.size >= file.size) return file;
    const ext = blob.type.split('/')[1];
    return new File([blob], `${file.name.replace(/\.\w+$/, '')}.${ext}`, { type: blob.type });
  } catch {
    return file; // unreadable format (e.g. HEIC in some browsers): upload as-is
  }
}

export const formatBytes = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
