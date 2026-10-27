import { Router } from 'express';
import { z } from 'zod';
import { Product } from '../models/index.js';
import { getCart } from '../services/cart.js';
import { AppError } from '../middleware/errors.js';
import { LIMITS } from '../config.js';

export function studyKitRoutes(config, plugin) {
  const router = Router();
  router.get('/', async (_req, res) => res.json({ data: await plugin.getStatus() }));
  router.post('/check', async (req, res) => {
    // Customer identity and cart/catalog data come from the core, never from browser-supplied items.
    const body = z
      .object({
        purposeId: z.string().regex(/^[a-z][a-z0-9-]{0,49}$/),
        expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      })
      .strict()
      .parse(req.body);
    const cart = await getCart(req.session.userId);
    const cartChanged = () =>
      new AppError(409, 'CART_CHANGED', 'Your bag changed. Check your kit again.');
    if (cart.version !== body.expectedVersion) throw cartChanged();
    if (
      cart.items.length > LIMITS.maxCartLines ||
      cart.items.some(
        (item) =>
          !Number.isSafeInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > LIMITS.maxQuantity,
      )
    )
      throw new AppError(
        422,
        'CART_INVALID',
        'Review your bag quantities before checking your kit.',
      );
    const catalog = await Product.find({ isActive: true })
      .select('sku name imagePath priceMinor')
      .lean();
    const activeIds = new Set(catalog.map((item) => String(item._id)));
    const result = await plugin.checkKit({
      purpose_id: body.purposeId,
      cart_version: String(cart.version),
      cart_items: cart.items
        .filter((item) => activeIds.has(String(item.productId)))
        .map((item) => ({ product_id: String(item.productId), quantity: item.quantity })),
      catalog_items: catalog.map((item) => ({ product_id: String(item._id), sku: item.sku })),
    });
    // Do not display results for a cart edited in another tab while gRPC was in flight.
    if ((await getCart(req.session.userId)).version !== cart.version) throw cartChanged();
    const byId = new Map(catalog.map((item) => [String(item._id), item]));
    const publicProduct = (id) => {
      const item = byId.get(id);
      return {
        id,
        name: item.name,
        imagePath: item.imagePath,
        priceMinor: item.priceMinor,
        currency: config.currency,
      };
    };
    res.json({
      data: {
        algorithmId: result.algorithm_id,
        algorithmName: result.algorithm_name,
        algorithmDescription: result.algorithm_description,
        purposeId: result.purpose_id,
        purposeName: result.purpose_name,
        cartVersion: cart.version,
        complete: result.complete,
        completedCount: result.completed_count,
        requiredCount: result.required_count,
        requirements: result.requirements.map((item) => ({
          id: item.id,
          label: item.label,
          satisfied: item.satisfied,
          minimumQuantity: item.minimum_quantity,
          presentQuantity: item.present_quantity,
          matchedProducts: item.matched_product_ids.map(publicProduct),
          suggestions: item.suggested_product_ids.map(publicProduct),
        })),
      },
    });
  });
  return router;
}
