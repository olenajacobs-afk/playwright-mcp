import { test, expect } from '@playwright/test';
import { bestEffortWaitForTransientLoaders } from './utils/vs';

// Performance tests only run on chromium (not needed on multiple browsers)
test.describe.configure({ mode: 'serial' });

test.describe('Bras Selecting Performance Testing', () => {
  const VS_BASE_URL = process.env.VS_BASE_URL || 'https://www.victoriassecret.com';
  
  const PLPUrls = {
    smooth: process.env.SMOOTH_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/smooth',
    smoothPushUp: process.env.SMOOTH_PUSHUP_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/smooth/push-up',
    smoothWireless: process.env.SMOOTH_WIRELESS_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/smooth/wireless',
    smoothTShirt: process.env.SMOOTH_TSHIRT_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/smooth/t-shirt',
    smoothStrapless: process.env.SMOOTH_STRAPLESS_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/smooth/strapless',
    smoothDemi: process.env.SMOOTH_DEMI_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/smooth/demi',
    gradientShine: process.env.GRADIENT_SHINE_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/gradient-shine',
  };

  // Performance thresholds (in milliseconds)
  const THRESHOLDS = {
    plpLoad: 10000,
    filterApplication: 4000,
    pdpLoad: 8000,
    colorSelection: 1000,
    bandSelection: 1000,
    cupSelection: 1000,
    shipSelection: 1000,
    addToBag: 2000,
    navigationTime: 15000,
  };

  // Skip performance tests on Firefox (they're not browser-specific)
  test.skip(({ browserName }) => browserName !== 'chromium', 'Performance tests only run on Chromium');

  test('PERF-SEL-01 — Measure Smooth PLP page load time', async ({ page }) => {
    const startTime = Date.now();

    const response = await page.goto(PLPUrls.smooth, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    const loadTime = Date.now() - startTime;

    console.log(`Smooth PLP Page Load Time: ${loadTime}ms`);

    expect(response?.status()).toBe(200);
    expect(loadTime).toBeLessThan(THRESHOLDS.plpLoad);
  });

  test('PERF-SEL-02 — Measure Smooth Push-Up PLP page load time', async ({ page }) => {
    const startTime = Date.now();

    const response = await page.goto(PLPUrls.smoothPushUp, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    const loadTime = Date.now() - startTime;

    console.log(`Smooth Push-Up PLP Page Load Time: ${loadTime}ms`);

    expect(response?.status()).toBe(200);
    expect(loadTime).toBeLessThan(THRESHOLDS.plpLoad);
  });

  test('PERF-SEL-03 — Measure Smooth Wireless PLP page load time', async ({ page }) => {
    const startTime = Date.now();

    const response = await page.goto(PLPUrls.smoothWireless, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    const loadTime = Date.now() - startTime;

    console.log(`Smooth Wireless PLP Page Load Time: ${loadTime}ms`);

    expect(response?.status()).toBe(200);
    expect(loadTime).toBeLessThan(THRESHOLDS.plpLoad);
  });

  test('PERF-SEL-04 — Measure Smooth T-Shirt PLP page load time', async ({ page }) => {
    const startTime = Date.now();

    const response = await page.goto(PLPUrls.smoothTShirt, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    const loadTime = Date.now() - startTime;

    console.log(`Smooth T-Shirt PLP Page Load Time: ${loadTime}ms`);

    expect(response?.status()).toBe(200);
    expect(loadTime).toBeLessThan(THRESHOLDS.plpLoad);
  });

  test('PERF-SEL-05 — Measure Smooth Strapless PLP page load time', async ({ page }) => {
    const startTime = Date.now();

    const response = await page.goto(PLPUrls.smoothStrapless, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    const loadTime = Date.now() - startTime;

    console.log(`Smooth Strapless PLP Page Load Time: ${loadTime}ms`);

    expect(response?.status()).toBe(200);
    expect(loadTime).toBeLessThan(THRESHOLDS.plpLoad);
  });

  test('PERF-SEL-06 — Measure Smooth Demi PLP page load time', async ({ page }) => {
    const startTime = Date.now();

    const response = await page.goto(PLPUrls.smoothDemi, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    const loadTime = Date.now() - startTime;

    console.log(`Smooth Demi PLP Page Load Time: ${loadTime}ms`);

    expect(response?.status()).toBe(200);
    expect(loadTime).toBeLessThan(THRESHOLDS.plpLoad);
  });

  test('PERF-SEL-07 — Measure Gradient Shine PLP page load time', async ({ page }) => {
    const startTime = Date.now();

    const response = await page.goto(PLPUrls.gradientShine, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    const loadTime = Date.now() - startTime;

    console.log(`Gradient Shine PLP Page Load Time: ${loadTime}ms`);

    expect(response?.status()).toBe(200);
    expect(loadTime).toBeLessThan(THRESHOLDS.plpLoad);
  });

  test('PERF-SEL-08 — Measure first PDP load time from Smooth category', async ({ page }) => {
    await page.goto(PLPUrls.smooth, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortWaitForTransientLoaders(page);

    // Find first product tile
    const productTile = page.locator('a[href*="-catalog/"]').first();
    const tileCount = await productTile.count();

    if (tileCount === 0) {
      test.skip();
    }

    const startTime = Date.now();
    await productTile.click({ timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    const loadTime = Date.now() - startTime;

    console.log(`Smooth PDP Load Time (from tile click): ${loadTime}ms`);
    expect(loadTime).toBeLessThan(THRESHOLDS.pdpLoad);
  });

  test('PERF-SEL-09 — Measure color selection performance', async ({ page }) => {
    await page.goto(PLPUrls.smooth, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortWaitForTransientLoaders(page);

    const productTile = page.locator('a[href*="-catalog/"]').first();
    if ((await productTile.count()) === 0) {
      test.skip();
    }

    await productTile.click({ timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await bestEffortWaitForTransientLoaders(page);

    // Find color swatches
    const colorSwatches = page.locator('button[aria-label*="("]');
    const swatchCount = await colorSwatches.count();

    if (swatchCount > 0) {
      const startTime = Date.now();
      await colorSwatches.first().click({ timeout: 10_000 });
      await bestEffortWaitForTransientLoaders(page);
      const selectionTime = Date.now() - startTime;

      console.log(`Color Selection Performance: ${selectionTime}ms (${swatchCount} swatches available)`);
      expect(selectionTime).toBeLessThan(THRESHOLDS.colorSelection);
    }
  });

  test('PERF-SEL-10 — Measure band selection performance', async ({ page }) => {
    await page.goto(PLPUrls.smooth, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortWaitForTransientLoaders(page);

    const productTile = page.locator('a[href*="-catalog/"]').first();
    if ((await productTile.count()) === 0) {
      test.skip();
    }

    await productTile.click({ timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await bestEffortWaitForTransientLoaders(page);

    // Find band radios
    const bandRadios = page.locator('[role="radio"][aria-label*="Band"]');
    const bandCount = await bandRadios.count();

    if (bandCount > 0) {
      const startTime = Date.now();
      await bandRadios.first().click({ timeout: 10_000 });
      await bestEffortWaitForTransientLoaders(page);
      const selectionTime = Date.now() - startTime;

      console.log(`Band Selection Performance: ${selectionTime}ms (${bandCount} bands available)`);
      expect(selectionTime).toBeLessThan(THRESHOLDS.bandSelection);
    }
  });

  test('PERF-SEL-11 — Measure cup selection performance', async ({ page }) => {
    await page.goto(PLPUrls.smooth, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortWaitForTransientLoaders(page);

    const productTile = page.locator('a[href*="-catalog/"]').first();
    if ((await productTile.count()) === 0) {
      test.skip();
    }

    await productTile.click({ timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await bestEffortWaitForTransientLoaders(page);

    // Find cup radios
    const cupRadios = page.locator('[role="radio"][aria-label*="Cup"]');
    const cupCount = await cupRadios.count();

    if (cupCount > 0) {
      const startTime = Date.now();
      await cupRadios.first().click({ timeout: 10_000 });
      await bestEffortWaitForTransientLoaders(page);
      const selectionTime = Date.now() - startTime;

      console.log(`Cup Selection Performance: ${selectionTime}ms (${cupCount} cups available)`);
      expect(selectionTime).toBeLessThan(THRESHOLDS.cupSelection);
    }
  });

  test('PERF-SEL-12 — Measure swatch selection performance (Gradient Shine)', async ({ page }) => {
    await page.goto(PLPUrls.gradientShine, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortWaitForTransientLoaders(page);

    const productTile = page.locator('a[href*="-catalog/"]').first();
    if ((await productTile.count()) === 0) {
      test.skip();
    }

    await productTile.click({ timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await bestEffortWaitForTransientLoaders(page);

    // Find swatch buttons (for Shine Strap products)
    const swatches = page.locator('button[data-testid*="swatch"], button[aria-label*="strap"]');
    const swatchCount = await swatches.count();

    if (swatchCount > 0) {
      const startTime = Date.now();
      await swatches.first().click({ timeout: 10_000 });
      await bestEffortWaitForTransientLoaders(page);
      const selectionTime = Date.now() - startTime;

      console.log(`Swatch Selection Performance: ${selectionTime}ms (${swatchCount} swatches available)`);
      expect(selectionTime).toBeLessThan(1500);
    }
  });

  test('PERF-SEL-13 — Measure filter application performance', async ({ page }) => {
    await page.goto(`${VS_BASE_URL}/us/vs/bras`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortWaitForTransientLoaders(page);

    // Try to open filter panel
    const filterButton = page.locator('button').filter({ hasText: /filter/i }).first();

    if ((await filterButton.count()) === 0) {
      test.skip();
    }

    const startTime = Date.now();
    await filterButton.click({ timeout: 10_000 });
    await page.waitForTimeout(500); // Wait for filter panel to appear
    const filterOpenTime = Date.now() - startTime;

    console.log(`Filter Panel Open Time: ${filterOpenTime}ms`);
    expect(filterOpenTime).toBeLessThan(2000);
  });

  test('PERF-SEL-14 — Measure navigation timing for Smooth categories', async ({ page }) => {
    await page.goto(PLPUrls.smooth, { waitUntil: 'networkidle', timeout: 45_000 });

    const metrics = await page.evaluate(() => {
      const perfData = performance.getEntriesByType('navigation');
      const navTiming = perfData[0] as PerformanceNavigationTiming;

      return {
        domContentLoaded: navTiming.domContentLoadedEventEnd - navTiming.domContentLoadedEventStart,
        loadComplete: navTiming.loadEventEnd - navTiming.loadEventStart,
        timeToFirstByte: navTiming.responseStart - navTiming.requestStart,
        domInteractive: navTiming.domInteractive - navTiming.fetchStart,
        domComplete: navTiming.domComplete - navTiming.fetchStart,
      };
    });

    console.log('Navigation Timing Metrics (Smooth):', metrics);

    expect(metrics.domContentLoaded).toBeLessThan(THRESHOLDS.navigationTime);
    expect(metrics.timeToFirstByte).toBeLessThan(2000);
  });

  test('PERF-SEL-15 — Measure complete selection flow performance (Smooth category)', async ({ page }) => {
    const startTime = Date.now();

    // Navigate to Smooth PLP
    await page.goto(PLPUrls.smooth, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortWaitForTransientLoaders(page);

    // Click first product
    const productTile = page.locator('a[href*="-catalog/"]').first();
    if ((await productTile.count()) === 0) {
      test.skip();
    }

    await productTile.click({ timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await bestEffortWaitForTransientLoaders(page);

    // Select color if available
    const colorSwatches = page.locator('button[aria-label*="("]');
    if ((await colorSwatches.count()) > 0) {
      await colorSwatches.first().click({ timeout: 10_000 });
      await bestEffortWaitForTransientLoaders(page);
    }

    // Select band if available
    const bandRadios = page.locator('[role="radio"][aria-label*="Band"]');
    if ((await bandRadios.count()) > 0) {
      await bandRadios.first().click({ timeout: 10_000 });
      await bestEffortWaitForTransientLoaders(page);
    }

    // Select cup if available
    const cupRadios = page.locator('[role="radio"][aria-label*="Cup"]');
    if ((await cupRadios.count()) > 0) {
      await cupRadios.first().click({ timeout: 10_000 });
      await bestEffortWaitForTransientLoaders(page);
    }

    // Select Ship to You option if available
    const shipOption = page.locator('[role="radio"][aria-label*="Ship"]').first();
    if ((await shipOption.count()) > 0) {
      await shipOption.click({ timeout: 10_000 });
      await bestEffortWaitForTransientLoaders(page);
    }

    // Click Add to Bag if available
    const addToBagButton = page.locator('button').filter({ hasText: /add to bag/i }).first();
    if ((await addToBagButton.count()) > 0 && (await addToBagButton.isEnabled())) {
      await addToBagButton.click({ timeout: 10_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => null);
    }

    const totalTime = Date.now() - startTime;
    console.log(`Complete Selection Flow (Smooth): ${totalTime}ms`);

    expect(totalTime).toBeLessThan(THRESHOLDS.pdpLoad + THRESHOLDS.addToBag);
  });
});
