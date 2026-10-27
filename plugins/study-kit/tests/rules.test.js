import test from 'node:test';
import assert from 'node:assert/strict';
import { checkKit, getPluginInfo, InvalidKitRequest } from '../src/rules.js';
const catalog = [
  { product_id: 'notebook', sku: 'NOTE-01' },
  { product_id: 'pad', sku: 'PAD-01' },
  { product_id: 'pen', sku: 'PEN-01' },
  { product_id: 'pencils', sku: 'PENCIL-01' },
  { product_id: 'tape', sku: 'TAPE-01' },
  { product_id: 'tray', sku: 'TRAY-01' },
  { product_id: 'pouch', sku: 'POUCH-01' },
  { product_id: 'mug', sku: 'MUG-01' },
];
const analyze = (purpose, ids, active = catalog) =>
  checkKit(
    {
      purpose_id: purpose,
      cart_version: '7',
      cart_items: ids.map((id) => ({ product_id: id, quantity: 1 })),
      catalog_items: active,
    },
    'P1',
  );
test('plug-in publishes the versioned contract and three supported purposes', () => {
  const info = getPluginInfo();
  assert.equal(info.api_version, 1);
  assert.equal(info.id, 'study-kit');
  assert.deepEqual(
    info.purposes.map((purpose) => purpose.id),
    ['exam-preparation', 'journaling', 'desk-organization'],
  );
});
test('an empty exam kit suggests paper and writing tools, not mugs', () => {
  const result = analyze('exam-preparation', []);
  assert.equal(result.complete, false);
  assert.equal(result.completed_count, 0);
  assert.deepEqual(
    result.requirements.map((item) => item.suggested_product_ids),
    [
      ['notebook', 'pad'],
      ['pen', 'pencils'],
    ],
  );
});
test('a notebook and mug fulfil only the paper requirement; adding a pen completes it', () => {
  assert.equal(analyze('exam-preparation', ['notebook', 'mug']).completed_count, 1);
  const result = analyze('exam-preparation', ['notebook', 'mug', 'pen']);
  assert.equal(result.complete, true);
  assert.equal(result.cart_version, '7');
  assert.ok(result.requirements.every((item) => item.suggested_product_ids.length === 0));
});
test('ninety-nine notebooks do not substitute for a writing tool', () => {
  const result = checkKit(
    {
      purpose_id: 'exam-preparation',
      cart_version: '1',
      cart_items: [{ product_id: 'notebook', quantity: 99 }],
      catalog_items: catalog,
    },
    'P1',
  );
  assert.equal(result.completed_count, 1);
});
test('journaling needs an actual notebook and decoration, not just any paper-category product', () => {
  const result = analyze('journaling', ['pad', 'pen', 'tape']);
  assert.equal(result.complete, false);
  assert.deepEqual(result.requirements.find((item) => !item.satisfied).suggested_product_ids, [
    'notebook',
  ]);
  assert.equal(analyze('journaling', ['notebook', 'pen', 'tape']).complete, true);
});
test('desk organization accepts a pouch or tray, and a mug does not substitute', () => {
  assert.equal(analyze('desk-organization', ['pen', 'mug']).complete, false);
  assert.equal(analyze('desk-organization', ['pencils', 'pouch']).complete, true);
  assert.equal(analyze('desk-organization', ['pen', 'tray']).complete, true);
});
test('removed catalog products and invented cart IDs neither fulfil rules nor become suggestions', () => {
  const result = analyze(
    'exam-preparation',
    ['pen', 'notebook', 'invented'],
    catalog.filter((item) => item.product_id !== 'pen'),
  );
  assert.equal(result.complete, false);
  assert.deepEqual(result.requirements[1].suggested_product_ids, ['pencils']);
});
test('a missing product type returns an empty suggestion list rather than fabricating a product', () => {
  const result = analyze(
    'journaling',
    ['notebook', 'pen'],
    catalog.filter((item) => item.sku !== 'TAPE-01'),
  );
  assert.deepEqual(result.requirements[2].suggested_product_ids, []);
});
test('unsupported purposes and invalid quantities are rejected', () => {
  assert.throws(() => analyze('made-up-purpose', []), InvalidKitRequest);
  assert.throws(
    () =>
      checkKit({
        purpose_id: 'journaling',
        cart_version: '0',
        catalog_items: [],
        cart_items: [{ product_id: 'pen', quantity: -1 }],
      }),
    InvalidKitRequest,
  );
});
test('P1 and P2 return different results for the identical notebook-and-pen cart', () => {
  const request = {
    purpose_id: 'exam-preparation',
    cart_version: '1',
    catalog_items: catalog,
    cart_items: [
      { product_id: 'notebook', quantity: 1 },
      { product_id: 'pen', quantity: 1 },
    ],
  };
  const p1 = checkKit(request, 'P1');
  const p2 = checkKit(request, 'P2');
  assert.equal(p1.algorithm_id, 'P1');
  assert.equal(p1.complete, true);
  assert.equal(p2.algorithm_id, 'P2');
  assert.equal(p2.complete, false);
  assert.equal(p2.completed_count, 1);
  const writing = p2.requirements.find((item) => item.id === 'writing');
  assert.equal(writing.present_quantity, 1);
  assert.equal(writing.minimum_quantity, 2);
  assert.deepEqual(writing.matched_product_ids, ['pen']);
  assert.ok(writing.suggested_product_ids.includes('pen'));
  request.cart_items[1].quantity = 2;
  assert.equal(checkKit(request, 'P2').complete, true);
});
test('P2 counts different writing tools together, while extra paper cannot replace a spare', () => {
  const request = {
    purpose_id: 'exam-preparation',
    cart_version: '1',
    catalog_items: catalog,
    cart_items: [
      { product_id: 'notebook', quantity: 20 },
      { product_id: 'pen', quantity: 1 },
    ],
  };
  assert.equal(checkKit(request, 'P2').complete, false);
  request.cart_items.push({ product_id: 'pencils', quantity: 1 });
  assert.equal(checkKit(request, 'P2').complete, true);
});
test('both image variants identify themselves and invalid algorithms fail fast', () => {
  for (const algorithm of ['P1', 'P2']) {
    const info = getPluginInfo(algorithm);
    assert.equal(info.algorithm_id, algorithm);
    assert.equal(info.version, `1.1.0-${algorithm}`);
  }
  assert.throws(() => getPluginInfo('P3'), /must be P1 or P2/);
});
test('P2 cannot count duplicate cart lines or inactive products as a spare', () => {
  const request = {
    purpose_id: 'exam-preparation',
    cart_version: '1',
    catalog_items: catalog,
    cart_items: [
      { product_id: 'pen', quantity: 1 },
      { product_id: 'pen', quantity: 1 },
    ],
  };
  assert.throws(() => checkKit(request, 'P2'), InvalidKitRequest);
  request.cart_items = [{ product_id: 'pen', quantity: 2 }];
  request.catalog_items = catalog.filter((item) => item.product_id !== 'pen');
  assert.equal(checkKit(request, 'P2').completed_count, 0);
});
