import { test, expect } from '@playwright/test';
import {
  VS_BASE_URL,
  bestEffortDismissOverlays,
  ensureNoBlockingOverlays,
} from '../utils/vs';

test.describe('SMOKE: Search Functionality', () => {
  const SEARCH_TERM = 'bra';

  test('SMOKE-SEARCH-01 — Search input is accessible', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i]'
    ).first();

    await expect(searchInput).toBeVisible();
    console.log('✓ Search input is visible');
  });

  test('SMOKE-SEARCH-02 — Can type in search field', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i]'
    ).first();

    await searchInput.click();
    await searchInput.type(SEARCH_TERM);

    const value = await searchInput.inputValue();
    expect(value).toContain(SEARCH_TERM);
    console.log(`✓ Can type "${SEARCH_TERM}" in search field`);
  });

  test('SMOKE-SEARCH-03 — Search suggestions appear', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i]'
    ).first();

    await searchInput.click();
    await searchInput.type(SEARCH_TERM);
    await page.waitForTimeout(500);

    // Look for dropdown or suggestions
    const suggestions = page.locator(
      '[role="listbox"], [role="menu"], [class*="dropdown"], [class*="suggest"]'
    ).first();

    const isSuggestionVisible = await suggestions.isVisible({ timeout: 3000 }).catch(() => false);
    expect(isSuggestionVisible).toBeTruthy();
    console.log('✓ Search suggestions appear');
  });

  test('SMOKE-SEARCH-04 — Can submit search', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i]'
    ).first();

    await searchInput.click();
    await searchInput.type(SEARCH_TERM);

    // Either press Enter or click search button
    const searchButton = page.locator('button[type="submit"], button[aria-label*="search"]').first();
    const hasButton = await searchButton.count();

    if (hasButton > 0) {
      await searchButton.click();
    } else {
      await page.keyboard.press('Enter');
    }

    // Wait for navigation
    await page.waitForLoadState('domcontentloaded');
    const currentUrl = page.url();
    expect(currentUrl).not.toBe(VS_BASE_URL);
    console.log('✓ Search submission successful');
  });

  test('SMOKE-SEARCH-05 — Search results page loads', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i]'
    ).first();

    await searchInput.click();
    await searchInput.type(SEARCH_TERM);
    await searchInput.press('Enter');

    await page.waitForLoadState('domcontentloaded');

    // Look for search results
    const results = page.locator(
      '[class*="product"], [class*="result"], a[href*="catalog"], a[href*="/p/"]'
    ).first();

    const resultsVisible = await results.isVisible({ timeout: 5000 }).catch(() => false);
    expect(resultsVisible).toBeTruthy();
    console.log('✓ Search results page loaded');
  });
});
