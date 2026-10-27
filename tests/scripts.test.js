import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'simple-shop-scripts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'bin'));
  for (const name of [
    'shop.sh',
    'orders.sh',
    'setup-vm-env.sh',
    'publish-images.sh',
    'setup-env.mjs',
  ])
    fs.copyFileSync(path.join(project, 'scripts', name), path.join(root, 'scripts', name));
  for (const name of ['.env.example', '.env.vm.example'])
    fs.copyFileSync(path.join(project, name), path.join(root, name));
  const log = path.join(root, 'docker-calls.jsonl');
  const runner = path.join(root, 'mock-docker.mjs');
  fs.writeFileSync(
    runner,
    `import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify(args) + '\\n');
if (process.env.MOCK_FAIL_BUILD === 'true' && args[0] === 'buildx' && args[1] === 'build') process.exit(7);
`,
  );
  fs.writeFileSync(
    path.join(root, 'bin', 'docker'),
    '#!/bin/sh\nexec "$MOCK_NODE" -- "$MOCK_RUNNER" "$@"\n',
    {
      mode: 0o755,
    },
  );
  const env = {
    ...process.env,
    PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
    MOCK_RUNNER: runner,
    MOCK_NODE: process.execPath,
    MOCK_LOG: log,
    DOCKERHUB_USERNAME: 'shinebo',
    APP_IMAGE_TAG: 'v2',
    PLATFORMS: 'linux/arm64',
    BUILDER: 'ecommerce-builder',
  };
  return {
    root,
    env,
    run: (script, args = [], extra = {}) =>
      spawnSync('sh', [`scripts/${script}`, ...args], {
        cwd: root,
        env: { ...env, ...extra },
        encoding: 'utf8',
      }),
    calls: () =>
      fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [],
  };
}

test('shop helper selects each Compose mode and forwards arguments without running extra actions', (t) => {
  const f = fixture(t);
  const selectors = {
    dev: ['-f', 'compose.yaml', '-f', 'compose.compass.yaml', '-f', 'compose.dev.yaml'],
    local: ['-f', 'compose.yaml', '-f', 'compose.compass.yaml'],
    vm: ['--env-file', '.env.vm', '-f', 'compose.deploy.yaml'],
    test: ['-f', 'compose.test.yaml'],
  };
  for (const [mode, flags] of Object.entries(selectors)) {
    const result = f.run('shop.sh', [mode, 'logs', '--tail=10', 'backend']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(f.calls().at(-1), ['compose', ...flags, 'logs', '--tail=10', 'backend']);
  }
  const count = f.calls().length;
  assert.equal(f.run('shop.sh', ['unknown', 'up']).status, 2);
  assert.equal(f.run('shop.sh', ['dev']).status, 2);
  assert.equal(f.calls().length, count);
});

test('publishing builds four intended tags and bakes separate P1/P2 algorithms', (t) => {
  const f = fixture(t);
  assert.equal(f.run('publish-images.sh').status, 0);
  const builds = f.calls().filter((args) => args[0] === 'buildx' && args[1] === 'build');
  assert.equal(builds.length, 4);
  assert.ok(builds.every((args) => args.includes('--push') && args.includes('linux/arm64')));
  assert.ok(builds[0].includes('shinebo/ecommerce-frontend:v2'));
  assert.ok(builds[1].includes('shinebo/ecommerce-backend:v2'));
  for (const tag of ['P1', 'P2']) {
    const args = builds.find((command) => command.includes(`shinebo/ecommerce-study-kit:${tag}`));
    assert.ok(args.includes(`STUDY_KIT_ALGORITHM=${tag}`));
    assert.ok(args.includes('plugins/study-kit/Dockerfile'));
  }
});

test('a failed image build stops the publishing sequence', (t) => {
  const f = fixture(t);
  assert.equal(f.run('publish-images.sh', [], { MOCK_FAIL_BUILD: 'true' }).status, 7);
  assert.equal(f.calls().filter((args) => args[0] === 'buildx' && args[1] === 'build').length, 1);
});

test('VM setup validates origin, creates private distinct secrets, and preserves initialized credentials', (t) => {
  const f = fixture(t);
  assert.notEqual(f.run('setup-vm-env.sh', ['bad origin']).status, 0);
  assert.equal(fs.existsSync(path.join(f.root, '.env.vm')), false);
  assert.equal(f.run('setup-vm-env.sh', ['http://localhost:8088']).status, 0);
  const envFile = path.join(f.root, '.env.vm');
  const original = fs.readFileSync(envFile, 'utf8');
  assert.equal(fs.statSync(envFile).mode & 0o777, 0o600);
  assert.ok(original.includes('APP_ORIGIN=http://localhost:8088'));
  assert.ok(original.includes('SESSION_COOKIE_NAME=simple_shop_vm.sid'));
  assert.ok(!original.includes('GENERATE_WITH_VM_SETUP_SCRIPT'));
  const secrets = [...original.matchAll(/^[A-Z_]+=([a-f0-9]{64})$/gm)].map((match) => match[1]);
  assert.equal(secrets.length, 4);
  assert.equal(new Set(secrets).size, 4);
  assert.equal(f.run('setup-vm-env.sh', ['http://different-host']).status, 0);
  assert.equal(fs.readFileSync(envFile, 'utf8'), original);
});

test('order commands target the selected VM configuration', (t) => {
  const f = fixture(t);
  const result = f.run('orders.sh', ['--mode', 'vm', 'list']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.calls()[0], [
    'compose',
    '--env-file',
    '.env.vm',
    '-f',
    'compose.deploy.yaml',
    'exec',
    '-T',
    'backend',
    'node',
    'scripts/orders.js',
    'list',
  ]);
  assert.equal(f.run('orders.sh', ['--mode', 'unknown', 'list']).status, 2);
});

test('local setup creates private configuration and never resets an existing environment', (t) => {
  const f = fixture(t);
  execFileSync(process.execPath, ['scripts/setup-env.mjs'], { cwd: f.root, stdio: 'pipe' });
  const file = path.join(f.root, '.env');
  const original = fs.readFileSync(file, 'utf8');
  assert.ok(!original.includes('GENERATE_WITH_SETUP_SCRIPT'));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  execFileSync(process.execPath, ['scripts/setup-env.mjs'], { cwd: f.root, stdio: 'pipe' });
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});
