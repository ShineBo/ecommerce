import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import { readConfig } from './config.js';
import { connectDatabase } from './models/index.js';
import { seedDemo } from './services/seed.js';
import { cleanupOrphanUploads } from './services/uploads.js';
import { createApp } from './app.js';

const config = readConfig();
await fs.mkdir(config.uploadDir, { recursive: true });
for (let attempt = 1; ; attempt++) {
  try {
    await connectDatabase(config);
    break;
  } catch (error) {
    if (attempt === 10) throw error;
    console.log(`Waiting for database (${attempt}/10)`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
await seedDemo(config);
await cleanupOrphanUploads(config);
const app = createApp(config);
const server = app.listen(config.port, '0.0.0.0', () =>
  console.log(`Simple Shop API listening on ${config.port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(async () => {
      await app.locals.sessionStore.close();
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
