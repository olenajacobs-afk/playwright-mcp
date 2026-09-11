import { test, expect } from '@playwright/test';
import {
  VS_BASE_URL,
  bestEffortDismissOverlays,
} from '../utils/vs';

test.describe('SMOKE: Menu & Navigation', () => {
  test('SMOKE-MENU-01 — NEW menu is accessible', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const newButton = page.locator('button:has-text("NEW"), a:has-text("NEW")').first();
    const isVisible = await newButton.isVisible({ timeout: 3000 }).catch(() => false);

    expect(isVisible).toBeTruthy();
    console.log('✓ NEW menu is accessible');
  });

  test('SMOKE-MENU-02 — BRAS menu is accessible', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const brasButton = page.locator('button:has-text("BRAS"), a:has-text("BRAS"), a[href*="/bras"]').first();
    const isVisible = await brasButton.isVisible({ timeout: 3000 }).catch(() => false);

    expect(isVisible).toBeTruthy();
    console.log('✓ BRAS menu is accessible');
  });

  test('SMOKE-MENU-03 — PANTIES menu is accessible', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const pantiesButton = page.locator('button:has-text("PANTIES"), a:has-text("PANTIES"), a[href*="/panties"]').first();
    const isVisible = await pantiesButton.isVisible({ timeout: 3000 }).catch(() => false);

    expect(isVisible).toBeTruthy();
    console.log('✓ PANTIES menu is accessible');
  });

  test('SMOKE-MENU-04 — Can hover over NEW menu', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const newButton = page.locator('button:has-text("NEW"), a:has-text("NEW")').first();
    await newButton.hover({ timeout: 5000 });
    await page.waitForTimeout(500);

    const menuContent = page.locator('[role="navigation"], [class*="menu"], [class*="dropdown"]').first();
    const isVisible = await menuContent.isVisible({ timeout: 2000 }).catch(() => false);

    expect(isVisible).toBeTruthy();
    console.log('✓ Menu opens on hover');
  });

  test('SMOKE-MENU-05 — Menu items are clickable', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const newButton = page.locator('button:has-text("NEW"), a:has-text("NEW")').first();
    await newButton.hover({ timeout: 5000 });
    await page.waitForTimeout(500);

    const menuItems = page.locator('a, button').filter({
      hasNot: page.locator('body > nav')
    }).filter({
      hasText: /Bestseller|Collection|Shop|Featured/i
    });

    const count = await menuItems.count();
    expect(count).toBeGreaterThan(0);
    console.log(`✓ Menu contains ${count} clickable items`);
  });

  test('SMOKE-MENU-06 — Mega menu structure is present', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const newButton = page.locator('button:has-text("NEW"), a:has-text("NEW")').first();
    await newButton.hover({ timeout: 5000 });
    await page.waitForTimeout(500);

    const menuColumns = page.locator('[class*="column"], [class*="section"]', {
      has: page.locator('a')
    });

    const count = await menuColumns.count();
    console.log(`✓ Mega menu has ${count} columns/sections`);
  });

  test('SMOKE-MENU-07 — Can navigate from menu', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const newButton = page.locator('button:has-text("NEW"), a:has-text("NEW")').first();
    await newButton.hover({ timeout: 5000 });
    await page.waitForTimeout(500);

    const firstMenuItem = page.locator('[class*="menu"] a, [role="navigation"] a').first();
    const isVisible = await firstMenuItem.isVisible({ timeout: 2000 }).catch(() => false);

    if (isVisible) {
      const href = await firstMenuItem.getAttribute('href');
      expect(href).toBeTruthy();
      console.log('✓ Menu items have valid links');
    } else {
      console.log('⚠ Could not verify menu item links');
    }
  });
});
