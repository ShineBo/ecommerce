import { test, expect } from '../../frontend/node_modules/@playwright/test/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
async function register(page) {
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Jamie Test');
  await page
    .getByLabel('Email address')
    .fill(`browser-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('LovelyBrowserTest123');
  await page.getByLabel('Confirm password').fill('LovelyBrowserTest123');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page).toHaveURL('/products');
}
test('guest route protection and complete shopping flow', async ({ page, context }) => {
  await page.goto('/cart');
  await expect(page).toHaveURL('/login');
  await register(page);
  await expect(
    page.getByRole('heading', { name: 'Make room for the little things.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add Everyday notebook to bag', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Shopping bag, 1 items' })).toBeVisible();
  await page.getByRole('link', { name: 'Shopping bag, 1 items' }).click();
  await page.getByRole('button', { name: 'Increase Everyday notebook' }).click();
  await expect(page.getByLabel('Quantity for Everyday notebook')).toHaveText('2');
  await page.reload();
  await expect(page.getByLabel('Quantity for Everyday notebook')).toHaveText('2');
  await page.getByRole('link', { name: 'Continue to checkout' }).click();
  await expect(page.getByText('You’re in our demo shop.')).toBeVisible();
  await page
    .getByLabel('Payment slip', { exact: true })
    .setInputFiles(path.join(root, 'frontend/public/demo/sample-slip.png'));
  await page.getByRole('button', { name: 'Submit my order' }).click();
  await expect(page).toHaveURL(/\/orders\/[a-f0-9]{24}$/);
  await expect(page.getByText('Awaiting review', { exact: true })).toBeVisible();
  const orderUrl = page.url();
  await page.getByRole('button', { name: 'View payment slip' }).click();
  await expect(page.getByAltText('Your submitted payment slip')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Awaiting review', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'All your orders', exact: true }).click();
  await expect(page.locator('.order-row')).toHaveCount(1);
  await expect(page.locator('.order-row')).toContainText('Awaiting review');
  await page.locator('.order-row').click();
  await expect(page).toHaveURL(orderUrl);
  await page.getByRole('link', { name: 'Shopping bag, 0 items' }).click();
  await expect(
    page.getByRole('heading', { name: 'A little room for something lovely.' }),
  ).toBeVisible();
  const second = await context
    .browser()
    .newContext({ baseURL: process.env.SHOP_URL || 'http://localhost:8080' });
  const otherPage = await second.newPage();
  await register(otherPage);
  await otherPage.goto(orderUrl);
  await expect(otherPage.getByRole('alert')).toHaveText('Order not found.');
  await second.close();
});
test('375px layout has no horizontal overflow and category filters work', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await register(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Writing', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Add The good pen to bag' }).click();
  await page.getByRole('link', { name: 'Shopping bag, 1 items' }).click();
  await page.getByRole('link', { name: 'Continue to checkout' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.getByRole('button', { name: 'Submit my order' })).toBeDisabled();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/login');
});

test('study kit suggestions can complete a kit and update after cart changes', async ({ page }) => {
  await register(page);
  await page.getByRole('link', { name: 'Shopping bag, 0 items' }).click();
  const checker = page.getByRole('region', { name: 'Study Kit Checker' });
  await expect(checker.getByRole('status', { name: 'Kit checker availability' })).toHaveText(
    'Available',
  );
  await checker.getByRole('button', { name: 'Check my kit', exact: true }).click();
  await expect(checker.getByText('0 of 2 essentials ready')).toBeVisible();
  await checker.getByLabel('What are you getting ready for?').selectOption('journaling');
  await checker.getByRole('button', { name: 'Check my kit', exact: true }).click();
  await expect(checker.getByText('0 of 3 essentials ready')).toBeVisible();
  await checker.getByRole('button', { name: 'Add Everyday notebook to bag' }).click();
  await expect(checker.getByLabel('What are you getting ready for?')).toHaveValue('journaling');
  await checker.getByLabel('What are you getting ready for?').selectOption('exam-preparation');
  await expect(page.getByRole('link', { name: 'Shopping bag, 1 items' })).toBeVisible();
  await expect(checker.getByRole('button', { name: 'Check my kit', exact: true })).toBeEnabled();
  await checker.getByRole('button', { name: 'Check my kit', exact: true }).click();
  await expect(checker.getByText('1 of 2 essentials ready')).toBeVisible();
  await checker.getByRole('button', { name: 'Add The good pen to bag' }).click();
  await expect(page.getByRole('link', { name: 'Shopping bag, 2 items' })).toBeVisible();
  await checker.getByRole('button', { name: 'Check my kit', exact: true }).click();
  await expect(checker.getByText('Your kit is ready!', { exact: true })).toBeVisible();
  await checker.getByLabel('What are you getting ready for?').selectOption('journaling');
  await checker.getByRole('button', { name: 'Check my kit', exact: true }).click();
  await expect(checker.getByText('2 of 3 essentials ready')).toBeVisible();
  await expect(
    checker.getByRole('button', { name: 'Add Soft color washi set to bag' }),
  ).toBeVisible();
  await checker.getByLabel('What are you getting ready for?').selectOption('desk-organization');
  await checker.getByRole('button', { name: 'Check my kit', exact: true }).click();
  await expect(checker.getByText('1 of 2 essentials ready')).toBeVisible();
  await page.getByRole('button', { name: 'Increase Everyday notebook' }).click();
  await expect(checker.getByText('1 of 2 essentials ready')).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await checker.getByRole('button', { name: 'Check my kit', exact: true }).click();
  await expect(checker.getByText('1 of 2 essentials ready')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
