import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { Order } from '../models/index.js';
import { AppError } from '../middleware/errors.js';

export async function validateSlip(file, config) {
  if (!file || !file.buffer.length)
    throw new AppError(422, 'SLIP_REQUIRED', 'Choose a payment slip to continue.');
  if (file.size > config.maxSlipBytes)
    throw new AppError(413, 'SLIP_TOO_LARGE', 'Choose a slip no larger than 5 MiB.');
  const extension = path.extname(file.originalname).toLowerCase();
  const isPng = file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = file.buffer[0] === 255 && file.buffer[1] === 216 && file.buffer[2] === 255;
  const valid =
    (isPng && extension === '.png' && file.mimetype === 'image/png') ||
    (isJpeg && ['.jpg', '.jpeg'].includes(extension) && file.mimetype === 'image/jpeg');
  if (!valid) throw new AppError(415, 'SLIP_TYPE_INVALID', 'Please choose a PNG or JPEG image.');
  try {
    const image = sharp(file.buffer, { limitInputPixels: 20_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['png', 'jpeg'].includes(metadata.format) || (metadata.pages || 1) !== 1)
      throw new Error('Invalid image');
    // Decode fully; a plausible file signature alone does not establish a valid image.
    const normalized = await image
      .rotate()
      .toFormat(isPng ? 'png' : 'jpeg')
      .toBuffer();
    return {
      buffer: normalized,
      extension: isPng ? '.png' : '.jpg',
      mimeType: isPng ? 'image/png' : 'image/jpeg',
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
  } catch {
    throw new AppError(
      422,
      'SLIP_CORRUPT',
      'This image could not be read. Choose a different slip (maximum 20 megapixels).',
    );
  }
}
export async function cleanupOrphanUploads(config, graceMs = 24 * 3600_000) {
  await fs.mkdir(config.uploadDir, { recursive: true });
  for (const name of await fs.readdir(config.uploadDir)) {
    if (!/^[a-f0-9-]+\.(png|jpg)$/.test(name)) continue;
    const filePath = path.join(config.uploadDir, name);
    const stat = await fs.stat(filePath);
    if (
      stat.isFile() &&
      Date.now() - stat.mtimeMs > graceMs &&
      !(await Order.exists({ 'slip.storageKey': name }))
    )
      await fs.unlink(filePath);
  }
}
