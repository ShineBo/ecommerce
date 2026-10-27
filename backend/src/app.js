import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { SESSION_HOURS } from './config.js';
import { AppError, errorHandler } from './middleware/errors.js';
import { csrfGuard, requireUser } from './middleware/auth.js';
import { makeLimiter } from './middleware/rateLimit.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { productsRoutes } from './routes/products.js';
import { cartRoutes } from './routes/cart.js';
import { checkoutRoutes } from './routes/checkout.js';
import { ordersRoutes } from './routes/orders.js';
import { createStudyKitPlugin } from './plugins/studyKitPlugin.js';
import { studyKitRoutes } from './plugins/studyKitRoutes.js';

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
  app.use('/api/health', healthRoutes(config));
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
      name: config.sessionCookieName,
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
  app.use('/api', csrfGuard(config));
  app.use('/api/auth', authRoutes(config));
  app.use('/api', requireUser);
  app.locals.studyKitPlugin = createStudyKitPlugin(config.studyKit);
  app.use('/api/plugins/study-kit', studyKitRoutes(config, app.locals.studyKitPlugin));
  app.use('/api/products', productsRoutes(config));
  app.use('/api/cart', cartRoutes(config));
  app.use('/api/checkout', checkoutRoutes(config));
  app.use('/api/orders', ordersRoutes(config, hooks));
  app.use((_req, _res, next) =>
    next(new AppError(404, 'NOT_FOUND', 'This page could not be found.')),
  );
  app.use(errorHandler);
  return app;
}
