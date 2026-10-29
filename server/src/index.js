import { connectDB } from './db.js';
import { server } from './app.js';
import { seed } from './seed.js';

const inMemory = await connectDB();
if (inMemory) await seed(); // zero-setup demo: fresh DB gets demo data every start

const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`Pulse API on http://localhost:${port}`));
