import mongoose from 'mongoose';
import { readConfig } from '../src/config.js';
import { connectDatabase } from '../src/models/index.js';
import { seedCatalog } from '../src/services/seed.js';
try {
  await connectDatabase(readConfig());
  await seedCatalog({ update: true });
  console.log('Catalog updated. Users, carts, and order snapshots preserved.');
} finally {
  await mongoose.disconnect();
}
