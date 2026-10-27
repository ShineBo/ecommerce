import { rateLimit } from 'express-rate-limit';

export const makeLimiter = (limit, windowMs, extra = {}) =>
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
