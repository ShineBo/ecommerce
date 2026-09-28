import fs from 'node:fs/promises';
import argon2 from 'argon2';
import { User, Product } from '../models/index.js';

export const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};
export async function seedCatalog({ update = false } = {}) {
  const products = JSON.parse(
    await fs.readFile(new URL('../data/products.json', import.meta.url), 'utf8'),
  );
  // Validate every record before applying any updates; existing order snapshots are never modified.
  products.forEach((product) => {
    const error = new Product(product).validateSync();
    if (error) throw error;
  });
  for (const product of products) {
    await Product.updateOne(
      { sku: product.sku },
      { [update ? '$set' : '$setOnInsert']: product },
      { upsert: true, runValidators: true },
    );
  }
}
export async function seedDemo(config) {
  if (!config.seedDemo) return;
  if (!config.demoPassword || config.demoPassword.length < 12 || config.demoPassword.length > 128)
    throw new Error('Set DEMO_CUSTOMER_PASSWORD to 12–128 characters');
  await seedCatalog();
  for (const [name, emailNormalized] of [
    ['Jamie', 'jamie@example.com'],
    ['Alex', 'alex@example.com'],
  ]) {
    if (!(await User.exists({ emailNormalized }))) {
      await User.create({
        name,
        emailNormalized,
        passwordHash: await argon2.hash(config.demoPassword, passwordOptions),
      });
    }
  }
}
