import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Cart, Order, publicOrder } from '../models/index.js';
import { getCart, describeCart } from './cart.js';
import { validateSlip } from './uploads.js';
import { AppError } from '../middleware/errors.js';

function replayResult(existing, key, fingerprint) {
  if (existing.idempotencyKey !== key || existing.requestFingerprint !== fingerprint) {
    throw new AppError(
      409,
      'ORDER_ALREADY_SUBMITTED',
      'This checkout was already submitted. Open your existing order.',
      { orderId: String(existing._id) },
    );
  }
  return { order: publicOrder(existing), replayed: true };
}
export async function createOrderFromCart(
  { userId, key, cartVersion, expectedTotalMinor, file },
  config,
  hooks = {},
) {
  const slip = await validateSlip(file, config);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([cartVersion, expectedTotalMinor, slip.sha256]))
    .digest('hex');
  const existing = await Order.findOne({ userId, $or: [{ idempotencyKey: key }, { cartVersion }] });
  if (existing) {
    await getCart(userId);
    return replayResult(existing, key, fingerprint);
  }
  await hooks.afterInitialOrderLookup?.();
  const cart = await getCart(userId);
  const summary = await describeCart(cart, config);
  if (cart.version !== cartVersion) {
    // Another request may have committed after our first lookup and cleared this cart.
    const committed = await Order.findOne({
      userId,
      $or: [{ idempotencyKey: key }, { cartVersion }],
    });
    if (committed) return replayResult(committed, key, fingerprint);
    throw new AppError(409, 'CART_CHANGED', 'Your cart changed. Review it before submitting.');
  }
  if (!summary.canCheckout)
    throw new AppError(422, 'CART_INVALID', 'Your cart is empty or contains unavailable items.');
  if (summary.totalMinor !== expectedTotalMinor)
    throw new AppError(
      409,
      'PRICE_CHANGED',
      'A price changed. Review the updated total before submitting.',
    );
  const storageKey = randomUUID() + slip.extension;
  const filePath = path.join(config.uploadDir, storageKey);
  await fs.writeFile(filePath, slip.buffer, { flag: 'wx', mode: 0o600 });
  let order;
  try {
    await hooks.beforeOrderInsert?.();
    order = await Order.create({
      orderNumber: `SS-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`,
      userId,
      cartId: cart._id,
      cartVersion,
      idempotencyKey: key,
      requestFingerprint: fingerprint,
      items: summary.items.map(({ isActive: _active, ...item }) => item),
      currency: config.currency,
      totalMinor: summary.totalMinor,
      slip: {
        storageKey,
        mimeType: slip.mimeType,
        sizeBytes: slip.buffer.length,
        sha256: slip.sha256,
        uploadedAt: new Date(),
      },
    });
    await hooks.afterOrderInsert?.();
  } catch (error) {
    // If Mongo acknowledged a write ambiguously, first resolve its key. Never unlink a committed slip.
    const committed = await Order.findOne({
      userId,
      $or: [{ idempotencyKey: key }, { cartVersion }],
    });
    if (!committed || committed.slip.storageKey !== storageKey)
      await fs.unlink(filePath).catch(() => {});
    if (committed) {
      await getCart(userId);
      return replayResult(committed, key, fingerprint);
    }
    throw error;
  }
  let cartChanged = false;
  try {
    await hooks.beforeCartClear?.();
    const cleared = await Cart.updateOne(
      { _id: cart._id, version: cartVersion },
      { $set: { items: [] }, $inc: { version: 1 } },
    );
    cartChanged = cleared.modifiedCount === 0;
  } catch {
    // The purchase exists. The next cart read will reconcile cleanup; don't report a failed purchase.
    cartChanged = true;
  }
  return { order: publicOrder(order), replayed: false, cartChanged };
}
export async function reviewOrder(orderNumber, decision, reviewerLabel, reason = '') {
  if (!['CONFIRMED', 'REJECTED'].includes(decision))
    throw new AppError(422, 'REVIEW_INVALID', 'Use CONFIRMED or REJECTED.');
  if (!reviewerLabel?.trim() || reviewerLabel.length > 80)
    throw new AppError(422, 'REVIEW_INVALID', 'Provide a reviewer name (1–80 characters).');
  if (reason.length > 500 || (decision === 'REJECTED' && !reason.trim()))
    throw new AppError(422, 'REVIEW_INVALID', 'Rejection needs a reason (1–500 characters).');
  const order = await Order.findOneAndUpdate(
    { orderNumber, status: 'PENDING_REVIEW' },
    {
      $set: {
        status: decision,
        review: {
          decision,
          reason: reason.trim(),
          reviewerLabel: reviewerLabel.trim(),
          reviewedAt: new Date(),
        },
      },
    },
    { new: true, runValidators: true },
  );
  if (!order) throw new AppError(409, 'REVIEW_CONFLICT', 'Order not found or already reviewed.');
  return publicOrder(order);
}
