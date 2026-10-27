import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { User, publicUser } from '../models/index.js';
import { AppError } from '../middleware/errors.js';
import { requireUser, newToken, startSession } from '../middleware/auth.js';
import { makeLimiter } from '../middleware/rateLimit.js';
import { passwordOptions } from '../services/seed.js';
export function authRoutes(config) {
  const router = Router();
  router.get('/csrf', (req, res) => {
    req.session.csrf ||= newToken();
    res.json({ data: { csrfToken: req.session.csrf } });
  });
  const authLimiter = makeLimiter(config.authRateLimit, 15 * 60_000);
  router.post('/register', authLimiter, async (req, res) => {
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
  router.post('/login', authLimiter, async (req, res) => {
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
  router.post('/logout', requireUser, async (req, res) => {
    await new Promise((resolve, reject) =>
      req.session.destroy((error) => (error ? reject(error) : resolve())),
    );
    res.clearCookie(config.sessionCookieName, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
    });
    res.status(204).end();
  });
  router.get('/me', requireUser, async (req, res) => {
    const user = await User.findById(req.session.userId);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in again.');
    res.json({ data: publicUser(user) });
  });
  return router;
}
