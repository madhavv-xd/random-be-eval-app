import './instrument.js'; // must be first: Sentry instruments modules as they load
import { connectDB } from './db.js';
import { server } from './app.js';
import { seed } from './seed.js';

const inMemory = await connectDB();
if (inMemory) await seed(); // zero-setup demo: fresh DB gets demo data every start

const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`Pulse API on http://localhost:${port}`));

// Graceful shutdown on redeploy: stop accepting sockets, then close Redis and MongoDB.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    const [{ closeSocket }, { redis }, { default: mongoose }] = await Promise.all([import('./socket.js'), import('./cache.js'), import('mongoose')]);
    await closeSocket();
    await redis?.quit().catch(() => {});
    await mongoose.disconnect();
    process.exit(0);
  });
}
