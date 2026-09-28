import { Cart, Order, Product } from '../models/index.js';
import { LIMITS } from '../config.js';
import { AppError } from '../middleware/errors.js';

export async function getCart(userId) {
  let cart;
  try {
    cart = await Cart.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, items: [], version: 0 } },
      { upsert: true, new: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    cart = await Cart.findOne({ userId });
  }
  // An order can commit just before a connection fails. Clear only that unchanged cart on the next visit.
  if (cart.items.length && (await Order.exists({ userId, cartVersion: cart.version }))) {
    await Cart.updateOne(
      { _id: cart._id, version: cart.version },
      { $set: { items: [] }, $inc: { version: 1 } },
    );
    cart = await Cart.findById(cart._id);
  }
  return cart;
}
export function calculateCartTotal(items) {
  const total = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  if (!Number.isSafeInteger(total) || total < 0)
    throw new AppError(422, 'TOTAL_INVALID', 'The cart total is outside the supported range.');
  return total;
}
export async function describeCart(cart, config) {
  const products = await Product.find({
    _id: { $in: cart.items.map((item) => item.productId) },
  }).lean();
  const items = cart.items.map((line) => {
    const product = products.find((p) => String(p._id) === String(line.productId));
    return {
      productId: String(line.productId),
      name: product?.name || 'Unavailable product',
      sku: product?.sku || '',
      imagePath: product?.imagePath || '/products/notebook.svg',
      unitPriceMinor: product?.priceMinor || 0,
      quantity: line.quantity,
      lineTotalMinor: (product?.priceMinor || 0) * line.quantity,
      isActive: Boolean(product?.isActive),
    };
  });
  return {
    id: String(cart._id),
    version: cart.version,
    items,
    totalMinor: calculateCartTotal(items),
    currency: config.currency,
    quantity: items.reduce((sum, line) => sum + line.quantity, 0),
    canCheckout:
      items.length > 0 &&
      items.length <= LIMITS.maxCartLines &&
      items.every(
        (item) =>
          item.isActive &&
          Number.isSafeInteger(item.quantity) &&
          item.quantity >= 1 &&
          item.quantity <= LIMITS.maxQuantity,
      ),
    limits: LIMITS,
  };
}
export async function changeCart(userId, { action, productId, quantity, expectedVersion }, config) {
  const cart = await getCart(userId);
  if (cart.version !== expectedVersion)
    throw new AppError(
      409,
      'CART_CHANGED',
      'Your cart changed in another window. We have refreshed it.',
    );
  let items = cart.items.map((item) => ({ productId: item.productId, quantity: item.quantity }));
  const index = items.findIndex((item) => String(item.productId) === productId);
  if (action === 'clear') items = [];
  else if (action === 'remove')
    items = items.filter((item) => String(item.productId) !== productId);
  else {
    if (!(await Product.exists({ _id: productId, isActive: true })))
      throw new AppError(422, 'PRODUCT_UNAVAILABLE', 'This item is no longer available.');
    if (action === 'set' && index === -1)
      throw new AppError(404, 'NOT_FOUND', 'This item is not in your cart.');
    const nextQuantity =
      action === 'add' && index !== -1 ? items[index].quantity + quantity : quantity;
    if (
      !Number.isSafeInteger(nextQuantity) ||
      nextQuantity < 1 ||
      nextQuantity > LIMITS.maxQuantity
    )
      throw new AppError(
        422,
        'QUANTITY_INVALID',
        `Choose a quantity from 1 to ${LIMITS.maxQuantity}.`,
      );
    if (index === -1) items.push({ productId, quantity: nextQuantity });
    else items[index].quantity = nextQuantity;
    if (items.length > LIMITS.maxCartLines)
      throw new AppError(422, 'CART_FULL', 'Your cart has too many different items.');
  }
  const updated = await Cart.findOneAndUpdate(
    { _id: cart._id, version: expectedVersion },
    { $set: { items }, $inc: { version: 1 } },
    { new: true, runValidators: true },
  );
  if (!updated)
    throw new AppError(409, 'CART_CHANGED', 'Your cart changed. Please review it and try again.');
  return describeCart(updated, config);
}
