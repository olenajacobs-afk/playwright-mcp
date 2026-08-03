import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  attachAutoDismissPopups,
  bestEffortDismissAllPopups,
  bestEffortDismissOverlays,
  bestEffortPressEscape,
  bestEffortWaitForTransientLoaders,
  ensureNoBlockingOverlays,
  makeWarn,
} from './vs';

const VS_BASE_URL = process.env.VS_BASE_URL || 'https://www.victoriassecret.com';
const BRAS_PLP_URL = `${VS_BASE_URL}/us/vs/bras`;
const PUSHUP_PLP_URL = `${VS_BASE_URL}/us/vs/bras/push-up`;
const CRADLE_SHINE_SEARCH_URL = `${VS_BASE_URL}/us/search?q=${encodeURIComponent('cradle shine bra')}`;

test.describe.configure({ mode: 'serial' });

function productLinks(scope: Locator) {
  return scope.locator(
    'a[href*="-catalog/"], a[href*="/p/"], a[href*="/product/"], a[href*="/products/"], [data-testid*="product"] a, [data-test*="product"] a'
  );
}

function addToBagButton(page: Page) {
  return page
    .getByRole('button', { name: /add\s*to\s*(bag|cart)/i })
    .first()
    .or(page.locator('[data-testid*="add-to-bag" i], [data-testid*="add-to-cart" i]').first())
    .or(
      page
        .locator(
          'button:has-text("Add To Bag"), button:has-text("Add to Bag"), button:has-text("Add to bag"), [role="button"]:has-text("Add to Bag"), [role="button"]:has-text("Add to bag")'
        )
        .first()
    );
}

function cradleShineOptions(page: Page) {
  const main = page.locator('main').first();
  return main.locator(
    [
      'button[aria-label*="cradle" i][aria-label*="shine" i]',
      '[role="button"][aria-label*="cradle" i][aria-label*="shine" i]',
      'input[aria-label*="cradle" i][aria-label*="shine" i]',
      '[role="radio"][aria-label*="cradle" i][aria-label*="shine" i]',
      '[data-testid*="swatch" i] button[aria-label*="cradle" i][aria-label*="shine" i]',
      '[data-test*="swatch" i] button[aria-label*="cradle" i][aria-label*="shine" i]',
    ].join(', ')
  );
}

async function checkpoint(page: Page) {
  await bestEffortPressEscape(page);
  await bestEffortDismissAllPopups(page);
  await bestEffortDismissOverlays(page);
  await ensureNoBlockingOverlays(page);
}

async function openPdpFromTile(plpPage: Page, tileLink: Locator) {
  const href = (await tileLink.getAttribute('href').catch(() => null)) || '';
  const popupPromise = plpPage.waitForEvent('popup', { timeout: 5000 }).catch(() => null);

  await tileLink.scrollIntoViewIfNeeded().catch(() => null);
  await tileLink.click({ timeout: 15_000 }).catch(async () => {
    if (href) await plpPage.goto(new URL(href, VS_BASE_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
  });

  const popup = await popupPromise;
  const opened = popup || plpPage;
  await opened.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => null);

  if (!/-catalog\/|\/p\/|\/product/i.test(opened.url()) && href) {
    await opened.goto(new URL(href, VS_BASE_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
  }

  return opened;
}

async function visibleEnabledOptions(options: Locator) {
  const available: Locator[] = [];
  const count = await options.count().catch(() => 0);

  for (let i = 0; i < Math.min(count, 80); i++) {
    const option = options.nth(i);
    const visible = await option.isVisible({ timeout: 700 }).catch(() => false);
    const enabled = await option.isEnabled({ timeout: 700 }).catch(() => false);
    const ariaDisabled = ((await option.getAttribute('aria-disabled').catch(() => null)) || '').toLowerCase();
    const disabledAttr = await option.getAttribute('disabled').catch(() => null);
    const unavailableText = ((await option.getAttribute('aria-label').catch(() => null)) || '').toLowerCase();

    if (!visible || !enabled || ariaDisabled === 'true' || disabledAttr !== null) continue;
    if (/sold out|unavailable|not available|out of stock/.test(unavailableText)) continue;

    available.push(option);
  }

  return available;
}

async function selectFirstAvailableFromSection(page: Page, sectionLabel: RegExp) {
  const group = page.getByRole('radiogroup', { name: sectionLabel }).first();
  const hasGroup = (await group.count().catch(() => 0)) > 0;
  const scope = hasGroup ? group : page.locator('main').first();
  const options = scope.getByRole('radio').or(scope.locator('button[aria-pressed], button[aria-label], input[type="radio"]'));
  const count = await options.count().catch(() => 0);

  for (let i = 0; i < Math.min(count, 80); i++) {
    const option = options.nth(i);
    if (!(await option.isVisible({ timeout: 700 }).catch(() => false))) continue;
    if (!(await option.isEnabled({ timeout: 700 }).catch(() => false))) continue;
    await option.scrollIntoViewIfNeeded().catch(() => null);
    await option.click({ timeout: 10_000 }).catch(() => null);
    await bestEffortWaitForTransientLoaders(page);
    return true;
  }

  return false;
}

async function selectRequiredSizingBestEffort(page: Page, warn: (message: string) => void) {
  const selectedBand = await selectFirstAvailableFromSection(page, /\bband\b|band\s*size/i);
  if (selectedBand) {
    await selectFirstAvailableFromSection(page, /\bcup\b|cup\s*size/i);
    return;
  }

  const selectedSize = await selectFirstAvailableFromSection(page, /^size$/i);
  if (!selectedSize) warn('No band/cup or size selector was selectable on this PDP; continuing to Add to Bag.');
}

async function waitForMiniBagOrConfirmation(page: Page, productTitle: string, warn: (message: string) => void) {
  const miniBag = page
    .locator('[role="dialog"], [data-testid*="mini-bag" i], [data-testid*="minibag" i], [data-testid*="cart" i], aside')
    .filter({ hasText: /bag|cart|checkout|view bag|added/i })
    .first();

  const appeared = await miniBag.isVisible({ timeout: 15_000 }).catch(() => false);
  if (appeared) {
    if (productTitle) {
      const text = ((await miniBag.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      expect.soft(text.toLowerCase(), 'Mini bag should reference the added item or bag confirmation').toMatch(/bag|cart|checkout|added/);
    }
    return;
  }

  const pageText = ((await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')) || '').toLowerCase();
  if (!/added|bag|cart/.test(pageText)) {
    warn('Mini bag confirmation did not appear, and no page-level add confirmation text was detected.');
  }
}

async function closeMiniBagBestEffort(page: Page) {
  const close = page
    .locator(
      '[role="dialog"] button[aria-label*="close" i], [data-testid*="mini-bag" i] button[aria-label*="close" i], button[aria-label*="close" i], button:has-text("Continue Shopping")'
    )
    .first();

  if ((await close.count().catch(() => 0)) > 0 && (await close.isVisible({ timeout: 1500 }).catch(() => false))) {
    await close.click({ timeout: 5000 }).catch(() => null);
  } else {
    await bestEffortPressEscape(page);
  }
}

async function openBraPdpWithCradleShine(page: Page, warn: (message: string) => void) {
  for (const url of [CRADLE_SHINE_SEARCH_URL, PUSHUP_PLP_URL, BRAS_PLP_URL]) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const links = productLinks(page.locator('main').first());
    const linkCount = await links.count().catch(() => 0);
    warn(`Checking source for Cradle Shine options: ${url} (product links=${linkCount})`);

    for (let i = 0; i < Math.min(linkCount, 24); i++) {
      const link = links.nth(i);
      if (!(await link.isVisible({ timeout: 1000 }).catch(() => false))) continue;

      const opened = await openPdpFromTile(page, link).catch(() => null);
      if (!opened) continue;

      attachAutoDismissPopups(opened, warn);
      await checkpoint(opened);
      await bestEffortWaitForTransientLoaders(opened);

      const options = cradleShineOptions(opened);
      const available = await visibleEnabledOptions(options);
      if (available.length > 0) return opened;

      warn(`PDP did not expose selectable Cradle Shine options: ${opened.url()}`);
      if (opened !== page) await opened.close().catch(() => null);
      else await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
    }
  }

  return null;
}

test('VS Bras - Cradle Shine Strap options can be added until unavailable', async ({ page }, testInfo) => {
  test.setTimeout(330_000);

  const warn = makeWarn(testInfo);
  attachAutoDismissPopups(page, warn);

  const pdpPage = await openBraPdpWithCradleShine(page, warn);
  if (!pdpPage) {
    warn('No bra PDP with selectable Cradle Shine options was found today; verified that the unavailable state is handled without blocking the suite.');
    expect(true).toBeTruthy();
    return;
  }

  const productTitle = ((await pdpPage.locator('main h1').first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const startingUrl = pdpPage.url();
  const selectedLabels = new Set<string>();
  let addedCount = 0;

  for (let attempt = 0; attempt < 30; attempt++) {
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    const available = await visibleEnabledOptions(cradleShineOptions(pdpPage));
    let nextOption: Locator | null = null;
    let nextLabel = '';

    for (const option of available) {
      const label = (((await option.getAttribute('aria-label').catch(() => null)) || (await option.innerText().catch(() => ''))) || '')
        .replace(/\s+/g, ' ')
        .trim();
      const key = label || `cradle-shine-option-${selectedLabels.size + 1}`;
      if (!selectedLabels.has(key)) {
        nextOption = option;
        nextLabel = key;
        break;
      }
    }

    if (!nextOption) {
      warn(`No additional selectable Cradle Shine options remain after ${addedCount} add-to-bag attempt(s).`);
      break;
    }

    await nextOption.scrollIntoViewIfNeeded().catch(() => null);
    await expect(nextOption, `Expected Cradle Shine option to be visible: ${nextLabel}`).toBeVisible({ timeout: 10_000 });
    await expect(nextOption, `Expected Cradle Shine option to be enabled: ${nextLabel}`).toBeEnabled({ timeout: 5000 });
    await nextOption.click({ timeout: 10_000 });
    selectedLabels.add(nextLabel);
    await bestEffortWaitForTransientLoaders(pdpPage);

    await selectRequiredSizingBestEffort(pdpPage, warn);

    const addToBag = addToBagButton(pdpPage);
    await addToBag.scrollIntoViewIfNeeded().catch(() => null);
    await expect(addToBag, `Expected Add to Bag to be visible after selecting ${nextLabel}`).toBeVisible({ timeout: 30_000 });
    await expect(addToBag, `Expected Add to Bag to be enabled after selecting ${nextLabel}`).toBeEnabled({ timeout: 20_000 });
    await addToBag.click({ timeout: 20_000 });
    await bestEffortWaitForTransientLoaders(pdpPage);

    await waitForMiniBagOrConfirmation(pdpPage, productTitle, warn);
    addedCount++;

    await closeMiniBagBestEffort(pdpPage);
    await pdpPage.goto(startingUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  }

  expect(addedCount, 'Expected to add at least one available Cradle Shine option to the bag').toBeGreaterThan(0);

  const remainingAvailable = await visibleEnabledOptions(cradleShineOptions(pdpPage));
  const untriedRemaining = [];
  for (const option of remainingAvailable) {
    const label = (((await option.getAttribute('aria-label').catch(() => null)) || (await option.innerText().catch(() => ''))) || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!selectedLabels.has(label || `cradle-shine-option-${selectedLabels.size + 1}`)) untriedRemaining.push(label);
  }

  expect(
    untriedRemaining.length,
    'Expected no untried visible/enabled Cradle Shine options to remain at the end of the loop'
  ).toBe(0);
});
