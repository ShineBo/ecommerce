import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import sharp from 'sharp';
import argon2 from 'argon2';
import { readConfig } from '../src/config.js';
import { connectDatabase, User, Product, Cart, Order } from '../src/models/index.js';
import { createApp } from '../src/app.js';
import { reviewOrder } from '../src/services/orders.js';
import { cleanupOrphanUploads } from '../src/services/uploads.js';
import { seedCatalog } from '../src/services/seed.js';

const config = readConfig();
if (!config.database.endsWith('_test'))
  throw new Error('Tests require an isolated database ending in _test');
config.authRateLimit = config.orderRateLimit = config.apiRateLimit = 10000;
const hooks = {};
let app;
let png;
before(async () => {
  await connectDatabase(config);
  await Promise.all([
    User.deleteMany({}),
    Product.deleteMany({}),
    Cart.deleteMany({}),
    Order.deleteMany({}),
  ]);
  await fs.mkdir(config.uploadDir, { recursive: true });
  png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#faf0e0' } })
    .png()
    .toBuffer();
  app = createApp(config, hooks);
});
afterEach(() => {
  for (const key of Object.keys(hooks)) delete hooks[key];
});
after(async () => {
  await app.locals.sessionStore.close();
  await mongoose.disconnect();
});
async function customer(target = app) {
  const agent = request.agent(target);
  let token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  const email = `${randomUUID()}@example.com`;
  const password = 'MyLovelyPassword123';
  const result = await agent
    .post('/api/auth/register')
    .set('Origin', config.origin)
    .set('X-CSRF-Token', token)
    .send({ name: 'Test Customer', email, password });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  token = result.body.data.csrfToken;
  const client = {
    agent,
    email,
    password,
    userId: result.body.data.user.id,
    mutate: (method, url) =>
      agent[method](url).set('Origin', config.origin).set('X-CSRF-Token', token),
  };
  return client;
}
async function product(priceMinor = 18900) {
  return Product.create({
    sku: randomUUID(),
    name: 'Test notebook',
    description: 'A useful notebook.',
    imagePath: '/products/notebook.svg',
    category: 'Paper goods',
    priceMinor,
    isActive: true,
  });
}
async function filledCart(client, quantity = 2) {
  const p = await product();
  const current = (await client.agent.get('/api/cart')).body.data;
  const response = await client
    .mutate('post', '/api/cart/items')
    .send({ productId: String(p._id), quantity, expectedVersion: current.version });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return { cart: response.body.data, product: p };
}
function checkout(
  client,
  cart,
  key = randomUUID(),
  buffer = png,
  filename = 'slip.png',
  contentType = 'image/png',
) {
  return client
    .mutate('post', '/api/orders')
    .set('Idempotency-Key', key)
    .field('cartVersion', String(cart.version))
    .field('expectedTotalMinor', String(cart.totalMinor))
    .attach('slip', buffer, { filename, contentType });
}

test('guests cannot browse products or access carts, orders, and slips', async () => {
  for (const endpoint of [
    '/api/products',
    '/api/cart',
    '/api/orders',
    `/api/orders/${new mongoose.Types.ObjectId()}/slip`,
  ])
    assert.equal((await request(app).get(endpoint)).status, 401);
});
test('registration hashes passwords, normalizes email, rejects duplicates and extra privileges', async () => {
  const client = await customer();
  const user = await User.findById(client.userId).select('+passwordHash');
  assert.notEqual(user.passwordHash, client.password);
  assert.ok(await argon2.verify(user.passwordHash, client.password));
  const dup = await client.mutate('post', '/api/auth/register').send({
    name: 'Different',
    email: ` ${client.email.toUpperCase()} `,
    password: client.password,
  });
  assert.equal(dup.status, 409);
  const extra = await client.mutate('post', '/api/auth/register').send({
    name: 'Different',
    email: 'extra@example.com',
    password: client.password,
    role: 'admin',
  });
  assert.equal(extra.status, 422);
});
test('login and logout rotate and invalidate sessions; incorrect credentials are generic', async () => {
  const client = await customer();
  const cookie = (await client.agent.get('/api/auth/csrf')).headers['set-cookie'];
  assert.equal((await client.mutate('post', '/api/auth/logout')).status, 204);
  assert.equal((await client.agent.get('/api/auth/me')).status, 401);
  const csrf = (await client.agent.get('/api/auth/csrf')).body.data.csrfToken;
  const bad = await client.agent
    .post('/api/auth/login')
    .set('Origin', config.origin)
    .set('X-CSRF-Token', csrf)
    .send({ email: client.email, password: 'incorrect' });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error.message, 'Invalid email or password.');
  const good = await client.agent
    .post('/api/auth/login')
    .set('Origin', config.origin)
    .set('X-CSRF-Token', csrf)
    .send({ email: client.email, password: client.password });
  assert.equal(good.status, 200);
  assert.ok(good.headers['set-cookie'][0].includes('HttpOnly'));
  if (cookie) assert.notEqual(good.headers['set-cookie'][0], cookie[0]);
});
test('CSRF rejects missing token, forged token, and wrong origin', async () => {
  const client = await customer();
  assert.equal((await client.agent.post('/api/cart/items').send({})).status, 403);
  assert.equal(
    (
      await client.agent
        .post('/api/cart/items')
        .set('Origin', config.origin)
        .set('X-CSRF-Token', 'bad')
        .send({})
    ).status,
    403,
  );
  assert.equal(
    (
      await client
        .mutate('post', '/api/cart/items')
        .set('Origin', 'https://untrusted.example')
        .send({})
    ).status,
    403,
  );
});
test('cart merges products, calculates totals, persists across requests, and detects stale edits', async () => {
  const client = await customer();
  const { cart, product: p } = await filledCart(client);
  assert.equal(cart.totalMinor, 37800);
  const add = await client
    .mutate('post', '/api/cart/items')
    .send({ productId: String(p._id), quantity: 1, expectedVersion: cart.version });
  assert.equal(add.body.data.items.length, 1);
  assert.equal(add.body.data.quantity, 3);
  assert.equal(add.body.data.totalMinor, 56700);
  const stale = await client
    .mutate('patch', `/api/cart/items/${p._id}`)
    .send({ quantity: 9, expectedVersion: cart.version });
  assert.equal(stale.status, 409);
  assert.equal((await client.agent.get('/api/cart')).body.data.quantity, 3);
  const remove = await client.mutate(
    'delete',
    `/api/cart/items/${p._id}?expectedVersion=${add.body.data.version}`,
  );
  assert.equal(remove.body.data.items.length, 0);
});
test('invalid quantities and mass-assigned prices or owners are rejected', async () => {
  const client = await customer();
  const { cart, product: p } = await filledCart(client);
  for (const quantity of [-1, 0, 1.5, 100, '2']) {
    assert.equal(
      (
        await client
          .mutate('patch', `/api/cart/items/${p._id}`)
          .send({ quantity, expectedVersion: cart.version })
      ).status,
      422,
    );
  }
  assert.equal(
    (
      await client.mutate('patch', `/api/cart/items/${p._id}`).send({
        quantity: 2,
        expectedVersion: cart.version,
        priceMinor: 1,
        userId: new mongoose.Types.ObjectId(),
      })
    ).status,
    422,
  );
  assert.equal((await client.agent.get('/api/cart')).body.data.totalMinor, 37800);
});
test('unavailable products and changed totals block checkout without losing the cart', async () => {
  const client = await customer();
  const { cart, product: p } = await filledCart(client);
  await Product.updateOne({ _id: p._id }, { priceMinor: 20900 });
  assert.equal((await checkout(client, cart)).status, 409);
  await Product.updateOne({ _id: p._id }, { isActive: false });
  assert.equal((await checkout(client, cart)).status, 422);
  assert.equal((await client.agent.get('/api/cart')).body.data.items.length, 1);
});
test('empty cart and missing slip cannot create an order', async () => {
  const client = await customer();
  const empty = (await client.agent.get('/api/cart')).body.data;
  assert.equal((await checkout(client, empty)).status, 422);
  const { cart } = await filledCart(client);
  const response = await client
    .mutate('post', '/api/orders')
    .set('Idempotency-Key', randomUUID())
    .field('cartVersion', String(cart.version))
    .field('expectedTotalMinor', String(cart.totalMinor));
  assert.equal(response.status, 422);
  assert.equal(await Order.countDocuments({ userId: client.userId }), 0);
});
test('invalid, corrupt, oversized, and multi-file slips are rejected', async () => {
  const client = await customer();
  const { cart } = await filledCart(client);
  assert.equal(
    (await checkout(client, cart, randomUUID(), Buffer.from('<svg/>'), 'slip.svg', 'image/svg+xml'))
      .status,
    415,
  );
  assert.equal((await checkout(client, cart, randomUUID(), png.subarray(0, 16))).status, 422);
  assert.equal(
    (await checkout(client, cart, randomUUID(), Buffer.alloc(config.maxSlipBytes + 1))).status,
    413,
  );
  const multi = await checkout(client, cart).attach('second', png, 'second.png');
  assert.equal(multi.status, 422);
  assert.equal(await Order.countDocuments({ userId: client.userId }), 0);
  assert.equal((await client.agent.get('/api/cart')).body.data.quantity, 2);
});
test('successful checkout saves private slip and immutable prices, then clears the cart', async () => {
  const client = await customer();
  const { cart, product: p } = await filledCart(client);
  const response = await checkout(client, cart);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const order = response.body.data;
  assert.equal(order.status, 'PENDING_REVIEW');
  assert.equal(order.totalMinor, 37800);
  assert.equal(order.slip, undefined);
  assert.equal((await client.agent.get('/api/cart')).body.data.items.length, 0);
  await Product.updateOne({ _id: p._id }, { priceMinor: 50000 });
  assert.equal(
    (await client.agent.get(`/api/orders/${order.id}`)).body.data.items[0].unitPriceMinor,
    18900,
  );
  const slip = await client.agent.get(order.slipUrl);
  assert.equal(slip.status, 200);
  assert.equal(slip.headers['cache-control'], 'private, no-store');
});
test('a different customer cannot access another customer cart, order, or slip', async () => {
  const first = await customer();
  const { cart } = await filledCart(first);
  const result = await checkout(first, cart);
  const other = await customer();
  assert.equal((await other.agent.get('/api/cart')).body.data.items.length, 0);
  assert.equal((await other.agent.get(`/api/orders/${result.body.data.id}`)).status, 404);
  assert.equal((await other.agent.get(result.body.data.slipUrl)).status, 404);
  assert.equal((await other.agent.get('/api/orders')).body.meta.total, 0);
});
test('retries after cart clearing/catalog changes return the original order', async () => {
  const client = await customer();
  const { cart, product: p } = await filledCart(client);
  const key = randomUUID();
  const first = await checkout(client, cart, key);
  await Product.updateOne({ _id: p._id }, { priceMinor: 30000 });
  const retry = await checkout(client, cart, key);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.id, first.body.data.id);
  assert.equal((await checkout(client, cart, randomUUID())).status, 409);
  const changed = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#000' },
  })
    .png()
    .toBuffer();
  assert.equal((await checkout(client, cart, key, changed)).status, 409);
  assert.equal(await Order.countDocuments({ userId: client.userId }), 1);
});
test('simultaneous submissions produce only one order and no extra saved slip', async () => {
  const client = await customer();
  const { cart } = await filledCart(client);
  const key = randomUUID();
  const before = (await fs.readdir(config.uploadDir)).length;
  const replies = await Promise.all([checkout(client, cart, key), checkout(client, cart, key)]);
  assert.ok(
    replies.every((reply) => [200, 201].includes(reply.status)),
    replies.map((r) => JSON.stringify(r.body)).join('\n'),
  );
  assert.equal(await Order.countDocuments({ userId: client.userId }), 1);
  assert.equal((await fs.readdir(config.uploadDir)).length, before + 1);
});
test('a checkout committed between lookup and cart read is returned as a replay', async () => {
  const client = await customer();
  const { cart } = await filledCart(client);
  const key = randomUUID();
  let first;
  hooks.afterInitialOrderLookup = async () => {
    delete hooks.afterInitialOrderLookup;
    first = await checkout(client, cart, key);
    assert.equal(first.status, 201);
  };
  const retry = await checkout(client, cart, key);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.id, first.body.data.id);
  assert.equal(retry.body.meta.replayed, true);
  assert.equal(await Order.countDocuments({ userId: client.userId }), 1);
});
test('a failure before insertion preserves cart and removes its unreferenced slip', async () => {
  const client = await customer();
  const { cart } = await filledCart(client);
  const count = (await fs.readdir(config.uploadDir)).length;
  hooks.beforeOrderInsert = () => {
    throw new Error('Simulated insert failure');
  };
  assert.equal((await checkout(client, cart)).status, 500);
  assert.equal(await Order.countDocuments({ userId: client.userId }), 0);
  assert.equal((await fs.readdir(config.uploadDir)).length, count);
  assert.equal((await client.agent.get('/api/cart')).body.data.quantity, 2);
});
test('a failure after insertion resolves the committed order and retains its slip', async () => {
  const client = await customer();
  const { cart } = await filledCart(client);
  hooks.afterOrderInsert = () => {
    throw new Error('Simulated lost database acknowledgement');
  };
  const response = await checkout(client, cart);
  assert.equal(response.status, 200);
  assert.equal((await client.agent.get(response.body.data.slipUrl)).status, 200);
  assert.equal((await client.agent.get('/api/cart')).body.data.quantity, 0);
});
test('failed cart cleanup is reconciled; concurrent newer cart changes are preserved', async () => {
  const first = await customer();
  const { cart } = await filledCart(first);
  hooks.beforeCartClear = () => {
    throw new Error('Simulated cleanup failure');
  };
  assert.equal((await checkout(first, cart)).status, 201);
  assert.equal((await first.agent.get('/api/cart')).body.data.quantity, 0);
  delete hooks.beforeCartClear;
  const other = await customer();
  const state = await filledCart(other);
  hooks.beforeCartClear = async () => {
    await Cart.updateOne(
      { userId: other.userId },
      { $inc: { version: 1 }, $set: { 'items.0.quantity': 4 } },
    );
  };
  const response = await checkout(other, state.cart);
  assert.equal(response.status, 201);
  assert.equal(response.body.meta.cartChanged, true);
  assert.equal((await other.agent.get('/api/cart')).body.data.quantity, 4);
  assert.equal(response.body.data.items[0].quantity, 2);
});
test('only pending orders can be approved/rejected, and rejection requires a reason', async () => {
  const client = await customer();
  const { cart } = await filledCart(client);
  const order = (await checkout(client, cart)).body.data;
  await assert.rejects(
    reviewOrder(order.orderNumber, 'REJECTED', 'Lecturer'),
    (error) => error.status === 422,
  );
  const reviewed = await reviewOrder(
    order.orderNumber,
    'REJECTED',
    'Lecturer',
    'Demo amount needs checking.',
  );
  assert.equal(reviewed.status, 'REJECTED');
  assert.equal(reviewed.review.reason, 'Demo amount needs checking.');
  await assert.rejects(
    reviewOrder(order.orderNumber, 'CONFIRMED', 'Lecturer'),
    (error) => error.status === 409,
  );
});
test('orphan cleanup removes old unused files but never a referenced slip', async () => {
  const client = await customer();
  const { cart } = await filledCart(client);
  await checkout(client, cart);
  const saved = await Order.findOne({ userId: client.userId });
  const orphan = path.join(config.uploadDir, `${randomUUID()}.png`);
  await fs.writeFile(orphan, png);
  const old = new Date(Date.now() - 48 * 3600_000);
  await fs.utimes(orphan, old, old);
  await fs.utimes(path.join(config.uploadDir, saved.slip.storageKey), old, old);
  await cleanupOrphanUploads(config);
  await assert.rejects(fs.access(orphan));
  await fs.access(path.join(config.uploadDir, saved.slip.storageKey));
});
test('expired sessions are rejected independently of Mongo TTL cleanup', async () => {
  const client = await customer();
  const sessions = await mongoose.connection.db.collection('sessions').find().toArray();
  const stored = sessions.find((row) => JSON.parse(row.session).userId === client.userId);
  const payload = JSON.parse(stored.session);
  payload.expiresAt = Date.now() - 1000;
  await mongoose.connection.db
    .collection('sessions')
    .updateOne({ _id: stored._id }, { $set: { session: JSON.stringify(payload) } });
  assert.equal((await client.agent.get('/api/cart')).status, 401);
});
test('authentication limits return 429 with Retry-After', async () => {
  const limitedApp = createApp({ ...config, authRateLimit: 1 });
  const agent = request.agent(limitedApp);
  try {
    const token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
    const login = () =>
      agent
        .post('/api/auth/login')
        .set('Origin', config.origin)
        .set('X-CSRF-Token', token)
        .send({ email: 'unknown@example.com', password: 'wrong' });
    assert.equal((await login()).status, 401);
    const blocked = await login();
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers['retry-after']);
  } finally {
    await limitedApp.locals.sessionStore.close();
  }
});
test('catalog seed inserts missing records; explicit update preserves order snapshots', async () => {
  await seedCatalog();
  const initial = await Product.findOne({ sku: 'NOTE-01' });
  await Product.updateOne({ _id: initial._id }, { priceMinor: 77700 });
  await seedCatalog();
  assert.equal((await Product.findById(initial._id)).priceMinor, 77700);
  await seedCatalog({ update: true });
  assert.equal((await Product.findById(initial._id)).priceMinor, 18900);
});

test('checkout revalidates old cart quantities against the current limits', async () => {
  const client = await customer();
  const { cart } = await filledCart(client);
  // Simulate an older cart saved before a limit was reduced or a manual database edit.
  await Cart.updateOne({ userId: client.userId }, { $set: { 'items.0.quantity': 100 } });
  const current = (await client.agent.get('/api/cart')).body.data;
  assert.equal(current.canCheckout, false);
  assert.equal((await checkout(client, { ...cart, totalMinor: current.totalMinor })).status, 422);
});
