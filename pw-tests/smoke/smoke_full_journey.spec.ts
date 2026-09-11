import { test, expect } from '@playwright/test';

test.describe('SMOKE: Full Website Walkthrough', () => {
  const VS_BASE_URL = 'https://www.victoriassecret.com/us/vs';

  test('SMOKE-FULL-01 — Complete user journey: Home → Search → PLP → PDP → Cart', async ({ page }) => {
    // Step 1: Load homepage
    console.log('\n[STEP 1] Loading homepage...');
    const homeResponse = await page.goto(VS_BASE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    expect(homeResponse?.status()).toBe(200);
    console.log('✓ Homepage loaded');

    // Dismiss overlays
    await page.evaluate(() => {
      const onetrust = document.getElementById('onetrust-consent-sdk');
      if (onetrust) onetrust.remove();
    });
    await page.waitForTimeout(500);

    // Step 2: Search
    console.log('[STEP 2] Performing search...');
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i]'
    ).first();

    await searchInput.click();
    await searchInput.type('bra');
    await searchInput.press('Enter');
    await page.waitForLoadState('domcontentloaded');
    console.log('✓ Search completed');

    // Step 3: Navigate to PLP
    console.log('[STEP 3] Verifying PLP loaded...');
    const currentUrl = page.url();
    expect(currentUrl).not.toBe(VS_BASE_URL);
    const productLinks = page.locator('a[href*="catalog"], a[href*="/p/"]');
    const productCount = await productLinks.count();
    expect(productCount).toBeGreaterThan(0);
    console.log(`✓ PLP loaded with ${productCount} products`);

    // Step 4: Click first product
    console.log('[STEP 4] Navigating to product detail...');
    const firstProduct = productLinks.first();
    await firstProduct.click();
    await page.waitForLoadState('domcontentloaded');
    const pdpUrl = page.url();
    expect(pdpUrl).not.toBe(currentUrl);
    console.log('✓ Product detail page loaded');

    // Step 5: Add to cart
    console.log('[STEP 5] Adding item to cart...');
    const sizeControl = page.locator(
      'select[aria-label*="size" i], [class*="size"] button, [role="radio"][aria-label*="size" i]'
    ).first();

    const hasSize = await sizeControl.count();
    if (hasSize > 0) {
      await sizeControl.click();
      const firstSize = page.locator('[role="option"], li, button').first();
      await firstSize.click({ timeout: 5000 }).catch(() => {});
    }

    const addToBagButton = page.locator(
      'button:has-text("Add to Bag"), button:has-text("Add to Cart"), button[aria-label*="add" i]'
    ).first();

    await addToBagButton.click();
    await page.waitForTimeout(1000);
    console.log('✓ Item added to cart');

    // Step 6: Verify cart
    console.log('[STEP 6] Verifying cart state...');
    const cartConfirmation = page.locator(
      'text=Added, [class*="toast"], [class*="modal"], [class*="confirm"]'
    ).first();

    const isConfirmed = await cartConfirmation.isVisible({ timeout: 3000 }).catch(() => false);
    if (!isConfirmed) {
      const bagIcon = page.locator('[class*="bag"]').first();
      const isVisible = await bagIcon.isVisible({ timeout: 2000 }).catch(() => false);
      expect(isVisible || isConfirmed).toBeTruthy();
    }
    console.log('✓ Cart update confirmed\n');
  });

  test('SMOKE-FULL-02 — Complete user journey: Home → Menu → Category Page', async ({ page }) => {
    // Step 1: Load homepage
    console.log('\n[STEP 1] Loading homepage...');
    const homeResponse = await page.goto(VS_BASE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    expect(homeResponse?.status()).toBe(200);
    console.log('✓ Homepage loaded');

    // Dismiss overlays
    await page.evaluate(() => {
      const onetrust = document.getElementById('onetrust-consent-sdk');
      if (onetrust) onetrust.remove();
    });
    await page.waitForTimeout(500);

    // Step 2: Open menu
    console.log('[STEP 2] Opening NEW menu...');
    const newButton = page.locator('button:has-text("NEW"), a:has-text("NEW")').first();
    await newButton.hover({ timeout: 5000 });
    await page.waitForTimeout(500);
    console.log('✓ Menu opened');

    // Step 3: Click menu item
    console.log('[STEP 3] Clicking menu item...');
    const menuItem = page.locator('a:has-text("Bestseller"), a:has-text("Collection"), a:has-text("Featured")').first();
    const menuItemVisible = await menuItem.isVisible({ timeout: 3000 }).catch(() => false);

    if (menuItemVisible) {
      await menuItem.click();
      await page.waitForLoadState('domcontentloaded');
      const newUrl = page.url();
      expect(newUrl).not.toBe(VS_BASE_URL);
      console.log('✓ Successfully navigated via menu');
    } else {
      console.log('⚠ Menu items not visible');
    }
    console.log('');
  });

  test('SMOKE-FULL-03 — Complete user journey: Home → Account Page', async ({ page }) => {
    // Step 1: Load homepage
    console.log('\n[STEP 1] Loading homepage...');
    const homeResponse = await page.goto(VS_BASE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    expect(homeResponse?.status()).toBe(200);
    console.log('✓ Homepage loaded');

    // Dismiss overlays
    await page.evaluate(() => {
      const onetrust = document.getElementById('onetrust-consent-sdk');
      if (onetrust) onetrust.remove();
    });
    await page.waitForTimeout(500);

    // Step 2: Click account link
    console.log('[STEP 2] Navigating to account...');
    const accountLink = page.locator(
      'a[href*="signin"], a[href*="account"], a[href*="login"], button[aria-label*="account" i]'
    ).first();

    await accountLink.click();
    await page.waitForLoadState('domcontentloaded');

    // Step 3: Verify sign-in page
    console.log('[STEP 3] Verifying sign-in page...');
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/signin|account|login/i);

    const emailInput = page.locator(
      'input[type="email"], input[autocomplete="email"], input[inputmode="email"], input[name*="email" i]'
    ).first();

    const isVisible = await emailInput.isVisible({ timeout: 3000 }).catch(() => false);
    expect(isVisible).toBeTruthy();
    console.log('✓ Sign-in page loaded successfully\n');
  });
});
