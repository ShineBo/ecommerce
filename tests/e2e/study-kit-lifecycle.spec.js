import { test, expect } from '../../frontend/node_modules/@playwright/test/index.mjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root =
  process.env.SHOP_COMPOSE_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Opt in explicitly: this demonstration stops/starts the selected project's plug-in.
test('stopping and restarting the plug-in changes the UI while checkout keeps working', async ({
  page,
}) => {
  test.skip(
    process.env.RUN_PLUGIN_LIFECYCLE_TEST !== 'true',
    'Requires explicit Docker lifecycle test opt-in.',
  );
  test.setTimeout(90_000);
  const compose = (action) =>
    execFileSync('docker', ['compose', action, 'study-kit-plugin'], { cwd: root, timeout: 30_000 });
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Kit Lifecycle Test');
  await page.getByLabel('Email address').fill(`kit-lifecycle-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('KitLifecycleTest123');
  await page.getByLabel('Confirm password').fill('KitLifecycleTest123');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page).toHaveURL('/products');
  await page.getByRole('button', { name: 'Add Everyday notebook to bag' }).click();
  await page.getByRole('link', { name: 'Shopping bag, 1 items' }).click();
  const checker = page.getByRole('region', { name: 'Study Kit Checker' });
  await expect(checker.getByRole('status', { name: 'Kit checker availability' })).toHaveText(
    'Available',
  );
  try {
    compose('stop');
    await expect(checker.getByRole('status', { name: 'Kit checker availability' })).toHaveText(
      'Unavailable',
      {
        timeout: 20_000,
      },
    );
    await expect(checker.getByRole('button', { name: 'Check my kit', exact: true })).toBeDisabled();
    await page.getByRole('link', { name: 'Continue to checkout' }).click();
    await page
      .getByLabel('Payment slip', { exact: true })
      .setInputFiles(path.join(root, 'frontend/public/demo/sample-slip.png'));
    await page.getByRole('button', { name: 'Submit my order' }).click();
    await expect(page.getByText('Awaiting review', { exact: true })).toBeVisible();
    compose('start');
    await page.getByRole('link', { name: 'Shopping bag, 0 items' }).click();
    await expect(checker.getByRole('status', { name: 'Kit checker availability' })).toHaveText(
      'Available',
      {
        timeout: 20_000,
      },
    );
    await checker.getByRole('button', { name: 'Check my kit', exact: true }).click();
    await expect(checker.getByText('0 of 2 essentials ready')).toBeVisible();
  } finally {
    compose('start');
  }
});
