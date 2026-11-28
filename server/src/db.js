import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';

// Returns true when running on the local fallback (so the caller can seed it when empty).
export async function connectDB() {
  let uri = process.env.MONGO_URI;
  if (!uri) {
    if (process.env.NODE_ENV === 'production') throw new Error('MONGO_URI must be set in production');
    // Local MongoDB kept in server/.data, so posts survive restarts. Delete that folder to start over.
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const dbPath = path.resolve(import.meta.dirname, '../.data');
    await fs.mkdir(dbPath, { recursive: true });
    uri = (await MongoMemoryServer.create({ instance: { dbPath, storageEngine: 'wiredTiger' } })).getUri('pulse');
    console.log(`MONGO_URI not set: using local MongoDB in ${path.relative(process.cwd(), dbPath)}`);
  }
  await mongoose.connect(uri);
  await ensureIndexes();
  return !process.env.MONGO_URI;
}

// Unique indexes (username, email, one like per user...) are what stop duplicates, so wait until
// they exist instead of letting Mongoose build them in the background after we start serving.
export const ensureIndexes = () => Promise.all(Object.values(mongoose.models).map((m) => m.init()));
