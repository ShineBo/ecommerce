import { Router } from 'express';
import mongoose from 'mongoose';
import fs from 'node:fs/promises';
export function healthRoutes(config) {
  const router = Router();
  router.get('/live', (_req, res) => res.json({ data: { status: 'ok' } }));
  router.get('/ready', async (_req, res) => {
    try {
      await mongoose.connection.db.admin().ping();
      await fs.access(config.uploadDir, fs.constants.W_OK);
      res.json({ data: { status: 'ready' } });
    } catch {
      res.status(503).json({ error: { code: 'NOT_READY', message: 'The shop is starting.' } });
    }
  });
  return router;
}
