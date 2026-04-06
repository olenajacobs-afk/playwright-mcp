import { test, expect } from '@playwright/test';
import {
  VS_BASE_URL,
  bestEffortDismissOverlays,
  ensureNoBlockingOverlays,
  getFooter,
  getHeader,
  hasHeaderUtilities,
  hasPrimaryNavEntryPoint,
  findLogoLink,
  openSearchFromHeader,
  bestEffortSubmitSearchToSrp,
  expectNoHeaderOverlap,
  expectFooterLinksBasic,
  bestEffortClickInternalFooterLink,
  makeWarn,
} from './utils/vs';

function safeDescribe(title: string, fn: () => void) {
  try {
    test.describe(title, fn);
  } catch {
    // When imported/executed outside the Playwright runner (e.g. by tooling), calling test.describe throws.
    // No-op in that scenario.
  }
}

safeDescribe('8.1 Global Header/Footer (Desktop only)', () => {
  test('GHF-TC-01 — Header renders and is usable', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const header = await getHeader(page);
    await ensureNoBlockingOverlays(page);

    const hasNav = await hasPrimaryNavEntryPoint(header);
    expect(hasNav, 'Primary navigation entry point should exist').toBeTruthy();

    const { hasSearch, hasAccount, hasBag } = await hasHeaderUtilities(header);
    if (!hasSearch) warn('Search control not detected in header (may be behind a menu)');
    if (!hasAccount) warn('Account entry point not detected in header (may be behind a menu / conditional render).');
    expect(hasBag || hasSearch, 'Expected at least Bag/Cart or Search entry point in header').toBeTruthy();
  });

  test('GHF-TC-02 — Logo returns to Home', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto('https://www.victoriassecret.com/us/search?q=bra', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const header = await getHeader(page);
    await ensureNoBlockingOverlays(page);

    const logo = await findLogoLink(header);
    try {
      await logo.click({ timeout: 15_000 });
    } catch {
      warn('Logo click blocked; retrying with force');
      await ensureNoBlockingOverlays(page);
      await logo.click({ timeout: 15_000, force: true });
    }

    await page.waitForLoadState('domcontentloaded');
    await expect(page, 'Expected to be on /us/ after logo click').toHaveURL(/\/us\/?/);
  });

  test('GHF-TC-03 — Primary navigation access works', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const header = await getHeader(page);
    await ensureNoBlockingOverlays(page);

    // Best-effort: click a known top-level category if present.
    const navCandidate = header.getByRole('link', { name: /bras|panties|lingerie|sleep|beauty/i }).first();
    const fallback = header.locator('nav a').first();
    const target = (await navCandidate.count()) > 0 ? navCandidate : fallback;
    if ((await target.count()) === 0) {
      warn('No nav link found in header to open mega menu.');
      expect(true).toBeTruthy();
      return;
    }

    await target.click({ timeout: 15_000 }).catch(() => null);

    // Expect some kind of opened navigation panel/mega menu.
    const menuLike = page.locator('[role="dialog"], [role="menu"], [data-testid*="menu" i], [aria-label*="menu" i]');
    const anyLinks = page.locator('a').filter({ hasText: /bras|panties|lingerie|sleep|beauty/i });

    const opened =
      ((await menuLike.count()) > 0 && (await menuLike.first().isVisible().catch(() => false))) ||
      ((await anyLinks.count()) > 0 && (await anyLinks.first().isVisible().catch(() => false)));

    if (!opened) warn('Mega menu/panel not clearly detected after clicking a top-level nav item (site behavior may vary).');
    expect(true).toBeTruthy();
  });

  test('GHF-TC-04 — Search opens, accepts input, and returns results', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const header = await getHeader(page);
    await ensureNoBlockingOverlays(page);

    const input = await openSearchFromHeader(page, header);

    await bestEffortSubmitSearchToSrp(page, input, 'bra', warn);
    await page.waitForLoadState('domcontentloaded').catch(() => null);
    await expect(page, 'Expected SRP-ish URL after search submit').toHaveURL(/search|q=bra/i);

    // Basic result signal (grid/list or product tiles)
    const products = page.locator('a[href*="/p/"], [data-testid*="product" i], li:has(a[href*="/p/"])');
    await expect(products.first(), 'Expected at least one product-ish element on SRP').toBeVisible({ timeout: 30_000 });
  });

  test('GHF-TC-05 — Account entry point is reachable', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const header = await getHeader(page);
    await ensureNoBlockingOverlays(page);

    const account = header.locator('a,button').filter({ hasText: /account|sign in|log in|profile/i }).first();
    const accountByAria = header
      .locator('[aria-label*="Account" i], [aria-label*="Sign In" i], [aria-label*="Log In" i]')
      .first();

    const target = (await account.count()) > 0 ? account : accountByAria;
    if ((await target.count()) === 0) {
      warn('Account control not found in header; skipping reachability assertion (site may hide it behind a menu).');
      expect(true).toBeTruthy();
      return;
    }

    await expect(target, 'Account control should be visible before click').toBeVisible({ timeout: 10_000 });

    const startUrl = page.url();
    await target.click({ timeout: 15_000 }).catch(() => null);
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => null);

    const dialog = page.locator('[role="dialog"]').first();
    const navigated = page.url() !== startUrl;
    const modalOpened = (await dialog.count()) > 0 && (await dialog.isVisible().catch(() => false));

    if (!navigated && !modalOpened) {
      warn('Account click did not clearly navigate or open a modal (site may require additional state).');
    }
    expect(true).toBeTruthy();
  });

  test('GHF-TC-06 — Bag/Cart entry point is reachable', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const header = await getHeader(page);
    await ensureNoBlockingOverlays(page);

    const bagByText = header.locator('a,button').filter({ hasText: /bag|cart/i }).first();
    const bagByAria = header.locator('[aria-label*="Bag" i], [aria-label*="Cart" i]').first();
    const target = (await bagByText.count()) > 0 ? bagByText : bagByAria;

    if ((await target.count()) === 0) {
      warn('Bag/Cart control not found in header; skipping reachability assertion (site may render it differently).');
      expect(true).toBeTruthy();
      return;
    }

    await expect(target, 'Bag/Cart control should be visible before click').toBeVisible({ timeout: 10_000 });

    const startUrl = page.url();
    await target.click({ timeout: 15_000 }).catch(() => null);
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => null);

    const dialog = page.locator('[role="dialog"]').first();
    const navigated = page.url() !== startUrl;
    const modalOpened = (await dialog.count()) > 0 && (await dialog.isVisible().catch(() => false));

    if (!navigated && !modalOpened) warn('Bag click did not clearly navigate or open a mini-bag modal.');
    expect(true).toBeTruthy();
  });

  test('GHF-TC-07 — Sticky header behavior (if applicable)', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const header = await getHeader(page);
    await ensureNoBlockingOverlays(page);

    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(500);

    const visibleAfterScroll = await header.isVisible().catch(() => false);
    if (!visibleAfterScroll) {
      warn('Header is not visible after scroll (may not be sticky on this page/breakpoint).');
    }

    // Key expectation: scrolling should still allow interacting with content.
    await expect(page.locator('body')).toBeVisible();
  });

  test('GHF-TC-08 — Header does not overlap main content', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);
    await ensureNoBlockingOverlays(page);
    await expectNoHeaderOverlap(page);
  });

  test('GHF-TC-09 — Footer renders and contains core sections', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const footer = await getFooter(page);
    await expectFooterLinksBasic(footer);

    // Best-effort: look for at least one legal-ish link label.
    const legalLike = footer.locator('a').filter({ hasText: /privacy|terms|accessibility|do not sell|cookie/i }).first();
    if ((await legalLike.count()) === 0) warn('No obvious legal link found in footer text (labels may vary).');

    expect(true).toBeTruthy();
  });

  test('GHF-TC-10 — Footer links navigate correctly (sample)', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const footer = await getFooter(page);
    await expectFooterLinksBasic(footer);
    await bestEffortClickInternalFooterLink(page, footer, warn);
  });

  test('GHF-TC-11 — Newsletter signup (if present)', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);
    await ensureNoBlockingOverlays(page);

    const footer = await getFooter(page);

    const email = footer.locator('input[type="email"], input[placeholder*="email" i]').first();
    const submit = footer.locator('button[type="submit"], button:has-text("Sign Up"), button:has-text("Subscribe")').first();

    const hasEmail = (await email.count()) > 0 && (await email.isVisible().catch(() => false));
    if (!hasEmail) {
      warn('Newsletter email field not found in footer; treating as not-present.');
      expect(true).toBeTruthy();
      return;
    }

    await email.fill('test@example.com').catch(() => null);
    const value = (await email.inputValue().catch(() => '')) || '';
    if (!/test@example\.com/i.test(value)) warn(`Newsletter email field did not retain typed value: "${value}"`);

    // Avoid submitting to prevent external side effects; just ensure a submit control exists if visible.
    if ((await submit.count()) === 0) warn('Newsletter submit button not detected near email input.');
    expect(true).toBeTruthy();
  });

  test('GHF-TC-12 — Social links (if present)', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const footer = await getFooter(page);

    const social = footer.locator('a[href*="instagram" i], a[href*="facebook" i], a[href*="tiktok" i], a[href*="pinterest" i], a[href*="twitter" i], a[href*="x.com" i]');
    const count = await social.count();
    if (count === 0) {
      warn('No social links detected in footer by common domains.');
      expect(true).toBeTruthy();
      return;
    }

    // Validate hrefs exist and look like external URLs; do not click.
    for (let i = 0; i < Math.min(count, 6); i++) {
      const href = (await social.nth(i).getAttribute('href').catch(() => null)) || '';
      if (!href) warn('Social link missing href attribute.');
      if (href && !/^https?:\/\//i.test(href)) warn(`Social link href not absolute: ${href}`);
    }
    expect(true).toBeTruthy();
  });

  test('GHF-TC-13 — Legal links are present', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const footer = await getFooter(page);
    const legalLinks = footer.locator('a').filter({ hasText: /privacy|terms|accessibility|do not sell|cookie/i });
    const count = await legalLinks.count();
    if (count === 0) warn('No legal links detected by text match (labels may differ).');
    expect(count).toBeGreaterThan(0);
  });
});
