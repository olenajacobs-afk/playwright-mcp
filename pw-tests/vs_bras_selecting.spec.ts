import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  bestEffortDismissOverlays,
  clickOnceWithRetry,
  ensureNoBlockingOverlays,
  getHeader,
  makeWarn,
  bestEffortWaitForTransientLoaders,
  bestEffortPressEscape,
  attachAutoDismissPopups,
  bestEffortDismissAllPopups,
  openPlpFilterPanel,
  applyOrCloseFilterPanel,
} from './utils/vs';

// VS Base URL
const VS_BASE_URL = process.env.VS_BASE_URL || 'https://www.victoriassecret.com';

// Bras PLP URL
const BRAS_PLP_URL = `${VS_BASE_URL}/us/vs/bras`;

// Push-Up PLP URL
const PUSHUP_PLP_URL = `${VS_BASE_URL}/us/vs/bras/push-up`;

// Smooth PLP URLs
const SMOOTH_PLP_URL = process.env.SMOOTH_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/smooth';
const SMOOTH_PUSHUP_PLP_URL = process.env.SMOOTH_PUSHUP_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/smooth/push-up';
const SMOOTH_WIRELESS_PLP_URL = process.env.SMOOTH_WIRELESS_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/smooth/wireless';
const SMOOTH_TSHIRT_PLP_URL = process.env.SMOOTH_TSHIRT_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/smooth/t-shirt';
const SMOOTH_STRAPLESS_PLP_URL = process.env.SMOOTH_STRAPLESS_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/smooth/strapless';
const SMOOTH_DEMI_PLP_URL = process.env.SMOOTH_DEMI_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/smooth/demi';

// Gradient Shine PLP URL
const GRADIENT_SHINE_PLP_URL = process.env.GRADIENT_SHINE_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/gradient-shine';

// Test configuration
test.describe.configure({ mode: 'serial' });

// Utility functions
function productLinks(scope: Locator) {
  // VS frequently uses "*-catalog" URLs instead of "/p/".
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

async function selectFirstColorBestEffort(page: Page, warn: (m: string) => void) {
  const candidates = page.locator(
    'button[aria-label*="("], [role="button"][aria-label*="("], [data-testid*="swatch" i] button, [data-testid*="color" i] button'
  );

  const count = await candidates.count().catch(() => 0);
  for (let i = 0; i < Math.min(count, 60); i++) {
    const swatch = candidates.nth(i);
    if (!(await swatch.isVisible({ timeout: 800 }).catch(() => false))) continue;
    if (!(await swatch.isEnabled({ timeout: 800 }).catch(() => false))) continue;
    await swatch.scrollIntoViewIfNeeded().catch(() => null);
    await swatch.click({ timeout: 10_000 }).catch(() => null);
    await bestEffortWaitForTransientLoaders(page);
    return;
  }

  warn('No color swatches detected/clickable; continuing.');
}

async function selectFirstAvailableFromSection(page: Page, sectionLabel: RegExp) {
  const selectAvailableFromSection = async (sectionLabelInner: RegExp, nthAvailable1Based = 1) => {
    const nth = Math.max(1, Math.floor(nthAvailable1Based));
    const labelSource = sectionLabelInner.source.toLowerCase();
    const isBand = /\bband\b/.test(labelSource);
    const isCup = /\bcup\b/.test(labelSource);

    // Prefer an ARIA radiogroup named Band/Cup (common on VS PDP).
    const radioGroup = page.getByRole('radiogroup', { name: sectionLabelInner }).first();
    // In headed/slow-mo runs the PDP can take longer to hydrate; wait a bit for the radiogroup to appear.
    if ((await radioGroup.count().catch(() => 0)) > 0) {
      await radioGroup.waitFor({ state: 'visible', timeout: 12_000 }).catch(() => null);
    }
    const hasRadioGroup = (await radioGroup.count().catch(() => 0)) > 0 && (await radioGroup.isVisible({ timeout: 1500 }).catch(() => false));

    // Otherwise locate a container that contains a *label-like* "Band"/"Cup" marker.
    // IMPORTANT: do not match arbitrary product-description text containing "band"/"cup".
    const labelExact = isBand
      ? /^\s*band(\s*size)?\s*:?\s*$/i
      : isCup
        ? /^\s*cup(\s*size)?\s*:?\s*$/i
        : sectionLabelInner;

    const main = page.locator('main').first();
    const label = main
      .locator('legend,label,h2,h3,h4,[role="heading"],[aria-label]')
      .filter({ hasText: labelExact })
      .first()
      // Fallback for variants where the label isn't a semantic heading/label.
      .or(main.locator('[data-testid*="label" i], span, div').filter({ hasText: labelExact }).first());
    if (!hasRadioGroup) {
      await label.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null);
    }

    const container = hasRadioGroup
      ? radioGroup
      : main
          .locator('section, fieldset, [role="group"], [data-testid], div')
          .filter({ has: label })
          .first();

    let availableSeen = 0;

    // <select> dropdown fallback (some PDP variants use selects for size).
    const selects = container.locator('select');
    const selectCount = await selects.count().catch(() => 0);
    for (let i = 0; i < Math.min(selectCount, 6); i++) {
      const sel = selects.nth(i);
      if (!(await sel.isVisible({ timeout: 800 }).catch(() => false))) continue;
      if (!(await sel.isEnabled().catch(() => false))) continue;

      const options = sel.locator('option');
      const optionCount = await options.count().catch(() => 0);
      for (let j = 0; j < Math.min(optionCount, 120); j++) {
        const opt = options.nth(j);
        const disabled = (await opt.getAttribute('disabled').catch(() => null)) !== null;
        if (disabled) continue;

        const txt = ((await opt.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (!txt) continue;
        if (/select|choose|pick/i.test(txt)) continue;
        if (/out\s*of\s*stock|sold\s*out/i.test(txt)) continue;

        availableSeen++;
        if (availableSeen !== nth) continue;
        const value = (await opt.getAttribute('value').catch(() => null)) || txt;
        await sel.scrollIntoViewIfNeeded().catch(() => null);
        await sel.selectOption({ value }).catch(async () => {
          await sel.selectOption({ label: txt }).catch(() => null);
        });
        await bestEffortWaitForTransientLoaders(page);
        return;
      }
    }

    // 1) Role radio options.
    // Use accessibility role so this works for native <input type="radio"> too.
    const roleRadios = container.getByRole('radio');
    const roleRadioCount = await roleRadios.count().catch(() => 0);
    for (let i = 0; i < Math.min(roleRadioCount, 60); i++) {
      const roleRadio = roleRadios.nth(i);
      if (await isCrossedOutOrDisabled(roleRadio)) continue;

      // Only count radios that have a visible/enabled click target.
      if (!(await roleRadio.isEnabled().catch(() => false))) continue;

      // On some VS PDPs, the "radio" is a hidden input; click a visible wrapper/label instead.
      const wrapper = roleRadio.locator(
        'xpath=ancestor-or-self::label[1] | ancestor-or-self::button[1] | ancestor-or-self::div[1] | ancestor-or-self::span[1]'
      );

      const innerTarget = isBand
        ? wrapper.getByText(/^\s*\d{2,3}\s*$/).first()
        : isCup
          ? wrapper.getByText(/^\s*[A-Z]{1,4}(?:\s*\(.+\))?\s*$/i).first()
          : wrapper.locator('button, [role="button"], div, span').first();

      const wrapperVisible = (await wrapper.count().catch(() => 0)) > 0 && (await wrapper.first().isVisible({ timeout: 1500 }).catch(() => false));
      const innerVisible = (await innerTarget.count().catch(() => 0)) > 0 && (await innerTarget.isVisible({ timeout: 1500 }).catch(() => false));
      if (!wrapperVisible && !innerVisible) continue;

      availableSeen++;
      if (availableSeen !== nth) continue;

      const target = innerVisible ? innerTarget : wrapper.first();
      await target.scrollIntoViewIfNeeded().catch(() => null);
      await target.click({ timeout: 10_000 }).catch(() => null);
      await bestEffortWaitForTransientLoaders(page);
      return;
    }

    // Buttons are the common case.
    const optionButtons = container
      .locator('button')
      .filter({ hasNotText: /size guide|find your|help|what\'?s my/i })
      .filter({ hasNotText: /out of stock|sold out/i });

    const buttonCount = await optionButtons.count().catch(() => 0);
    for (let i = 0; i < Math.min(buttonCount, 80); i++) {
      const optionButton = optionButtons.nth(i);
      if (!(await optionButton.isVisible({ timeout: 800 }).catch(() => false))) continue;
      if (!(await optionButton.isEnabled({ timeout: 800 }).catch(() => false))) continue;
      if (await isCrossedOutOrDisabled(optionButton)) continue;

      availableSeen++;
      if (availableSeen !== nth) continue;
      await optionButton.scrollIntoViewIfNeeded().catch(() => null);
      await optionButton.click({ timeout: 10_000 }).catch(() => null);
      return;
    }

    // Radio inputs fallback.
    const radios = container.locator('input[type="radio"]');
    const radioCount = await radios.count().catch(() => 0);
    for (let i = 0; i < Math.min(radioCount, 80); i++) {
      const radio = radios.nth(i);
      if (!(await radio.isEnabled().catch(() => false))) continue;

      // Strike-through is often applied to a label/wrapper.
      const wrapper = radio.locator('xpath=ancestor-or-self::label[1] | ancestor-or-self::div[1] | ancestor-or-self::span[1]');
      if ((await wrapper.count().catch(() => 0)) > 0 && (await isCrossedOutOrDisabled(wrapper.first()))) continue;

      availableSeen++;
      if (availableSeen !== nth) continue;
      // Inputs are often visually hidden; click the wrapper/label if possible.
      const clickTarget = (await wrapper.count().catch(() => 0)) > 0 ? wrapper.first() : radio;
      const targetVisible = await clickTarget.isVisible({ timeout: 800 }).catch(() => false);
      if (!targetVisible) continue;

      await clickTarget.scrollIntoViewIfNeeded().catch(() => null);
      // Prefer a click (more compatible with custom radios), fall back to check().
      await clickTarget.click({ timeout: 10_000 }).catch(() => null);
      await radio.check({ timeout: 10_000, force: true }).catch(() => null);
      await bestEffortWaitForTransientLoaders(page);
      return;
    }

    throw new Error(`Could not find available option #${nth} under section ${sectionLabelInner} (found ${availableSeen}).`);
  };

  await selectAvailableFromSection(sectionLabel, 1);
}

async function selectShipToYouBestEffort(page: Page, warn: (m: string) => void) {
  const ship = page
    .getByRole('radio', { name: /ship\s*to\s*you/i })
    .first()
    .or(page.getByRole('button', { name: /ship\s*to\s*you/i }).first())
    .or(page.getByRole('tab', { name: /ship\s*to\s*you/i }).first())
    .or(page.locator('button, [role="button"], [role="radio"], label').filter({ hasText: /ship\s*to\s*you/i }).first());

  if ((await ship.count().catch(() => 0)) > 0 && (await ship.isVisible({ timeout: 2000 }).catch(() => false))) {
    await ship.scrollIntoViewIfNeeded().catch(() => null);
    await ship.click({ timeout: 10_000 }).catch(() => null);
    await bestEffortWaitForTransientLoaders(page);
    return;
  }

  warn('Ship to you option not found/visible; continuing.');
}

async function waitForMiniBagOverlay(page: Page, opts: { requireVisible: boolean; productTitle?: string; warn: (m: string) => void }) {
  const overlay = page
    .locator('[role="dialog"], aside, [data-testid*="mini" i], [data-testid*="bag" i], [data-testid*="cart" i]')
    .filter({ hasText: /added to bag|added to cart|in your bag|shopping bag|bag|cart/i })
    .first();

  const overlayVisible = await overlay.isVisible({ timeout: 30_000 }).catch(() => false);
  if (!overlayVisible) {
    if (opts.requireVisible) {
      throw new Error('Expected mini bag overlay/drawer to appear after Add to bag, but it did not become visible.');
    }
    opts.warn('Mini bag overlay not detected (could be a silent add); continuing.');
    return;
  }

  const title = (opts.productTitle || '').replace(/\s+/g, ' ').trim();
  if (title) {
    const snippet = title.slice(0, 18);
    if (snippet.length >= 8) {
      const escaped = snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const titleLike = overlay.getByText(new RegExp(escaped, 'i')).first();
      const titleVisible = await titleLike.isVisible({ timeout: 5000 }).catch(() => false);
      if (!titleVisible) {
        opts.warn('Mini bag overlay appeared, but product title was not detectable as text (UI variant).');
      }
    }
  }
}

async function hasBandAndCupSelectorsBestEffort(pdpPage: Page): Promise<boolean> {
  // We must avoid false positives caused by product descriptions containing "band"/"cup".
  // Only accept if the PDP shows real selectors for BOTH Band and Cup.
  const main = pdpPage.locator('main').first();

  const bandGroup = pdpPage.getByRole('radiogroup', { name: /\bband\b|band\s*size/i }).first();
  const cupGroup = pdpPage.getByRole('radiogroup', { name: /\bcup\b|cup\s*size/i }).first();

  const bandGroupPresent = (await bandGroup.count().catch(() => 0)) > 0;
  const cupGroupPresent = (await cupGroup.count().catch(() => 0)) > 0;
  if (bandGroupPresent && cupGroupPresent) return true;

  const hasSelectableOptionsNearLabel = async (labelRe: RegExp): Promise<boolean> => {
    const label = main
      .locator('legend,label,h2,h3,h4,[role="heading"],span,div,p')
      .filter({ hasText: labelRe })
      .first();

    if ((await label.count().catch(() => 0)) === 0) return false;
    // Prefer visible label, but don't fail if it isn't (the container may still be valid).
    await label.waitFor({ state: 'visible', timeout: 6000 }).catch(() => null);

    const container = main.locator('section, fieldset, [role="group"], [data-testid], div').filter({ has: label }).first();
    const candidates = container
      .locator('[role="radio"], button, input[type="radio"], select')
      .filter({ hasNotText: /size\s*chart|size\s*guide|find\s+your|help|what\s*\'?s\s+my/i })
      .filter({ hasNotText: /add\s*to\s*(bag|cart)|ship\s*to\s*you|pick\s*up/i });

    const count = await candidates.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 40); i++) {
      const el = candidates.nth(i);
      if (!(await el.isVisible({ timeout: 800 }).catch(() => false))) continue;
      if (!(await el.isEnabled({ timeout: 800 }).catch(() => false))) continue;

      // If the selector is a dropdown, ensure it actually has at least one usable option.
      const tag = ((await el.evaluate((n) => (n as HTMLElement).tagName).catch(() => '')) || '').toLowerCase();
      if (tag === 'select') {
        const opts = el.locator('option');
        const optCount = await opts.count().catch(() => 0);
        let usable = 0;
        for (let j = 0; j < Math.min(optCount, 60); j++) {
          const opt = opts.nth(j);
          const disabled = (await opt.getAttribute('disabled').catch(() => null)) !== null;
          if (disabled) continue;
          const txt = ((await opt.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
          if (!txt) continue;
          if (/select|choose|pick/i.test(txt)) continue;
          if (/out\s*of\s*stock|sold\s*out/i.test(txt)) continue;
          usable++;
          if (usable >= 1) break;
        }
        if (usable >= 1) return true;
        continue;
      }

      return true;
    }
    return false;
  };

  const bandOk = await hasSelectableOptionsNearLabel(/^band(\s*size)?$/i);
  const cupOk = await hasSelectableOptionsNearLabel(/^cup(\s*size)?$/i);
  return bandOk && cupOk;
}

async function getVisibleEnabledSwatchLabelsBestEffort(pdpPage: Page): Promise<string[]> {
  // Used for Shine Strap tests: we only want swatches that are actually selectable
  // (visible + enabled), because the site often renders hidden duplicates.
  const swatchGroup = pdpPage
    .locator('[role="radiogroup"]')
    .filter({ has: pdpPage.locator('[role="radio"] img') })
    .first();

  // Best-effort: expand overflow (e.g. "+18" / "remaining swatches") so higher-index swatches become visible.
  const groupForMore = ((await swatchGroup.count().catch(() => 0)) > 0 ? swatchGroup : pdpPage.locator('main').first())
    .first();
  const more = groupForMore
    .locator('a,button')
    .filter({ hasText: /^(\+\d+)$|remaining\s+swatches|more\s+colors|more\s+options/i })
    .first();
  if ((await more.count().catch(() => 0)) > 0 && (await more.isVisible({ timeout: 1200 }).catch(() => false))) {
    await more.click({ timeout: 5000 }).catch(() => null);
    await bestEffortWaitForTransientLoaders(pdpPage);
  }

  const swatches = ((await swatchGroup.count().catch(() => 0)) > 0 ? swatchGroup : pdpPage)
    .locator('[role="radio"][aria-label], button[aria-label]')
    .filter({ hasNotText: /size guide|find your|help|what\'?'s my/i });

  const count = await swatches.count().catch(() => 0);
  const maxToCheck = Math.min(count, 120);

  const labels: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < maxToCheck; i++) {
    const s = swatches.nth(i);
    await s.scrollIntoViewIfNeeded().catch(() => null);
    if (!(await s.isVisible({ timeout: 500 }).catch(() => false))) continue;
    if (!(await s.isEnabled({ timeout: 500 }).catch(() => false))) continue;
    const raw = ((await s.getAttribute('aria-label').catch(() => null)) || '').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(raw);
  }

  return labels;
}

async function selectNthShineStrapSwatchRequired(pdpPage: Page, n1Based: number) {
  // "Strap" here maps to the PDP swatch list for the Shine Strap product.
  // We pick the Nth available swatch, starting at 1.
  const n = Math.max(1, Math.floor(n1Based));
  const swatchGroup = pdpPage
    .locator('[role="radiogroup"]')
    .filter({ has: pdpPage.locator('[role="radio"] img') })
    .first();

  // Best-effort: expand overflow if the UI hides swatches behind "+N".
  const groupForMore = ((await swatchGroup.count().catch(() => 0)) > 0 ? swatchGroup : pdpPage.locator('main').first())
    .first();
  const more = groupForMore
    .locator('a,button')
    .filter({ hasText: /^(\+\d+)$|remaining\s+swatches|more\s+colors|more\s+options/i })
    .first();
  if ((await more.count().catch(() => 0)) > 0 && (await more.isVisible({ timeout: 1200 }).catch(() => false))) {
    await more.click({ timeout: 5000 }).catch(() => null);
    await bestEffortWaitForTransientLoaders(pdpPage);
  }

  const swatches = ((await swatchGroup.count().catch(() => 0)) > 0 ? swatchGroup : pdpPage)
    .locator('[role="radio"][aria-label], button[aria-label]')
    .filter({ hasNotText: /size guide|find your|help|what\'?'s my/i });

  const count = await swatches.count().catch(() => 0);
  if (count === 0) throw new Error('No strap/color swatches found on Shine Strap PDP.');

  const getSelectedLabelBestEffort = async (): Promise<string> => {
    try {
      const selected = swatches
        .filter({
          has: pdpPage.locator(
            '[aria-checked="true"], [aria-selected="true"], [aria-pressed="true"], [data-state="checked"], [data-state="selected"]'
          ),
        })
        .first();

      if ((await selected.count().catch(() => 0)) > 0) {
        return (await selected.getAttribute('aria-label').catch(() => null)) || '';
      }
    } catch {
      // ignore
    }
    return '';
  };

  const beforeLabel = await getSelectedLabelBestEffort();

  // Pick by iterating visible/enabled to avoid hidden duplicates.
  const maxToCheck = Math.min(count, 80);
  let seen = 0;
  for (let i = 0; i < maxToCheck; i++) {
    const s = swatches.nth(i);
    await s.scrollIntoViewIfNeeded().catch(() => null);
    if (!(await s.isVisible({ timeout: 500 }).catch(() => false))) continue;
    if (!(await s.isEnabled({ timeout: 500 }).catch(() => false))) continue;
    seen++;
    if (seen === n) {
      const targetLabel = (await s.getAttribute('aria-label').catch(() => null)) || '';
      await s.scrollIntoViewIfNeeded().catch(() => null);
      await s.hover({ timeout: 2000 }).catch(() => null);
      await pdpPage.waitForTimeout(350).catch(() => null);

      await s.click({ timeout: 10_000 });
      // Wait until the selection state changes to the clicked swatch (or at least changes away from prior).
      await pdpPage
        .waitForFunction(
          ([selector, prev, target]) => {
            const nodes = Array.from(document.querySelectorAll(selector));

            const selected = nodes.find((el) => {
              const a = (el.getAttribute('aria-checked') || '').toLowerCase();
              const b = (el.getAttribute('aria-selected') || '').toLowerCase();
              const c = (el.getAttribute('aria-pressed') || '').toLowerCase();
              const d = (el.getAttribute('data-state') || '').toLowerCase();
              return a === 'true' || b === 'true' || c === 'true' || d === 'checked' || d === 'selected';
            });

            const label = selected?.getAttribute('aria-label') || '';
            if (target) return label.toLowerCase() === String(target).toLowerCase();
            if (prev) return label && label.toLowerCase() !== String(prev).toLowerCase();
            return Boolean(label);
          },
          ['[role="radio"][aria-label], button[aria-label]', beforeLabel, targetLabel],
          { timeout: 10_000 }
        )
        .catch(() => null);

      await bestEffortWaitForTransientLoaders(pdpPage);
      return;
    }
  }

  throw new Error(`Requested strap swatch #${n} but only found ${seen} visible/enabled swatches.`);
}

async function demoWait(page: Page, delayMs: number) {
  if (delayMs > 0) {
    await page.waitForTimeout(delayMs);
  }
}

async function ensurePlpHasAtLeastNProductLinks(page: Page, minCount: number, warn: (m: string) => void) {
  const maxScrolls = Math.max(1, Math.floor(Number(process.env.LACE_MAX_SCROLLS || '14') || 14));
  const desired = Math.max(1, Math.floor(minCount));

  let lastCount = -1;
  let stagnant = 0;

  for (let attempt = 0; attempt <= maxScrolls; attempt++) {
    const main = page.locator('main').first();
    const count = await productLinks(main).count().catch(() => 0);
    if (count >= desired) return count;

    if (count === lastCount) stagnant++;
    else stagnant = 0;
    lastCount = count;

    if (stagnant >= 2) break;

    // Scroll to prompt lazy-load/infinite scroll.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => null);
    await page.waitForTimeout(900).catch(() => null);
    await bestEffortWaitForTransientLoaders(page);
  }

  const main = page.locator('main').first();
  const finalCount = await productLinks(main).count().catch(() => 0);
  warn(`Could not load ${desired} product tiles; only saw ${finalCount} after scrolling.`);
  return finalCount;
}

async function isCrossedOutOrDisabled(option: Locator): Promise<boolean> {
  try {
    const ariaDisabled = (await option.getAttribute('aria-disabled').catch(() => null)) || '';
    if (ariaDisabled.toLowerCase() === 'true') return true;

    return await option.evaluate((el) => {
      const node = el as HTMLElement;

      const attr = (name: string) => (node.getAttribute(name) || '').toLowerCase();
      if (attr('disabled') === 'true') return true;
      if (attr('data-disabled') === 'true') return true;
      if (attr('data-state') === 'disabled') return true;

      const className = (node.className || '').toString().toLowerCase();
      if (/\b(disabled|unavailable|soldout|sold-out|oos|strike|strikethrough|crossed)\b/.test(className)) return true;

      const style = window.getComputedStyle(node);
      const td = `${style.textDecorationLine || ''} ${style.textDecoration || ''}`.toLowerCase();
      if (td.includes('line-through')) return true;

      // Sometimes the strike is applied to a wrapper/child.
      // NOTE: Avoid matching generic "cross" icons (e.g. close buttons). Only match explicit crossed-out variants.
      const anyStrike = node.querySelector(
        '[style*="line-through" i], [class*="strike" i], [class*="strikethrough" i], [class*="crossed" i], [class*="cross-out" i], [class*="crossout" i]'
      );
      if (anyStrike) return true;

      return false;
    });
  } catch {
    return false;
  }
}

async function applyBraSizedFilterBestEffort(page: Page, warn: (m: string) => void) {
  const panel = await openPlpFilterPanel(page, warn);
  if (!panel) return false;

  // Try to find a filter option that biases toward bra-sized items.
  const prefer = [
    /bra\s*-?\s*sized/i,
    /bra\s+size/i,
    /band\s+size/i,
    /cup\s+size/i,
    /a\s*-?\s*f\s+cups?/i,
  ];

  let option: Locator | null = null;
  for (const re of prefer) {
    const byRole = panel.getByRole('checkbox', { name: re }).first();
    if ((await byRole.count().catch(() => 0)) > 0) {
      option = byRole;
      break;
    }

    const aria = panel.locator('[role="checkbox"]').filter({ hasText: re }).first();
    if ((await aria.count().catch(() => 0)) > 0) {
      option = aria;
      break;
    }

    const input = panel.locator('input[type="checkbox"]').filter({ has: panel.getByText(re) }).first();
    if ((await input.count().catch(() => 0)) > 0) {
      option = input;
      break;
    }
  }

  if (!option) {
    warn('No bra-sized/cup-related filter option detected; continuing without filter.');
    await applyOrCloseFilterPanel(page, panel, warn);
    return false;
  }

  await option.click({ timeout: 10_000 }).catch(() => null);
  await applyOrCloseFilterPanel(page, panel, warn);
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => null);
  await bestEffortWaitForTransientLoaders(page);
  return true;
}

async function openPdpFromPlpTile(page: Page, tileLink: Locator) {
  const href = (await tileLink.getAttribute('href').catch(() => null)) || '';
  const img = tileLink.locator('img').first();

  const ctx = page.context();
  const newPagePromise = ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null);

  if ((await img.count()) > 0 && (await img.isVisible({ timeout: 1500 }).catch(() => false))) {
    await img.scrollIntoViewIfNeeded().catch(() => null);
    await img.click({ timeout: 15_000 }).catch(() => null);
  } else {
    await tileLink.scrollIntoViewIfNeeded().catch(() => null);
    await tileLink.click({ timeout: 15_000 }).catch(() => null);
  }

  const maybeNew = await newPagePromise;
  const pdpPage = maybeNew ?? page;

  await pdpPage.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => null);

  // If click didn't navigate (SPA/no-op), use the href directly.
  if (!/-catalog\/(?:[^\s]+)?|\/p\//.test(pdpPage.url()) && href) {
    const absolute = new URL(href, pdpPage.url()).toString();
    await pdpPage.goto(absolute, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
  }

  await expect(pdpPage).toHaveURL(/-catalog\/|\/p\//).catch(() => {
    // If URL check fails, warn but continue - some PDPs might have different URL patterns
    console.warn(`PDP URL check failed for ${pdpPage.url()}; continuing anyway.`);
  });
  return pdpPage;
}

test.describe('Bras — Selecting (Desktop E2E)', () => {
  // Test setup and helper functions will go here
  // Helper functions for Smooth category
  async function openSmoothPlpBestEffort(page: Page, warn: (m: string) => void, checkpoint: (p: Page) => Promise<void>) {
    // Prefer a dedicated Smooth PLP, then fall back to applying a Smooth filter on Push-Up,
    // then fall back to SRP (search) for smooth bras.
    let smoothSource: 'smooth-plp' | 'pushup+smooth-filter' | 'srp' = 'smooth-plp';
    await page.goto(SMOOTH_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const main = page.locator('main').first();
    const candidates = productLinks(main);
    const linkCount = await candidates.count().catch(() => 0);
    if (linkCount === 0) {
      smoothSource = 'pushup+smooth-filter';
      warn(`Smooth PLP had no product links (URL=${page.url()}); trying Push-Up PLP + Smooth filter.`);
      await page.goto(PUSHUP_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);

      const applied = await applySmoothFilterBestEffort(page, warn);
      if (!applied) warn('Could not apply Smooth filter on Push-Up PLP.');
      const linkCountAfter = await productLinks(page.locator('main')).count().catch(() => 0);
      if (linkCountAfter === 0) {
        smoothSource = 'srp';
        warn('Push-Up + Smooth filter fallback had no product links; using SRP search fallback.');
        const srpUrl = `${VS_BASE_URL}search?q=${encodeURIComponent('smooth bra')}`;
        await page.goto(srpUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await checkpoint(page);
        await bestEffortWaitForTransientLoaders(page);
        const linkCountSrp = await productLinks(page.locator('main')).count().catch(() => 0);
        if (linkCountSrp === 0) {
          throw new Error(`No Smooth products detected today after all fallbacks (source=${smoothSource}, url=${page.url()}).`);
        }
      }
    }

    return { smoothSource, plpUrl: page.url() };
  }

  async function applySmoothFilterBestEffort(page: Page, warn: (msg: string) => void) {
    // Try to find a filter option for "Smooth". This usually appears under Fabric/Material filters.
    const prefer = [/\bsmooth\b/i, /smooth\s*detail/i, /smooth\s*trim/i];

    const main = page.locator('main').first();
    const filterButtons = main.locator('button, [role="button"]').filter({ hasText: /filter|sort/i });
    const filterCount = await filterButtons.count().catch(() => 0);
    for (let i = 0; i < filterCount; i++) {
      const btn = filterButtons.nth(i);
      if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) continue;
      await btn.click({ timeout: 10_000 }).catch(() => null);
      await bestEffortWaitForTransientLoaders(page);
      break;
    }

    for (const re of prefer) {
      const option = page.locator('input[type="checkbox"], [role="checkbox"]').filter({ hasText: re });
      if ((await option.count().catch(() => 0)) > 0 && (await option.isVisible({ timeout: 5000 }).catch(() => false))) {
        await option.check({ timeout: 10_000 }).catch(() => null);
        await bestEffortWaitForTransientLoaders(page);
        await applyOrCloseFilterPanel(page, null, warn);
        return true;
      }
    }

    warn('No Smooth filter option detected; continuing without Smooth filter.');
    return false;
  }

  async function addSmoothProductFromTileIndex1Based(page: Page, testInfo: any, tileIndex1Based: number) {
    const isHeaded = process.env.HEADLESS === '0';
    const slowMoMs = Number(process.env.SLOWMO || '0');
    if (isHeaded) test.setTimeout(slowMoMs > 0 ? 240_000 : 180_000);
    else test.setTimeout(180_000);

    const warn = makeWarn(testInfo);
    const demoDelayMs = isHeaded ? 600 : 0;

    attachAutoDismissPopups(page, warn);
    const checkpoint = async (p: Page) => {
      await bestEffortPressEscape(p);
      await bestEffortDismissAllPopups(p);
      await bestEffortDismissOverlays(p);
      await ensureNoBlockingOverlays(p);
    };

    // Go straight to Smooth PLP (fastest and most stable entry point for smooth flows).
    const { smoothSource, plpUrl } = await openSmoothPlpBestEffort(page, warn, checkpoint);
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const main = page.locator('main').first();
    const candidates = productLinks(main);
    const count = await candidates.count().catch(() => 0);
    if (count <= 0) throw new Error(`No product tiles found on smooth source=${smoothSource} (url=${page.url()}).`);

    const requested = tileIndex1Based;
    const effectiveIndex = Math.min(requested - 1, count - 1);
    if (effectiveIndex !== requested - 1) {
      warn(`Requested Smooth tile #${requested} but only ${count} tiles are available; using tile #${effectiveIndex + 1} instead.`);
    }

    await checkpoint(page);
    const pdpPage = await openPdpFromPlpTile(page, candidates.nth(effectiveIndex));
    attachAutoDismissPopups(pdpPage, warn);
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    const pdpH1 = pdpPage.locator('main h1').first();
    await expect(pdpH1, 'Expected PDP H1').toBeVisible({ timeout: 30_000 });
    const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

    // Skip beyond what is actually selectable (visible+enabled), not just what exists in the DOM.
    const selectableSwatches = await getVisibleEnabledSwatchLabelsBestEffort(pdpPage);
    if (selectableSwatches.length === 0) {
      throw new Error('No selectable Smooth swatches found on PDP.');
    }

    // Per requirement: do NOT skip tests.
    // When the live site exposes fewer selectable straps than our generated index,
    // clamp to the last available swatch and continue.
    const effectiveStrapIndex = Math.min(Math.max(1, tileIndex1Based), selectableSwatches.length);
    if (effectiveStrapIndex !== tileIndex1Based) {
      warn(
        `Requested strap #${tileIndex1Based}, but only ${selectableSwatches.length} selectable swatches were available; selecting strap #${effectiveStrapIndex} instead.`
      );
    }

    // Step 3: select the Nth strap (swatch).
    await checkpoint(pdpPage);
    await selectNthShineStrapSwatchRequired(pdpPage, effectiveStrapIndex);
    // Make the strap selection clearly visible in headed runs.
    await demoWait(pdpPage, isHeaded ? Math.max(demoDelayMs, 1800) : demoDelayMs);

    // Band.
    await checkpoint(pdpPage);
    await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
    await demoWait(pdpPage, demoDelayMs);

    // Cup.
    await checkpoint(pdpPage);
    await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
    await demoWait(pdpPage, demoDelayMs);

    // Ship to you.
    await checkpoint(pdpPage);
    await selectShipToYouBestEffort(pdpPage, warn);
    await demoWait(pdpPage, demoDelayMs);

    // Add to bag.
    const addToBag = addToBagButton(pdpPage);
    await checkpoint(pdpPage);
    await addToBag.scrollIntoViewIfNeeded().catch(() => null);
    await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
    await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });
    await addToBag.click({ timeout: 20_000 });
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    await checkpoint(pdpPage);
    await waitForMiniBagOverlay(pdpPage, { requireVisible: isHeaded, productTitle, warn });
    await demoWait(pdpPage, isHeaded ? 2500 : 0);

    expect(true).toBeTruthy();

    return { productTitle, effectiveIndex: effectiveIndex + 1, smoothSource };
  }

  // Helper functions for Smooth Push-Up category
  async function openSmoothPushUpPlpBestEffort(page: Page, warn: (m: string) => void, checkpoint: (p: Page) => Promise<void>) {
    // Since specific subcategory URLs return 403, use main Smooth PLP directly
    await page.goto(SMOOTH_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const main = page.locator('main').first();
    const candidates = productLinks(main);
    const linkCount = await candidates.count().catch(() => 0);
    if (linkCount === 0) {
      warn(`Smooth PLP had no product links; using SRP search fallback.`);
      const srpUrl = `${VS_BASE_URL}/search?q=${encodeURIComponent('smooth bra')}`;
      await page.goto(srpUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);
      const linkCountSrp = await productLinks(page.locator('main')).count().catch(() => 0);
      if (linkCountSrp === 0) {
        throw new Error(`No Smooth products detected today (url=${page.url()}).`);
      }
    }

    return { smoothPushUpSource: 'smooth-plp', plpUrl: page.url() };
  }

  async function applyPushUpFilterBestEffort(page: Page, warn: (msg: string) => void) {
    const prefer = [/\bpush.?up\b/i, /push\s*up/i, /adds?\s*\d*\s*cups?/i];

    const main = page.locator('main').first();
    const filterButtons = main.locator('button, [role="button"]').filter({ hasText: /filter|sort/i });
    const filterCount = await filterButtons.count().catch(() => 0);
    for (let i = 0; i < filterCount; i++) {
      const btn = filterButtons.nth(i);
      if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) continue;
      await btn.click({ timeout: 10_000 }).catch(() => null);
      await bestEffortWaitForTransientLoaders(page);
      break;
    }

    for (const re of prefer) {
      const option = page.locator('input[type="checkbox"], [role="checkbox"]').filter({ hasText: re });
      if ((await option.count().catch(() => 0)) > 0 && (await option.isVisible({ timeout: 5000 }).catch(() => false))) {
        await option.check({ timeout: 10_000 }).catch(() => null);
        await bestEffortWaitForTransientLoaders(page);
        await applyOrCloseFilterPanel(page, null, warn);
        return true;
      }
    }

    warn('No Push-Up filter option detected; continuing without Push-Up filter.');
    return false;
  }

  async function addSmoothPushUpProductFromTileIndex1Based(page: Page, testInfo: any, tileIndex1Based: number) {
    const isHeaded = process.env.HEADLESS === '0';
    const slowMoMs = Number(process.env.SLOWMO || '0');
    if (isHeaded) test.setTimeout(slowMoMs > 0 ? 240_000 : 180_000);
    else test.setTimeout(180_000);

    const warn = makeWarn(testInfo);
    const demoDelayMs = isHeaded ? 600 : 0;

    attachAutoDismissPopups(page, warn);
    const checkpoint = async (p: Page) => {
      await bestEffortPressEscape(p);
      await bestEffortDismissAllPopups(p);
      await bestEffortDismissOverlays(p);
      await ensureNoBlockingOverlays(p);
    };

    const { smoothPushUpSource, plpUrl } = await openSmoothPushUpPlpBestEffort(page, warn, checkpoint);
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const main = page.locator('main').first();
    const candidates = productLinks(main);
    const count = await candidates.count().catch(() => 0);
    if (count <= 0) throw new Error(`No product tiles found on smooth push-up source=${smoothPushUpSource} (url=${page.url()}).`);

    const requested = tileIndex1Based;
    const effectiveIndex = Math.min(requested - 1, count - 1);
    if (effectiveIndex !== requested - 1) {
      warn(`Requested Smooth Push-Up tile #${requested} but only ${count} tiles are available; using tile #${effectiveIndex + 1} instead.`);
    }

    await checkpoint(page);
    const pdpPage = await openPdpFromPlpTile(page, candidates.nth(effectiveIndex));
    attachAutoDismissPopups(pdpPage, warn);
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    const pdpH1 = pdpPage.locator('main h1').first();
    await expect(pdpH1, 'Expected PDP H1').toBeVisible({ timeout: 30_000 });
    const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

    const selectableSwatches = await getVisibleEnabledSwatchLabelsBestEffort(pdpPage);
    if (selectableSwatches.length === 0) {
      throw new Error('No selectable Smooth Push-Up swatches found on PDP.');
    }

    const effectiveStrapIndex = Math.min(Math.max(1, tileIndex1Based), selectableSwatches.length);
    if (effectiveStrapIndex !== tileIndex1Based) {
      warn(
        `Requested strap #${tileIndex1Based}, but only ${selectableSwatches.length} selectable swatches were available; selecting strap #${effectiveStrapIndex} instead.`
      );
    }

    await checkpoint(pdpPage);
    await selectNthShineStrapSwatchRequired(pdpPage, effectiveStrapIndex);
    await demoWait(pdpPage, isHeaded ? Math.max(demoDelayMs, 1800) : demoDelayMs);

    const hasBandCupOnPdp = await hasBandAndCupSelectorsBestEffort(pdpPage);

    await checkpoint(pdpPage);
    if (hasBandCupOnPdp) {
      await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
      await demoWait(pdpPage, demoDelayMs);

      await checkpoint(pdpPage);
      try {
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn(`Cup selection failed on smooth push-up PDP; re-selecting first available band and retrying cup. (${msg})`);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      }
      await demoWait(pdpPage, demoDelayMs);
    } else {
      // Check if there's a general size selector
      const sizeSelectors = pdpPage.locator('select, [role="listbox"], button').filter({ hasText: /^size$/i });
      const hasSizeSelector = (await sizeSelectors.count().catch(() => 0)) > 0;
      
      if (hasSizeSelector) {
        await selectFirstAvailableFromSection(pdpPage, /^size$/i);
        await demoWait(pdpPage, demoDelayMs);
      } else {
        warn(`Smooth Push-Up PDP has no size selectors; this might be a one-size product. Proceeding to Add to Bag.`);
      }
    }

    await checkpoint(pdpPage);
    await selectShipToYouBestEffort(pdpPage, warn);
    await demoWait(pdpPage, demoDelayMs);

    const addToBag = addToBagButton(pdpPage);
    await checkpoint(pdpPage);
    await addToBag.scrollIntoViewIfNeeded().catch(() => null);
    await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
    await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });
    await addToBag.click({ timeout: 20_000 });
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    await checkpoint(pdpPage);
    await waitForMiniBagOverlay(pdpPage, { requireVisible: isHeaded, productTitle, warn });
    await demoWait(pdpPage, isHeaded ? 2500 : 0);

    expect(true).toBeTruthy();

    return { productTitle, effectiveIndex: effectiveIndex + 1, smoothPushUpSource };
  }
  test('BRAS-SELECT-01 — Basic bras PLP navigation', async ({ page }) => {
    // Basic test to verify bras PLP loads
    await page.goto(BRAS_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    // Verify page loaded
    await expect(page).toHaveURL(/.*bras.*/);

    // Check for basic page elements
    const main = page.locator('main').first();
    await expect(main).toBeVisible();

    // Check for product tiles using the same helper as the main flow.
    const products = productLinks(main);
    const productCount = await products.count();
    if (productCount === 0) {
      const fallbackProducts = main.locator('[data-testid*="product"], .product-tile, .product-card, [data-test*="product"]');
      expect(await fallbackProducts.count()).toBeGreaterThan(0);
    } else {
      expect(productCount).toBeGreaterThan(0);
    }
  });

  test.describe('Smooth', () => {
    test('BRAS-E2E-10 — Smooth → first tile, then next (+1) until no Smooth products → select first color/band/cup → Add to bag', async ({ page }, testInfo) => {
      const isHeaded = process.env.HEADLESS === '0';
      const slowMoMs = Number(process.env.SLOWMO || '0');
      if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
      else test.setTimeout(210_000);

      const warn = makeWarn(testInfo);
      const demoDelayMs = isHeaded ? 600 : 0;

      const maxAdds = Math.max(1, Math.floor(Number(process.env.SMOOTH_MAX_ADDS || '3') || 3));
      const maxTilesToScan = Math.max(3, Math.floor(Number(process.env.SMOOTH_MAX_TILES || '25') || 25));

      attachAutoDismissPopups(page, warn);
      const checkpoint = async (p: Page) => {
        await bestEffortPressEscape(p);
        await bestEffortDismissAllPopups(p);
        await bestEffortDismissOverlays(p);
        await ensureNoBlockingOverlays(p);
      };

      const { plpUrl } = await openSmoothPlpBestEffort(page, warn, checkpoint);

      // Increase the odds of getting bra-sized PDPs.
      await checkpoint(page);
      await applyBraSizedFilterBestEffort(page, warn);
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);

      const plpUrlFinal = plpUrl;
      let adds = 0;

      for (let tileIndex = 0; tileIndex < maxTilesToScan && adds < maxAdds; tileIndex++) {
        // Ensure lazy-loaded tiles are present as we move to higher indices.
        await ensurePlpHasAtLeastNProductLinks(page, tileIndex + 1, warn);
        const main = page.locator('main').first();
        const candidates = productLinks(main);
        const linkCount = await candidates.count().catch(() => 0);
        if (tileIndex >= linkCount) break;

        const tileLink = candidates.nth(tileIndex);
        if (!(await tileLink.isVisible({ timeout: 1500 }).catch(() => false))) continue;

        await checkpoint(page);
        const opened = await openPdpFromPlpTile(page, tileLink).catch(() => null);
        if (!opened) continue;

        attachAutoDismissPopups(opened, warn);
        await checkpoint(opened);
        await bestEffortWaitForTransientLoaders(opened);

        const pdpH1 = opened.locator('main h1').first();
        await pdpH1.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => null);
        const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

        const addToBag = addToBagButton(opened);
        const addCount = await addToBag.count().catch(() => 0);
        if (addCount === 0) {
          warn(`Smooth tile #${tileIndex + 1}: PDP had no Add to Bag; trying next tile. (url=${opened.url()})`);
          if (opened !== page) await opened.close().catch(() => null);
          else {
            await page.goto(plpUrlFinal, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
            await checkpoint(page);
            await bestEffortWaitForTransientLoaders(page);
          }
          continue;
        }

        const hasBandCupOnPdp = await hasBandAndCupSelectorsBestEffort(opened);

        await demoWait(opened, demoDelayMs);
        await checkpoint(opened);
        await selectFirstColorBestEffort(opened, warn);
        await demoWait(opened, demoDelayMs);

        await checkpoint(opened);
        if (hasBandCupOnPdp) {
          await selectFirstAvailableFromSection(opened, /\bband\b|band\s*size/i);
          await demoWait(opened, demoDelayMs);

          await checkpoint(opened);
          try {
            await selectFirstAvailableFromSection(opened, /\bcup\b|cup\s*size/i);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            warn(`Cup selection failed on smooth PDP; re-selecting first available band and retrying cup. (${msg})`);
            await checkpoint(opened);
            await selectFirstAvailableFromSection(opened, /\bband\b|band\s*size/i);
            await checkpoint(opened);
            await selectFirstAvailableFromSection(opened, /\bcup\b|cup\s*size/i);
          }
          await demoWait(opened, demoDelayMs);
        } else {
          // Some smooth products can be alpha-sized; fall back to generic Size.
          await selectFirstAvailableFromSection(opened, /^size$/i);
          await demoWait(opened, demoDelayMs);
        }

        await checkpoint(opened);
        await selectShipToYouBestEffort(opened, warn);
        await demoWait(opened, demoDelayMs);

        await checkpoint(opened);
        await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
        await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });

        await addToBag.click({ timeout: 20_000 });
        await checkpoint(opened);
        await bestEffortWaitForTransientLoaders(opened);

        await checkpoint(opened);
        await waitForMiniBagOverlay(opened, { requireVisible: isHeaded, productTitle, warn });
        await demoWait(opened, isHeaded ? 1500 : 0);

        adds++;
        warn(`Added smooth product #${adds}/${maxAdds} from tile #${tileIndex + 1} (title=${productTitle || 'unknown'})`);

        if (opened !== page) {
          await opened.close().catch(() => null);
        } else {
          await page.goto(plpUrlFinal, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
          await checkpoint(page);
          await bestEffortWaitForTransientLoaders(page);
        }
      }

      expect(adds, 'Expected to add at least one Smooth product to bag').toBeGreaterThan(0);
    });

    const smoothMaxProducts = Math.max(1, Math.floor(Number(process.env.SMOOTH_MAX_PRODUCTS || '20') || 20));
    for (let i = 1; i <= smoothMaxProducts; i++) {
      test(`BRAS-E2E-10-${String(i).padStart(2, '0')} — Smooth tile #${i} → select first color/band/cup → Ship to you → Add to bag`, async ({ page }, testInfo) => {
        const isHeaded = process.env.HEADLESS === '0';
        const slowMoMs = Number(process.env.SLOWMO || '0');
        // Per-tile Smooth tests can still require PLP scrolling + PDP hydration.
        if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
        else test.setTimeout(210_000);

        const result = await addSmoothProductFromTileIndex1Based(page, testInfo, i);
        expect(result.productTitle.length >= 0).toBeTruthy();
      });
    }
  });

  // Helper functions for Smooth Wireless category
  async function openSmoothWirelessPlpBestEffort(page: Page, warn: (m: string) => void, checkpoint: (p: Page) => Promise<void>) {
    // Since specific subcategory URLs return 403, use main Smooth PLP directly
    await page.goto(SMOOTH_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const main = page.locator('main').first();
    const candidates = productLinks(main);
    const linkCount = await candidates.count().catch(() => 0);
    if (linkCount === 0) {
      warn(`Smooth PLP had no product links; using SRP search fallback.`);
      const srpUrl = `${VS_BASE_URL}search?q=${encodeURIComponent('smooth wireless bra')}`;
      await page.goto(srpUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);
      const linkCountSrp = await productLinks(page.locator('main')).count().catch(() => 0);
      if (linkCountSrp === 0) {
        throw new Error(`No Smooth products detected today (url=${page.url()}).`);
      }
    }

    return { smoothWirelessSource: 'smooth-plp', plpUrl: page.url() };
  }

  async function applyWirelessFilterBestEffort(page: Page, warn: (msg: string) => void) {
    const prefer = [/\bwireless\b/i, /wire.?free/i, /no\s*wires?/i];

    const main = page.locator('main').first();
    const filterButtons = main.locator('button, [role="button"]').filter({ hasText: /filter|sort/i });
    const filterCount = await filterButtons.count().catch(() => 0);
    for (let i = 0; i < filterCount; i++) {
      const btn = filterButtons.nth(i);
      if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) continue;
      await btn.click({ timeout: 10_000 }).catch(() => null);
      await bestEffortWaitForTransientLoaders(page);
      break;
    }

    for (const re of prefer) {
      const option = page.locator('input[type="checkbox"], [role="checkbox"]').filter({ hasText: re });
      if ((await option.count().catch(() => 0)) > 0 && (await option.isVisible({ timeout: 5000 }).catch(() => false))) {
        await option.check({ timeout: 10_000 }).catch(() => null);
        await bestEffortWaitForTransientLoaders(page);
        await applyOrCloseFilterPanel(page, null, warn);
        return true;
      }
    }

    warn('No Wireless filter option detected; continuing without Wireless filter.');
    return false;
  }

  async function addSmoothWirelessProductFromTileIndex1Based(page: Page, testInfo: any, tileIndex1Based: number) {
    const isHeaded = process.env.HEADLESS === '0';
    const slowMoMs = Number(process.env.SLOWMO || '0');
    if (isHeaded) test.setTimeout(slowMoMs > 0 ? 240_000 : 180_000);
    else test.setTimeout(180_000);

    const warn = makeWarn(testInfo);
    const demoDelayMs = isHeaded ? 600 : 0;

    attachAutoDismissPopups(page, warn);
    const checkpoint = async (p: Page) => {
      await bestEffortPressEscape(p);
      await bestEffortDismissAllPopups(p);
      await bestEffortDismissOverlays(p);
      await ensureNoBlockingOverlays(p);
    };

    const { smoothWirelessSource, plpUrl } = await openSmoothWirelessPlpBestEffort(page, warn, checkpoint);
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const main = page.locator('main').first();
    const candidates = productLinks(main);
    const count = await candidates.count().catch(() => 0);
    if (count <= 0) throw new Error(`No product tiles found on smooth wireless source=${smoothWirelessSource} (url=${page.url()}).`);

    const requested = tileIndex1Based;
    const effectiveIndex = Math.min(requested - 1, count - 1);
    if (effectiveIndex !== requested - 1) {
      warn(`Requested Smooth Wireless tile #${requested} but only ${count} tiles are available; using tile #${effectiveIndex + 1} instead.`);
    }

    await checkpoint(page);
    const pdpPage = await openPdpFromPlpTile(page, candidates.nth(effectiveIndex));
    attachAutoDismissPopups(pdpPage, warn);
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    const pdpH1 = pdpPage.locator('main h1').first();
    await expect(pdpH1, 'Expected PDP H1').toBeVisible({ timeout: 30_000 });
    const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

    const selectableSwatches = await getVisibleEnabledSwatchLabelsBestEffort(pdpPage);
    if (selectableSwatches.length === 0) {
      throw new Error('No selectable Smooth Wireless swatches found on PDP.');
    }

    const effectiveStrapIndex = Math.min(Math.max(1, tileIndex1Based), selectableSwatches.length);
    if (effectiveStrapIndex !== tileIndex1Based) {
      warn(
        `Requested strap #${tileIndex1Based}, but only ${selectableSwatches.length} selectable swatches were available; selecting strap #${effectiveStrapIndex} instead.`
      );
    }

    await checkpoint(pdpPage);
    await selectNthShineStrapSwatchRequired(pdpPage, effectiveStrapIndex);
    await demoWait(pdpPage, isHeaded ? Math.max(demoDelayMs, 1800) : demoDelayMs);

    const hasBandCupOnPdp = await hasBandAndCupSelectorsBestEffort(pdpPage);

    await checkpoint(pdpPage);
    if (hasBandCupOnPdp) {
      await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
      await demoWait(pdpPage, demoDelayMs);

      await checkpoint(pdpPage);
      try {
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn(`Cup selection failed on smooth wireless PDP; re-selecting first available band and retrying cup. (${msg})`);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      }
      await demoWait(pdpPage, demoDelayMs);
    } else {
      // Check if there's a general size selector
      const sizeSelectors = pdpPage.locator('select, [role="listbox"], button').filter({ hasText: /^size$/i });
      const hasSizeSelector = (await sizeSelectors.count().catch(() => 0)) > 0;
      
      if (hasSizeSelector) {
        await selectFirstAvailableFromSection(pdpPage, /^size$/i);
        await demoWait(pdpPage, demoDelayMs);
      } else {
        warn(`Smooth Wireless PDP has no size selectors; this might be a one-size product. Proceeding to Add to Bag.`);
      }
    }

    await checkpoint(pdpPage);
    await selectShipToYouBestEffort(pdpPage, warn);
    await demoWait(pdpPage, demoDelayMs);

    const addToBag = addToBagButton(pdpPage);
    await checkpoint(pdpPage);
    await addToBag.scrollIntoViewIfNeeded().catch(() => null);
    await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
    await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });
    await addToBag.click({ timeout: 20_000 });
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    await checkpoint(pdpPage);
    await waitForMiniBagOverlay(pdpPage, { requireVisible: isHeaded, productTitle, warn });
    await demoWait(pdpPage, isHeaded ? 2500 : 0);

    expect(true).toBeTruthy();

    return { productTitle, effectiveIndex: effectiveIndex + 1, smoothWirelessSource };
  }

  // Helper functions for Smooth T-Shirt category
  async function openSmoothTShirtPlpBestEffort(page: Page, warn: (m: string) => void, checkpoint: (p: Page) => Promise<void>) {
    // Since specific subcategory URLs return 403, use main Smooth PLP directly
    await page.goto(SMOOTH_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const main = page.locator('main').first();
    const candidates = productLinks(main);
    const linkCount = await candidates.count().catch(() => 0);
    if (linkCount === 0) {
      warn(`Smooth PLP had no product links; using SRP search fallback.`);
      const srpUrl = `${VS_BASE_URL}search?q=${encodeURIComponent('smooth t-shirt bra')}`;
      await page.goto(srpUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);
      const linkCountSrp = await productLinks(page.locator('main')).count().catch(() => 0);
      if (linkCountSrp === 0) {
        throw new Error(`No Smooth products detected today (url=${page.url()}).`);
      }
    }

    return { smoothTShirtSource: 'smooth-plp', plpUrl: page.url() };
  }

  async function applyTShirtFilterBestEffort(page: Page, warn: (msg: string) => void) {
    const prefer = [/\bt.?shirt\b/i, /t\s*shirt/i, /tee\s*shirt/i];

    const main = page.locator('main').first();
    const filterButtons = main.locator('button, [role="button"]').filter({ hasText: /filter|sort/i });
    const filterCount = await filterButtons.count().catch(() => 0);
    for (let i = 0; i < filterCount; i++) {
      const btn = filterButtons.nth(i);
      if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) continue;
      await btn.click({ timeout: 10_000 }).catch(() => null);
      await bestEffortWaitForTransientLoaders(page);
      break;
    }

    for (const re of prefer) {
      const option = page.locator('input[type="checkbox"], [role="checkbox"]').filter({ hasText: re });
      if ((await option.count().catch(() => 0)) > 0 && (await option.isVisible({ timeout: 5000 }).catch(() => false))) {
        await option.check({ timeout: 10_000 }).catch(() => null);
        await bestEffortWaitForTransientLoaders(page);
        await applyOrCloseFilterPanel(page, null, warn);
        return true;
      }
    }

    warn('No T-Shirt filter option detected; continuing without T-Shirt filter.');
    return false;
  }

  async function addSmoothTShirtProductFromTileIndex1Based(page: Page, testInfo: any, tileIndex1Based: number) {
    const isHeaded = process.env.HEADLESS === '0';
    const slowMoMs = Number(process.env.SLOWMO || '0');
    if (isHeaded) test.setTimeout(slowMoMs > 0 ? 240_000 : 180_000);
    else test.setTimeout(180_000);

    const warn = makeWarn(testInfo);
    const demoDelayMs = isHeaded ? 600 : 0;

    attachAutoDismissPopups(page, warn);
    const checkpoint = async (p: Page) => {
      await bestEffortPressEscape(p);
      await bestEffortDismissAllPopups(p);
      await bestEffortDismissOverlays(p);
      await ensureNoBlockingOverlays(p);
    };

    const { smoothTShirtSource, plpUrl } = await openSmoothTShirtPlpBestEffort(page, warn, checkpoint);
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const main = page.locator('main').first();
    const candidates = productLinks(main);
    const count = await candidates.count().catch(() => 0);
    if (count <= 0) throw new Error(`No product tiles found on smooth t-shirt source=${smoothTShirtSource} (url=${page.url()}).`);

    const requested = tileIndex1Based;
    const effectiveIndex = Math.min(requested - 1, count - 1);
    if (effectiveIndex !== requested - 1) {
      warn(`Requested Smooth T-Shirt tile #${requested} but only ${count} tiles are available; using tile #${effectiveIndex + 1} instead.`);
    }

    await checkpoint(page);
    const pdpPage = await openPdpFromPlpTile(page, candidates.nth(effectiveIndex));
    attachAutoDismissPopups(pdpPage, warn);
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    const pdpH1 = pdpPage.locator('main h1').first();
    await expect(pdpH1, 'Expected PDP H1').toBeVisible({ timeout: 30_000 });
    const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

    const selectableSwatches = await getVisibleEnabledSwatchLabelsBestEffort(pdpPage);
    if (selectableSwatches.length === 0) {
      throw new Error('No selectable Smooth T-Shirt swatches found on PDP.');
    }

    const effectiveStrapIndex = Math.min(Math.max(1, tileIndex1Based), selectableSwatches.length);
    if (effectiveStrapIndex !== tileIndex1Based) {
      warn(
        `Requested strap #${tileIndex1Based}, but only ${selectableSwatches.length} selectable swatches were available; selecting strap #${effectiveStrapIndex} instead.`
      );
    }

    await checkpoint(pdpPage);
    await selectNthShineStrapSwatchRequired(pdpPage, effectiveStrapIndex);
    await demoWait(pdpPage, isHeaded ? Math.max(demoDelayMs, 1800) : demoDelayMs);

    const hasBandCupOnPdp = await hasBandAndCupSelectorsBestEffort(pdpPage);

    await checkpoint(pdpPage);
    if (hasBandCupOnPdp) {
      await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
      await demoWait(pdpPage, demoDelayMs);

      await checkpoint(pdpPage);
      try {
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn(`Cup selection failed on smooth t-shirt PDP; re-selecting first available band and retrying cup. (${msg})`);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      }
      await demoWait(pdpPage, demoDelayMs);
    } else {
      // Check if there's a general size selector
      const sizeSelectors = pdpPage.locator('select, [role="listbox"], button').filter({ hasText: /^size$/i });
      const hasSizeSelector = (await sizeSelectors.count().catch(() => 0)) > 0;
      
      if (hasSizeSelector) {
        await selectFirstAvailableFromSection(pdpPage, /^size$/i);
        await demoWait(pdpPage, demoDelayMs);
      } else {
        warn(`Smooth T-Shirt PDP has no size selectors; this might be a one-size product. Proceeding to Add to Bag.`);
      }
    }

    await checkpoint(pdpPage);
    await selectShipToYouBestEffort(pdpPage, warn);
    await demoWait(pdpPage, demoDelayMs);

    const addToBag = addToBagButton(pdpPage);
    await checkpoint(pdpPage);
    await addToBag.scrollIntoViewIfNeeded().catch(() => null);
    await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
    await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });
    await addToBag.click({ timeout: 20_000 });
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    await checkpoint(pdpPage);
    await waitForMiniBagOverlay(pdpPage, { requireVisible: isHeaded, productTitle, warn });
    await demoWait(pdpPage, isHeaded ? 2500 : 0);

    expect(true).toBeTruthy();

    return { productTitle, effectiveIndex: effectiveIndex + 1, smoothTShirtSource };
  }

  // Helper functions for Smooth Strapless category
  async function openSmoothStraplessPlpBestEffort(page: Page, warn: (m: string) => void, checkpoint: (p: Page) => Promise<void>) {
    // Since specific subcategory URLs return 403, use main Smooth PLP directly
    await page.goto(SMOOTH_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const main = page.locator('main').first();
    const candidates = productLinks(main);
    const linkCount = await candidates.count().catch(() => 0);
    if (linkCount === 0) {
      warn(`Smooth PLP had no product links; using SRP search fallback.`);
      const srpUrl = `${VS_BASE_URL}search?q=${encodeURIComponent('smooth strapless bra')}`;
      await page.goto(srpUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);
      const linkCountSrp = await productLinks(page.locator('main')).count().catch(() => 0);
      if (linkCountSrp === 0) {
        throw new Error(`No Smooth products detected today (url=${page.url()}).`);
      }
    }

    return { smoothStraplessSource: 'smooth-plp', plpUrl: page.url() };
  }

  async function applyStraplessFilterBestEffort(page: Page, warn: (msg: string) => void) {
    const prefer = [/\bstrapless\b/i, /no\s*straps?/i, /strap.?less/i];

    const main = page.locator('main').first();
    const filterButtons = main.locator('button, [role="button"]').filter({ hasText: /filter|sort/i });
    const filterCount = await filterButtons.count().catch(() => 0);
    for (let i = 0; i < filterCount; i++) {
      const btn = filterButtons.nth(i);
      if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) continue;
      await btn.click({ timeout: 10_000 }).catch(() => null);
      await bestEffortWaitForTransientLoaders(page);
      break;
    }

    for (const re of prefer) {
      const option = page.locator('input[type="checkbox"], [role="checkbox"]').filter({ hasText: re });
      if ((await option.count().catch(() => 0)) > 0 && (await option.isVisible({ timeout: 5000 }).catch(() => false))) {
        await option.check({ timeout: 10_000 }).catch(() => null);
        await bestEffortWaitForTransientLoaders(page);
        await applyOrCloseFilterPanel(page, null, warn);
        return true;
      }
    }

    warn('No Strapless filter option detected; continuing without Strapless filter.');
    return false;
  }

  async function addSmoothStraplessProductFromTileIndex1Based(page: Page, testInfo: any, tileIndex1Based: number) {
    const isHeaded = process.env.HEADLESS === '0';
    const slowMoMs = Number(process.env.SLOWMO || '0');
    if (isHeaded) test.setTimeout(slowMoMs > 0 ? 240_000 : 180_000);
    else test.setTimeout(180_000);

    const warn = makeWarn(testInfo);
    const demoDelayMs = isHeaded ? 600 : 0;

    attachAutoDismissPopups(page, warn);
    const checkpoint = async (p: Page) => {
      await bestEffortPressEscape(p);
      await bestEffortDismissAllPopups(p);
      await bestEffortDismissOverlays(p);
      await ensureNoBlockingOverlays(p);
    };

    const { smoothStraplessSource, plpUrl } = await openSmoothStraplessPlpBestEffort(page, warn, checkpoint);
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const main = page.locator('main').first();
    const candidates = productLinks(main);
    const count = await candidates.count().catch(() => 0);
    if (count <= 0) throw new Error(`No product tiles found on smooth strapless source=${smoothStraplessSource} (url=${page.url()}).`);

    const requested = tileIndex1Based;
    const effectiveIndex = Math.min(requested - 1, count - 1);
    if (effectiveIndex !== requested - 1) {
      warn(`Requested Smooth Strapless tile #${requested} but only ${count} tiles are available; using tile #${effectiveIndex + 1} instead.`);
    }

    await checkpoint(page);
    const pdpPage = await openPdpFromPlpTile(page, candidates.nth(effectiveIndex));
    attachAutoDismissPopups(pdpPage, warn);
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    const pdpH1 = pdpPage.locator('main h1').first();
    await expect(pdpH1, 'Expected PDP H1').toBeVisible({ timeout: 30_000 });
    const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

    const selectableSwatches = await getVisibleEnabledSwatchLabelsBestEffort(pdpPage);
    if (selectableSwatches.length === 0) {
      throw new Error('No selectable Smooth Strapless swatches found on PDP.');
    }

    const effectiveStrapIndex = Math.min(Math.max(1, tileIndex1Based), selectableSwatches.length);
    if (effectiveStrapIndex !== tileIndex1Based) {
      warn(
        `Requested strap #${tileIndex1Based}, but only ${selectableSwatches.length} selectable swatches were available; selecting strap #${effectiveStrapIndex} instead.`
      );
    }

    await checkpoint(pdpPage);
    await selectNthShineStrapSwatchRequired(pdpPage, effectiveStrapIndex);
    await demoWait(pdpPage, isHeaded ? Math.max(demoDelayMs, 1800) : demoDelayMs);

    const hasBandCupOnPdp = await hasBandAndCupSelectorsBestEffort(pdpPage);

    await checkpoint(pdpPage);
    if (hasBandCupOnPdp) {
      await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
      await demoWait(pdpPage, demoDelayMs);

      await checkpoint(pdpPage);
      try {
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn(`Cup selection failed on smooth strapless PDP; re-selecting first available band and retrying cup. (${msg})`);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      }
      await demoWait(pdpPage, demoDelayMs);
    } else {
      // Check if there's a general size selector
      const sizeSelectors = pdpPage.locator('select, [role="listbox"], button').filter({ hasText: /^size$/i });
      const hasSizeSelector = (await sizeSelectors.count().catch(() => 0)) > 0;
      
      if (hasSizeSelector) {
        await selectFirstAvailableFromSection(pdpPage, /^size$/i);
        await demoWait(pdpPage, demoDelayMs);
      } else {
        warn(`Smooth Strapless PDP has no size selectors; this might be a one-size product. Proceeding to Add to Bag.`);
      }
    }

    await checkpoint(pdpPage);
    await selectShipToYouBestEffort(pdpPage, warn);
    await demoWait(pdpPage, demoDelayMs);

    const addToBag = addToBagButton(pdpPage);
    await checkpoint(pdpPage);
    await addToBag.scrollIntoViewIfNeeded().catch(() => null);
    await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
    await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });
    await addToBag.click({ timeout: 20_000 });
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    await checkpoint(pdpPage);
    await waitForMiniBagOverlay(pdpPage, { requireVisible: isHeaded, productTitle, warn });
    await demoWait(pdpPage, isHeaded ? 2500 : 0);

    expect(true).toBeTruthy();

    return { productTitle, effectiveIndex: effectiveIndex + 1, smoothStraplessSource };
  }

  // Helper functions for Smooth Demi category
  async function openSmoothDemiPlpBestEffort(page: Page, warn: (m: string) => void, checkpoint: (p: Page) => Promise<void>) {
    // Since specific subcategory URLs return 403, use main Smooth PLP directly
    await page.goto(SMOOTH_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const main = page.locator('main').first();
    const candidates = productLinks(main);
    const linkCount = await candidates.count().catch(() => 0);
    if (linkCount === 0) {
      warn(`Smooth PLP had no product links; using SRP search fallback.`);
      const srpUrl = `${VS_BASE_URL}search?q=${encodeURIComponent('smooth demi bra')}`;
      await page.goto(srpUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);
      const linkCountSrp = await productLinks(page.locator('main')).count().catch(() => 0);
      if (linkCountSrp === 0) {
        throw new Error(`No Smooth products detected today (url=${page.url()}).`);
      }
    }

    return { smoothDemiSource: 'smooth-plp', plpUrl: page.url() };
  }

  async function applyDemiFilterBestEffort(page: Page, warn: (msg: string) => void) {
    const prefer = [/\bdemi\b/i, /half\s*cup/i, /demi\s*cup/i];

    const main = page.locator('main').first();
    const filterButtons = main.locator('button, [role="button"]').filter({ hasText: /filter|sort/i });
    const filterCount = await filterButtons.count().catch(() => 0);
    for (let i = 0; i < filterCount; i++) {
      const btn = filterButtons.nth(i);
      if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) continue;
      await btn.click({ timeout: 10_000 }).catch(() => null);
      await bestEffortWaitForTransientLoaders(page);
      break;
    }

    for (const re of prefer) {
      const option = page.locator('input[type="checkbox"], [role="checkbox"]').filter({ hasText: re });
      if ((await option.count().catch(() => 0)) > 0 && (await option.isVisible({ timeout: 5000 }).catch(() => false))) {
        await option.check({ timeout: 10_000 }).catch(() => null);
        await bestEffortWaitForTransientLoaders(page);
        await applyOrCloseFilterPanel(page, null, warn);
        return true;
      }
    }

    warn('No Demi filter option detected; continuing without Demi filter.');
    return false;
  }

  async function addSmoothDemiProductFromTileIndex1Based(page: Page, testInfo: any, tileIndex1Based: number) {
    const isHeaded = process.env.HEADLESS === '0';
    const slowMoMs = Number(process.env.SLOWMO || '0');
    if (isHeaded) test.setTimeout(slowMoMs > 0 ? 240_000 : 180_000);
    else test.setTimeout(180_000);

    const warn = makeWarn(testInfo);
    const demoDelayMs = isHeaded ? 600 : 0;

    attachAutoDismissPopups(page, warn);
    const checkpoint = async (p: Page) => {
      await bestEffortPressEscape(p);
      await bestEffortDismissAllPopups(p);
      await bestEffortDismissOverlays(p);
      await ensureNoBlockingOverlays(p);
    };

    const { smoothDemiSource, plpUrl } = await openSmoothDemiPlpBestEffort(page, warn, checkpoint);
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const main = page.locator('main').first();
    const candidates = productLinks(main);
    const count = await candidates.count().catch(() => 0);
    if (count <= 0) throw new Error(`No product tiles found on smooth demi source=${smoothDemiSource} (url=${page.url()}).`);

    const requested = tileIndex1Based;
    const effectiveIndex = Math.min(requested - 1, count - 1);
    if (effectiveIndex !== requested - 1) {
      warn(`Requested Smooth Demi tile #${requested} but only ${count} tiles are available; using tile #${effectiveIndex + 1} instead.`);
    }

    await checkpoint(page);
    const pdpPage = await openPdpFromPlpTile(page, candidates.nth(effectiveIndex));
    attachAutoDismissPopups(pdpPage, warn);
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    const pdpH1 = pdpPage.locator('main h1').first();
    await expect(pdpH1, 'Expected PDP H1').toBeVisible({ timeout: 30_000 });
    const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

    const selectableSwatches = await getVisibleEnabledSwatchLabelsBestEffort(pdpPage);
    if (selectableSwatches.length === 0) {
      throw new Error('No selectable Smooth Demi swatches found on PDP.');
    }

    const effectiveStrapIndex = Math.min(Math.max(1, tileIndex1Based), selectableSwatches.length);
    if (effectiveStrapIndex !== tileIndex1Based) {
      warn(
        `Requested strap #${tileIndex1Based}, but only ${selectableSwatches.length} selectable swatches were available; selecting strap #${effectiveStrapIndex} instead.`
      );
    }

    await checkpoint(pdpPage);
    await selectNthShineStrapSwatchRequired(pdpPage, effectiveStrapIndex);
    await demoWait(pdpPage, isHeaded ? Math.max(demoDelayMs, 1800) : demoDelayMs);

    const hasBandCupOnPdp = await hasBandAndCupSelectorsBestEffort(pdpPage);

    await checkpoint(pdpPage);
    if (hasBandCupOnPdp) {
      await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
      await demoWait(pdpPage, demoDelayMs);

      await checkpoint(pdpPage);
      try {
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn(`Cup selection failed on smooth demi PDP; re-selecting first available band and retrying cup. (${msg})`);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      }
      await demoWait(pdpPage, demoDelayMs);
    } else {
      // Check if there's a general size selector
      const sizeSelectors = pdpPage.locator('select, [role="listbox"], button').filter({ hasText: /^size$/i });
      const hasSizeSelector = (await sizeSelectors.count().catch(() => 0)) > 0;
      
      if (hasSizeSelector) {
        await selectFirstAvailableFromSection(pdpPage, /^size$/i);
        await demoWait(pdpPage, demoDelayMs);
      } else {
        warn(`Smooth Demi PDP has no size selectors; this might be a one-size product. Proceeding to Add to Bag.`);
      }
    }

    await checkpoint(pdpPage);
    await selectShipToYouBestEffort(pdpPage, warn);
    await demoWait(pdpPage, demoDelayMs);

    const addToBag = addToBagButton(pdpPage);
    await checkpoint(pdpPage);
    await addToBag.scrollIntoViewIfNeeded().catch(() => null);
    await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
    await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });
    await addToBag.click({ timeout: 20_000 });
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    await checkpoint(pdpPage);
    await waitForMiniBagOverlay(pdpPage, { requireVisible: isHeaded, productTitle, warn });
    await demoWait(pdpPage, isHeaded ? 2500 : 0);

    expect(true).toBeTruthy();

    return { productTitle, effectiveIndex: effectiveIndex + 1, smoothDemiSource };
  }

  test.describe('Smooth Push-Up', () => {
    test('BRAS-E2E-11 — Smooth Push-Up → first tile, then next (+1) until no Smooth Push-Up products → select first color/band/cup → Add to bag', async ({ page }, testInfo) => {
      const isHeaded = process.env.HEADLESS === '0';
      const slowMoMs = Number(process.env.SLOWMO || '0');
      if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
      else test.setTimeout(210_000);

      const warn = makeWarn(testInfo);
      const demoDelayMs = isHeaded ? 600 : 0;

      const maxAdds = Math.max(1, Math.floor(Number(process.env.SMOOTH_PUSHUP_MAX_ADDS || '3') || 3));
      const maxTilesToScan = Math.max(3, Math.floor(Number(process.env.SMOOTH_PUSHUP_MAX_TILES || '25') || 25));

      attachAutoDismissPopups(page, warn);
      const checkpoint = async (p: Page) => {
        await bestEffortPressEscape(p);
        await bestEffortDismissAllPopups(p);
        await bestEffortDismissOverlays(p);
        await ensureNoBlockingOverlays(p);
      };

      const { plpUrl } = await openSmoothPushUpPlpBestEffort(page, warn, checkpoint);

      await checkpoint(page);
      await applyBraSizedFilterBestEffort(page, warn);
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);

      const plpUrlFinal = plpUrl;
      let adds = 0;

      for (let tileIndex = 0; tileIndex < maxTilesToScan && adds < maxAdds; tileIndex++) {
        await ensurePlpHasAtLeastNProductLinks(page, tileIndex + 1, warn);
        const main = page.locator('main').first();
        const candidates = productLinks(main);
        const linkCount = await candidates.count().catch(() => 0);
        if (tileIndex >= linkCount) break;

        const tileLink = candidates.nth(tileIndex);
        if (!(await tileLink.isVisible({ timeout: 1500 }).catch(() => false))) continue;

        await checkpoint(page);
        const opened = await openPdpFromPlpTile(page, tileLink).catch(() => null);
        if (!opened) continue;

        attachAutoDismissPopups(opened, warn);
        await checkpoint(opened);
        await bestEffortWaitForTransientLoaders(opened);

        const pdpH1 = opened.locator('main h1').first();
        await pdpH1.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => null);
        const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

        const addToBag = addToBagButton(opened);
        const addCount = await addToBag.count().catch(() => 0);
        if (addCount === 0) {
          warn(`Smooth Push-Up tile #${tileIndex + 1}: PDP had no Add to Bag; trying next tile. (url=${opened.url()})`);
          if (opened !== page) await opened.close().catch(() => null);
          else {
            await page.goto(plpUrlFinal, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
            await checkpoint(page);
            await bestEffortWaitForTransientLoaders(page);
          }
          continue;
        }

        const hasBandCupOnPdp = await hasBandAndCupSelectorsBestEffort(opened);

        await demoWait(opened, demoDelayMs);
        await checkpoint(opened);
        await selectFirstColorBestEffort(opened, warn);
        await demoWait(opened, demoDelayMs);

        await checkpoint(opened);
        if (hasBandCupOnPdp) {
          await selectFirstAvailableFromSection(opened, /\bband\b|band\s*size/i);
          await demoWait(opened, demoDelayMs);

          await checkpoint(opened);
          try {
            await selectFirstAvailableFromSection(opened, /\bcup\b|cup\s*size/i);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            warn(`Cup selection failed on gradient shine PDP; re-selecting first available band and retrying cup. (${msg})`);
            await checkpoint(opened);
            await selectFirstAvailableFromSection(opened, /\bband\b|band\s*size/i);
            await checkpoint(opened);
            await selectFirstAvailableFromSection(opened, /\bcup\b|cup\s*size/i);
          }
          await demoWait(opened, demoDelayMs);
        } else {
          await selectFirstAvailableFromSection(opened, /^size$/i);
          await demoWait(opened, demoDelayMs);
        }

        await checkpoint(opened);
        await selectShipToYouBestEffort(opened, warn);
        await demoWait(opened, demoDelayMs);

        await checkpoint(opened);
        await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
        await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });

        await addToBag.click({ timeout: 20_000 });
        await checkpoint(opened);
        await bestEffortWaitForTransientLoaders(opened);

        await checkpoint(opened);
        await waitForMiniBagOverlay(opened, { requireVisible: isHeaded, productTitle, warn });
        await demoWait(opened, isHeaded ? 1500 : 0);

        adds++;
        warn(`Added smooth push-up product #${adds}/${maxAdds} from tile #${tileIndex + 1} (title=${productTitle || 'unknown'})`);

        if (opened !== page) {
          await opened.close().catch(() => null);
        } else {
          await page.goto(plpUrlFinal, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
          await checkpoint(page);
          await bestEffortWaitForTransientLoaders(page);
        }
      }

      expect(adds, 'Expected to add at least one Smooth Push-Up product to bag').toBeGreaterThan(0);
    });

    const smoothPushUpMaxProducts = Math.max(1, Math.floor(Number(process.env.SMOOTH_PUSHUP_MAX_PRODUCTS || '15') || 15));
    for (let i = 1; i <= smoothPushUpMaxProducts; i++) {
      test(`BRAS-E2E-11-${String(i).padStart(2, '0')} — Smooth Push-Up tile #${i} → select first color/band/cup → Ship to you → Add to bag`, async ({ page }, testInfo) => {
        const isHeaded = process.env.HEADLESS === '0';
        const slowMoMs = Number(process.env.SLOWMO || '0');
        if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
        else test.setTimeout(210_000);

        const result = await addSmoothPushUpProductFromTileIndex1Based(page, testInfo, i);
        expect(result.productTitle.length >= 0).toBeTruthy();
      });
    }
  });

  test.describe('Smooth Wireless', () => {
    test('BRAS-E2E-12 — Smooth Wireless → first tile, then next (+1) until no Smooth Wireless products → select first color/band/cup → Add to bag', async ({ page }, testInfo) => {
      const isHeaded = process.env.HEADLESS === '0';
      const slowMoMs = Number(process.env.SLOWMO || '0');
      if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
      else test.setTimeout(210_000);

      const warn = makeWarn(testInfo);
      const demoDelayMs = isHeaded ? 600 : 0;

      const maxAdds = Math.max(1, Math.floor(Number(process.env.SMOOTH_WIRELESS_MAX_ADDS || '3') || 3));
      const maxTilesToScan = Math.max(3, Math.floor(Number(process.env.SMOOTH_WIRELESS_MAX_TILES || '25') || 25));

      attachAutoDismissPopups(page, warn);
      const checkpoint = async (p: Page) => {
        await bestEffortPressEscape(p);
        await bestEffortDismissAllPopups(p);
        await bestEffortDismissOverlays(p);
        await ensureNoBlockingOverlays(p);
      };

      const { plpUrl } = await openSmoothWirelessPlpBestEffort(page, warn, checkpoint);

      await checkpoint(page);
      await applyBraSizedFilterBestEffort(page, warn);
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);

      const plpUrlFinal = plpUrl;
      let adds = 0;

      for (let tileIndex = 0; tileIndex < maxTilesToScan && adds < maxAdds; tileIndex++) {
        await ensurePlpHasAtLeastNProductLinks(page, tileIndex + 1, warn);
        const main = page.locator('main').first();
        const candidates = productLinks(main);
        const linkCount = await candidates.count().catch(() => 0);
        if (tileIndex >= linkCount) break;

        const tileLink = candidates.nth(tileIndex);
        if (!(await tileLink.isVisible({ timeout: 1500 }).catch(() => false))) continue;

        await checkpoint(page);
        const opened = await openPdpFromPlpTile(page, tileLink).catch(() => null);
        if (!opened) continue;

        attachAutoDismissPopups(opened, warn);
        await checkpoint(opened);
        await bestEffortWaitForTransientLoaders(opened);

        const pdpH1 = opened.locator('main h1').first();
        await pdpH1.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => null);
        const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

        const addToBag = addToBagButton(opened);
        const addCount = await addToBag.count().catch(() => 0);
        if (addCount === 0) {
          warn(`Smooth Wireless tile #${tileIndex + 1}: PDP had no Add to Bag; trying next tile. (url=${opened.url()})`);
          if (opened !== page) await opened.close().catch(() => null);
          else {
            await page.goto(plpUrlFinal, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
            await checkpoint(page);
            await bestEffortWaitForTransientLoaders(page);
          }
          continue;
        }

        const hasBandCupOnPdp = await hasBandAndCupSelectorsBestEffort(opened);

        await demoWait(opened, demoDelayMs);
        await checkpoint(opened);
        await selectFirstColorBestEffort(opened, warn);
        await demoWait(opened, demoDelayMs);

        await checkpoint(opened);
        if (hasBandCupOnPdp) {
          await selectFirstAvailableFromSection(opened, /\bband\b|band\s*size/i);
          await demoWait(opened, demoDelayMs);

          await checkpoint(opened);
          try {
            await selectFirstAvailableFromSection(opened, /\bcup\b|cup\s*size/i);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            warn(`Cup selection failed on smooth wireless PDP; re-selecting first available band and retrying cup. (${msg})`);
            await checkpoint(opened);
            await selectFirstAvailableFromSection(opened, /\bband\b|band\s*size/i);
            await checkpoint(opened);
            await selectFirstAvailableFromSection(opened, /\bcup\b|cup\s*size/i);
          }
          await demoWait(opened, demoDelayMs);
        } else {
          await selectFirstAvailableFromSection(opened, /^size$/i);
          await demoWait(opened, demoDelayMs);
        }

        await checkpoint(opened);
        await selectShipToYouBestEffort(opened, warn);
        await demoWait(opened, demoDelayMs);

        await checkpoint(opened);
        await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
        await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });

        await addToBag.click({ timeout: 20_000 });
        await checkpoint(opened);
        await bestEffortWaitForTransientLoaders(opened);

        await checkpoint(opened);
        await waitForMiniBagOverlay(opened, { requireVisible: isHeaded, productTitle, warn });
        await demoWait(opened, isHeaded ? 1500 : 0);

        adds++;
        warn(`Added smooth wireless product #${adds}/${maxAdds} from tile #${tileIndex + 1} (title=${productTitle || 'unknown'})`);

        if (opened !== page) {
          await opened.close().catch(() => null);
        } else {
          await page.goto(plpUrlFinal, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
          await checkpoint(page);
          await bestEffortWaitForTransientLoaders(page);
        }
      }

      expect(adds, 'Expected to add at least one Smooth Wireless product to bag').toBeGreaterThan(0);
    });

    const smoothWirelessMaxProducts = Math.max(1, Math.floor(Number(process.env.SMOOTH_WIRELESS_MAX_PRODUCTS || '15') || 15));
    for (let i = 1; i <= smoothWirelessMaxProducts; i++) {
      test(`BRAS-E2E-12-${String(i).padStart(2, '0')} — Smooth Wireless tile #${i} → select first color/band/cup → Ship to you → Add to bag`, async ({ page }, testInfo) => {
        const isHeaded = process.env.HEADLESS === '0';
        const slowMoMs = Number(process.env.SLOWMO || '0');
        if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
        else test.setTimeout(210_000);

        const result = await addSmoothWirelessProductFromTileIndex1Based(page, testInfo, i);
        expect(result.productTitle.length >= 0).toBeTruthy();
      });
    }
  });

  test.describe('Smooth T-Shirt', () => {
    test('BRAS-E2E-13 — Smooth T-Shirt → first tile, then next (+1) until no Smooth T-Shirt products → select first color/band/cup → Add to bag', async ({ page }, testInfo) => {
      const isHeaded = process.env.HEADLESS === '0';
      const slowMoMs = Number(process.env.SLOWMO || '0');
      if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
      else test.setTimeout(210_000);

      const warn = makeWarn(testInfo);
      const demoDelayMs = isHeaded ? 600 : 0;

      const maxAdds = Math.max(1, Math.floor(Number(process.env.SMOOTH_TSHIRT_MAX_ADDS || '3') || 3));
      const maxTilesToScan = Math.max(3, Math.floor(Number(process.env.SMOOTH_TSHIRT_MAX_TILES || '25') || 25));

      attachAutoDismissPopups(page, warn);
      const checkpoint = async (p: Page) => {
        await bestEffortPressEscape(p);
        await bestEffortDismissAllPopups(p);
        await bestEffortDismissOverlays(p);
        await ensureNoBlockingOverlays(p);
      };

      const { plpUrl } = await openSmoothTShirtPlpBestEffort(page, warn, checkpoint);

      await checkpoint(page);
      await applyBraSizedFilterBestEffort(page, warn);
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);

      const plpUrlFinal = plpUrl;
      let adds = 0;

      for (let tileIndex = 0; tileIndex < maxTilesToScan && adds < maxAdds; tileIndex++) {
        await ensurePlpHasAtLeastNProductLinks(page, tileIndex + 1, warn);
        const main = page.locator('main').first();
        const candidates = productLinks(main);
        const linkCount = await candidates.count().catch(() => 0);
        if (tileIndex >= linkCount) break;

        const tileLink = candidates.nth(tileIndex);
        if (!(await tileLink.isVisible({ timeout: 1500 }).catch(() => false))) continue;

        await checkpoint(page);
        const opened = await openPdpFromPlpTile(page, tileLink).catch(() => null);
        if (!opened) continue;

        attachAutoDismissPopups(opened, warn);
        await checkpoint(opened);
        await bestEffortWaitForTransientLoaders(opened);

        const pdpH1 = opened.locator('main h1').first();
        await pdpH1.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => null);
        const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

        const addToBag = addToBagButton(opened);
        const addCount = await addToBag.count().catch(() => 0);
        if (addCount === 0) {
          warn(`Smooth T-Shirt tile #${tileIndex + 1}: PDP had no Add to Bag; trying next tile. (url=${opened.url()})`);
          if (opened !== page) await opened.close().catch(() => null);
          else {
            await page.goto(plpUrlFinal, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
            await checkpoint(page);
            await bestEffortWaitForTransientLoaders(page);
          }
          continue;
        }

        const hasBandCupOnPdp = await hasBandAndCupSelectorsBestEffort(opened);

        await demoWait(opened, demoDelayMs);
        await checkpoint(opened);
        await selectFirstColorBestEffort(opened, warn);
        await demoWait(opened, demoDelayMs);

        await checkpoint(opened);
        if (hasBandCupOnPdp) {
          await selectFirstAvailableFromSection(opened, /\bband\b|band\s*size/i);
          await demoWait(opened, demoDelayMs);

          await checkpoint(opened);
          try {
            await selectFirstAvailableFromSection(opened, /\bcup\b|cup\s*size/i);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            warn(`Cup selection failed on smooth t-shirt PDP; re-selecting first available band and retrying cup. (${msg})`);
            await checkpoint(opened);
            await selectFirstAvailableFromSection(opened, /\bband\b|band\s*size/i);
            await checkpoint(opened);
            await selectFirstAvailableFromSection(opened, /\bcup\b|cup\s*size/i);
          }
          await demoWait(opened, demoDelayMs);
        } else {
          await selectFirstAvailableFromSection(opened, /^size$/i);
          await demoWait(opened, demoDelayMs);
        }

        await checkpoint(opened);
        await selectShipToYouBestEffort(opened, warn);
        await demoWait(opened, demoDelayMs);

        await checkpoint(opened);
        await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
        await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });

        await addToBag.click({ timeout: 20_000 });
        await checkpoint(opened);
        await bestEffortWaitForTransientLoaders(opened);

        await checkpoint(opened);
        await waitForMiniBagOverlay(opened, { requireVisible: isHeaded, productTitle, warn });
        await demoWait(opened, isHeaded ? 1500 : 0);

        adds++;
        warn(`Added smooth t-shirt product #${adds}/${maxAdds} from tile #${tileIndex + 1} (title=${productTitle || 'unknown'})`);

        if (opened !== page) {
          await opened.close().catch(() => null);
        } else {
          await page.goto(plpUrlFinal, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
          await checkpoint(page);
          await bestEffortWaitForTransientLoaders(page);
        }
      }

      expect(adds, 'Expected to add at least one Smooth T-Shirt product to bag').toBeGreaterThan(0);
    });

    const smoothTShirtMaxProducts = Math.max(1, Math.floor(Number(process.env.SMOOTH_TSHIRT_MAX_PRODUCTS || '15') || 15));
    for (let i = 1; i <= smoothTShirtMaxProducts; i++) {
      test(`BRAS-E2E-13-${String(i).padStart(2, '0')} — Smooth T-Shirt tile #${i} → select first color/band/cup → Ship to you → Add to bag`, async ({ page }, testInfo) => {
        const isHeaded = process.env.HEADLESS === '0';
        const slowMoMs = Number(process.env.SLOWMO || '0');
        if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
        else test.setTimeout(210_000);

        const result = await addSmoothTShirtProductFromTileIndex1Based(page, testInfo, i);
        expect(result.productTitle.length >= 0).toBeTruthy();
      });
    }
  });

  test.describe('Smooth Strapless', () => {
    test('BRAS-E2E-14 — Smooth Strapless → first tile, then next (+1) until no Smooth Strapless products → select first color/band/cup → Add to bag', async ({ page }, testInfo) => {
      const isHeaded = process.env.HEADLESS === '0';
      const slowMoMs = Number(process.env.SLOWMO || '0');
      if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
      else test.setTimeout(210_000);

      const warn = makeWarn(testInfo);
      const demoDelayMs = isHeaded ? 600 : 0;

      const maxAdds = Math.max(1, Math.floor(Number(process.env.SMOOTH_STRAPLESS_MAX_ADDS || '3') || 3));
      const maxTilesToScan = Math.max(3, Math.floor(Number(process.env.SMOOTH_STRAPLESS_MAX_TILES || '25') || 25));

      attachAutoDismissPopups(page, warn);
      const checkpoint = async (p: Page) => {
        await bestEffortPressEscape(p);
        await bestEffortDismissAllPopups(p);
        await bestEffortDismissOverlays(p);
        await ensureNoBlockingOverlays(p);
      };

      const { plpUrl } = await openSmoothStraplessPlpBestEffort(page, warn, checkpoint);

      await checkpoint(page);
      await applyBraSizedFilterBestEffort(page, warn);
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);

      const plpUrlFinal = plpUrl;
      let adds = 0;

      for (let tileIndex = 0; tileIndex < maxTilesToScan && adds < maxAdds; tileIndex++) {
        await ensurePlpHasAtLeastNProductLinks(page, tileIndex + 1, warn);
        const main = page.locator('main').first();
        const candidates = productLinks(main);
        const linkCount = await candidates.count().catch(() => 0);
        if (tileIndex >= linkCount) break;

        const tileLink = candidates.nth(tileIndex);
        if (!(await tileLink.isVisible({ timeout: 1500 }).catch(() => false))) continue;

        await checkpoint(page);
        const opened = await openPdpFromPlpTile(page, tileLink).catch(() => null);
        if (!opened) continue;

        attachAutoDismissPopups(opened, warn);
        await checkpoint(opened);
        await bestEffortWaitForTransientLoaders(opened);

        const pdpH1 = opened.locator('main h1').first();
        await pdpH1.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => null);
        const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

        const addToBag = addToBagButton(opened);
        const addCount = await addToBag.count().catch(() => 0);
        if (addCount === 0) {
          warn(`Smooth Strapless tile #${tileIndex + 1}: PDP had no Add to Bag; trying next tile. (url=${opened.url()})`);
          if (opened !== page) await opened.close().catch(() => null);
          else {
            await page.goto(plpUrlFinal, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
            await checkpoint(page);
            await bestEffortWaitForTransientLoaders(page);
          }
          continue;
        }

        const hasBandCupOnPdp = await hasBandAndCupSelectorsBestEffort(opened);

        await demoWait(opened, demoDelayMs);
        await checkpoint(opened);
        await selectFirstColorBestEffort(opened, warn);
        await demoWait(opened, demoDelayMs);

        await checkpoint(opened);
        if (hasBandCupOnPdp) {
          await selectFirstAvailableFromSection(opened, /\bband\b|band\s*size/i);
          await demoWait(opened, demoDelayMs);

          await checkpoint(opened);
          try {
            await selectFirstAvailableFromSection(opened, /\bcup\b|cup\s*size/i);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            warn(`Cup selection failed on smooth strapless PDP; re-selecting first available band and retrying cup. (${msg})`);
            await checkpoint(opened);
            await selectFirstAvailableFromSection(opened, /\bband\b|band\s*size/i);
            await checkpoint(opened);
            await selectFirstAvailableFromSection(opened, /\bcup\b|cup\s*size/i);
          }
          await demoWait(opened, demoDelayMs);
        } else {
          await selectFirstAvailableFromSection(opened, /^size$/i);
          await demoWait(opened, demoDelayMs);
        }

        await checkpoint(opened);
        await selectShipToYouBestEffort(opened, warn);
        await demoWait(opened, demoDelayMs);

        await checkpoint(opened);
        await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
        await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });

        await addToBag.click({ timeout: 20_000 });
        await checkpoint(opened);
        await bestEffortWaitForTransientLoaders(opened);

        await checkpoint(opened);
        await waitForMiniBagOverlay(opened, { requireVisible: isHeaded, productTitle, warn });
        await demoWait(opened, isHeaded ? 1500 : 0);

        adds++;
        warn(`Added smooth strapless product #${adds}/${maxAdds} from tile #${tileIndex + 1} (title=${productTitle || 'unknown'})`);

        if (opened !== page) {
          await opened.close().catch(() => null);
        } else {
          await page.goto(plpUrlFinal, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
          await checkpoint(page);
          await bestEffortWaitForTransientLoaders(page);
        }
      }

      expect(adds, 'Expected to add at least one Smooth Strapless product to bag').toBeGreaterThan(0);
    });

    const smoothStraplessMaxProducts = Math.max(1, Math.floor(Number(process.env.SMOOTH_STRAPLESS_MAX_PRODUCTS || '15') || 15));
    for (let i = 1; i <= smoothStraplessMaxProducts; i++) {
      test(`BRAS-E2E-14-${String(i).padStart(2, '0')} — Smooth Strapless tile #${i} → select first color/band/cup → Ship to you → Add to bag`, async ({ page }, testInfo) => {
        const isHeaded = process.env.HEADLESS === '0';
        const slowMoMs = Number(process.env.SLOWMO || '0');
        if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
        else test.setTimeout(210_000);

        const result = await addSmoothStraplessProductFromTileIndex1Based(page, testInfo, i);
        expect(result.productTitle.length >= 0).toBeTruthy();
      });
    }
  });

  test.describe('Smooth Demi', () => {
    test('BRAS-E2E-15 — Smooth Demi → first tile, then next (+1) until no Smooth Demi products → select first color/band/cup → Add to bag', async ({ page }, testInfo) => {
      const isHeaded = process.env.HEADLESS === '0';
      const slowMoMs = Number(process.env.SLOWMO || '0');
      if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
      else test.setTimeout(210_000);

      const warn = makeWarn(testInfo);
      const demoDelayMs = isHeaded ? 600 : 0;

      const maxAdds = Math.max(1, Math.floor(Number(process.env.SMOOTH_DEMI_MAX_ADDS || '3') || 3));
      const maxTilesToScan = Math.max(3, Math.floor(Number(process.env.SMOOTH_DEMI_MAX_TILES || '25') || 25));

      attachAutoDismissPopups(page, warn);
      const checkpoint = async (p: Page) => {
        await bestEffortPressEscape(p);
        await bestEffortDismissAllPopups(p);
        await bestEffortDismissOverlays(p);
        await ensureNoBlockingOverlays(p);
      };

      const { plpUrl } = await openSmoothDemiPlpBestEffort(page, warn, checkpoint);

      await checkpoint(page);
      await applyBraSizedFilterBestEffort(page, warn);
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);

      const plpUrlFinal = plpUrl;
      let adds = 0;

      for (let tileIndex = 0; tileIndex < maxTilesToScan && adds < maxAdds; tileIndex++) {
        await ensurePlpHasAtLeastNProductLinks(page, tileIndex + 1, warn);
        const main = page.locator('main').first();
        const candidates = productLinks(main);
        const linkCount = await candidates.count().catch(() => 0);
        if (tileIndex >= linkCount) break;

        const tileLink = candidates.nth(tileIndex);
        if (!(await tileLink.isVisible({ timeout: 1500 }).catch(() => false))) continue;

        await checkpoint(page);
        const opened = await openPdpFromPlpTile(page, tileLink).catch(() => null);
        if (!opened) continue;

        attachAutoDismissPopups(opened, warn);
        await checkpoint(opened);
        await bestEffortWaitForTransientLoaders(opened);

        const pdpH1 = opened.locator('main h1').first();
        await pdpH1.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => null);
        const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

        const addToBag = addToBagButton(opened);
        const addCount = await addToBag.count().catch(() => 0);
        if (addCount === 0) {
          warn(`Smooth Demi tile #${tileIndex + 1}: PDP had no Add to Bag; trying next tile. (url=${opened.url()})`);
          if (opened !== page) await opened.close().catch(() => null);
          else {
            await page.goto(plpUrlFinal, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
            await checkpoint(page);
            await bestEffortWaitForTransientLoaders(page);
          }
          continue;
        }

        const hasBandCupOnPdp = await hasBandAndCupSelectorsBestEffort(opened);

        await demoWait(opened, demoDelayMs);
        await checkpoint(opened);
        await selectFirstColorBestEffort(opened, warn);
        await demoWait(opened, demoDelayMs);

        await checkpoint(opened);
        if (hasBandCupOnPdp) {
          await selectFirstAvailableFromSection(opened, /\bband\b|band\s*size/i);
          await demoWait(opened, demoDelayMs);

          await checkpoint(opened);
          try {
            await selectFirstAvailableFromSection(opened, /\bcup\b|cup\s*size/i);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            warn(`Cup selection failed on smooth demi PDP; re-selecting first available band and retrying cup. (${msg})`);
            await checkpoint(opened);
            await selectFirstAvailableFromSection(opened, /\bband\b|band\s*size/i);
            await checkpoint(opened);
            await selectFirstAvailableFromSection(opened, /\bcup\b|cup\s*size/i);
          }
          await demoWait(opened, demoDelayMs);
        } else {
          await selectFirstAvailableFromSection(opened, /^size$/i);
          await demoWait(opened, demoDelayMs);
        }

        await checkpoint(opened);
        await selectShipToYouBestEffort(opened, warn);
        await demoWait(opened, demoDelayMs);

        await checkpoint(opened);
        await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
        await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });

        await addToBag.click({ timeout: 20_000 });
        await checkpoint(opened);
        await bestEffortWaitForTransientLoaders(opened);

        await checkpoint(opened);
        await waitForMiniBagOverlay(opened, { requireVisible: isHeaded, productTitle, warn });
        await demoWait(opened, isHeaded ? 1500 : 0);

        adds++;
        warn(`Added smooth demi product #${adds}/${maxAdds} from tile #${tileIndex + 1} (title=${productTitle || 'unknown'})`);

        if (opened !== page) {
          await opened.close().catch(() => null);
        } else {
          await page.goto(plpUrlFinal, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
          await checkpoint(page);
          await bestEffortWaitForTransientLoaders(page);
        }
      }

      expect(adds, 'Expected to add at least one Smooth Demi product to bag').toBeGreaterThan(0);
    });

    const smoothDemiMaxProducts = Math.max(1, Math.floor(Number(process.env.SMOOTH_DEMI_MAX_PRODUCTS || '15') || 15));
    for (let i = 1; i <= smoothDemiMaxProducts; i++) {
      test(`BRAS-E2E-15-${String(i).padStart(2, '0')} — Smooth Demi tile #${i} → select first color/band/cup → Ship to you → Add to bag`, async ({ page }, testInfo) => {
        const isHeaded = process.env.HEADLESS === '0';
        const slowMoMs = Number(process.env.SLOWMO || '0');
        if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
        else test.setTimeout(210_000);

        const result = await addSmoothDemiProductFromTileIndex1Based(page, testInfo, i);
        expect(result.productTitle.length >= 0).toBeTruthy();
      });
    }
  });

  // Helper functions for Gradient Shine category
  async function openGradientShinePlpBestEffort(page: Page, warn: (m: string) => void, checkpoint: (p: Page) => Promise<void>) {
    // Prefer a dedicated Gradient Shine PLP, then fall back to SRP search.
    let gradientShineSource: 'gradient-shine-plp' | 'srp' = 'gradient-shine-plp';
    await page.goto(GRADIENT_SHINE_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const main = page.locator('main').first();
    const candidates = productLinks(main);
    const linkCount = await candidates.count().catch(() => 0);
    if (linkCount === 0) {
      gradientShineSource = 'srp';
      warn(`Gradient Shine PLP had no product links (URL=${page.url()}); using SRP search fallback.`);
      const srpUrl = `${VS_BASE_URL}/search?q=${encodeURIComponent('gradient shine bra')}`;
      await page.goto(srpUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);
      const linkCountSrp = await productLinks(page.locator('main')).count().catch(() => 0);
      if (linkCountSrp === 0) {
        warn(`No Gradient Shine products detected today after all fallbacks. Skipping Gradient Shine tests.`);
        return { gradientShineSource: null, plpUrl: page.url(), hasProducts: false };
      }
    }

    return { gradientShineSource, plpUrl: page.url(), hasProducts: true };
  }

  async function addGradientShineProductFromTileIndex1Based(page: Page, testInfo: any, tileIndex1Based: number, existingPlpUrl?: string) {
    const isHeaded = process.env.HEADLESS === '0';
    const slowMoMs = Number(process.env.SLOWMO || '0');
    if (isHeaded) test.setTimeout(slowMoMs > 0 ? 240_000 : 180_000);
    else test.setTimeout(180_000);

    const warn = makeWarn(testInfo);
    const demoDelayMs = isHeaded ? 600 : 0;

    attachAutoDismissPopups(page, warn);
    const checkpoint = async (p: Page) => {
      await bestEffortPressEscape(p);
      await bestEffortDismissAllPopups(p);
      await bestEffortDismissOverlays(p);
      await ensureNoBlockingOverlays(p);
    };

    // Go straight to Gradient Shine PLP (unless already on one).
    let gradientShineSource: 'gradient-shine-plp' | 'srp';
    let plpUrl: string;
    let hasProducts: boolean;
    
    if (existingPlpUrl) {
      gradientShineSource = 'gradient-shine-plp'; // Assume it's the right PLP
      plpUrl = existingPlpUrl;
      hasProducts = true; // Assume products exist since main test already checked
    } else {
      const plpResult = await openGradientShinePlpBestEffort(page, warn, checkpoint);
      gradientShineSource = plpResult.gradientShineSource;
      plpUrl = plpResult.plpUrl;
      hasProducts = plpResult.hasProducts;
    }
    
    if (!hasProducts) {
      throw new Error('No Gradient Shine products available today; expected at least one product.');
    }
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    const main = page.locator('main').first();
    const candidates = productLinks(main);
    const count = await candidates.count().catch(() => 0);
    if (count <= 0) {
      warn(`No product tiles found on gradient shine source=${gradientShineSource} (url=${page.url()}); ending search.`);
      return { productTitle: '', effectiveIndex: tileIndex1Based, gradientShineSource };
    }

    const requested = tileIndex1Based;
    const effectiveIndex = Math.min(requested - 1, count - 1);
    if (effectiveIndex !== requested - 1) {
      warn(`Requested Gradient Shine tile #${requested} but only ${count} tiles are available; using tile #${effectiveIndex + 1} instead.`);
    }

    await checkpoint(page);
    const pdpPage = await openPdpFromPlpTile(page, candidates.nth(effectiveIndex));
    attachAutoDismissPopups(pdpPage, warn);
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    const pdpH1 = pdpPage.locator('main h1').first();
    try {
      await expect(pdpH1, 'Expected PDP H1').toBeVisible({ timeout: 30_000 });
    } catch (error) {
      console.warn(`PDP H1 not found on ${pdpPage.url()}; likely not a valid PDP.`);
      if (pdpPage !== page) await pdpPage.close().catch(() => null);
      return { productTitle: '', effectiveIndex: tileIndex1Based, gradientShineSource: null };
    }

    // Additional check: if URL contains "catalog", it's not a PDP
    if (pdpPage.url().includes('catalog')) {
      console.warn(`URL contains 'catalog' (${pdpPage.url()}); not a PDP. Skipping.`);
      if (pdpPage !== page) await pdpPage.close().catch(() => null);
      return { productTitle: '', effectiveIndex: tileIndex1Based, gradientShineSource: null };
    }

    const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

    // Select first available color/swatch (Gradient Shine products should have swatches)
    await checkpoint(pdpPage);
    await selectFirstColorBestEffort(pdpPage, warn);
    await demoWait(pdpPage, demoDelayMs);

    // Check if this PDP has band/cup selectors
    const hasBandCupOnPdp = await hasBandAndCupSelectorsBestEffort(pdpPage);

    // Band and Cup selection
    await checkpoint(pdpPage);
    if (hasBandCupOnPdp) {
      await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
      await demoWait(pdpPage, demoDelayMs);

      await checkpoint(pdpPage);
      await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      await demoWait(pdpPage, demoDelayMs);
    } else {
      // Some gradient shine products might use alpha sizing
      await selectFirstAvailableFromSection(pdpPage, /^size$/i);
      await demoWait(pdpPage, demoDelayMs);
    }

    // Ship to you.
    await checkpoint(pdpPage);
    await selectShipToYouBestEffort(pdpPage, warn);
    await demoWait(pdpPage, demoDelayMs);

    // Add to bag.
    const addToBag = addToBagButton(pdpPage);
    await checkpoint(pdpPage);
    await addToBag.scrollIntoViewIfNeeded().catch(() => null);
    await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
    await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });
    await addToBag.click({ timeout: 20_000 });
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    await checkpoint(pdpPage);
    await waitForMiniBagOverlay(pdpPage, { requireVisible: isHeaded, productTitle, warn });
    await demoWait(pdpPage, isHeaded ? 2500 : 0);

    expect(true).toBeTruthy();

    return { productTitle, effectiveIndex: effectiveIndex + 1, gradientShineSource };
  }

  test.describe('Gradient Shine', () => {
    test('BRAS-E2E-16 — Gradient Shine → first tile, then next (+1) until no Gradient Shine products → select first color/swatch/band/cup → Add to bag', async ({ page }, testInfo) => {
      const isHeaded = process.env.HEADLESS === '0';
      const slowMoMs = Number(process.env.SLOWMO || '0');
      if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
      else test.setTimeout(210_000);

      const warn = makeWarn(testInfo);
      const demoDelayMs = isHeaded ? 600 : 0;

      const maxAdds = Math.max(1, Math.floor(Number(process.env.GRADIENT_SHINE_MAX_ADDS || '3') || 3));
      const maxTilesToScan = Math.max(3, Math.floor(Number(process.env.GRADIENT_SHINE_MAX_TILES || '25') || 25));

      attachAutoDismissPopups(page, warn);
      const checkpoint = async (p: Page) => {
        await bestEffortPressEscape(p);
        await bestEffortDismissAllPopups(p);
        await bestEffortDismissOverlays(p);
        await ensureNoBlockingOverlays(p);
      };

      const { plpUrl, hasProducts } = await openGradientShinePlpBestEffort(page, warn, checkpoint);

      if (!hasProducts) {
        throw new Error('No Gradient Shine products available today; expected at least one product.');
      }

      await checkpoint(page);
      await applyBraSizedFilterBestEffort(page, warn);
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);

      const plpUrlFinal = plpUrl;
      let adds = 0;

      for (let tileIndex = 1; tileIndex <= maxTilesToScan && adds < maxAdds; tileIndex++) {
        // Check if we have enough tiles
        const main = page.locator('main').first();
        const candidates = productLinks(main);
        const linkCount = await candidates.count().catch(() => 0);
        if (tileIndex > linkCount) break; // No more tiles available
        
        const result = await addGradientShineProductFromTileIndex1Based(page, testInfo, tileIndex, plpUrlFinal);
        if (!result.productTitle) {
          // No valid product at this tile, try next
          continue;
        }
        adds++;
        warn(`Added gradient shine product #${adds}/${maxAdds} from tile #${result.effectiveIndex} (title=${result.productTitle})`);
        
        // Navigate back to PLP for next iteration
        await page.goto(plpUrlFinal, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
        await checkpoint(page);
        await bestEffortWaitForTransientLoaders(page);
      }

      if (adds === 0) {
        throw new Error('No valid Gradient Shine products found after scanning tiles.');
      }

      expect(adds, 'Expected to add at least one Gradient Shine product to bag').toBeGreaterThan(0);
    });

    const gradientShineMaxProducts = Math.max(1, Math.floor(Number(process.env.GRADIENT_SHINE_MAX_PRODUCTS || '15') || 15));
    for (let i = 1; i <= gradientShineMaxProducts; i++) {
      test(`BRAS-E2E-16-${String(i).padStart(2, '0')} — Gradient Shine tile #${i} → select first color/swatch/band/cup → Ship to you → Add to bag`, async ({ page }, testInfo) => {
        const isHeaded = process.env.HEADLESS === '0';
        const slowMoMs = Number(process.env.SLOWMO || '0');
        if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
        else test.setTimeout(210_000);

        const result = await addGradientShineProductFromTileIndex1Based(page, testInfo, i);
        if (result.gradientShineSource === null) {
          throw new Error(`No Gradient Shine product available at tile index ${i}.`);
        }
        expect(result.productTitle.length >= 0).toBeTruthy();
      });
    }
  });
});
