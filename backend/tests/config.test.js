import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';

const environment = {
  SESSION_SECRET: 'isolated-configuration-test-secret-long-enough',
  MONGO_DB_NAME: 'config_test',
  MONGO_APP_USERNAME: 'test_app',
  MONGO_APP_PASSWORD: 'not-a-real-password',
};

test('session cookies preserve the default and allow separate deployment names', () => {
  assert.equal(readConfig(environment).sessionCookieName, 'simple_shop.sid');
  assert.equal(
    readConfig({ ...environment, SESSION_COOKIE_NAME: 'simple_shop_vm.sid' }).sessionCookieName,
    'simple_shop_vm.sid',
  );
});

test('invalid cookie names cannot become response headers', () => {
  for (const name of ['bad name', 'bad;name', 'bad\r\nname', 'x'.repeat(81)]) {
    assert.throws(
      () => readConfig({ ...environment, SESSION_COOKIE_NAME: name }),
      /Invalid SESSION_COOKIE_NAME/,
    );
  }
});
