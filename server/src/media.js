// Where uploaded media ends up.
//   - CLOUDINARY_URL set: each file is uploaded to Cloudinary (folder "pulse") and the local temp copy is deleted.
//     The client then asks Cloudinary for f_auto,q_auto,w_<size> variants, so every image is served
//     from the CDN in the best format and quality the browser supports.
//   - otherwise: files stay in server/uploads and are served at /uploads (fine for local dev; a PaaS disk is wiped on deploy).
import fs from 'node:fs/promises';
import path from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import { UPLOADS_DIR } from './lib.js';

export const useCloudinary = !!process.env.CLOUDINARY_URL; // the SDK reads CLOUDINARY_URL itself

// Takes multer's req.files and returns one public URL per file, in the same order.
export async function storeFiles(files = []) {
  if (!useCloudinary) return files.map((f) => `/uploads/${f.filename}`);
  return Promise.all(files.map(async (file) => {
    try {
      const result = await cloudinary.uploader.upload(file.path, { folder: 'pulse', resource_type: 'auto' });
      return result.secure_url;
    } finally {
      await fs.unlink(file.path).catch(() => {});
    }
  }));
}

// "https://res.cloudinary.com/x/image/upload/v17/pulse/abc.jpg" → { publicId: 'pulse/abc', type: 'image' }
function cloudinaryId(url) {
  const m = url.match(/\/(image|video)\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(pulse\/[^.]+)\.\w+$/);
  return m && { type: m[1], publicId: m[2] };
}

// Deletes media we stored (local uploads or our Cloudinary folder). Remote seed URLs are ignored.
export const removeFiles = (urls) => Promise.all(urls.filter(Boolean).map((url) => {
  if (url.startsWith('/uploads/')) return fs.unlink(path.join(UPLOADS_DIR, path.basename(url))).catch(() => {});
  const id = useCloudinary && cloudinaryId(url);
  return id ? cloudinary.uploader.destroy(id.publicId, { resource_type: id.type }).catch(() => {}) : null;
}));

// Temp files left behind by uploads that failed validation.
export const discardUploads = (files = []) => Promise.all(files.map((f) => fs.unlink(f.path).catch(() => {})));
