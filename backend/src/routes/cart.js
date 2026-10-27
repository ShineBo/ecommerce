import { Router } from 'express';
import { z } from 'zod';
import { getCart, describeCart, changeCart } from '../services/cart.js';
import { productId, cartVersion, cartQuantity, strictInteger } from './validation.js';
export function cartRoutes(config) {
  const router = Router();
  router.get('/', async (req, res) =>
    res.json({ data: await describeCart(await getCart(req.session.userId), config) }),
  );
  router.post('/items', async (req, res) => {
    const input = z
      .object({ productId, quantity: cartQuantity, expectedVersion: cartVersion })
      .strict()
      .parse(req.body);
    res.json({ data: await changeCart(req.session.userId, { action: 'add', ...input }, config) });
  });
  router.patch('/items/:productId', async (req, res) => {
    const input = z
      .object({ quantity: cartQuantity, expectedVersion: cartVersion })
      .strict()
      .parse(req.body);
    res.json({
      data: await changeCart(
        req.session.userId,
        { action: 'set', productId: productId.parse(req.params.productId), ...input },
        config,
      ),
    });
  });
  router.delete('/items/:productId', async (req, res) =>
    res.json({
      data: await changeCart(
        req.session.userId,
        {
          action: 'remove',
          productId: productId.parse(req.params.productId),
          expectedVersion: strictInteger(req.query.expectedVersion),
        },
        config,
      ),
    }),
  );
  router.delete('/', async (req, res) =>
    res.json({
      data: await changeCart(
        req.session.userId,
        { action: 'clear', expectedVersion: strictInteger(req.query.expectedVersion) },
        config,
      ),
    }),
  );
  return router;
}
