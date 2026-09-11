import { test, expect } from '@playwright/test';
import {
  VS_BASE_URL,
  bestEffortDismissOverlays,
  ensureNoBlockingOverlays,
  getHeader,
} from '../utils/vs';

test.describe('SMOKE: Homepage', () => {
  test('SMOKE-HOME-01 — Homepage loads successfully', async ({ page }) => {
    const response = await page.goto(VS_BASE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    expect(response?.status()).toBe(200);
    console.log('✓ Homepage loaded (200)');
  });

  test('SMOKE-HOME-02 — Page body is visible', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const body = page.locator('body');
    await expect(body).toBeVisible();
    console.log('✓ Body element is visible');
  });

  test('SMOKE-HOME-03 — Header is present and visible', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const header = await getHeader(page);
    await expect(header).toBeVisible();
    console.log('✓ Header is visible');
  });

  test('SMOKE-HOME-04 — Main content area is visible', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const main = page.locator('main, [role="main"], #main').first();
    await expect(main).toBeVisible();
    console.log('✓ Main content area is visible');
  });

  test('SMOKE-HOME-05 — No console errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    // Allow some time for any async errors
    await page.waitForTimeout(1000);

    expect(errors.length).toBe(0);
    console.log('✓ No console errors');
  });
});
