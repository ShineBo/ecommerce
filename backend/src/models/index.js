import mongoose from 'mongoose';
import { LIMITS } from '../config.js';
const { Schema } = mongoose;
const options = { timestamps: true, strict: 'throw' };
const userSchema = new Schema(
  {
    name: { type: String, required: true, minlength: 2, maxlength: 80 },
    emailNormalized: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
  },
  options,
);
const productSchema = new Schema(
  {
    sku: { type: String, required: true, unique: true },
    name: { type: String, required: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 1000 },
    imagePath: { type: String, required: true },
    category: { type: String, required: true },
    color: String,
    priceMinor: {
      type: Number,
      required: true,
      min: 1,
      max: LIMITS.maxPriceMinor,
      validate: Number.isSafeInteger,
    },
    isActive: { type: Boolean, default: true },
  },
  options,
);
const cartSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true, ref: 'User' },
    version: { type: Number, default: 0, required: true },
    items: [
      {
        _id: false,
        productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },
        quantity: { type: Number, min: 1, max: LIMITS.maxQuantity, validate: Number.isSafeInteger },
      },
    ],
  },
  options,
);
const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    cartId: { type: Schema.Types.ObjectId, required: true },
    cartVersion: { type: Number, required: true },
    idempotencyKey: { type: String, required: true },
    requestFingerprint: { type: String, required: true },
    items: [
      {
        _id: false,
        productId: Schema.Types.ObjectId,
        sku: String,
        name: String,
        imagePath: String,
        unitPriceMinor: Number,
        quantity: Number,
        lineTotalMinor: Number,
      },
    ],
    currency: { type: String, required: true },
    totalMinor: { type: Number, required: true },
    paymentMethod: { type: String, default: 'BANK_TRANSFER', enum: ['BANK_TRANSFER'] },
    status: {
      type: String,
      enum: ['PENDING_REVIEW', 'CONFIRMED', 'REJECTED'],
      default: 'PENDING_REVIEW',
    },
    slip: {
      storageKey: { type: String, required: true },
      mimeType: String,
      sizeBytes: Number,
      sha256: String,
      uploadedAt: Date,
    },
    review: {
      type: new Schema(
        { decision: String, reason: String, reviewerLabel: String, reviewedAt: Date },
        { _id: false },
      ),
      default: null,
    },
  },
  options,
);
orderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ userId: 1, cartVersion: 1 }, { unique: true });
orderSchema.index({ userId: 1, createdAt: -1 });
export const User = mongoose.model('User', userSchema);
export const Product = mongoose.model('Product', productSchema);
export const Cart = mongoose.model('Cart', cartSchema);
export const Order = mongoose.model('Order', orderSchema);

export async function connectDatabase(config) {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Product.init(), Cart.init(), Order.init()]);
}
export function publicUser(user) {
  return { id: String(user._id), name: user.name, email: user.emailNormalized };
}
export function publicOrder(order) {
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    items: order.items,
    currency: order.currency,
    totalMinor: order.totalMinor,
    status: order.status,
    paymentMethod: order.paymentMethod,
    review: order.review,
    createdAt: order.createdAt,
    slipUrl: `/api/orders/${order._id}/slip`,
  };
}
