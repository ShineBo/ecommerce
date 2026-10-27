import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { createStudyKitPlugin } from '../src/plugins/studyKitPlugin.js';
const definition = protoLoader.loadSync(
  fileURLToPath(new URL('../src/plugins/studyKit.proto', import.meta.url)),
  {
    keepCase: true,
    longs: String,
    defaults: true,
  },
);
const Service = grpc.loadPackageDefinition(definition).simple_shop.study_kit.v1.StudyKitPlugin;
const info = {
  id: 'study-kit',
  name: 'Study Kit Checker',
  version: '1.0.0',
  algorithm_id: 'P1',
  algorithm_name: 'Essential checklist',
  algorithm_description: 'One suitable product per essential.',
  api_version: 1,
  purposes: [
    { id: 'exam-preparation', name: 'Exam preparation', description: 'Paper and a writing tool.' },
  ],
};
async function serve(handlers) {
  const server = new grpc.Server();
  server.addService(Service.service, { getInfo: (_call, done) => done(null, info), ...handlers });
  const port = await new Promise((resolve, reject) =>
    server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, port) =>
      error ? reject(error) : resolve(port),
    ),
  );
  return { server, plugin: createStudyKitPlugin({ host: '127.0.0.1', port, timeoutMs: 150 }) };
}
test('disabled plug-in reports unavailable and refuses checks without any network dependency', async () => {
  const plugin = createStudyKitPlugin({ enabled: false });
  assert.equal((await plugin.getStatus()).state, 'disabled');
  await assert.rejects(
    plugin.checkKit({}),
    (error) => error.code === 'PLUGIN_UNAVAILABLE' && error.status === 503,
  );
  plugin.close();
});
test('an unreachable plug-in reports unavailable within its deadline', async () => {
  const plugin = createStudyKitPlugin({ host: '127.0.0.1', port: 1, timeoutMs: 100 });
  const started = Date.now();
  try {
    assert.equal((await plugin.getStatus()).available, false);
    await assert.rejects(plugin.checkKit({}), (error) => error.code === 'PLUGIN_UNAVAILABLE');
    assert.ok(Date.now() - started < 1500);
  } finally {
    plugin.close();
  }
});
test('a nonresponding gRPC method is bounded and does not affect a working status call', async () => {
  const { server, plugin } = await serve({ checkKit: () => {} });
  try {
    assert.equal((await plugin.getStatus()).available, true);
    const started = Date.now();
    await assert.rejects(plugin.checkKit({}), (error) => error.code === 'PLUGIN_UNAVAILABLE');
    assert.ok(Date.now() - started < 1500);
    assert.equal((await plugin.getStatus()).available, true);
  } finally {
    plugin.close();
    server.forceShutdown();
  }
});
test('an incompatible API version is not advertised as available', async () => {
  const { server, plugin } = await serve({
    getInfo: (_call, done) => done(null, { ...info, api_version: 2 }),
  });
  try {
    assert.equal((await plugin.getStatus()).available, false);
  } finally {
    plugin.close();
    server.forceShutdown();
  }
});
test('a reply inventing a product is rejected at the core extension boundary', async () => {
  const { server, plugin } = await serve({
    checkKit: (_call, done) =>
      done(null, {
        algorithm_id: 'P1',
        algorithm_name: 'Essential checklist',
        algorithm_description: 'One suitable product per essential.',
        purpose_id: 'exam-preparation',
        purpose_name: 'Exam preparation',
        cart_version: '0',
        complete: false,
        completed_count: 0,
        required_count: 1,
        requirements: [
          {
            id: 'paper',
            label: 'Paper',
            satisfied: false,
            minimum_quantity: 1,
            present_quantity: 0,
            matched_product_ids: [],
            suggested_product_ids: ['aaaaaaaaaaaaaaaaaaaaaaaa'],
          },
        ],
      }),
  });
  try {
    await assert.rejects(
      plugin.checkKit({
        purpose_id: 'exam-preparation',
        cart_version: '0',
        cart_items: [],
        catalog_items: [],
      }),
      (error) => error.code === 'PLUGIN_UNAVAILABLE',
    );
  } finally {
    plugin.close();
    server.forceShutdown();
  }
});
test('P2 partial quantities and suggestions for another unit pass the core boundary', async () => {
  const pen = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  let claimedQuantity = 1;
  const { server, plugin } = await serve({
    checkKit: (_call, done) =>
      done(null, {
        ...info,
        algorithm_id: 'P2',
        purpose_id: 'exam-preparation',
        purpose_name: 'Exam preparation',
        cart_version: '4',
        complete: false,
        completed_count: 0,
        required_count: 1,
        requirements: [
          {
            id: 'writing',
            label: 'A pen or pencil',
            satisfied: false,
            minimum_quantity: 2,
            present_quantity: claimedQuantity,
            matched_product_ids: [pen],
            suggested_product_ids: [pen],
          },
        ],
      }),
  });
  const request = {
    purpose_id: 'exam-preparation',
    cart_version: '4',
    cart_items: [{ product_id: pen, quantity: 1 }],
    catalog_items: [{ product_id: pen, sku: 'PEN-01' }],
  };
  try {
    const result = await plugin.checkKit(request);
    assert.equal(result.algorithm_id, 'P2');
    assert.equal(result.requirements[0].present_quantity, 1);
    claimedQuantity = 3;
    await assert.rejects(plugin.checkKit(request), (error) => error.code === 'PLUGIN_UNAVAILABLE');
  } finally {
    plugin.close();
    server.forceShutdown();
  }
});
