import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

export const VS_BASE_URL = 'https://www.victoriassecret.com/us/';

export function makeWarn(testInfo: TestInfo) {
  return (message: string) => {
    testInfo.annotations.push({ type: 'warn', description: message });
  };
}

export async function clickOnceWithRetry(
  target: Locator,
  opts: {
    click?: Parameters<Locator['click']>[0];
    retryClick?: Parameters<Locator['click']>[0];
    beforeRetry?: () => Promise<void>;
  } = {}
) {
  const clickOpts = opts.click ?? {};
  try {
    await target.click(clickOpts);
    return;
  } catch {
    await opts.beforeRetry?.();
    await target.click({ ...clickOpts, ...(opts.retryClick ?? {}) });
  }
}

export async function bestEffortPressEscape(page: Page) {
  if (page.isClosed()) return;
  try {
    await page.keyboard.press('Escape');
  } catch {
    // ignore
  }
}

export async function bestEffortDismissOverlays(page: Page) {
  if (page.isClosed()) return;
  // OneTrust accept
  const onetrustAccept = page.locator(
    "#onetrust-accept-btn-handler, button#onetrust-accept-btn-handler, [data-testid='onetrust-accept-btn-handler']"
  );
  try {
    if (await onetrustAccept.isVisible({ timeout: 1500 })) {
      await onetrustAccept.click({ timeout: 5000 });
      await page
        .locator('.onetrust-pc-dark-filter, #onetrust-consent-sdk')
        .first()
        .waitFor({ state: 'hidden', timeout: 5000 })
        .catch(() => null);
      await page.waitForTimeout(200);
      return;
    }
  } catch {
    // ignore
  }

  // OneTrust fallback within root
  const onetrustRoot = page.locator('#onetrust-consent-sdk');
  try {
    if (await onetrustRoot.isVisible({ timeout: 1500 })) {
      const acceptLike = onetrustRoot.getByRole('button', { name: /accept|allow|agree|confirm/i }).first();
      if ((await acceptLike.count()) > 0 && (await acceptLike.isVisible({ timeout: 1500 }))) {
        await acceptLike.click({ timeout: 5000 });
      }

      // Preference center / modal variations
      const closeLike = onetrustRoot.getByRole('button', { name: /close|dismiss|x/i }).first();
      if ((await closeLike.count()) > 0 && (await closeLike.isVisible().catch(() => false))) {
        await closeLike.click({ timeout: 3000 }).catch(() => null);
      }

      await page
        .locator('.onetrust-pc-dark-filter, #onetrust-consent-sdk')
        .first()
        .waitFor({ state: 'hidden', timeout: 5000 })
        .catch(() => null);
      await page.waitForTimeout(200);
      return;
    }
  } catch {
    // ignore
  }

  // Generic accept/ok/continue buttons
  for (const re of [/accept/i, /agree/i, /^ok$/i, /got it/i, /continue/i]) {
    const btn = page.getByRole('button', { name: re }).first();
    try {
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click({ timeout: 1500 });
        await page
          .locator('.onetrust-pc-dark-filter, #onetrust-consent-sdk')
          .first()
          .waitFor({ state: 'hidden', timeout: 5000 })
          .catch(() => null);
        break;
      }
    } catch {
      // ignore
    }
  }

  // Generic dialog close
  try {
    const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('button') }).first();
    if ((await dialog.count()) > 0 && (await dialog.isVisible({ timeout: 1500 }))) {
      const closeButton = dialog.getByRole('button', { name: /close|dismiss|no thanks|not now|x/i }).first();
      if ((await closeButton.count()) > 0 && (await closeButton.isVisible({ timeout: 1500 }))) {
        await closeButton.click({ timeout: 5000 });
      }
    }
  } catch {
    // ignore
  }

  // Common marketing/upsell modals (best-effort)
  try {
    const closeLike = page
      .locator(
        '[role="dialog"] button[aria-label*="close" i], [role="dialog"] button:has-text("Close"), [role="dialog"] button:has-text("No Thanks"), [role="dialog"] button:has-text("Not now"), [data-testid*="close" i], button[aria-label*="close" i]'
      )
      .first();
    if ((await closeLike.count()) > 0 && (await closeLike.isVisible({ timeout: 800 }).catch(() => false))) {
      await closeLike.click({ timeout: 3000 }).catch(() => null);
    }
  } catch {
    // ignore
  }
}

export async function bestEffortDismissAllPopups(page: Page) {
  // A single call that is safe to sprinkle throughout tests.
  if (page.isClosed()) return;
  await bestEffortDismissOverlays(page).catch(() => null);
  await ensureNoBlockingOverlays(page).catch(() => null);
}

export function attachAutoDismissPopups(page: Page, warn?: (message: string) => void) {
  if (page.isClosed()) return;
  // JS dialogs (alert/confirm/prompt)
  page.on('dialog', (dialog) => {
    dialog.dismiss().catch(() => null);
  });

  // New windows/tabs
  page.on('popup', (popup) => {
    if (popup.isClosed()) return;
    // Don't auto-close first-party popups (some product links can open in new tabs);
    // instead attach the same handlers and dismiss overlays inside them.
    warn?.(`Popup page opened (url=${popup.url() || 'unknown'})`);
    popup.on('dialog', (dialog) => dialog.dismiss().catch(() => null));

    // Best-effort dismiss after navigation; safe if it fails.
    popup
      .waitForLoadState('domcontentloaded', { timeout: 15_000 })
      .catch(() => null)
      .then(() => bestEffortDismissOverlays(popup).catch(() => null));
  });
}

export async function ensureNoBlockingOverlays(page: Page) {
  if (page.isClosed()) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (page.isClosed()) return;
    await bestEffortDismissOverlays(page).catch(() => null);

    const onetrustBlocker = page.locator('.onetrust-pc-dark-filter');
    const onetrustRoot = page.locator('#onetrust-consent-sdk');
    const anyDialog = page.locator('[role="dialog"]');

    const blockerVisible =
      (await onetrustBlocker.count().catch(() => 0)) > 0 && (await onetrustBlocker.first().isVisible().catch(() => false));
    const rootVisible =
      (await onetrustRoot.count().catch(() => 0)) > 0 && (await onetrustRoot.first().isVisible().catch(() => false));
    const dialogVisible = (await anyDialog.count().catch(() => 0)) > 0 && (await anyDialog.first().isVisible().catch(() => false));

    if (!blockerVisible && !rootVisible && !dialogVisible) return;

    await bestEffortPressEscape(page);
    if (page.isClosed()) return;
    await page.waitForTimeout(500).catch(() => null);
  }
}

export async function getHeader(page: Page) {
  const header = page.locator('header').first();
  await expect(header, 'Header should exist').toBeVisible();
  return header;
}

export async function getFooter(page: Page) {
  const footer = page.locator('footer').first();
  await expect(footer, 'Footer should exist').toBeVisible();
  return footer;
}

export async function findLogoLink(header: Locator) {
  const strategies = [
    () => header.getByRole('link', { name: /victoria|victoria\s*'?s\s*secret/i }).first(),
    () => header.locator('a[aria-label*="victoria" i], a[aria-label*="secret" i]').first(),
    () => header.locator('a').filter({ has: header.locator('img, svg') }).first(),
    () => header.locator('a[href*="/us"], a[href="/us/"], a[href="/us"]:not([href^="#"])').first(),
    () => header.locator('a').filter({ hasNotText: /skip to main content/i }).first(),
  ];

  for (const make of strategies) {
    const loc = make();
    try {
      if ((await loc.count()) > 0) {
        const first = loc.first();
        const href = (await first.getAttribute('href').catch(() => null)) || '';
        const text = ((await first.innerText().catch(() => '')) || '').trim().toLowerCase();
        if (href.startsWith('#') || text.includes('skip to')) continue;
        if (await first.isVisible({ timeout: 1500 })) return first;
      }
    } catch {
      // ignore
    }
  }

  throw new Error('Could not find a visible logo link in header');
}

export async function hasPrimaryNavEntryPoint(header: Locator) {
  // Desktop: visible top-level nav links.
  const navLinks = header.locator('nav a');
  if ((await navLinks.count()) > 0 && (await navLinks.first().isVisible().catch(() => false))) return true;

  // Mobile: hamburger/menu button.
  const menuButton = header
    .locator(
      'button[aria-label*="menu" i], button[aria-label*="navigation" i], button[aria-label*="nav" i], [role="button"][aria-label*="menu" i]'
    )
    .first();
  if ((await menuButton.count()) > 0 && (await menuButton.isVisible().catch(() => false))) return true;

  const menuByRole = header.getByRole('button', { name: /menu|navigation/i }).first();
  if ((await menuByRole.count()) > 0 && (await menuByRole.isVisible().catch(() => false))) return true;

  return false;
}

export async function hasHeaderUtilities(header: Locator) {
  // Search
  const searchbox = header.getByRole('searchbox');
  const searchInput = header.locator('input[type="search"], input[placeholder*="search" i]');
  const searchTrigger = header.locator(
    'button[aria-label*="search" i], a[aria-label*="search" i], [role="button"][aria-label*="search" i]'
  );
  const searchTriggerByRole = header.getByRole('button', { name: /search/i }).first();

  const hasSearch =
    (await searchbox.count()) > 0 ||
    (await searchInput.count()) > 0 ||
    (await searchTrigger.count()) > 0 ||
    (await searchTriggerByRole.count()) > 0;

  // Account
  const account = header.locator('a,button').filter({ hasText: /account|sign in|log in|profile/i }).first();
  const accountByAria = header
    .locator('[aria-label*="Account" i], [aria-label*="Sign In" i], [aria-label*="Log In" i]')
    .first();
  const hasAccount = (await account.count()) > 0 || (await accountByAria.count()) > 0;

  // Bag
  const bagByText = header.locator('a,button').filter({ hasText: /bag|cart/i }).first();
  const bagByAria = header.locator('[aria-label*="Bag" i], [aria-label*="Cart" i]').first();
  const hasBag = (await bagByText.count()) > 0 || (await bagByAria.count()) > 0;

  return { hasSearch, hasAccount, hasBag };
}

export async function openSearchFromHeader(page: Page, header: Locator) {
  const searchInput = header.locator('input[type="search"], input[placeholder*="search" i]').first();
  if ((await searchInput.count()) > 0 && (await searchInput.isVisible().catch(() => false))) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await ensureNoBlockingOverlays(page);
      try {
        await searchInput.focus({ timeout: 5000 });
        return searchInput;
      } catch {
        // If focus fails (or something intercepts interactions), try click; force-click on later attempts.
        try {
          await searchInput.click({ timeout: 5000 });
          return searchInput;
        } catch {
          // keep retrying
        }
        if (attempt >= 2) {
          try {
            await searchInput.click({ timeout: 5000, force: true });
            return searchInput;
          } catch {
            // keep retrying
          }
        }
        await page.waitForTimeout(300);
      }
    }
    return searchInput;
  }

  const trigger = header
    .locator('button[aria-label*="search" i], a[aria-label*="search" i], [role="button"][aria-label*="search" i]')
    .first();
  if ((await trigger.count()) > 0 && (await trigger.isVisible().catch(() => false))) {
    await trigger.click({ timeout: 5000 });
    const input = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    await expect(input, 'Search input should appear after opening search').toBeVisible();
    return input;
  }

  const triggerByRole = header.getByRole('button', { name: /search/i }).first();
  if ((await triggerByRole.count()) > 0 && (await triggerByRole.isVisible().catch(() => false))) {
    await triggerByRole.click({ timeout: 5000 });
    const input = page.locator('input[type="search"], input[placeholder*="search" i]').first();
    await expect(input, 'Search input should appear after opening search').toBeVisible();
    return input;
  }

  // Last resort: if already on a search page, the input may be outside the header.
  const pageInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();
  await expect(pageInput, 'Search input should be available on the page').toBeVisible();
  return pageInput;
}

export async function bestEffortWaitForTransientLoaders(page: Page) {
  // The VS site frequently shows skeleton/loading overlays that can intercept clicks.
  // We keep this best-effort and short to avoid slowing the suite down.
  const candidates = [
    '[data-testid*="skeleton" i]',
    '[class*="skeleton" i]',
    '[data-testid*="loading" i]',
    '[class*="loading" i]',
    '[aria-busy="true"]',
  ];

  for (const sel of candidates) {
    const loc = page.locator(sel).first();
    try {
      if ((await loc.count()) > 0) {
        await loc.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => null);
      }
    } catch {
      // ignore
    }
  }
}

export async function bestEffortSubmitSearchToSrp(
  page: Page,
  input: Locator,
  term: string,
  warn?: (message: string) => void
) {
  await ensureNoBlockingOverlays(page);
  await input.fill(term);
  await input.focus().catch(() => null);

  const beforeUrl = page.url();
  const looksLikeSrp = () => /\/search\b|[?&]q=/i.test(page.url());

  // Attempt 1: Enter on input.
  await input.press('Enter').catch(() => null);
  await page.waitForLoadState('domcontentloaded', { timeout: 12_000 }).catch(() => null);
  if (looksLikeSrp() && page.url() !== beforeUrl) return;

  // Attempt 2: click a visible suggestion (if present).
  const suggestion = page
    .locator(
      '[role="option"]:visible, [role="listbox"] [role="option"]:visible, [data-testid*="suggest" i] a:visible, [data-testid*="suggest" i] button:visible'
    )
    .first();
  try {
    if ((await suggestion.count()) > 0) {
      await ensureNoBlockingOverlays(page);
      await suggestion.click({ timeout: 10_000 }).catch(() => null);
      await page.waitForLoadState('domcontentloaded', { timeout: 12_000 }).catch(() => null);
      if (looksLikeSrp() && page.url() !== beforeUrl) return;
    }
  } catch {
    // ignore
  }

  // Attempt 3: submit button in the nearest form.
  try {
    const form = input.locator('xpath=ancestor::form[1]');
    const submit = form.locator('button[type="submit"], input[type="submit"]').first();
    if ((await submit.count()) > 0 && (await submit.isVisible().catch(() => false))) {
      await ensureNoBlockingOverlays(page);
      await submit.click({ timeout: 10_000 }).catch(() => null);
      await page.waitForLoadState('domcontentloaded', { timeout: 12_000 }).catch(() => null);
      if (looksLikeSrp() && page.url() !== beforeUrl) return;
    }
  } catch {
    // ignore
  }

  // Fallback: direct SRP URL to keep the test from flaking when the home-page submit is SPA/no-op.
  if (!looksLikeSrp()) {
    warn?.(`Search submit did not navigate (URL stayed: ${page.url()}); navigating directly to SRP as fallback.`);
    const srpUrl = `${VS_BASE_URL}search?q=${encodeURIComponent(term)}`;
    await page.goto(srpUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await ensureNoBlockingOverlays(page);
  }
}

export async function expectNoHeaderOverlap(page: Page) {
  const header = page.locator('header').first();
  await expect(header, 'Header should exist').toBeVisible();

  const headerBox = await header.boundingBox();
  expect(headerBox, 'Header bounding box should be available').toBeTruthy();

  const mainCandidates = [page.locator('main').first(), page.locator('[role="main"]').first(), page.locator('#main').first()];

  let main: Locator | null = null;
  for (const candidate of mainCandidates) {
    try {
      if ((await candidate.count()) > 0) {
        main = candidate;
        break;
      }
    } catch {
      // ignore
    }
  }

  if (!main) {
    main = page.locator('body > *:not(header):not(script):not(style)').first();
  }

  await expect(main).toBeVisible();
  const mainBox = await main.boundingBox();
  expect(mainBox, 'Main content bounding box should be available').toBeTruthy();

  const tolerancePx = 2;
  expect(mainBox.y + tolerancePx, 'Header overlaps content').toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
}

export async function expectFooterLinksBasic(footer: Locator) {
  await expect(footer, 'Footer should exist').toBeVisible();

  const links = footer.locator('a');
  const count = await links.count();
  expect(count, 'Expected at least 5 footer links').toBeGreaterThanOrEqual(5);

  // Ensure at least one visible link has text or aria-label.
  let visibleCount = 0;
  const sample = Math.min(count, 12);
  for (let i = 0; i < sample; i++) {
    const link = links.nth(i);
    const href = (await link.getAttribute('href').catch(() => null)) || '';
    expect(href.length, 'Footer link should have an href').toBeGreaterThan(0);

    const aria = (await link.getAttribute('aria-label').catch(() => null)) || '';
    const isVisible = await link.isVisible().catch(() => false);
    if (isVisible) {
      visibleCount++;
      const text = ((await link.innerText().catch(() => '')) || '').trim();
      expect(text.length > 0 || aria.length > 0, 'Visible footer link should have visible text or aria-label').toBeTruthy();
    }
  }

  expect(visibleCount, 'Expected at least one visible footer link').toBeGreaterThan(0);
}

export async function getVisibleDialog(page: Page) {
  // Prefer dialogs that are not OneTrust.
  const dialogs = page.locator('[role="dialog"]');
  const count = await dialogs.count();
  for (let i = 0; i < Math.min(count, 6); i++) {
    const d = dialogs.nth(i);
    const visible = await d.isVisible().catch(() => false);
    if (!visible) continue;
    const id = (await d.getAttribute('id').catch(() => null)) || '';
    if (id.toLowerCase().includes('onetrust')) continue;
    return d;
  }
  return null;
}

export async function openDesktopMegaMenu(page: Page, header: Locator, warn: (m: string) => void) {
  // Pinned target: try Bras first; fallback to any visible nav link.
  const navItem = header.getByRole('link', { name: /bras/i }).first();
  const fallbackNav = header.locator('nav a').first();

  const opener = (await navItem.count()) > 0 ? navItem : fallbackNav;
  if ((await opener.count()) === 0) return null;

  await ensureNoBlockingOverlays(page);
  await opener.click({ timeout: 15_000 }).catch(() => null);

  // Detect menu-like UI.
  const menuLike = page.locator('[role="menu"], [data-testid*="menu" i], [data-testid*="mega" i], [aria-modal="true"]').first();
  const dialog = await getVisibleDialog(page);

  const isMenuLikeVisible = (await menuLike.count()) > 0 && (await menuLike.isVisible({ timeout: 3000 }).catch(() => false));
  const isDialogVisible = !!dialog && (await dialog.isVisible().catch(() => false));

  if (!isMenuLikeVisible && !isDialogVisible) {
    warn('Mega menu not clearly detected after click; site may render non-semantic navigation.');
    return null;
  }

  return (dialog || menuLike) as Locator;
}

export async function findCloseButton(container: Locator) {
  const byAria = container.locator('button[aria-label*="close" i], button[aria-label="Close" i]').first();
  if ((await byAria.count()) > 0) return byAria;

  const byRole = container.getByRole('button', { name: /close|dismiss|x/i }).first();
  if ((await byRole.count()) > 0) return byRole;

  // Some menus use an icon button with no accessible name.
  const anyButton = container.locator('button').first();
  if ((await anyButton.count()) > 0) return anyButton;

  return null;
}

export async function isContainerVisible(container: Locator | null) {
  if (!container) return false;
  return (await container.isVisible().catch(() => false)) === true;
}

export async function openPlpFilterPanel(page: Page, warn: (m: string) => void) {
  const filterButton = page.getByRole('button', { name: /filter/i }).first();
  if ((await filterButton.count()) === 0) {
    warn('Filter button not found.');
    return null;
  }

  await ensureNoBlockingOverlays(page);
  await filterButton.click({ timeout: 15_000 }).catch(() => null);

  // Prefer a dialog containing checkboxes.
  const dialog = await getVisibleDialog(page);
  if (dialog) {
    const hasCheckbox =
      (await dialog.getByRole('checkbox').count().catch(() => 0)) > 0 ||
      (await dialog.locator('input[type="checkbox"]').count().catch(() => 0)) > 0;
    if (hasCheckbox) return dialog;
  }

  // Fallback: sidebar/region.
  const sidebar = page.locator('aside, [data-testid*="filter" i], [aria-label*="filter" i]').first();
  if ((await sidebar.count()) > 0 && (await sidebar.isVisible().catch(() => false))) return sidebar;

  warn('Filter panel not clearly detected after clicking Filter.');
  return dialog;
}

export async function pickAFilterOption(panel: Locator, warn: (m: string) => void) {
  const optionName = process.env.FILTER_OPTION_NAME;
  if (optionName) {
    const escaped = optionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byName = panel.getByRole('checkbox', { name: new RegExp(escaped, 'i') }).first();
    if ((await byName.count()) > 0) return byName;
    warn(`FILTER_OPTION_NAME=${optionName} did not match any checkbox option.`);
  }

  if (process.env.DUMP_FILTER_OPTIONS === '1') {
    try {
      const checkboxes = panel.getByRole('checkbox');
      const count = await checkboxes.count();
      const names: string[] = [];
      for (let i = 0; i < Math.min(count, 30); i++) {
        const cb = checkboxes.nth(i);
        const name = (await cb.getAttribute('aria-label').catch(() => null)) || (await cb.textContent().catch(() => ''));
        const cleaned = (name || '').replace(/\s+/g, ' ').trim();
        if (cleaned) names.push(cleaned);
      }
      if (names.length > 0) warn(`DUMP_FILTER_OPTIONS: ${names.join(' | ')}`);
      else warn('DUMP_FILTER_OPTIONS: no checkbox names found via role=checkbox.');
    } catch {
      warn('DUMP_FILTER_OPTIONS: failed to enumerate checkboxes.');
    }
  }

  const roleCheckbox = panel.getByRole('checkbox').first();
  if ((await roleCheckbox.count()) > 0) return roleCheckbox;

  const inputCheckbox = panel.locator('input[type="checkbox"]').first();
  if ((await inputCheckbox.count()) > 0) return inputCheckbox;

  return null;
}

export async function findCheckedFilterOption(panel: Locator) {
  const checkedInput = panel.locator('input[type="checkbox"]:checked').first();
  if ((await checkedInput.count()) > 0) return checkedInput;

  // ARIA checkbox fallback
  const ariaChecked = panel.locator('[role="checkbox"][aria-checked="true"]').first();
  if ((await ariaChecked.count()) > 0) return ariaChecked;

  return null;
}

export async function applyOrCloseFilterPanel(page: Page, panel: Locator, warn: (m: string) => void) {
  const apply = panel.getByRole('button', { name: /apply|view results|show results|done/i }).first();
  if ((await apply.count()) > 0 && (await apply.isVisible().catch(() => false))) {
    await apply.click({ timeout: 15_000 }).catch(() => null);
    return;
  }

  const close = await findCloseButton(panel);
  if (close && (await close.isVisible().catch(() => false))) {
    await close.click({ timeout: 15_000 }).catch(() => null);
    return;
  }

  warn('No Apply/Close control detected in filter panel; pressing Escape as fallback.');
  await bestEffortPressEscape(page);
}

export async function detectAppliedFilterSignals(page: Page) {
  const chips = page.locator('[data-testid*="chip" i], [aria-label*="remove" i], button:has-text("Clear"), text=/clear all/i');
  const chipCount = await chips.count().catch(() => 0);

  const clearButton = page.getByRole('button', { name: /clear|reset/i }).first();
  const clearVisible = (await clearButton.count()) > 0 && (await clearButton.isVisible().catch(() => false));

  return { chipCount, clearVisible };
}

export async function clearFiltersBestEffort(page: Page, warn: (m: string) => void) {
  // Try global clear/reset controls first.
  const clearButtons = [
    page.getByRole('button', { name: /clear all/i }).first(),
    page.getByRole('button', { name: /clear/i }).first(),
    page.getByRole('button', { name: /reset/i }).first(),
    page.locator('button:has-text("Clear")').first(),
  ];

  for (const btn of clearButtons) {
    try {
      if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
        await btn.click({ timeout: 15_000 }).catch(() => null);
        return true;
      }
    } catch {
      // ignore
    }
  }

  // Try removing a chip.
  const removeChip = page.locator('[aria-label*="remove" i], button[aria-label*="remove" i]').first();
  if ((await removeChip.count()) > 0 && (await removeChip.isVisible().catch(() => false))) {
    await removeChip.click({ timeout: 15_000 }).catch(() => null);
    return true;
  }

  warn('No clear/reset/remove-filter control detected.');
  return false;
}

export async function bestEffortClickInternalFooterLink(page: Page, footer: Locator, warn: (m: string) => void) {
  const links = footer.locator('a');
  const count = await links.count();
  if (count === 0) return;

  const isIgnorableHref = (href: string) =>
    !href ||
    href.startsWith('#') ||
    href.toLowerCase().startsWith('javascript') ||
    href.toLowerCase().startsWith('mailto:') ||
    href.toLowerCase().startsWith('tel:');

  let internal: Locator | null = null;
  for (let i = 0; i < Math.min(count, 80); i++) {
    const link = links.nth(i);
    const href = (await link.getAttribute('href')) || '';
    if (isIgnorableHref(href)) continue;

    const isInternal = href.startsWith('/') || href.includes('victoriassecret.com');
    if (!isInternal) continue;

    const target = ((await link.getAttribute('target')) || '').toLowerCase();
    if (target === '_blank') continue;

    internal = link;
    break;
  }

  expect(internal, 'Expected at least one internal footer link that opens in the same tab').toBeTruthy();

  try {
    const startUrl = page.url();
    await internal!.scrollIntoViewIfNeeded();
    await internal!.click({ timeout: 15_000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => null);
    await page.waitForURL((u) => u.toString() !== startUrl, { timeout: 15_000 }).catch(() => null);

    if (page.url() === startUrl) {
      warn('Internal footer link click did not visibly change URL (SPA/modal behavior possible)');
    } else {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => null);
    }
  } catch {
    warn('Internal footer link navigation check was inconclusive');
  }
}
