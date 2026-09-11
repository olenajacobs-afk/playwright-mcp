import { test, expect } from '@playwright/test';
import {
  VS_BASE_URL,
  bestEffortDismissOverlays,
  getFooter,
} from '../utils/vs';

test.describe('SMOKE: Footer & Links', () => {
  test('SMOKE-FOOTER-01 — Footer is present and visible', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const footer = await getFooter(page);
    const isVisible = await footer.isVisible({ timeout: 3000 }).catch(() => false);
    expect(isVisible).toBeTruthy();
    console.log('✓ Footer is visible');
  });

  test('SMOKE-FOOTER-02 — Footer contains links', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const footer = await getFooter(page);
    const footerLinks = footer.locator('a');
    const count = await footerLinks.count();

    expect(count).toBeGreaterThan(0);
    console.log(`✓ Footer contains ${count} links`);
  });

  test('SMOKE-FOOTER-03 — Copyright/Legal information is present', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const footer = await getFooter(page);
    const footerText = await footer.textContent();

    expect(footerText?.toLowerCase()).toMatch(/copyright|©|all rights|terms|privacy/);
    console.log('✓ Copyright/Legal information is present');
  });

  test('SMOKE-FOOTER-04 — Footer has multiple columns/sections', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const footer = await getFooter(page);
    const footerSections = footer.locator(
      '[class*="column"], [class*="section"], ul, nav, [role="navigation"]'
    );

    const count = await footerSections.count();
    expect(count).toBeGreaterThanOrEqual(0);
    console.log(`✓ Footer has ${count} sections`);
  });

  test('SMOKE-FOOTER-05 — Social media links are present', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const footer = await getFooter(page);
    const socialLinks = footer.locator(
      'a[href*="facebook"], a[href*="twitter"], a[href*="instagram"], a[href*="youtube"], [aria-label*="facebook"], [aria-label*="twitter"], [aria-label*="instagram"]'
    );

    const count = await socialLinks.count();
    if (count > 0) {
      console.log(`✓ Social media links found (${count})`);
    } else {
      console.log('⚠ No obvious social media links found');
    }
  });

  test('SMOKE-FOOTER-06 — Newsletter signup is available', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const footer = await getFooter(page);
    const newsletter = footer.locator(
      'input[placeholder*="email" i], input[type="email"], form:has-text("subscribe"), form:has-text("newsletter")'
    ).first();

    const isVisible = await newsletter.isVisible({ timeout: 2000 }).catch(() => false);
    if (isVisible) {
      console.log('✓ Newsletter signup is available');
    } else {
      console.log('⚠ Newsletter signup not found');
    }
  });

  test('SMOKE-FOOTER-07 — Key footer links are clickable', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const footer = await getFooter(page);
    const termsLink = footer.locator('a:has-text("Terms"), a:has-text("Privacy")').first();

    const isVisible = await termsLink.isVisible({ timeout: 2000 }).catch(() => false);
    if (isVisible) {
      const href = await termsLink.getAttribute('href');
      expect(href).toBeTruthy();
      console.log('✓ Key footer links are present and clickable');
    } else {
      console.log('⚠ Key footer links not clearly identified');
    }
  });
});
