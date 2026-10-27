import { Router } from 'express';
import { LIMITS } from '../config.js';
export function checkoutRoutes(config) {
  const router = Router();
  router.get('/config', (_req, res) =>
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
  return router;
}
