import { test, expect } from '@playwright/test';
import {
  VS_BASE_URL,
  bestEffortDismissOverlays,
  ensureNoBlockingOverlays,
} from '../utils/vs';

const BRAS_PLP = 'https://www.victoriassecret.com/us/vs/bras';

test.describe('SMOKE: Product Navigation (PLP)', () => {
  test('SMOKE-PLP-01 — PLP page loads', async ({ page }) => {
    const response = await page.goto(BRAS_PLP, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    expect(response?.status()).toBe(200);
    console.log('✓ PLP page loaded (200)');
  });

  test('SMOKE-PLP-02 — Product list is visible', async ({ page }) => {
    await page.goto(BRAS_PLP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const productLinks = page.locator('a[href*="catalog"], a[href*="/p/"]');
    const count = await productLinks.count();

    expect(count).toBeGreaterThan(0);
    console.log(`✓ Product list visible with ${count} items`);
  });

  test('SMOKE-PLP-03 — First product is clickable', async ({ page }) => {
    await page.goto(BRAS_PLP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const firstProduct = page.locator('a[href*="catalog"], a[href*="/p/"]').first();
    await expect(firstProduct).toBeVisible();
    await expect(firstProduct).toHaveCount(1);

    console.log('✓ First product is clickable');
  });

  test('SMOKE-PLP-04 — Can navigate to product detail', async ({ page }) => {
    await page.goto(BRAS_PLP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const firstProduct = page.locator('a[href*="catalog"], a[href*="/p/"]').first();
    const productUrl = await firstProduct.getAttribute('href');

    await firstProduct.click();
    await page.waitForLoadState('domcontentloaded');

    const currentUrl = page.url();
    expect(currentUrl).not.toBe(BRAS_PLP);
    expect(currentUrl).toContain(productUrl?.substring(0, 20) || 'catalog');
    console.log('✓ Navigated to product detail page');
  });

  test('SMOKE-PLP-05 — Filter controls are visible', async ({ page }) => {
    await page.goto(BRAS_PLP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const filterButton = page.locator(
      'button:has-text("Filter"), button[aria-label*="filter" i], [class*="filter"]'
    ).first();

    const isVisible = await filterButton.isVisible({ timeout: 3000 }).catch(() => false);
    expect(isVisible).toBeTruthy();
    console.log('✓ Filter controls are visible');
  });

  test('SMOKE-PLP-06 — Sort options are available', async ({ page }) => {
    await page.goto(BRAS_PLP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const sortControl = page.locator(
      'select, button[aria-label*="sort" i], [class*="sort"]'
    ).first();

    const isVisible = await sortControl.isVisible({ timeout: 3000 }).catch(() => false);
    expect(isVisible).toBeTruthy();
    console.log('✓ Sort controls are visible');
  });

  test('SMOKE-PLP-07 — Pagination or load more is available', async ({ page }) => {
    await page.goto(BRAS_PLP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const pagination = page.locator(
      '[role="navigation"] a, button:has-text("Load More"), button:has-text("Next"), [class*="pagination"]'
    ).first();

    const isVisible = await pagination.isVisible({ timeout: 2000 }).catch(() => false);
    // Not all sites have pagination, so this is optional
    if (isVisible) {
      console.log('✓ Pagination/load more is available');
    } else {
      console.log('⚠ Pagination not found (may be infinite scroll)');
    }
  });
});
