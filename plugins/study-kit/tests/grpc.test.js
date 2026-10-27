import test from 'node:test';
import assert from 'node:assert/strict';
import grpc from '@grpc/grpc-js';
import { createStudyKitServer, StudyKitPlugin } from '../src/grpcServer.js';
test('real gRPC transport loads the shared contract, checks a kit, and reports unsupported purposes', async () => {
  const server = createStudyKitServer({ algorithm: 'P1' });
  const port = await new Promise((resolve, reject) =>
    server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, port) =>
      error ? reject(error) : resolve(port),
    ),
  );
  const client = new StudyKitPlugin(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
  const call = (method, value) =>
    new Promise((resolve, reject) =>
      client[method](value, { deadline: Date.now() + 2000 }, (error, result) =>
        error ? reject(error) : resolve(result),
      ),
    );
  try {
    assert.equal((await call('getInfo', {})).api_version, 1);
    const result = await call('checkKit', {
      purpose_id: 'exam-preparation',
      cart_version: '3',
      cart_items: [
        { product_id: 'pen', quantity: 1 },
        { product_id: 'pad', quantity: 1 },
      ],
      catalog_items: [
        { product_id: 'pen', sku: 'PEN-01' },
        { product_id: 'pad', sku: 'PAD-01' },
      ],
    });
    assert.equal(result.complete, true);
    assert.equal(result.cart_version, '3');
    await assert.rejects(
      call('checkKit', { purpose_id: 'unknown' }),
      (error) => error.code === grpc.status.INVALID_ARGUMENT,
    );
  } finally {
    client.close();
    await new Promise((resolve) => server.tryShutdown(resolve));
  }
});
test('the shared gRPC contract carries P2 metadata and a partially satisfied quantity requirement', async () => {
  const server = createStudyKitServer({ algorithm: 'P2' });
  const port = await new Promise((resolve, reject) =>
    server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, port) =>
      error ? reject(error) : resolve(port),
    ),
  );
  const client = new StudyKitPlugin(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
  const call = (method, request) =>
    new Promise((resolve, reject) =>
      client[method](request, { deadline: Date.now() + 2000 }, (error, reply) =>
        error ? reject(error) : resolve(reply),
      ),
    );
  try {
    assert.equal((await call('getInfo', {})).algorithm_id, 'P2');
    const result = await call('checkKit', {
      purpose_id: 'exam-preparation',
      cart_version: '2',
      cart_items: [{ product_id: 'pen', quantity: 1 }],
      catalog_items: [{ product_id: 'pen', sku: 'PEN-01' }],
    });
    assert.equal(result.algorithm_id, 'P2');
    assert.equal(result.requirements[1].present_quantity, 1);
    assert.equal(result.requirements[1].minimum_quantity, 2);
    assert.equal(result.requirements[1].satisfied, false);
  } finally {
    client.close();
    await new Promise((resolve) => server.tryShutdown(resolve));
  }
});
