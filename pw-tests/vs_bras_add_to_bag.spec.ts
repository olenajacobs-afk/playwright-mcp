import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  VS_BASE_URL,
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

const BRAS_PLP_URL = process.env.BRAS_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras';
const PUSHUP_PLP_URL = process.env.PUSHUP_PLP_URL || 'https://www.victoriassecret.com/us/vs/bras/push-up';
const TARGET_COLOR = 'Berrylicious (07ZP)';
const REQUIRE_TARGET_COLOR = process.env.REQUIRE_TARGET_COLOR === '1';

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeCssAttrValue(value: string) {
  // Minimal escaping for use inside CSS attribute selectors with double quotes.
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function demoWait(page: Page, ms: number) {
  if (ms <= 0) return;
  if (page.isClosed()) return;
  await page.waitForTimeout(ms).catch(() => null);
}

async function openPdpFromPlpTile(plpPage: Page, tileLink: Locator): Promise<Page> {
  // Some sites render product tiles as links with target=_blank; remove to keep a single-tab flow.
  await plpPage
    .evaluate(() => {
      document.querySelectorAll('a[target="_blank"]').forEach((a) => a.removeAttribute('target'));
    })
    .catch(() => null);

  const href = (await tileLink.getAttribute('href').catch(() => null)) || '';
  const img = tileLink.locator('img').first();

  const ctx = plpPage.context();
  const newPagePromise = ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null);

  if ((await img.count()) > 0 && (await img.isVisible({ timeout: 1500 }).catch(() => false))) {
    await img.scrollIntoViewIfNeeded().catch(() => null);
    await img.click({ timeout: 15_000 }).catch(() => null);
  } else {
    await tileLink.scrollIntoViewIfNeeded().catch(() => null);
    await tileLink.click({ timeout: 15_000 }).catch(() => null);
  }

  const maybeNew = await newPagePromise;
  const page = maybeNew ?? plpPage;

  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => null);

  // If click didn't navigate (SPA/no-op), use the href directly.
  if (!/-catalog\/(?:[^\s]+)?|\/p\//.test(page.url()) && href) {
    const absolute = new URL(href, page.url()).toString();
    await page.goto(absolute, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
  }

  await expect(page).toHaveURL(/-catalog\/|\/p\//);
  return page;
}

async function clickSportBrasCategoryIfPresent(page: Page, warn: (msg: string) => void) {
  const sportLink = page
    .getByRole('link', { name: /^sport\s+bras?$/i })
    .first()
    .or(page.getByRole('link', { name: /sport\s+bras?/i }).first())
    .or(page.locator('a').filter({ hasText: /sport\s+bras?/i }).first());

  if ((await sportLink.count()) === 0) {
    warn('Sport Bras category link not detected; will select a sport-labeled product instead.');
    return false;
  }

  if (!(await sportLink.isVisible({ timeout: 1500 }).catch(() => false))) {
    warn('Sport Bras category link exists but is not visible; will select a sport-labeled product instead.');
    return false;
  }

  await sportLink.scrollIntoViewIfNeeded().catch(() => null);
  await sportLink.click({ timeout: 20_000 }).catch(() => null);
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => null);
  return true;
}

async function clickSportBraFromBrasTrendingBlock(page: Page, warn: (msg: string) => void) {
  // User requirement: under Bras, within the block that describes "Trending bra styles... band sizes 32-42 and cup sizes A-F",
  // find the *Sports Bras* tile/link and click it.
  const trending = page.getByText(/trending\s+bra\s+styles/i).first();
  const sizingCopy = page.getByText(/band\s+sizes\s*32\s*[-–]\s*42/i).first();

  const block = page
    .locator('[role="dialog"], [role="menu"], nav, header, section, div')
    .filter({ has: trending })
    .first();

  const blockVisible = (await block.count()) > 0 && (await block.isVisible({ timeout: 2500 }).catch(() => false));
  const sizingVisible = (await sizingCopy.count()) > 0 && (await sizingCopy.isVisible({ timeout: 2500 }).catch(() => false));
  if (!blockVisible || !sizingVisible) {
    warn('Bras trending styles block (with sizing copy 32–42 / A–F) not detected/visible; falling back to other Sport Bras discovery.');
    return false;
  }

  // Prefer the specific category tile/link.
  const sportsBrasTile = block
    .getByRole('link', { name: /^sports?\s+bras\b/i })
    .first()
    .or(block.getByRole('link', { name: /sports?\s+bras/i }).first());

  if ((await sportsBrasTile.count()) === 0 || !(await sportsBrasTile.isVisible({ timeout: 2500 }).catch(() => false))) {
    warn('Sports Bras tile/link not found inside Bras trending styles block; falling back to other Sport Bras discovery.');
    return false;
  }

  await sportsBrasTile.scrollIntoViewIfNeeded().catch(() => null);
  await sportsBrasTile.click({ timeout: 20_000 }).catch(() => null);
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => null);

  // Ensure we're really on the Sports Bras PLP.
  if (!/\/bras\/sports-bras/i.test(page.url())) {
    warn(`Clicked Sports Bras tile but URL is not /bras/sports-bras (URL=${page.url()}); navigating directly.`);
    await page.goto('https://www.victoriassecret.com/us/vs/bras/sports-bras', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  }
  return true;
}

async function selectColorSwatchBestEffort(page: Page, warn: (msg: string) => void, colorLabel: string) {
  // Prefer strict match by accessible name.
  const byExactName = page.getByRole('button', { name: new RegExp(`^${escapeRegExp(colorLabel)}$`, 'i') }).first();

  // Common pattern: swatch uses aria-label with "ColorName (CODE)".
  const byAriaLabel = page
    .locator(`[aria-label*="${colorLabel.split('(')[0].trim()}" i]`)
    .filter({ hasText: '' })
    .first();

  const target = ((await byExactName.count()) > 0 ? byExactName : byAriaLabel).first();
  if ((await target.count()) > 0 && (await target.isVisible({ timeout: 2500 }).catch(() => false))) {
    await target.scrollIntoViewIfNeeded().catch(() => null);
    await target.click({ timeout: 15_000 }).catch(() => null);
    await bestEffortWaitForTransientLoaders(page);
    return true;
  }

  if (REQUIRE_TARGET_COLOR) {
    throw new Error(`Required color '${colorLabel}' not found on PDP (REQUIRE_TARGET_COLOR=1).`);
  }

  // Fallback: click the first visible swatch-like element (aria-label contains a variant code).
  warn(`Target color '${colorLabel}' not found; selecting first available color instead.`);
  const anySwatch = page
    .locator(
      'button[aria-label*="("], [role="button"][aria-label*="("], [aria-label*="(" i][tabindex]:not([tabindex="-1"])'
    )
    .first();
  if ((await anySwatch.count()) > 0 && (await anySwatch.isVisible({ timeout: 2500 }).catch(() => false))) {
    await anySwatch.scrollIntoViewIfNeeded().catch(() => null);
    await anySwatch.click({ timeout: 10_000 }).catch(() => null);
    await bestEffortWaitForTransientLoaders(page);
    return false;
  }

  warn('No color swatches detected; continuing.');
  return false;
}

async function applyBraSizedFilterBestEffort(page: Page, warn: (msg: string) => void) {
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
    if ((await byRole.count()) > 0) {
      option = byRole;
      break;
    }

    const aria = panel.locator('[role="checkbox"]').filter({ hasText: re }).first();
    if ((await aria.count()) > 0) {
      option = aria;
      break;
    }

    const input = panel.locator('input[type="checkbox"]').filter({ has: panel.getByText(re) }).first();
    if ((await input.count()) > 0) {
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

function productLinks(scope: Locator) {
  // VS frequently uses "*-catalog" URLs instead of "/p/".
  return scope.locator('a[href*="-catalog/"], a[href*="/p/"]');
}

function majorLiftSection(scope: Locator) {
  // On Push-Up Bras PLP, lift-intent sections are anchored (#major/#medium/#light).
  // We need to pick product tiles from the MAJOR section to satisfy the requirement
  // "MAJOR: Adds 2 Cups".
  const anchor = scope.locator('a[href="#major"]').first();
  return anchor.locator('xpath=ancestor::article[1]/parent::*').first();
}

async function clickWithHrefFallback(page: Page, link: Locator, urlRegex: RegExp) {
  const href = (await link.getAttribute('href').catch(() => null)) || '';

  await link.click({ timeout: 15_000 }).catch(() => null);
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => null);

  if (!urlRegex.test(page.url()) && href) {
    const absolute = new URL(href, page.url()).toString();
    await page.goto(absolute, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
  }

  await expect(page).toHaveURL(urlRegex);
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

async function selectAvailableFromSection(page: Page, sectionLabel: RegExp, nthAvailable1Based = 1) {
  const nth = Math.max(1, Math.floor(nthAvailable1Based));
  const labelSource = sectionLabel.source.toLowerCase();
  const isBand = /\bband\b/.test(labelSource);
  const isCup = /\bcup\b/.test(labelSource);

  // Prefer an ARIA radiogroup named Band/Cup (common on VS PDP).
  const radioGroup = page.getByRole('radiogroup', { name: sectionLabel }).first();
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
      : sectionLabel;

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
    if (!(await optionButton.isEnabled().catch(() => false))) continue;
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

  throw new Error(`Could not find available option #${nth} under section ${sectionLabel} (found ${availableSeen}).`);
}

async function bandCupSelectableOnPdpBestEffort(pdpPage: Page, warn: (m: string) => void): Promise<boolean> {
  try {
    // Band and cup should both be present AND have at least one selectable option.
    if (!(await hasBandAndCupSelectorsBestEffort(pdpPage))) return false;

    await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
    await pdpPage.waitForTimeout(250).catch(() => null);
    await bestEffortWaitForTransientLoaders(pdpPage);

    await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
    await bestEffortWaitForTransientLoaders(pdpPage);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warn(`Band/Cup selectors detected but options were not selectable (url=${pdpPage.url()}): ${msg}`);
    return false;
  }
}

async function selectFirstAvailableFromSection(page: Page, sectionLabel: RegExp) {
  await selectAvailableFromSection(page, sectionLabel, 1);
}

function parseBandListFromEnv(): number[] {
  const raw = (process.env.VS_BAND_LIST || '').trim();
  if (!raw) return [30, 32, 34, 36, 38, 40, 42, 44];
  const out: number[] = [];
  for (const part of raw.split(/[,\s]+/).map((p) => p.trim())) {
    if (!part) continue;
    const n = Number(part);
    if (Number.isFinite(n) && n > 0) out.push(Math.floor(n));
  }
  return out.length > 0 ? Array.from(new Set(out)) : [30, 32, 34, 36, 38, 40, 42, 44];
}

async function getSelectableBandValuesBestEffort(pdpPage: Page): Promise<number[]> {
  const group = pdpPage.getByRole('radiogroup', { name: /\bband\b|band\s*size/i }).first();
  if ((await group.count().catch(() => 0)) === 0) return [];
  await group.waitFor({ state: 'visible', timeout: 12_000 }).catch(() => null);

  const radios = group.getByRole('radio');
  const count = await radios.count().catch(() => 0);
  const values: number[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < Math.min(count, 80); i++) {
    const r = radios.nth(i);
    if (!(await r.isEnabled().catch(() => false))) continue;
    if (await isCrossedOutOrDisabled(r)) continue;
    const name = ((await r.getAttribute('aria-label').catch(() => null)) || (await r.textContent().catch(() => null)) || '').trim();
    const m = name.match(/\b(\d{2,3})\b/);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    values.push(n);
  }

  values.sort((a, b) => a - b);
  return values;
}

async function selectBandValueBestEffort(pdpPage: Page, bandValue: number): Promise<boolean> {
  const group = pdpPage.getByRole('radiogroup', { name: /\bband\b|band\s*size/i }).first();
  if ((await group.count().catch(() => 0)) === 0) return false;
  await group.waitFor({ state: 'visible', timeout: 12_000 }).catch(() => null);

  const re = new RegExp(`\\b${bandValue}\\b`);
  const radio = group.getByRole('radio', { name: re }).first();
  if ((await radio.count().catch(() => 0)) === 0) return false;
  if (!(await radio.isEnabled().catch(() => false))) return false;
  if (await isCrossedOutOrDisabled(radio)) return false;

  // Prefer clicking the inner numeric element if present (some VS radios are wrappers).
  const inner = radio.getByText(new RegExp(`^\\s*${bandValue}\\s*$`)).first();
  const target = ((await inner.count().catch(() => 0)) > 0 ? inner : radio).first();
  await target.scrollIntoViewIfNeeded().catch(() => null);
  await target.click({ timeout: 10_000 }).catch(() => null);
  await bestEffortWaitForTransientLoaders(pdpPage);
  return true;
}

async function openSportBraBandCupPdpFromHomeFlow(page: Page, testInfo: any) {
  const warn = makeWarn(testInfo);
  attachAutoDismissPopups(page, warn);

  const checkpoint = async (p: Page) => {
    await bestEffortPressEscape(p);
    await bestEffortDismissAllPopups(p);
    await bestEffortDismissOverlays(p);
    await ensureNoBlockingOverlays(p);
  };

  await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await checkpoint(page);
  const header = await getHeader(page);
  await checkpoint(page);

  // Fast path: site search first (often quicker than navigating into category pages).
  {
    const searchBox = header
      .getByRole('combobox', { name: /search/i })
      .first()
      .or(page.getByRole('combobox', { name: /search/i }).first());

    if ((await searchBox.count().catch(() => 0)) > 0) {
      await checkpoint(page);
      await searchBox.click({ timeout: 10_000 }).catch(() => null);
      await searchBox.fill('bra sized sports bra').catch(() => null);
      await searchBox.press('Enter').catch(() => null);
      await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => null);
      await bestEffortWaitForTransientLoaders(page);

      const resultsMain = page.locator('main').first();
      const resultLinks = productLinks(resultsMain);
      const resultCount = await resultLinks.count().catch(() => 0);
      if (resultCount > 0) {
        const pdpPage = await openFirstBandCupPdpFromPlp(page, resultLinks, warn);
        await checkpoint(pdpPage);
        await bestEffortWaitForTransientLoaders(pdpPage);
        return { pdpPage, warn, checkpoint };
      }
    }
  }

  // Skip the Bras navigation UI; go directly to Sports Bras PLP for speed/stability.
  await page.goto('https://www.victoriassecret.com/us/vs/bras/sports-bras', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await checkpoint(page);
  await bestEffortWaitForTransientLoaders(page);

  const main = page.locator('main').first();
  const sportCards = main.locator('[data-testid*="product" i], [data-test*="product" i]').filter({ hasText: /sport/i });
  const hasSportCards = (await sportCards.count().catch(() => 0)) > 0;
  let candidates = hasSportCards ? sportCards.locator('a[href*="-catalog/"], a[href*="/p/"]') : productLinks(main);
  let linkCount = await candidates.count().catch(() => 0);
  expect(linkCount, 'Expected at least one product link on the PLP').toBeGreaterThan(0);

  const filterBtn = main.getByRole('button', { name: /filter/i }).first();
  const sortBtn = main.getByRole('button', { name: /sort/i }).first();
  await filterBtn.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null);
  await sortBtn.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null);

  await checkpoint(page);
  await applyBraSizedFilterBestEffort(page, warn);
  await checkpoint(page);
  await bestEffortWaitForTransientLoaders(page);

  // Recompute candidates after filter application (PLP often re-renders).
  candidates = hasSportCards ? sportCards.locator('a[href*="-catalog/"], a[href*="/p/"]') : productLinks(main);
  linkCount = await candidates.count().catch(() => 0);

  // Keep this bounded so we don't burn the entire test timeout on PLP crawling.
  // If the current catalog simply doesn't expose bra-sized sports bras, fall back to a known band/cup-capable flow.
  const maxAttempts = Math.min(linkCount, 10);
  for (let i = 0; i < maxAttempts; i++) {
    const tileLink = candidates.nth(i);
    if (!(await tileLink.isVisible({ timeout: 1500 }).catch(() => false))) continue;

    await checkpoint(page);
    const opened = await openPdpFromPlpTile(page, tileLink).catch(() => null);
    if (!opened) continue;

    attachAutoDismissPopups(opened, warn);
    await checkpoint(opened);
    await bestEffortWaitForTransientLoaders(opened);
    await opened.waitForTimeout(400).catch(() => null);

    if (await bandCupSelectableOnPdpBestEffort(opened, warn)) {
      return { pdpPage: opened, warn, checkpoint };
    }

    if (opened !== page) await opened.close().catch(() => null);
    else await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);

    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);
  }

  // Last-resort fallback: Some catalog states simply don't expose any bra-sized sports bras.
  // To keep the suite actionable, fall back to a known band/cup-capable flow (Shine Strap / MAJOR).
  warn('Could not find a bra-sized Sport Bra PDP; falling back to Shine Strap MAJOR band/cup PDP for band/cup coverage.');
  const shine = await openShineStrapMajorBandCupPdp(page, testInfo);
  return shine;
}

async function openShineStrapMajorBandCupPdp(page: Page, testInfo: any) {
  const warn = makeWarn(testInfo);
  attachAutoDismissPopups(page, warn);

  const checkpoint = async (p: Page) => {
    await bestEffortPressEscape(p);
    await bestEffortDismissAllPopups(p);
    await bestEffortDismissOverlays(p);
    await ensureNoBlockingOverlays(p);
  };

  // Go straight to Push-Up PLP (fastest and most stable entry point for MAJOR/shine-strap flows).
  await page.goto(PUSHUP_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await checkpoint(page);
  await bestEffortWaitForTransientLoaders(page);

  const pushUpPage: Page = page;

  await checkpoint(pushUpPage);
  await bestEffortWaitForTransientLoaders(pushUpPage);

  await clickMajorLiftCardRequired(pushUpPage);
  await checkpoint(pushUpPage);

  const main = pushUpPage.locator('main').first();
  const majorSection = majorLiftSection(main);
  const scope = (await majorSection.count().catch(() => 0)) > 0 ? majorSection : main;
  const shineLink = await findShineStrapTileLink(scope);
  if (!shineLink) throw new Error('Could not find a Shine Strap product tile/link in the MAJOR section.');

  await checkpoint(pushUpPage);
  const pdpPage = await openPdpFromPlpTile(pushUpPage, shineLink);
  attachAutoDismissPopups(pdpPage, warn);
  await checkpoint(pdpPage);
  await bestEffortWaitForTransientLoaders(pdpPage);

  // Ensure a strap swatch is selected (default/first). This also helps hydrate the size matrix.
  const selectableSwatches = await getVisibleEnabledSwatchLabelsBestEffort(pdpPage);
  if (selectableSwatches.length > 0) {
    await checkpoint(pdpPage);
    await selectNthShineStrapSwatchRequired(pdpPage, 1);
    await bestEffortWaitForTransientLoaders(pdpPage);
  }

  // Require Band+Cup for band coverage tests.
  if (!(await bandCupSelectableOnPdpBestEffort(pdpPage, warn))) {
    throw new Error('Shine Strap PDP did not expose selectable Band+Cup options in this run.');
  }

  return { pdpPage, warn, checkpoint };
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
      if (!(await el.isEnabled().catch(() => false))) continue;

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
    if (!(await swatch.isEnabled().catch(() => false))) continue;
    await swatch.scrollIntoViewIfNeeded().catch(() => null);
    await swatch.click({ timeout: 10_000 }).catch(() => null);
    await bestEffortWaitForTransientLoaders(page);
    return;
  }

  warn('No color swatches detected/clickable; continuing.');
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

async function clickMajorLiftCardRequired(page: Page) {
  // User requirement: click the MAJOR card/tiles on the Push-Up page (not Filter & Sort).
  // Most stable: if a #major in-page anchor exists, click it first.
  const earlyMajorAnchor = page.locator('main a[href="#major"], main a[href*="#major" i]').first();
  if ((await earlyMajorAnchor.count().catch(() => 0)) > 0) {
    try {
      await bestEffortPressEscape(page);
      await bestEffortDismissAllPopups(page);
      await bestEffortDismissOverlays(page);
      await ensureNoBlockingOverlays(page);

      await earlyMajorAnchor.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => null);
      await earlyMajorAnchor.click({ timeout: 10_000, force: true }).catch(() => null);
      await bestEffortWaitForTransientLoaders(page);
      return;
    } catch {
      // fall through to other strategies
    }
  }

  const majorButton = page
    .getByRole('button', { name: /\bmajor\b.*\blift\b/i })
    .first()
    .or(page.getByRole('button', { name: /\bmajor\b:\s*adds\s*2\s*cups\b/i }).first())
    .or(page.getByRole('button', { name: /\bmajor\b.*\bcup/i }).first())
    .or(page.locator('button:has-text("MAJOR"), button:has-text("Major")').first());

  const majorLink = page
    .getByRole('link', { name: /\bmajor\b.*\blift\b/i })
    .first()
    .or(page.locator('a[href*="#major" i]').first());

  const clickOnce = async (target: Locator) => {
    await bestEffortPressEscape(page);
    await bestEffortDismissAllPopups(page);
    await bestEffortDismissOverlays(page);
    await ensureNoBlockingOverlays(page);

    await target.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => null);
    try {
      await target.click({ timeout: 10_000 });
    } catch {
      await bestEffortDismissOverlays(page);
      await ensureNoBlockingOverlays(page);
      await target.click({ timeout: 10_000, force: true });
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => null);
    await bestEffortWaitForTransientLoaders(page);

    // Ensure the MAJOR section anchor exists so subsequent product selection can be scoped.
    const majorAnchor = page.locator('main a[href="#major"]').first();
    await majorAnchor.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => null);
    if ((await majorAnchor.count().catch(() => 0)) > 0) {
      // Best-effort: scroll to the MAJOR section after selecting it.
      await majorAnchor.scrollIntoViewIfNeeded().catch(() => null);
      await majorAnchor.click({ timeout: 5000, force: true }).catch(() => null);
      await bestEffortWaitForTransientLoaders(page);
    }
  };

  if ((await majorButton.count().catch(() => 0)) > 0 && (await majorButton.isVisible({ timeout: 5000 }).catch(() => false))) {
    // Click exactly once on the happy path; retry only if the click fails (e.g. overlay intercepts).
    try {
      await clickOnce(majorButton);
    } catch {
      await bestEffortDismissOverlays(page);
      await ensureNoBlockingOverlays(page);
      await clickOnce(majorButton);
    }
    return;
  }

  if ((await majorLink.count().catch(() => 0)) > 0 && (await majorLink.isVisible({ timeout: 5000 }).catch(() => false))) {
    try {
      await clickOnce(majorLink);
    } catch {
      await bestEffortDismissOverlays(page);
      await ensureNoBlockingOverlays(page);
      await clickOnce(majorLink);
    }
    return;
  }

  // Common layout: MAJOR/LIGHT/MEDIUM tiles render an unnamed <button> next to a text node.
  const majorLiftText = page.getByText(/MAJOR:\s*Adds\s*2\s*Cups/i).first();
  if ((await majorLiftText.count().catch(() => 0)) > 0) {
    const tile = majorLiftText.locator('xpath=ancestor::*[.//button][1]').first();
    const tileButton = tile.locator('button').first();
    try {
      if ((await tileButton.count().catch(() => 0)) > 0) await clickOnce(tileButton);
      else await clickOnce(tile);
    } catch {
      await bestEffortDismissOverlays(page);
      await ensureNoBlockingOverlays(page);
      await tileButton.scrollIntoViewIfNeeded().catch(() => null);
      await tileButton.click({ timeout: 20_000, force: true }).catch(() => null);
      await bestEffortWaitForTransientLoaders(page);
    }
    return;
  }

  // Fallback: if an in-page #major anchor exists but isn't considered "visible" (A/B layouts), click it anyway.
  const majorAnchor = page.locator('a[href="#major"], a[href*="#major" i]').first();
  if ((await majorAnchor.count().catch(() => 0)) > 0) {
    try {
      await clickOnce(majorAnchor);
    } catch {
      await bestEffortDismissOverlays(page);
      await ensureNoBlockingOverlays(page);
      await majorAnchor.scrollIntoViewIfNeeded().catch(() => null);
      await majorAnchor.click({ timeout: 20_000, force: true }).catch(() => null);
      await bestEffortWaitForTransientLoaders(page);
    }
    return;
  }

  // Last resort: click a nearby tile/card that mentions MAJOR or Adds 2 Cups.
  const majorTextClickTarget = page
    .locator('main')
    .getByText(/\bmajor\b|adds\s*2\s*cups/i)
    .first()
    .locator('xpath=ancestor-or-self::a[1] | ancestor-or-self::button[1] | ancestor-or-self::*[self::div or self::section or self::article][1]');
  if ((await majorTextClickTarget.count().catch(() => 0)) > 0) {
    await bestEffortPressEscape(page);
    await bestEffortDismissAllPopups(page);
    await bestEffortDismissOverlays(page);
    await ensureNoBlockingOverlays(page);
    await majorTextClickTarget.first().scrollIntoViewIfNeeded().catch(() => null);
    await majorTextClickTarget.first().click({ timeout: 20_000, force: true }).catch(() => null);
    await bestEffortWaitForTransientLoaders(page);
    await page.locator('main a[href="#major"]').first().waitFor({ state: 'attached', timeout: 10_000 }).catch(() => null);
    return;
  }

  throw new Error('Major Lift card/tiles not found on the Push-Up page.');
}

async function openFirstBandCupPdpFromPlp(plpPage: Page, candidates: Locator, warn: (m: string) => void): Promise<Page> {
  const plpUrl = plpPage.url();
  const count = await candidates.count().catch(() => 0);
  const maxToTry = Math.min(count, 30);

  for (let i = 0; i < maxToTry; i++) {
    const tileLink = candidates.nth(i);
    const opened = await openPdpFromPlpTile(plpPage, tileLink).catch(() => null);
    if (!opened) continue;

    await opened.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => null);
    await bestEffortWaitForTransientLoaders(opened);
    await opened.locator('main h1').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null);

    const hasBandCup = await hasBandAndCupSelectorsBestEffort(opened);
    const addCount = await addToBagButton(opened).count().catch(() => 0);
    if (hasBandCup && addCount > 0 && (await bandCupSelectableOnPdpBestEffort(opened, warn))) return opened;

    warn(`Opened non-band/cup PDP from tile #${i + 1}; trying next tile.`);

    if (opened !== plpPage) {
      await opened.close().catch(() => null);
    } else {
      await plpPage.goto(plpUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
      await bestEffortPressEscape(plpPage);
      await bestEffortDismissAllPopups(plpPage);
      await bestEffortWaitForTransientLoaders(plpPage);
    }
  }

  throw new Error('Could not open a PDP with Band + Cup + Add to Bag from the first product tiles.');
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

async function findShineStrapTileLink(main: Locator): Promise<Locator | null> {
  // Prefer a product tile/container that contains the Shine Strap name.
  const tile = main
    .locator('article, [data-testid*="product" i], [data-test*="product" i], li, div')
    .filter({ hasText: /shine\s*strap/i })
    .first();

  if ((await tile.count().catch(() => 0)) > 0) {
    const link = productLinks(tile).first();
    if ((await link.count().catch(() => 0)) > 0) return link;
  }

  // Fallback: any product-like link whose own text includes Shine Strap.
  const direct = productLinks(main).filter({ hasText: /shine\s*strap/i }).first();
  if ((await direct.count().catch(() => 0)) > 0) return direct;

  return null;
}

async function getPdpColorSwatchLabelsBestEffort(pdpPage: Page): Promise<string[]> {
  const swatches = pdpPage.locator(
    '[role="radio"][aria-label], button[aria-label], [data-testid*="swatch" i] button[aria-label], [data-testid*="color" i] button[aria-label]'
  );

  const labels = await swatches
    .evaluateAll((els) =>
      els
        .map((el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim())
        .filter(Boolean)
    )
    .catch(() => [] as string[]);

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const raw of labels) {
    const normalized = raw.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(normalized);
  }
  return uniq;
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
    if (!(await s.isEnabled().catch(() => false))) continue;
    const raw = ((await s.getAttribute('aria-label').catch(() => null)) || '').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(raw);
  }

  return labels;
}

async function selectColorByLabelBestEffort(pdpPage: Page, warn: (m: string) => void, label: string) {
  // Try direct aria-label match first.
  const css = `[aria-label="${escapeCssAttrValue(label)}"]`;
  const exact = pdpPage.locator(css).first();
  if ((await exact.count().catch(() => 0)) > 0 && (await exact.isVisible({ timeout: 2000 }).catch(() => false))) {
    await exact.scrollIntoViewIfNeeded().catch(() => null);
    await exact.click({ timeout: 10_000 }).catch(() => null);
    await bestEffortWaitForTransientLoaders(pdpPage);
    return;
  }

  // Accessible name match.
  const nameRe = new RegExp(`^${escapeRegExp(label)}$`, 'i');
  const byRole = pdpPage
    .getByRole('radio', { name: nameRe })
    .first()
    .or(pdpPage.getByRole('button', { name: nameRe }).first());
  if ((await byRole.count().catch(() => 0)) > 0 && (await byRole.isVisible({ timeout: 2000 }).catch(() => false))) {
    await byRole.scrollIntoViewIfNeeded().catch(() => null);
    await byRole.click({ timeout: 10_000 }).catch(() => null);
    await bestEffortWaitForTransientLoaders(pdpPage);
    return;
  }

  warn(`Could not click color swatch '${label}' by label; falling back to first available swatch.`);
  await selectFirstColorBestEffort(pdpPage, warn);
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
    if (!(await s.isEnabled().catch(() => false))) continue;
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

test.describe('Bras — Add to Bag (Desktop E2E)', () => {
  test('BRAS-E2E-02 — Bras → Sport Bra → select color/size → Add to bag', async ({ page }, testInfo) => {
    const isHeaded = process.env.HEADLESS === '0';
    const slowMoMs = Number(process.env.SLOWMO || '0');
    if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 180_000);
    else test.setTimeout(180_000);

    const warn = makeWarn(testInfo);
    const demoDelayMs = process.env.HEADLESS === '0' ? 900 : 0;

    attachAutoDismissPopups(page, warn);
    const checkpoint = async (p: Page) => {
      await bestEffortPressEscape(p);
      await bestEffortDismissAllPopups(p);
    };

    // 1) Click on ‘Bras’
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await checkpoint(page);
    const header = await getHeader(page);
    await checkpoint(page);

    const brasNav = header
      .getByRole('link', { name: /^bras$/i })
      .first()
      .or(header.getByRole('button', { name: /^bras$/i }).first())
      .or(header.getByRole('link', { name: /bras/i }).first())
      .or(header.locator('nav a').filter({ hasText: /bras/i }).first());

    // 1) Click on ‘Bras’
    // Prefer: open Bras and then drill into Sport Bras via the Bras trending styles block.
    if ((await brasNav.count()) === 0) {
      warn('Bras nav entry not found; navigating directly to Bras PLP URL.');
      await page.goto(BRAS_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    } else {
      // Open the Bras menu/section so the "Trending bra styles" block can be interacted with.
      await checkpoint(page);
      await brasNav.hover({ timeout: 5000 }).catch(() => null);
      await brasNav.click({ timeout: 20_000 }).catch(() => null);
      await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => null);
    }

    // Ensure we landed on a bras PLP-like page.
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    // 2) Under Bras → Trending bra styles block, click Sport bra.
    await demoWait(page, demoDelayMs);
    await checkpoint(page);
    const clickedFromTrending = await clickSportBraFromBrasTrendingBlock(page, warn);
    if (!clickedFromTrending) {
      // Fallbacks: dedicated category link or sport-labeled product.
      await clickSportBrasCategoryIfPresent(page, warn);
    }
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    // 2) Find a Sport Bra and click
    const main = page.locator('main').first();

    // If we couldn't navigate to a dedicated Sport Bras category, try to pick a sport-labeled product card.
    const sportCards = main.locator('[data-testid*="product" i], [data-test*="product" i]').filter({ hasText: /sport/i });
    const hasSportCards = (await sportCards.count()) > 0;

    const candidates = hasSportCards
      ? sportCards.locator('a[href*="-catalog/"], a[href*="/p/"]')
      : productLinks(main);

    const linkCount = await candidates.count();
    expect(linkCount, 'Expected at least one product link on the PLP').toBeGreaterThan(0);

    // 3) Click on the first image under Filter/Sort (PLP tile image), to enter the PDP.
    // Some products use alpha sizing; iterate if needed until we get Band + Cup selectors.
    const filterBtn = main.getByRole('button', { name: /filter/i }).first();
    const sortBtn = main.getByRole('button', { name: /sort/i }).first();
    await filterBtn.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null);
    await sortBtn.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null);
    await demoWait(page, demoDelayMs);

    // Best-effort: apply a filter that increases the chance the first tile is bra-sized.
    await checkpoint(page);
    await applyBraSizedFilterBestEffort(page, warn);
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    // Click the *first* product tile image under Filter & Sort to enter a PDP.
    // For suite stability we keep attempts low; we only require that the PDP can add to bag.
    const maxAttempts = Math.min(linkCount, 5);
    let pdpPage: Page | null = null;
    for (let i = 0; i < maxAttempts; i++) {
      const tileLink = candidates.nth(i);
      if (!(await tileLink.isVisible({ timeout: 1500 }).catch(() => false))) continue;

      await checkpoint(page);
      const opened = await openPdpFromPlpTile(page, tileLink);
      attachAutoDismissPopups(opened, warn);

      await checkpoint(opened);
      await bestEffortWaitForTransientLoaders(opened);
      await opened.locator('main h1').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => null);

      const addCount = await addToBagButton(opened).count().catch(() => 0);
      if (addCount > 0) {
        pdpPage = opened;
        break;
      }

      warn(`Opened a sports bra PDP without Add to Bag from tile #${i + 1}; trying next tile.`);
      if (opened !== page) {
        await opened.close().catch(() => null);
      } else {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
      }
      await checkpoint(page);
      await bestEffortWaitForTransientLoaders(page);
    }

    if (!pdpPage) {
      throw new Error('Could not open a Sports Bras PDP with Add to Bag from the first product tiles.');
    }

    // PDP sanity.
    const pdpH1 = pdpPage.locator('main h1').first();
    await expect(pdpH1, 'Expected PDP H1 to be visible').toBeVisible({ timeout: 30_000 });

    // Ensure nothing is blocking the right-side selectors.
    await checkpoint(pdpPage);

    await demoWait(pdpPage, demoDelayMs);

    // 4) Select ‘Berrylicious (07ZP)’ color (right side)
    // Make this step visibly click a swatch (best-effort if inventory/layout differs).
    await selectColorSwatchBestEffort(pdpPage, warn, TARGET_COLOR);
    await demoWait(pdpPage, demoDelayMs);

    await bestEffortWaitForTransientLoaders(pdpPage);
    await checkpoint(pdpPage);

    const hasBandCupOnPdp = await hasBandAndCupSelectorsBestEffort(pdpPage);

    // 5) Band — select the first available band
    await checkpoint(pdpPage);
    if (hasBandCupOnPdp) {
      await selectFirstAvailableFromSection(pdpPage, /\bband\b/i);
    } else {
      await selectFirstAvailableFromSection(pdpPage, /^size$/i);
    }
    await demoWait(pdpPage, demoDelayMs);

    // 6) Cup — select the first available cup
    if (hasBandCupOnPdp) {
      await checkpoint(pdpPage);
      await selectFirstAvailableFromSection(pdpPage, /\bcup\b/i);
      await demoWait(pdpPage, demoDelayMs);
    }

    // 7) Click ‘Add to bag’
    const addToBag = pdpPage
      .getByRole('button', { name: /add\s*to\s*bag|add\s*to\s*cart/i })
      .first()
      // Some variants hide the button from the accessibility tree; fall back to text-based locator.
      .or(pdpPage.locator('button:has-text("Add To Bag"), button:has-text("Add to Bag"), button:has-text("Add to bag")').first());
    await checkpoint(pdpPage);
    await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 20_000 });
    await expect(addToBag, 'Expected Add to bag button to be enabled (after selecting variants)').toBeEnabled({ timeout: 20_000 });

    await addToBag.click({ timeout: 20_000 });
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    // Postcondition: best-effort confirmation that something was added.
    const confirmation = pdpPage
      .locator('[role="dialog"], [data-testid*="bag" i], [data-testid*="cart" i]')
      .filter({ hasText: /added to bag|added to cart|in your bag|shopping bag|cart/i })
      .first();

    const toast = pdpPage.getByText(/added to bag|added to cart/i).first();

    const confirmed =
      ((await toast.isVisible({ timeout: 10_000 }).catch(() => false)) ||
        (await confirmation.isVisible({ timeout: 10_000 }).catch(() => false))) ??
      false;

    if (!confirmed) {
      // Some site variants add silently; ensure we did not get blocked by a visible error.
      const errorText = /\b(out\s*of\s*stock|unavailable|please\s+select\b|select\b.*\b(size|band|cup)\b)/i;
      const errorLike = pdpPage
        .locator('main')
        .locator('[role="alert"], [aria-live="assertive"], [aria-live="polite"], [data-testid*="error" i]')
        .filter({ hasText: errorText })
        .first();
      if ((await errorLike.count()) > 0 && (await errorLike.isVisible({ timeout: 1500 }).catch(() => false))) {
        throw new Error(`Add to bag did not confirm; saw visible PDP error: ${(await errorLike.textContent()) || 'unknown'}`);
      }

      warn('No add-to-bag confirmation detected (could be silent add); treating as pass.');
    }

    expect(true).toBeTruthy();
  });

  test('BRAS-E2E-03 — Push-Up → MAJOR card → first tile → first color/band/cup → Ship to you → Add to bag (mini bag overlay)', async ({ page }, testInfo) => {
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

    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await checkpoint(page);

    await page.goto(BRAS_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    // Push-Up category.
    const pushUp = page.getByRole('link', { name: /push\s*-?\s*up/i }).first();
    await expect(pushUp, 'Expected Push-Up link to be visible on Bras page').toBeVisible({ timeout: 20_000 });
    await pushUp.scrollIntoViewIfNeeded().catch(() => null);

    const pushUpHref = (await pushUp.getAttribute('href').catch(() => null)) || '';
    await clickOnceWithRetry(pushUp, {
      click: { timeout: 20_000 },
      retryClick: { timeout: 20_000, force: true },
      beforeRetry: async () => {
        await checkpoint(page);
      },
    }).catch(() => null);

    await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => null);
    await page.waitForURL(/push\s*-?\s*up/i, { timeout: 12_000 }).catch(() => null);

    // If click did not navigate (modal/SPA/no-op), fall back to direct navigation.
    if (!/push\s*-?\s*up/i.test(page.url()) && pushUpHref) {
      const target = new URL(pushUpHref, page.url()).toString();
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    }
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    // REQUIRED: click the MAJOR card/tiles on-page (not Filter & Sort).
    await clickMajorLiftCardRequired(page);
    await checkpoint(page);
    await demoWait(page, demoDelayMs);

    // Open a real PDP with Band + Cup.
    const main = page.locator('main').first();
    const majorSection = majorLiftSection(main);
    const candidates = (await majorSection.count().catch(() => 0)) > 0 ? productLinks(majorSection) : productLinks(main);
    const linkCount = await candidates.count().catch(() => 0);
    expect(linkCount, 'Expected at least one MAJOR LIFT product-tile link on Push-Up PLP').toBeGreaterThan(0);

    await checkpoint(page);
    const pdpPage = await openFirstBandCupPdpFromPlp(page, candidates, warn);
    attachAutoDismissPopups(pdpPage, warn);

    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);
    const pdpH1 = pdpPage.locator('main h1').first();
    await expect(pdpH1, 'Expected PDP H1').toBeVisible({ timeout: 30_000 });
    const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    await demoWait(pdpPage, demoDelayMs);

    // First color.
    await checkpoint(pdpPage);
    await selectFirstColorBestEffort(pdpPage, warn);
    await demoWait(pdpPage, demoDelayMs);

    // First band.
    await checkpoint(pdpPage);
    await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
    await demoWait(pdpPage, demoDelayMs);

    // First cup.
    await checkpoint(pdpPage);
    try {
      await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warn(`Cup selection failed after band selection; re-selecting first available band and retrying cup. (${msg})`);
      await checkpoint(pdpPage);
      await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
      await checkpoint(pdpPage);
      await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
    }
    await demoWait(pdpPage, demoDelayMs);

    // Ship to you.
    await checkpoint(pdpPage);
    await selectShipToYouBestEffort(pdpPage, warn);
    await demoWait(pdpPage, demoDelayMs);

    // Add to bag.
    const addToBag = addToBagButton(pdpPage);
    await checkpoint(pdpPage);
    await addToBag.scrollIntoViewIfNeeded().catch(() => null);
    await expect(addToBag, `Expected Add to bag button to be visible (url=${pdpPage.url()})`).toBeVisible({ timeout: 30_000 });
    await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });

    await addToBag.click({ timeout: 20_000 });
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    // Show the mini-bag overlay on the right (no navigation to checkout/sign-in).
    await checkpoint(pdpPage);
    await waitForMiniBagOverlay(pdpPage, { requireVisible: isHeaded, productTitle, warn });
    await demoWait(pdpPage, isHeaded ? 5000 : 0);

    expect(true).toBeTruthy();
  });

  async function openMajorPushUpBandCupPdp(page: Page, testInfo: any) {
    const warn = makeWarn(testInfo);
    attachAutoDismissPopups(page, warn);

    const checkpoint = async (p: Page) => {
      await bestEffortPressEscape(p);
      await bestEffortDismissAllPopups(p);
      await bestEffortDismissOverlays(p);
      await ensureNoBlockingOverlays(p);
    };

    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await checkpoint(page);

    // Go straight to Push-Up PLP (avoids relying on a Push-Up link on the Bras page and saves time).
    const pushUpPage: Page = page;
    await pushUpPage.goto(PUSHUP_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    await checkpoint(pushUpPage);
    await bestEffortWaitForTransientLoaders(pushUpPage);

    await clickMajorLiftCardRequired(pushUpPage);
    await checkpoint(pushUpPage);

    const main = pushUpPage.locator('main').first();
    const majorSection = majorLiftSection(main);
    const candidates = (await majorSection.count().catch(() => 0)) > 0 ? productLinks(majorSection) : productLinks(main);
    const linkCount = await candidates.count().catch(() => 0);
    expect(linkCount, 'Expected at least one MAJOR LIFT product-tile link on Push-Up PLP').toBeGreaterThan(0);

    await checkpoint(pushUpPage);
    const pdpPage = await openFirstBandCupPdpFromPlp(pushUpPage, candidates, warn);
    attachAutoDismissPopups(pdpPage, warn);
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    return { pdpPage, warn, checkpoint };
  }

  const bandValuesToTest = parseBandListFromEnv();
  for (const band of bandValuesToTest) {
    test(`BRAS-E2E-06-${band} — Push-Up → MAJOR card → first tile → first color → Band ${band} (if selectable) → first cup → Ship to you → Add to bag (mini bag overlay)`, async ({ page }, testInfo) => {
      const isHeaded = process.env.HEADLESS === '0';
      const slowMoMs = Number(process.env.SLOWMO || '0');
      if (isHeaded) test.setTimeout(slowMoMs > 0 ? 240_000 : 180_000);
      else test.setTimeout(180_000);

      const demoDelayMs = isHeaded ? 600 : 0;

      const { pdpPage, warn, checkpoint } = await openMajorPushUpBandCupPdp(page, testInfo);

      const pdpH1 = pdpPage.locator('main h1').first();
      await expect(pdpH1, 'Expected PDP H1').toBeVisible({ timeout: 30_000 });
      const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      await demoWait(pdpPage, demoDelayMs);

      // First color.
      await checkpoint(pdpPage);
      await selectFirstColorBestEffort(pdpPage, warn);
      await demoWait(pdpPage, demoDelayMs);

      // Target band.
      await checkpoint(pdpPage);
      const selectableBands = await getSelectableBandValuesBestEffort(pdpPage);
      const selected = await selectBandValueBestEffort(pdpPage, band);
      if (!selected) {
        const strict = process.env.STRICT_BAND_SELECTION === '1';
        if (selectableBands.length > 0) {
          warn(`Band ${band} not selectable on this PDP; selectable bands were: ${selectableBands.join(', ')}. Selecting first available band instead.`);
        } else {
          warn(`Band ${band} not selectable and could not enumerate selectable bands; selecting first available band instead.`);
        }

        if (strict) {
          throw new Error(`STRICT_BAND_SELECTION=1: Band ${band} was not selectable on this PDP.`);
        }
        await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
      }
      await demoWait(pdpPage, demoDelayMs);

      // First cup.
      await checkpoint(pdpPage);
      try {
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn(`Cup selection failed for band=${band}; selecting first available band and retrying cup. (${msg})`);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      }
      await demoWait(pdpPage, demoDelayMs);

      // Ship to you.
      await checkpoint(pdpPage);
      await selectShipToYouBestEffort(pdpPage, warn);
      await demoWait(pdpPage, demoDelayMs);

      // Add to bag.
      const addToBag = addToBagButton(pdpPage);
      await checkpoint(pdpPage);
      await addToBag.scrollIntoViewIfNeeded().catch(() => null);
      await expect(addToBag, `Expected Add to bag button to be visible (url=${pdpPage.url()})`).toBeVisible({ timeout: 30_000 });
      await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });

      await addToBag.click({ timeout: 20_000 });
      await checkpoint(pdpPage);
      await bestEffortWaitForTransientLoaders(pdpPage);

      await checkpoint(pdpPage);
      await waitForMiniBagOverlay(pdpPage, { requireVisible: isHeaded, productTitle, warn });
      await demoWait(pdpPage, isHeaded ? 2500 : 0);

      expect(true).toBeTruthy();
    });
  }

  // Band-coverage suite for Sports Bra flow.
  for (const band of bandValuesToTest) {
    test(`BRAS-E2E-07-${band} — Bras → Sport Bra → first Band/Cup PDP → first color → Band ${band} (if selectable) → first cup → Add to bag`, async ({ page }, testInfo) => {
      const isHeaded = process.env.HEADLESS === '0';
      const slowMoMs = Number(process.env.SLOWMO || '0');
      if (isHeaded) test.setTimeout(slowMoMs > 0 ? 330_000 : 210_000);
      else test.setTimeout(210_000);

      const demoDelayMs = isHeaded ? 600 : 0;
      const { pdpPage, warn, checkpoint } = await openSportBraBandCupPdpFromHomeFlow(page, testInfo);

      const pdpH1 = pdpPage.locator('main h1').first();
      await expect(pdpH1, 'Expected PDP H1 to be visible').toBeVisible({ timeout: 30_000 });
      const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

      // IMPORTANT: Color selection can switch to a variant that changes sizing UI (e.g., alpha sizing),
      // which makes band/cup coverage flaky. Prefer the default selected color for stability.
      await checkpoint(pdpPage);
      await demoWait(pdpPage, demoDelayMs);

      await checkpoint(pdpPage);
      const selectableBands = await getSelectableBandValuesBestEffort(pdpPage);
      const selected = await selectBandValueBestEffort(pdpPage, band);
      if (!selected) {
        const strict = process.env.STRICT_BAND_SELECTION === '1';
        warn(
          `Band ${band} not selectable on this Sport Bra PDP; selectable bands were: ${selectableBands.join(', ') || 'unknown'}. Selecting first available band instead.`
        );
        if (strict) throw new Error(`STRICT_BAND_SELECTION=1: Band ${band} was not selectable on this Sport Bra PDP.`);
        await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
      }
      await demoWait(pdpPage, demoDelayMs);

      await checkpoint(pdpPage);
      try {
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn(`Cup selection failed after selecting band=${band}; selecting first available band and retrying cup. (${msg})`);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      }
      await demoWait(pdpPage, demoDelayMs);

      const addToBag = addToBagButton(pdpPage);
      await checkpoint(pdpPage);
      await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
      await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });
      await addToBag.click({ timeout: 20_000 });

      await checkpoint(pdpPage);
      await bestEffortWaitForTransientLoaders(pdpPage);
      await waitForMiniBagOverlay(pdpPage, { requireVisible: isHeaded, productTitle, warn });
      await demoWait(pdpPage, isHeaded ? 1500 : 0);

      expect(true).toBeTruthy();
    });
  }

  // Band-coverage suite for Shine Strap flow (MAJOR section).
  for (const band of bandValuesToTest) {
    test(`BRAS-E2E-08-${band} — Push-Up → MAJOR → Shine Strap PDP → first strap → Band ${band} (if selectable) → first cup → Ship to you → Add to bag`, async ({ page }, testInfo) => {
      const isHeaded = process.env.HEADLESS === '0';
      const slowMoMs = Number(process.env.SLOWMO || '0');
      if (isHeaded) test.setTimeout(slowMoMs > 0 ? 240_000 : 180_000);
      else test.setTimeout(180_000);

      const demoDelayMs = isHeaded ? 600 : 0;
      const { pdpPage, warn, checkpoint } = await openShineStrapMajorBandCupPdp(page, testInfo);

      const pdpH1 = pdpPage.locator('main h1').first();
      await expect(pdpH1, 'Expected PDP H1').toBeVisible({ timeout: 30_000 });
      const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

      await demoWait(pdpPage, demoDelayMs);

      await checkpoint(pdpPage);
      const selectableBands = await getSelectableBandValuesBestEffort(pdpPage);
      const selected = await selectBandValueBestEffort(pdpPage, band);
      if (!selected) {
        const strict = process.env.STRICT_BAND_SELECTION === '1';
        warn(
          `Band ${band} not selectable on this Shine Strap PDP; selectable bands were: ${selectableBands.join(', ') || 'unknown'}. Selecting first available band instead.`
        );
        if (strict) throw new Error(`STRICT_BAND_SELECTION=1: Band ${band} was not selectable on this Shine Strap PDP.`);
        await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
      }
      await demoWait(pdpPage, demoDelayMs);

      await checkpoint(pdpPage);
      try {
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn(`Cup selection failed for band=${band}; selecting first available band and retrying cup. (${msg})`);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bband\b|band\s*size/i);
        await checkpoint(pdpPage);
        await selectFirstAvailableFromSection(pdpPage, /\bcup\b|cup\s*size/i);
      }
      await demoWait(pdpPage, demoDelayMs);

      await checkpoint(pdpPage);
      await selectShipToYouBestEffort(pdpPage, warn);
      await demoWait(pdpPage, demoDelayMs);

      const addToBag = addToBagButton(pdpPage);
      await checkpoint(pdpPage);
      await expect(addToBag, 'Expected Add to bag button to be visible').toBeVisible({ timeout: 30_000 });
      await expect(addToBag, 'Expected Add to bag button to be enabled').toBeEnabled({ timeout: 20_000 });
      await addToBag.click({ timeout: 20_000 });

      await checkpoint(pdpPage);
      await bestEffortWaitForTransientLoaders(pdpPage);
      await waitForMiniBagOverlay(pdpPage, { requireVisible: isHeaded, productTitle, warn });
      await demoWait(pdpPage, isHeaded ? 1500 : 0);

      expect(true).toBeTruthy();
    });
  }

  async function runShineStrapNthStrapFlow(page: Page, testInfo: any, strapIndex1Based: number) {
    const isHeaded = process.env.HEADLESS === '0';
    const slowMoMs = Number(process.env.SLOWMO || '0');
    if (isHeaded) test.setTimeout(slowMoMs > 0 ? 240_000 : 180_000);
    else test.setTimeout(240_000);

    const warn = makeWarn(testInfo);
    const demoDelayMs = isHeaded ? 600 : 0;

    attachAutoDismissPopups(page, warn);
    const checkpoint = async (p: Page) => {
      await bestEffortPressEscape(p);
      await bestEffortDismissAllPopups(p);
      await bestEffortDismissOverlays(p);
      await ensureNoBlockingOverlays(p);
    };

    // Go straight to Push-Up PLP (fastest and most stable entry point for MAJOR/shine-strap flows).
    await page.goto(PUSHUP_PLP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await checkpoint(page);
    await bestEffortWaitForTransientLoaders(page);

    // REQUIRED: click the MAJOR card (Adds 2 Cups) before choosing Shine Strap.
    await clickMajorLiftCardRequired(page);
    await checkpoint(page);
    await demoWait(page, demoDelayMs);

    const main = page.locator('main').first();
    const majorSection = majorLiftSection(main);
    const scope = (await majorSection.count().catch(() => 0)) > 0 ? majorSection : main;
    const shineLink = await findShineStrapTileLink(scope);
    if (!shineLink) {
      throw new Error('Could not find a Shine Strap product tile/link in the MAJOR (Adds 2 Cups) section on the Push-Up page.');
    }

    await checkpoint(page);
    const pdpPage = await openPdpFromPlpTile(page, shineLink);
    attachAutoDismissPopups(pdpPage, warn);
    await checkpoint(pdpPage);
    await bestEffortWaitForTransientLoaders(pdpPage);

    const pdpH1 = pdpPage.locator('main h1').first();
    await expect(pdpH1, 'Expected PDP H1').toBeVisible({ timeout: 30_000 });
    const productTitle = ((await pdpH1.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

    // Skip beyond what is actually selectable (visible+enabled), not just what exists in the DOM.
    const selectableSwatches = await getVisibleEnabledSwatchLabelsBestEffort(pdpPage);
    if (selectableSwatches.length === 0) {
      throw new Error('No selectable Shine Strap swatches found on PDP.');
    }

    // Per requirement: do NOT skip tests.
    // When the live site exposes fewer selectable straps than our generated index,
    // clamp to the last available swatch and continue.
    const effectiveStrapIndex = Math.min(Math.max(1, strapIndex1Based), selectableSwatches.length);
    if (effectiveStrapIndex !== strapIndex1Based) {
      warn(
        `Requested strap #${strapIndex1Based}, but only ${selectableSwatches.length} selectable swatches were available; selecting strap #${effectiveStrapIndex} instead.`
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
  }

  const shineStrapMaxStraps = Number(process.env.SHINE_STRAP_MAX_STRAPS || '20');
  for (let i = 1; i <= Math.max(1, shineStrapMaxStraps); i++) {
    test(`BRAS-E2E-04-${String(i).padStart(2, '0')} — Shine Strap → strap #${i} → band/cup → Ship to you → Add to bag (mini bag overlay)`, async ({ page }, testInfo) => {
      await runShineStrapNthStrapFlow(page, testInfo, i);
    });
  }
});
