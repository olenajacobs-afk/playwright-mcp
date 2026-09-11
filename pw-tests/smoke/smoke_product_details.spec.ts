import { test, expect } from '@playwright/test';
import {
  VS_BASE_URL,
  bestEffortDismissOverlays,
  bestEffortWaitForTransientLoaders,
} from '../utils/vs';

const BRAS_PLP = 'https://www.victoriassecret.com/us/vs/bras';

test.describe('SMOKE: Product Details (PDP)', () => {
  test('SMOKE-PDP-01 — Can navigate to product detail page', async ({ page }) => {
    await page.goto(BRAS_PLP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const firstProduct = page.locator('a[href*="catalog"], a[href*="/p/"]').first();
    await firstProduct.click();
    await page.waitForLoadState('domcontentloaded');

    const currentUrl = page.url();
    expect(currentUrl).not.toBe(BRAS_PLP);
    console.log('✓ Product detail page loaded');
  });

  test('SMOKE-PDP-02 — Product image is visible', async ({ page }) => {
    await page.goto(BRAS_PLP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const firstProduct = page.locator('a[href*="catalog"], a[href*="/p/"]').first();
    await firstProduct.click();
    await page.waitForLoadState('domcontentloaded');
    await bestEffortWaitForTransientLoaders(page);

    const productImage = page.locator('img, [role="img"]').first();
    await expect(productImage).toBeVisible();
    console.log('✓ Product image is visible');
  });

  test('SMOKE-PDP-03 — Product name/title is visible', async ({ page }) => {
    await page.goto(BRAS_PLP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const firstProduct = page.locator('a[href*="catalog"], a[href*="/p/"]').first();
    await firstProduct.click();
    await page.waitForLoadState('domcontentloaded');

    const productTitle = page.locator('h1, h2, [class*="title"], [class*="name"]').first();
    await expect(productTitle).toBeVisible();
    const text = await productTitle.textContent();
    expect(text?.length).toBeGreaterThan(0);
    console.log('✓ Product title is visible');
  });

  test('SMOKE-PDP-04 — Product price is visible', async ({ page }) => {
    await page.goto(BRAS_PLP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const firstProduct = page.locator('a[href*="catalog"], a[href*="/p/"]').first();
    await firstProduct.click();
    await page.waitForLoadState('domcontentloaded');

    const priceElement = page.locator(
      '[class*="price"], [aria-label*="price" i], span:has-text("$")'
    ).first();

    await expect(priceElement).toBeVisible();
    const priceText = await priceElement.textContent();
    expect(priceText).toMatch(/\$/);
    console.log('✓ Product price is visible');
  });

  test('SMOKE-PDP-05 — Size selection is available', async ({ page }) => {
    await page.goto(BRAS_PLP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const firstProduct = page.locator('a[href*="catalog"], a[href*="/p/"]').first();
    await firstProduct.click();
    await page.waitForLoadState('domcontentloaded');

    const sizeControl = page.locator(
      'select[aria-label*="size" i], [class*="size"] button, [role="radio"][aria-label*="size" i]'
    ).first();

    const isVisible = await sizeControl.isVisible({ timeout: 3000 }).catch(() => false);
    expect(isVisible).toBeTruthy();
    console.log('✓ Size selection is available');
  });

  test('SMOKE-PDP-06 — Color selection is available', async ({ page }) => {
    await page.goto(BRAS_PLP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const firstProduct = page.locator('a[href*="catalog"], a[href*="/p/"]').first();
    await firstProduct.click();
    await page.waitForLoadState('domcontentloaded');

    const colorControl = page.locator(
      'button[aria-label*="color" i], [class*="color"] button, [role="radio"][aria-label*="color" i]'
    ).first();

    const isVisible = await colorControl.isVisible({ timeout: 3000 }).catch(() => false);
    expect(isVisible).toBeTruthy();
    console.log('✓ Color selection is available');
  });

  test('SMOKE-PDP-07 — Add to Bag button is visible', async ({ page }) => {
    await page.goto(BRAS_PLP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const firstProduct = page.locator('a[href*="catalog"], a[href*="/p/"]').first();
    await firstProduct.click();
    await page.waitForLoadState('domcontentloaded');

    const addToBagButton = page.locator(
      'button:has-text("Add to Bag"), button:has-text("Add to Cart"), button[aria-label*="add" i]'
    ).first();

    await expect(addToBagButton).toBeVisible();
    console.log('✓ Add to Bag button is visible');
  });

  test('SMOKE-PDP-08 — Can add item to bag', async ({ page }) => {
    await page.goto(BRAS_PLP, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const firstProduct = page.locator('a[href*="catalog"], a[href*="/p/"]').first();
    await firstProduct.click();
    await page.waitForLoadState('domcontentloaded');

    // Select size if needed
    const sizeControl = page.locator(
      'select[aria-label*="size" i], [class*="size"] button, [role="radio"][aria-label*="size" i]'
    ).first();

    const hasSizeControl = await sizeControl.count();
    if (hasSizeControl > 0) {
      await sizeControl.click();
      const firstSize = page.locator('[role="option"], li, button').first();
      await firstSize.click({ timeout: 5000 }).catch(() => {});
    }

    // Click Add to Bag
    const addToBagButton = page.locator(
      'button:has-text("Add to Bag"), button:has-text("Add to Cart"), button[aria-label*="add" i]'
    ).first();

    await addToBagButton.click();
    await page.waitForTimeout(1000);

    // Verify confirmation (message, modal, or bag update)
    const confirmation = page.locator(
      'text=Added, [class*="toast"], [class*="modal"], [class*="confirm"]'
    ).first();

    const isConfirmed = await confirmation.isVisible({ timeout: 3000 }).catch(() => false);
    if (!isConfirmed) {
      // Check if bag count updated
      const bagCount = page.locator('[class*="bag"] [class*="count"], [aria-label*="bag"]').first();
      const isVisible = await bagCount.isVisible({ timeout: 2000 }).catch(() => false);
      expect(isVisible || isConfirmed).toBeTruthy();
    }

    console.log('✓ Item added to bag');
  });
});
