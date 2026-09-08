import { test, expect } from '@playwright/test';

// Performance tests only run on chromium (not needed on multiple browsers)
test.describe.configure({ mode: 'serial' });

test.describe('VS Full Coverage Bras Performance Testing', () => {
  const BASE_URL = 'https://www.victoriassecret.com';
  const FULL_COVERAGE_URL = `${BASE_URL}/us/vs/bras/full-coverage`;

  // Skip performance tests on Firefox (they're not browser-specific)
  test.skip(({ browserName }) => browserName !== 'chromium', 'Performance tests only run on Chromium');

  // Performance thresholds (in milliseconds)
  const THRESHOLDS = {
    pageLoad: 5000,
    apiResponse: 3000,
    navigationTime: 12000,
    firstPaint: 2000,
    domContentLoaded: 3000,
    imageLoad: 2000,
  };

  test('PERF-FC-01 — Measure page load time for full coverage bras', async ({ page }) => {
    const navigationTiming: { startTime: number; endTime: number } = {
      startTime: 0,
      endTime: 0,
    };

    navigationTiming.startTime = Date.now();

    const response = await page.goto(FULL_COVERAGE_URL, {
      waitUntil: 'domcontentloaded',
    });

    navigationTiming.endTime = Date.now();
    const loadTime = navigationTiming.endTime - navigationTiming.startTime;

    console.log(`Page Load Time: ${loadTime}ms`);

    expect(response?.status()).toBe(200);
    expect(loadTime).toBeLessThan(THRESHOLDS.pageLoad);
  });

  test('PERF-FC-02 — Measure API response time', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.get(FULL_COVERAGE_URL);

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    console.log(`API Response Time: ${responseTime}ms`);

    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(THRESHOLDS.apiResponse);
  });

  test('PERF-FC-03 — Measure navigation timing metrics', async ({ page }) => {
    await page.goto(FULL_COVERAGE_URL, { waitUntil: 'networkidle' });

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

    console.log('Navigation Timing Metrics:', metrics);

    expect(metrics.domContentLoaded).toBeLessThan(THRESHOLDS.domContentLoaded);
    expect(metrics.timeToFirstByte).toBeLessThan(1000);
  });

  test('PERF-FC-04 — Measure Core Web Vitals', async ({ page }) => {
    await page.goto(FULL_COVERAGE_URL, { waitUntil: 'networkidle' });

    const webVitals = await page.evaluate(() => {
      return {
        fcp: performance.getEntriesByName('first-contentful-paint').length > 0
          ? (performance.getEntriesByName('first-contentful-paint')[0] as PerformanceEntry).startTime
          : null,
        lcp: performance.getEntriesByType('largest-contentful-paint').length > 0
          ? (performance.getEntriesByType('largest-contentful-paint').pop() as PerformanceEntry).startTime
          : null,
        cls: 0, // CLS measured differently, simplified for this test
      };
    });

    console.log('Core Web Vitals:', webVitals);

    // FCP should be under 2.5 seconds
    if (webVitals.fcp !== null) {
      expect(webVitals.fcp).toBeLessThan(2500);
    }

    // LCP should be under 4 seconds
    if (webVitals.lcp !== null) {
      expect(webVitals.lcp).toBeLessThan(4000);
    }
  });

  test('PERF-FC-05 — Measure image loading performance', async ({ page }) => {
    await page.goto(FULL_COVERAGE_URL, { waitUntil: 'networkidle' });

    const imageMetrics = await page.evaluate(() => {
      const images = performance.getEntriesByType('resource').filter((entry) =>
        entry.name.includes('.jpg') || entry.name.includes('.png') || entry.name.includes('.webp')
      );

      return {
        totalImages: images.length,
        averageLoadTime: images.length > 0 
          ? images.reduce((sum, img) => sum + img.duration, 0) / images.length 
          : 0,
        slowestImage: images.length > 0 
          ? Math.max(...images.map((img) => img.duration)) 
          : 0,
        fastestImage: images.length > 0 
          ? Math.min(...images.map((img) => img.duration)) 
          : 0,
      };
    });

    console.log('Image Loading Metrics:', imageMetrics);

    expect(imageMetrics.averageLoadTime).toBeLessThan(THRESHOLDS.imageLoad);
  });

  test('PERF-FC-06 — Measure resource loading times', async ({ page }) => {
    await page.goto(FULL_COVERAGE_URL, { waitUntil: 'networkidle' });

    const resourceMetrics = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');

      const byType = {
        scripts: resources.filter((r) => r.name.includes('.js')),
        stylesheets: resources.filter((r) => r.name.includes('.css')),
        images: resources.filter((r) => /\.(jpg|png|webp|gif)/.test(r.name)),
        fonts: resources.filter((r) => /\.(woff|ttf|otf)/.test(r.name)),
        api: resources.filter((r) => r.name.includes('/api')),
      };

      return {
        totalResources: resources.length,
        scriptCount: byType.scripts.length,
        averageScriptLoadTime: byType.scripts.length > 0
          ? byType.scripts.reduce((sum, r) => sum + r.duration, 0) / byType.scripts.length
          : 0,
        stylesheetCount: byType.stylesheets.length,
        averageStylesheetLoadTime: byType.stylesheets.length > 0
          ? byType.stylesheets.reduce((sum, r) => sum + r.duration, 0) / byType.stylesheets.length
          : 0,
        apiCallCount: byType.api.length,
        averageApiCallTime: byType.api.length > 0
          ? byType.api.reduce((sum, r) => sum + r.duration, 0) / byType.api.length
          : 0,
      };
    });

    console.log('Resource Loading Metrics:', resourceMetrics);

    expect(resourceMetrics.totalResources).toBeGreaterThan(0);
  });

  test('PERF-FC-07 — Measure product list rendering performance', async ({ page }) => {
    const startTime = Date.now();

    await page.goto(FULL_COVERAGE_URL, { waitUntil: 'networkidle' });

    // Wait for all products to be visible
    const productCount = await page.locator('main a[href*="/bras-catalog/"]').count();

    const renderTime = Date.now() - startTime;

    console.log(`Product List Render Time: ${renderTime}ms for ${productCount} products`);

    expect(productCount).toBeGreaterThan(0);
    expect(renderTime).toBeLessThan(THRESHOLDS.navigationTime);
  });

  test('PERF-FC-08 — Measure DOM size and complexity', async ({ page }) => {
    await page.goto(FULL_COVERAGE_URL, { waitUntil: 'networkidle' });

    const domMetrics = await page.evaluate(() => {
      return {
        domNodeCount: document.querySelectorAll('*').length,
        formCount: document.querySelectorAll('form').length,
        inputCount: document.querySelectorAll('input').length,
        imageCount: document.querySelectorAll('img').length,
        linkCount: document.querySelectorAll('a').length,
      };
    });

    console.log('DOM Metrics:', domMetrics);

    expect(domMetrics.domNodeCount).toBeGreaterThan(100);
  });

  test('PERF-FC-09 — Measure memory usage', async ({ page }) => {
    await page.goto(FULL_COVERAGE_URL, { waitUntil: 'networkidle' });

    const memoryMetrics = await page.evaluate(() => {
      if ((performance as any).memory) {
        return {
          usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
          totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
          jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit,
        };
      }
      return null;
    });

    console.log('Memory Metrics:', memoryMetrics);

    if (memoryMetrics) {
      // Memory usage should be reasonable (less than 100MB used)
      expect(memoryMetrics.usedJSHeapSize).toBeLessThan(100 * 1024 * 1024);
    }
  });

  test('PERF-FC-10 — Measure interaction performance', async ({ page }) => {
    await page.goto(FULL_COVERAGE_URL, { waitUntil: 'networkidle' });

    // Dismiss consent banner if present
    const consentButton = page.locator('[id*="onetrust"] button, [aria-label*="Accept"]').first();
    if (await consentButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await consentButton.click().catch(() => null);
      await page.waitForTimeout(300);
    }

    // Measure time to first interactive product
    const interactionStartTime = Date.now();

    const firstProduct = page.locator('main a[href*="/bras-catalog/"]').first();
    await firstProduct.hover({ force: true }).catch(() => null);

    const interactionTime = Date.now() - interactionStartTime;

    console.log(`Time to First Interaction: ${interactionTime}ms`);

    expect(interactionTime).toBeLessThan(2000);
  });

  test('PERF-FC-11 — Measure color swatch interaction performance', async ({ page }) => {
    await page.goto(FULL_COVERAGE_URL, { waitUntil: 'networkidle' });

    // Dismiss consent banner if present
    const consentButton = page.locator('[id*="onetrust"] button, [aria-label*="Accept"]').first();
    if (await consentButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await consentButton.click().catch(() => null);
      await page.waitForTimeout(300);
    }

    const productTiles = await page.locator('main a[href*="/bras-catalog/"]').all();

    if (productTiles.length > 0) {
      const firstTile = productTiles[0];
      const tileParent = firstTile.locator('xpath=ancestor::*[.//*[@role="radiogroup"]][1]').first();

      const swatches = tileParent.getByRole('radio');
      const swatchCount = await swatches.count();

      if (swatchCount > 1) {
        const swatchClickStart = Date.now();

        await swatches.nth(1).click({ force: true }).catch(() => null);
        await page.waitForTimeout(200);

        const swatchClickTime = Date.now() - swatchClickStart;

        console.log(`Color Swatch Click Performance: ${swatchClickTime}ms`);

        expect(swatchClickTime).toBeLessThan(2000);
      }
    }
  });

  test('PERF-FC-12 — Measure page scroll performance', async ({ page }) => {
    await page.goto(FULL_COVERAGE_URL, { waitUntil: 'networkidle' });

    // Measure scroll performance
    const scrollStartTime = Date.now();

    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 3);
    });

    await page.waitForTimeout(300);

    const scrollTime = Date.now() - scrollStartTime;

    console.log(`Scroll Performance: ${scrollTime}ms`);

    expect(scrollTime).toBeLessThan(2000);
  });

  test('PERF-FC-13 — Measure network request count and size', async ({ page }) => {
    const requests: { url: string; size: number; duration: number }[] = [];

    page.on('response', (response) => {
      const request = response.request();
      requests.push({
        url: request.url(),
        size: response.headers()['content-length'] ? parseInt(response.headers()['content-length']) : 0,
        duration: 0,
      });
    });

    await page.goto(FULL_COVERAGE_URL, { waitUntil: 'networkidle' });

    const totalSize = requests.reduce((sum, req) => sum + req.size, 0);
    const totalSizeMB = totalSize / (1024 * 1024);

    console.log(`Total Network Requests: ${requests.length}`);
    console.log(`Total Data Transferred: ${totalSizeMB.toFixed(2)}MB`);

    expect(requests.length).toBeGreaterThan(0);
    // Total page size should be reasonable (less than 10MB)
    expect(totalSizeMB).toBeLessThan(10);
  });

  test('PERF-FC-14 — Measure CSS rendering performance', async ({ page }) => {
    await page.goto(FULL_COVERAGE_URL, { waitUntil: 'networkidle' });

    const cssMetrics = await page.evaluate(() => {
      const stylesheets = Array.from(document.styleSheets) as any[];
      return {
        styleSheetCount: stylesheets.length,
        totalCSSRules: stylesheets.reduce((sum, sheet) => {
          try {
            return sum + (sheet.cssRules?.length || 0);
          } catch {
            return sum;
          }
        }, 0),
      };
    });

    console.log('CSS Metrics:', cssMetrics);

    expect(cssMetrics.styleSheetCount).toBeGreaterThan(0);
  });

  test('PERF-FC-15 — Measure repeated navigation performance', async ({ page }) => {
    // First navigation
    const firstNavStart = Date.now();
    await page.goto(FULL_COVERAGE_URL, { waitUntil: 'domcontentloaded' });
    const firstNavTime = Date.now() - firstNavStart;

    // Second navigation (may be cached)
    const secondNavStart = Date.now();
    await page.goto(FULL_COVERAGE_URL, { waitUntil: 'domcontentloaded' });
    const secondNavTime = Date.now() - secondNavStart;

    console.log(`First Navigation: ${firstNavTime}ms`);
    console.log(`Second Navigation (cached): ${secondNavTime}ms`);
    console.log(`Cache Performance Improvement: ${(((firstNavTime - secondNavTime) / firstNavTime) * 100).toFixed(2)}%`);

    expect(firstNavTime).toBeLessThan(THRESHOLDS.pageLoad);
    expect(secondNavTime).toBeLessThan(THRESHOLDS.pageLoad);
  });
});
