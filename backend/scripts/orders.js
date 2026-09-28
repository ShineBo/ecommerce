import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readConfig } from '../src/config.js';
import { connectDatabase, Order, publicOrder } from '../src/models/index.js';
import { reviewOrder } from '../src/services/orders.js';
const config = readConfig();
const [command = 'list', reference, decision, ...options] = process.argv.slice(2);
const flag = (name) => {
  const index = options.indexOf(name);
  return index >= 0 ? options[index + 1] : undefined;
};
try {
  await connectDatabase(config);
  if (command === 'list') {
    const orders = await Order.find({ status: 'PENDING_REVIEW' }).sort({ createdAt: -1 });
    console.table(
      orders.map((order) => ({
        reference: order.orderNumber,
        total: (order.totalMinor / 100).toFixed(2),
        currency: order.currency,
        status: order.status,
      })),
    );
  } else if (command === 'inspect' || command === 'export-slip') {
    const order = await Order.findOne({ orderNumber: reference });
    if (!order) throw new Error('Order not found');
    if (command === 'export-slip')
      process.stdout.write(await fs.readFile(path.join(config.uploadDir, order.slip.storageKey)));
    else console.log(JSON.stringify(publicOrder(order), null, 2));
  } else if (command === 'review') {
    console.log(
      JSON.stringify(
        await reviewOrder(reference, decision, flag('--reviewer'), flag('--reason') || ''),
        null,
        2,
      ),
    );
  } else
    throw new Error(
      'Use list, inspect ORDER_REFERENCE, or review ORDER_REFERENCE CONFIRMED|REJECTED --reviewer NAME [--reason TEXT]',
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
