import { z } from 'zod';
import { LIMITS } from '../config.js';
import { AppError } from '../middleware/errors.js';

export const productId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid product ID');
export const cartVersion = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const cartQuantity = z.number().int().min(1).max(LIMITS.maxQuantity);
export const strictInteger = (value) => {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new AppError(422, 'INVALID_NUMBER', 'A valid whole number is required.');
  return Number(value);
};
export function pagination(query, defaultLimit) {
  const page = query.page === undefined ? 1 : strictInteger(query.page);
  const limit = query.limit === undefined ? defaultLimit : strictInteger(query.limit);
  if (page < 1 || page > 100000 || limit < 1 || limit > 50)
    throw new AppError(422, 'PAGINATION_INVALID', 'Invalid page or page size.');
  return { page, limit };
}
