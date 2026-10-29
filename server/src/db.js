import mongoose from 'mongoose';

// Returns true when running on the in-memory fallback (so the caller can auto-seed).
export async function connectDB() {
  let uri = process.env.MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    uri = (await MongoMemoryServer.create()).getUri();
    console.log('MONGO_URI not set: using in-memory MongoDB (data resets on restart)');
  }
  await mongoose.connect(uri);
  return !process.env.MONGO_URI;
}
