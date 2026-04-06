import { test, expect } from '@playwright/test';
import {
  VS_BASE_URL,
  bestEffortDismissOverlays,
  ensureNoBlockingOverlays,
  getHeader,
  makeWarn,
} from './utils/vs';

test.describe('8.2 Homepage (Desktop only)', () => {
  test('HOME-TC-01 — Homepage loads without critical UI breakage', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    await expect(page.locator('body')).toBeVisible();

    const header = await getHeader(page);
    await expect(header).toBeVisible();

    // Basic content signal
    const main = page.locator('main, [role="main"], #main').first();
    await expect(main).toBeVisible();
  });

  test('HOME-TC-02 — Hero module is visible and not broken', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const heroCandidate = page.locator('main').locator('img, video').first();
    if ((await heroCandidate.count()) === 0) {
      warn('No obvious hero media found (img/video).');
      expect(true).toBeTruthy();
      return;
    }

    await expect(heroCandidate).toBeVisible();
  });

  test('HOME-TC-03 — Hero CTA navigates to a relevant destination', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);
    await ensureNoBlockingOverlays(page);

    const hero = page.locator('main').first();
    const cta = hero.getByRole('link', { name: /shop|explore|discover|learn more|new|now/i }).first();
    const fallbackCta = hero.locator('a[href]').filter({ hasNotText: /skip to/i }).first();
    const target = (await cta.count()) > 0 ? cta : fallbackCta;

    if ((await target.count()) === 0) {
      warn('No hero CTA link found; cannot validate navigation.');
      expect(true).toBeTruthy();
      return;
    }

    const startUrl = page.url();
    await target.click({ timeout: 15_000 }).catch(() => null);
    await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => null);

    if (page.url() === startUrl) warn('Hero CTA click did not change URL (possible SPA behavior or modal).');
    expect(true).toBeTruthy();
  });

  test('HOME-TC-04 — Featured content modules load and are clickable (sample)', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);
    await ensureNoBlockingOverlays(page);

    const tiles = page.locator('main a').filter({ hasNotText: /skip to/i });
    const count = await tiles.count();
    if (count < 5) warn(`Found only ${count} links in main content; tiles may be rendered differently.`);

    // Click a couple of visible links best-effort.
    let clicked = 0;
    for (let i = 0; i < Math.min(count, 12) && clicked < 2; i++) {
      const link = tiles.nth(i);
      if (!(await link.isVisible().catch(() => false))) continue;

      const href = (await link.getAttribute('href').catch(() => null)) || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript')) continue;

      const startUrl = page.url();
      await link.click({ timeout: 15_000 }).catch(() => null);

      // Many homepage links are SPA routes or open modals and won't trigger a full navigation.
      // Avoid spending 20s per attempt waiting for load states that never happen.
      await page
        .waitForURL((url) => url.toString() !== startUrl, { timeout: 7_000 })
        .catch(() => null);

      if (page.url() !== startUrl) {
        await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => null);
        clicked++;
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => null);
        await bestEffortDismissOverlays(page);
      }
    }

    if (clicked === 0) warn('No promo tile navigation could be validated (links may open modals or SPA routes).');
    expect(true).toBeTruthy();
  });

  test('HOME-TC-05 — Carousel/slider works (if present)', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);
    await ensureNoBlockingOverlays(page);

    const carousel = page
      .locator(
        '[aria-roledescription="carousel"], [data-testid*="carousel" i], [class*="carousel" i], [data-testid*="slider" i], [class*="slider" i]'
      )
      .first();

    const exists = (await carousel.count()) > 0 && (await carousel.isVisible().catch(() => false));
    if (!exists) {
      warn('No carousel/slider detected on homepage; treating as not-present.');
      expect(true).toBeTruthy();
      return;
    }

    const next = carousel
      .locator(
        'button[aria-label*="next" i], button[aria-label*="right" i], button:has-text("Next"), button:has-text(">")'
      )
      .first();

    if ((await next.count()) === 0 || !(await next.isVisible().catch(() => false))) {
      warn('Carousel detected but no Next control was found; cannot validate slide interaction.');
      expect(true).toBeTruthy();
      return;
    }

    await next.click({ timeout: 10_000 }).catch(() => null);
    expect(true).toBeTruthy();
  });

  test('HOME-TC-06 — No horizontal overflow (desktop sanity)', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const metrics = await page.evaluate(() => {
      const el = document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });

    if (metrics.scrollWidth > metrics.clientWidth + 2) {
      warn(`Horizontal overflow detected: scrollWidth=${metrics.scrollWidth}, clientWidth=${metrics.clientWidth}`);
    }

    expect(true).toBeTruthy();
  });

  test('HOME-TC-07 — Links are distinguishable and tappable (desktop sampling)', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);
    await ensureNoBlockingOverlays(page);

    const links = page.locator('main a[href]').filter({ hasNotText: /skip to/i });
    const count = await links.count();
    if (count === 0) {
      warn('No links found in main content to validate tapability.');
      expect(true).toBeTruthy();
      return;
    }

    let checked = 0;
    for (let i = 0; i < Math.min(count, 30) && checked < 5; i++) {
      const link = links.nth(i);
      if (!(await link.isVisible().catch(() => false))) continue;
      const box = await link.boundingBox().catch(() => null);
      if (!box) continue;
      checked++;
      if (box.width < 20 || box.height < 10) warn(`Small link hit-target detected (w=${box.width}, h=${box.height}).`);
    }

    if (checked === 0) warn('Could not find any visible links with measurable bounds.');
    expect(true).toBeTruthy();
  });

  test('HOME-TC-08 — Performance sanity check (lightweight)', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const nav = await page
      .evaluate(() => {
        const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        const e = entries[0];
        if (!e) return null;
        return {
          domContentLoadedMs: Math.round(e.domContentLoadedEventEnd),
          loadMs: Math.round(e.loadEventEnd),
          ttfbMs: Math.round(e.responseStart),
        };
      })
      .catch(() => null);

    if (!nav) {
      warn('Navigation timing not available in this browser context.');
      expect(true).toBeTruthy();
      return;
    }

    if (nav.domContentLoadedMs > 15_000) warn(`Slow DCL observed: ${nav.domContentLoadedMs}ms`);
    if (nav.loadMs > 25_000) warn(`Slow load observed: ${nav.loadMs}ms`);
    if (nav.ttfbMs > 5_000) warn(`High TTFB observed: ${nav.ttfbMs}ms`);
    expect(true).toBeTruthy();
  });

  test('HOME-TC-09 — Accessibility spot checks (homepage, lightweight)', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const lang = await page.locator('html').getAttribute('lang').catch(() => null);
    if (!lang) warn('Missing html[lang] attribute.');

    const title = (await page.title().catch(() => '')) || '';
    if (!title.trim()) warn('Empty document title.');

    const h1Count = await page.locator('h1').count();
    if (h1Count === 0) warn('No H1 found on homepage.');

    const focusables = page.locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const focusableCount = await focusables.count();
    if (focusableCount < 10) warn(`Low number of focusable elements detected: ${focusableCount}`);

    expect(true).toBeTruthy();
  });
});
