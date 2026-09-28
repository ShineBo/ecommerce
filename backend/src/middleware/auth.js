import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors.js';
import { SESSION_HOURS } from '../config.js';

export const newToken = () => randomBytes(32).toString('hex');
export function requireUser(req, _res, next) {
  if (!req.session.userId || !req.session.expiresAt || req.session.expiresAt <= Date.now()) {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
  }
  next();
}
export function csrfGuard(config) {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const supplied = req.get('X-CSRF-Token') || '';
    const expected = req.session.csrf || '';
    const origin = req.get('origin');
    if (
      origin !== config.origin ||
      !expected ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      return next(
        new AppError(
          403,
          'CSRF_INVALID',
          'Your form session expired. Refresh the page and try again.',
        ),
      );
    }
    next();
  };
}
export async function startSession(req, user) {
  await new Promise((resolve, reject) =>
    req.session.regenerate((error) => (error ? reject(error) : resolve())),
  );
  req.session.userId = String(user._id);
  req.session.expiresAt = Date.now() + SESSION_HOURS * 3600_000;
  req.session.csrf = newToken();
  await new Promise((resolve, reject) =>
    req.session.save((error) => (error ? reject(error) : resolve())),
  );
}
