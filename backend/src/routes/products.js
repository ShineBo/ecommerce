import { Router } from 'express';
import { Product } from '../models/index.js';
import { pagination } from './validation.js';
export function productsRoutes(config) {
  const router = Router();
  router.get('/', async (req, res) => {
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
  return router;
}
