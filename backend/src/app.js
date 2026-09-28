import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import argon2 from 'argon2';
import { LIMITS, SESSION_HOURS } from './config.js';
import { User, Product, Order, publicUser, publicOrder } from './models/index.js';
import { AppError, errorHandler } from './middleware/errors.js';
import { csrfGuard, requireUser, newToken, startSession } from './middleware/auth.js';
import { passwordOptions } from './services/seed.js';
import { getCart, describeCart, changeCart } from './services/cart.js';
import { createOrderFromCart } from './services/orders.js';

const id = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid product ID');
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const quantity = z.number().int().min(1).max(LIMITS.maxQuantity);
const strictInteger = (value) => {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new AppError(422, 'INVALID_NUMBER', 'A valid whole number is required.');
  return Number(value);
};
function pagination(query, defaultLimit) {
  const page = query.page === undefined ? 1 : strictInteger(query.page);
  const limit = query.limit === undefined ? defaultLimit : strictInteger(query.limit);
  if (page < 1 || page > 100000 || limit < 1 || limit > 50)
    throw new AppError(422, 'PAGINATION_INVALID', 'Invalid page or page size.');
  return { page, limit };
}
const makeLimiter = (limit, windowMs, extra = {}) =>
  rateLimit({
    limit,
    windowMs,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'A few too many requests. Please wait and try again.',
        },
      }),
    ...extra,
  });

export function createApp(config, hooks = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-origin' } }));
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.set('X-Request-Id', req.id);
    next();
  });
  app.get('/api/health/live', (_req, res) => res.json({ data: { status: 'ok' } }));
  app.get('/api/health/ready', async (_req, res) => {
    try {
      await mongoose.connection.db.admin().ping();
      await fs.access(config.uploadDir, fs.constants.W_OK);
      res.json({ data: { status: 'ready' } });
    } catch {
      res.status(503).json({ error: { code: 'NOT_READY', message: 'The shop is starting.' } });
    }
  });
  app.use('/api', makeLimiter(config.apiRateLimit, 60_000));
  app.use(express.json({ limit: '32kb' }));
  const store = MongoStore.create({
    mongoUrl: config.mongoUri,
    collectionName: 'sessions',
    ttl: SESSION_HOURS * 3600,
  });
  app.locals.sessionStore = store;
  app.use(
    session({
      name: 'simple_shop.sid',
      secret: config.sessionSecret,
      store,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        maxAge: SESSION_HOURS * 3600_000,
      },
    }),
  );
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/auth/csrf', (req, res) => {
    req.session.csrf ||= newToken();
    res.json({ data: { csrfToken: req.session.csrf } });
  });
  app.use('/api', csrfGuard(config));
  const authLimiter = makeLimiter(config.authRateLimit, 15 * 60_000);
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().toLowerCase().email().max(254),
        password: z.string().min(12).max(128),
      })
      .strict()
      .parse(req.body);
    if (await User.exists({ emailNormalized: body.email }))
      throw new AppError(409, 'EMAIL_EXISTS', 'An account with this email already exists.');
    const user = await User.create({
      name: body.name,
      emailNormalized: body.email,
      passwordHash: await argon2.hash(body.password, passwordOptions),
    });
    await startSession(req, user);
    res.status(201).json({ data: { user: publicUser(user), csrfToken: req.session.csrf } });
  });
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const body = z
      .object({
        email: z.string().trim().toLowerCase().email().max(254),
        password: z.string().min(1).max(128),
      })
      .strict()
      .parse(req.body);
    const user = await User.findOne({ emailNormalized: body.email }).select('+passwordHash');
    if (!user || !(await argon2.verify(user.passwordHash, body.password)))
      throw new AppError(401, 'LOGIN_INVALID', 'Invalid email or password.');
    await startSession(req, user);
    res.json({ data: { user: publicUser(user), csrfToken: req.session.csrf } });
  });
  app.post('/api/auth/logout', requireUser, async (req, res) => {
    await new Promise((resolve, reject) =>
      req.session.destroy((error) => (error ? reject(error) : resolve())),
    );
    res.clearCookie('simple_shop.sid', {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
    });
    res.status(204).end();
  });
  app.get('/api/auth/me', requireUser, async (req, res) => {
    const user = await User.findById(req.session.userId);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in again.');
    res.json({ data: publicUser(user) });
  });
  app.use('/api', requireUser);
  app.get('/api/products', async (req, res) => {
    const { page, limit } = pagination(req.query, 12);
    const filter = { isActive: true };
    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ sku: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);
    res.json({
      data: products.map(
        ({ _id, name, sku, description, imagePath, priceMinor, category, color }) => ({
          id: String(_id),
          name,
          sku,
          description,
          imagePath,
          priceMinor,
          category,
          color,
        }),
      ),
      meta: { page, limit, total, currency: config.currency },
    });
  });
  app.get('/api/cart', async (req, res) =>
    res.json({ data: await describeCart(await getCart(req.session.userId), config) }),
  );
  app.post('/api/cart/items', async (req, res) => {
    const input = z
      .object({ productId: id, quantity, expectedVersion: version })
      .strict()
      .parse(req.body);
    res.json({ data: await changeCart(req.session.userId, { action: 'add', ...input }, config) });
  });
  app.patch('/api/cart/items/:productId', async (req, res) => {
    const input = z.object({ quantity, expectedVersion: version }).strict().parse(req.body);
    res.json({
      data: await changeCart(
        req.session.userId,
        { action: 'set', productId: id.parse(req.params.productId), ...input },
        config,
      ),
    });
  });
  app.delete('/api/cart/items/:productId', async (req, res) =>
    res.json({
      data: await changeCart(
        req.session.userId,
        {
          action: 'remove',
          productId: id.parse(req.params.productId),
          expectedVersion: strictInteger(req.query.expectedVersion),
        },
        config,
      ),
    }),
  );
  app.delete('/api/cart', async (req, res) =>
    res.json({
      data: await changeCart(
        req.session.userId,
        { action: 'clear', expectedVersion: strictInteger(req.query.expectedVersion) },
        config,
      ),
    }),
  );
  app.get('/api/checkout/config', (_req, res) =>
    res.json({
      data: {
        currency: config.currency,
        demoMode: config.demoMode,
        bank: config.bank,
        maxSlipBytes: config.maxSlipBytes,
        limits: LIMITS,
      },
    }),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxSlipBytes, files: 1, fields: 2, fieldSize: 100, parts: 3 },
  });
  app.post(
    '/api/orders',
    makeLimiter(config.orderRateLimit, 10 * 60_000, { keyGenerator: (req) => req.session.userId }),
    upload.single('slip'),
    async (req, res) => {
      const key = z.string().uuid().parse(req.get('Idempotency-Key'));
      const result = await createOrderFromCart(
        {
          userId: req.session.userId,
          key,
          cartVersion: strictInteger(req.body.cartVersion),
          expectedTotalMinor: strictInteger(req.body.expectedTotalMinor),
          file: req.file,
        },
        config,
        hooks,
      );
      res.status(result.replayed ? 200 : 201).json({
        data: result.order,
        meta: { replayed: result.replayed, cartChanged: result.cartChanged || false },
      });
    },
  );
  app.get('/api/orders', async (req, res) => {
    const { page, limit } = pagination(req.query, 10);
    const filter = { userId: req.session.userId };
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Order.countDocuments(filter),
    ]);
    res.json({ data: orders.map(publicOrder), meta: { page, limit, total } });
  });
  async function ownedOrder(req) {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id))
      throw new AppError(404, 'NOT_FOUND', 'Order not found.');
    const order = await Order.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found.');
    return order;
  }
  app.get('/api/orders/:id/slip', async (req, res, next) => {
    const order = await ownedOrder(req);
    res.set({
      'Content-Type': order.slip.mimeType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.sendFile(
      order.slip.storageKey,
      { root: path.resolve(config.uploadDir), dotfiles: 'deny' },
      (error) => {
        if (error) next(error);
      },
    );
  });
  app.get('/api/orders/:id', async (req, res) =>
    res.json({ data: publicOrder(await ownedOrder(req)) }),
  );
  app.use((_req, _res, next) =>
    next(new AppError(404, 'NOT_FOUND', 'This page could not be found.')),
  );
  app.use(errorHandler);
  return app;
}
