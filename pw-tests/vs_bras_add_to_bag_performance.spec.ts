import { test, expect } from '@playwright/test';
import { VS_BASE_URL, makeWarn, bestEffortWaitForTransientLoaders } from './utils/vs';

// Performance tests only run on chromium (not needed on multiple browsers)
test.describe.configure({ mode: 'serial' });

test.describe('Bras Add-to-Bag Performance Testing', () => {
  const PUSHUP_PLP_URL = process.env.PUSHUP_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/push-up';

  // Performance thresholds (in milliseconds)
  const THRESHOLDS = {
    pageLoad: 8000,
    pdpLoad: 6000,
    apiResponse: 3000,
    navigationTime: 15000,
    firstPaint: 2000,
    domContentLoaded: 4000,
    imageLoad: 3000,
    interactionResponse: 1000,
    bandSelectionResponse: 2000,
    addToBagResponse: 2000,
  };

  // Skip performance tests on Firefox (they're not browser-specific)
  test.skip(({ browserName }) => browserName !== 'chromium', 'Performance tests only run on Chromium');

  test('PERF-ATB-01 — Measure PLP page load time for Push-Up bras', async ({ page }) => {
    const startTime = Date.now();

    const response = await page.goto(PUSHUP_PLP_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    const loadTime = Date.now() - startTime;

    console.log(`PLP Page Load Time: ${loadTime}ms`);

    expect(response?.status()).toBe(200);
    expect(loadTime).toBeLessThan(THRESHOLDS.pageLoad);
  });

  test('PERF-ATB-02 — Measure PDP page load time from tile click', async ({ page }) => {
    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortWaitForTransientLoaders(page);

    // Find and click first product tile
    const productTile = page.locator('a[href*="-catalog/"]').first();
    const tileCount = await productTile.count();
    
    if (tileCount === 0) {
      test.skip();
    }

    const startTime = Date.now();
    await productTile.click({ timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    const loadTime = Date.now() - startTime;

    console.log(`PDP Load Time (from tile click): ${loadTime}ms`);
    expect(loadTime).toBeLessThan(THRESHOLDS.pdpLoad);
  });

  test('PERF-ATB-03 — Measure navigation timing metrics on PLP', async ({ page }) => {
    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'networkidle', timeout: 45_000 });

    const metrics = await page.evaluate(() => {
      const perfData = performance.getEntriesByType('navigation');
      const navTiming = perfData[0] as PerformanceNavigationTiming;

      return {
        domContentLoaded:
          navTiming.domContentLoadedEventEnd - navTiming.domContentLoadedEventStart,
        loadComplete: navTiming.loadEventEnd - navTiming.loadEventStart,
        timeToFirstByte: navTiming.responseStart - navTiming.requestStart,
        domInteractive: navTiming.domInteractive - navTiming.fetchStart,
        domComplete: navTiming.domComplete - navTiming.fetchStart,
      };
    });

    console.log('Navigation Timing Metrics:', metrics);

    expect(metrics.domContentLoaded).toBeLessThan(THRESHOLDS.domContentLoaded);
    expect(metrics.timeToFirstByte).toBeLessThan(2000);
  });

  test('PERF-ATB-04 — Measure Core Web Vitals on PLP', async ({ page }) => {
    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'networkidle', timeout: 45_000 });

    const webVitals = await page.evaluate(() => {
      return {
        fcp: performance.getEntriesByName('first-contentful-paint').length > 0
          ? (performance.getEntriesByName('first-contentful-paint')[0] as PerformanceEntry)
              .startTime
          : null,
        lcp: performance.getEntriesByType('largest-contentful-paint').length > 0
          ? (performance.getEntriesByType('largest-contentful-paint').pop() as PerformanceEntry)
              .startTime
          : null,
      };
    });

    console.log('Core Web Vitals (PLP):', webVitals);

    if (webVitals.fcp !== null) {
      expect(webVitals.fcp).toBeLessThan(2500);
    }

    if (webVitals.lcp !== null) {
      expect(webVitals.lcp).toBeLessThan(5000);
    }
  });

  test('PERF-ATB-05 — Measure image loading performance on PLP', async ({ page }) => {
    let imageLoadTimes: number[] = [];

    page.on('response', (response) => {
      const url = response.url();
      if (/\.(jpg|png|webp|gif)/.test(url)) {
        const timing = response.request().timing();
        if (timing) {
          const totalTime = timing.responseEnd - timing.requestStart;
          imageLoadTimes.push(totalTime);
        }
      }
    });

    const startTime = Date.now();
    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'networkidle', timeout: 45_000 });
    const totalTime = Date.now() - startTime;

    const avgImageLoadTime = imageLoadTimes.length > 0 ? imageLoadTimes.reduce((a, b) => a + b, 0) / imageLoadTimes.length : 0;

    console.log(`Image Load Performance: avg=${avgImageLoadTime.toFixed(0)}ms, total=${imageLoadTimes.length} images, page-load=${totalTime}ms`);

    expect(imageLoadTimes.length).toBeGreaterThan(0);
    expect(avgImageLoadTime).toBeLessThan(THRESHOLDS.imageLoad);
  });

  test('PERF-ATB-06 — Measure resource loading times', async ({ page }) => {
    const resources: { name: string; time: number }[] = [];

    page.on('response', (response) => {
      const url = response.url();
      const timing = response.request().timing();
      if (timing) {
        const totalTime = timing.responseEnd - timing.requestStart;
        resources.push({
          name: url.split('/').pop() || url,
          time: totalTime,
        });
      }
    });

    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'networkidle', timeout: 45_000 });

    const jsResources = resources.filter((r) => /\.js/.test(r.name));
    const cssResources = resources.filter((r) => /\.css/.test(r.name));
    const imageResources = resources.filter((r) => /\.(jpg|png|webp|gif)/.test(r.name));

    const avgJsTime = jsResources.length > 0 ? jsResources.reduce((a, b) => a + b.time, 0) / jsResources.length : 0;
    const avgCssTime = cssResources.length > 0 ? cssResources.reduce((a, b) => a + b.time, 0) / cssResources.length : 0;

    console.log(`Resource Loading - JS: ${avgJsTime.toFixed(0)}ms avg (${jsResources.length} files), CSS: ${avgCssTime.toFixed(0)}ms avg (${cssResources.length} files), Images: ${imageResources.length}`);

    expect(resources.length).toBeGreaterThan(0);
  });

  test('PERF-ATB-07 — Measure product list rendering performance', async ({ page }) => {
    const startTime = Date.now();

    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortWaitForTransientLoaders(page);

    // Wait for product tiles to render
    const productTiles = page.locator('a[href*="-catalog/"]');
    await productTiles.first().waitFor({ timeout: 15_000 });

    const renderTime = Date.now() - startTime;
    const tileCount = await productTiles.count();

    console.log(`Product List Rendering: ${renderTime}ms to render ${tileCount} tiles`);

    expect(tileCount).toBeGreaterThan(0);
    expect(renderTime).toBeLessThan(THRESHOLDS.pageLoad);
  });

  test('PERF-ATB-08 — Measure DOM size and complexity on PLP', async ({ page }) => {
    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'networkidle', timeout: 45_000 });

    const domStats = await page.evaluate(() => {
      return {
        totalNodes: document.querySelectorAll('*').length,
        depthLevel: Math.max(
          ...Array.from(document.querySelectorAll('*')).map((el) => {
            let depth = 0;
            let current = el;
            while (current.parentElement) {
              depth++;
              current = current.parentElement;
            }
            return depth;
          })
        ),
        iframeCount: document.querySelectorAll('iframe').length,
        scriptCount: document.querySelectorAll('script').length,
        styleCount: document.querySelectorAll('style').length,
      };
    });

    console.log('DOM Complexity:', domStats);

    expect(domStats.totalNodes).toBeLessThan(10000);
    expect(domStats.depthLevel).toBeLessThan(100);
  });

  test('PERF-ATB-09 — Measure band/cup selection interaction performance', async ({ page }) => {
    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortWaitForTransientLoaders(page);

    // Click first product tile
    const productTile = page.locator('a[href*="-catalog/"]').first();
    if ((await productTile.count()) === 0) {
      test.skip();
    }

    await productTile.click({ timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await bestEffortWaitForTransientLoaders(page);

    // Find and measure band selection interaction
    const bandRadios = page.locator('[role="radio"][aria-label*="Band"]');
    const bandCount = await bandRadios.count();

    if (bandCount > 0) {
      const startTime = Date.now();
      await bandRadios.first().click({ timeout: 10_000 });
      const interactionTime = Date.now() - startTime;

      console.log(`Band Selection Interaction: ${interactionTime}ms`);
      expect(interactionTime).toBeLessThan(THRESHOLDS.bandSelectionResponse);
    }

    // Find and measure cup selection interaction
    const cupRadios = page.locator('[role="radio"][aria-label*="Cup"]');
    const cupCount = await cupRadios.count();

    if (cupCount > 0) {
      const startTime = Date.now();
      await cupRadios.first().click({ timeout: 10_000 });
      const interactionTime = Date.now() - startTime;

      console.log(`Cup Selection Interaction: ${interactionTime}ms`);
      expect(interactionTime).toBeLessThan(THRESHOLDS.interactionResponse);
    }
  });

  test('PERF-ATB-10 — Measure Add to Bag button interaction performance', async ({ page }) => {
    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortWaitForTransientLoaders(page);

    // Click first product tile
    const productTile = page.locator('a[href*="-catalog/"]').first();
    if ((await productTile.count()) === 0) {
      test.skip();
    }

    await productTile.click({ timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await bestEffortWaitForTransientLoaders(page);

    // Find Add to Bag button
    const addToBagButton = page.locator('button').filter({ hasText: /add to bag/i }).first();

    if ((await addToBagButton.count()) > 0 && (await addToBagButton.isEnabled())) {
      const startTime = Date.now();
      await addToBagButton.click({ timeout: 10_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => null);
      const interactionTime = Date.now() - startTime;

      console.log(`Add to Bag Interaction: ${interactionTime}ms`);
      expect(interactionTime).toBeLessThan(THRESHOLDS.addToBagResponse);
    }
  });

  test('PERF-ATB-11 — Measure memory usage on PLP', async ({ page }) => {
    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'networkidle', timeout: 45_000 });

    const memoryUsage = await page.evaluate(() => {
      if ('memory' in performance) {
        const mem = (performance as any).memory;
        return {
          usedJSHeapSize: Math.round(mem.usedJSHeapSize / 1024 / 1024),
          totalJSHeapSize: Math.round(mem.totalJSHeapSize / 1024 / 1024),
          jsHeapSizeLimit: Math.round(mem.jsHeapSizeLimit / 1024 / 1024),
        };
      }
      return null;
    });

    if (memoryUsage) {
      console.log(
        `Memory Usage: ${memoryUsage.usedJSHeapSize}MB used / ${memoryUsage.totalJSHeapSize}MB allocated (limit: ${memoryUsage.jsHeapSizeLimit}MB)`
      );

      expect(memoryUsage.usedJSHeapSize).toBeLessThan(300); // Reasonable limit
    }
  });

  test('PERF-ATB-12 — Measure network request count and size', async ({ page, context }) => {
    let totalSize = 0;
    let requestCount = 0;

    // Track requests
    page.on('response', (response) => {
      requestCount++;
      const timing = response.request().timing();
      if (timing) {
        totalSize += timing.responseEnd;
      }
    });

    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'networkidle', timeout: 45_000 });

    const avgRequestSize = requestCount > 0 ? totalSize / requestCount : 0;

    console.log(
      `Network Performance: ${requestCount} requests, avg size=${avgRequestSize.toFixed(0)}ms per request`
    );

    expect(requestCount).toBeLessThan(200); // Reasonable limit for PLP
  });

  test('PERF-ATB-13 — Measure scroll performance on PLP', async ({ page }) => {
    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'networkidle', timeout: 45_000 });

    // Measure scrolling performance
    const scrollStartTime = Date.now();
    await page.evaluate(() => {
      window.scrollBy(0, 1000);
    });
    await page.waitForTimeout(500); // Allow paint to occur
    const scrollTime = Date.now() - scrollStartTime;

    console.log(`Scroll Performance: ${scrollTime}ms for 1000px scroll`);

    expect(scrollTime).toBeLessThan(2000);
  });

  test('PERF-ATB-14 — Measure repeated PDP navigation performance', async ({ page }) => {
    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortWaitForTransientLoaders(page);

    const productTiles = page.locator('a[href*="-catalog/"]');
    const tileCount = Math.min(3, await productTiles.count());

    const navigationTimes: number[] = [];

    for (let i = 0; i < tileCount; i++) {
      const startTime = Date.now();
      const tile = productTiles.nth(i);
      await tile.click({ timeout: 10_000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
      await bestEffortWaitForTransientLoaders(page);
      navigationTimes.push(Date.now() - startTime);

      // Go back to PLP
      await page.goBack({ timeout: 30_000 });
      await bestEffortWaitForTransientLoaders(page);
    }

    const avgNavTime = navigationTimes.reduce((a, b) => a + b, 0) / navigationTimes.length;
    console.log(`Repeated Navigation Performance: avg=${avgNavTime.toFixed(0)}ms over ${tileCount} navigations`);

    expect(avgNavTime).toBeLessThan(THRESHOLDS.pdpLoad);
  });

  test('PERF-ATB-15 — Measure CSS rendering performance', async ({ page }) => {
    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'networkidle', timeout: 45_000 });

    const cssMetrics = await page.evaluate(() => {
      const styleSheets = document.styleSheets;
      let ruleCount = 0;

      for (let i = 0; i < styleSheets.length; i++) {
        try {
          const rules = styleSheets[i].cssRules;
          if (rules) {
            ruleCount += rules.length;
          }
        } catch (e) {
          // Cross-origin stylesheets
        }
      }

      return {
        stylesheetCount: styleSheets.length,
        ruleCount,
      };
    });

    console.log(`CSS Metrics: ${cssMetrics.stylesheetCount} stylesheets, ${cssMetrics.ruleCount} CSS rules`);

    expect(cssMetrics.stylesheetCount).toBeGreaterThan(0);
    expect(cssMetrics.ruleCount).toBeGreaterThan(0);
  });
});
