import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'node:path';
import { Order, publicOrder } from '../models/index.js';
import { AppError } from '../middleware/errors.js';
import { makeLimiter } from '../middleware/rateLimit.js';
import { createOrderFromCart } from '../services/orders.js';
import { pagination, strictInteger } from './validation.js';
export function ordersRoutes(config, hooks = {}) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxSlipBytes, files: 1, fields: 2, fieldSize: 100, parts: 3 },
  });
  router.post(
    '/',
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
  router.get('/', async (req, res) => {
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
  router.get('/:id/slip', async (req, res, next) => {
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
  router.get('/:id', async (req, res) => res.json({ data: publicOrder(await ownedOrder(req)) }));
  return router;
}
