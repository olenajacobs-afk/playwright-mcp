import { test, expect } from '@playwright/test';
import {
  VS_BASE_URL,
  bestEffortDismissOverlays,
  ensureNoBlockingOverlays,
  getHeader,
} from '../utils/vs';

test.describe('SMOKE: Header & Navigation', () => {
  test('SMOKE-HEADER-01 — Header renders with navigation', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const header = await getHeader(page);
    const navLinks = header.locator('nav a, [role="navigation"] a');

    await expect(navLinks.first()).toBeVisible();
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
    console.log(`✓ Header navigation rendered with ${count} links`);
  });

  test('SMOKE-HEADER-02 — Search icon/button is visible', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const header = await getHeader(page);
    const searchControl = header.locator(
      'input[type="search"], button[aria-label*="search" i], a[aria-label*="search" i], [class*="search"]'
    ).first();

    await expect(searchControl).toBeVisible();
    console.log('✓ Search control is visible');
  });

  test('SMOKE-HEADER-03 — Account/Login link is visible', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const header = await getHeader(page);
    const accountLink = header.locator(
      'a[href*="signin"], a[href*="account"], button[aria-label*="account" i], [class*="account"]'
    ).first();

    await expect(accountLink).toBeVisible();
    console.log('✓ Account link is visible');
  });

  test('SMOKE-HEADER-04 — Shopping bag icon is visible', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const header = await getHeader(page);
    const bagIcon = header.locator(
      'a[href*="bag"], button[aria-label*="bag" i], [class*="bag"], [aria-label*="cart"]'
    ).first();

    await expect(bagIcon).toBeVisible();
    console.log('✓ Shopping bag icon is visible');
  });

  test('SMOKE-HEADER-05 — Logo/Home link is clickable', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const header = await getHeader(page);
    const logo = header.locator('a[href="/"], [class*="logo"], img[alt*="victoria" i]').first();

    await expect(logo).toBeVisible();
    await expect(logo).toHaveCount(1);
    console.log('✓ Logo/home link is visible');
  });
});
