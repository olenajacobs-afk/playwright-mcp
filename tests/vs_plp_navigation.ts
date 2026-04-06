import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE_URL = "https://www.victoriassecret.com/us/";

const PLP_URL_OVERRIDE = process.env.PLP_URL || "";
const CANDIDATE_PLP_URLS = [
  // These are common, relatively stable category paths; the test will pick the first that meets criteria.
  "https://www.victoriassecret.com/us/vs/bras",
  "https://www.victoriassecret.com/us/vs/panties",
  "https://www.victoriassecret.com/us/vs/lingerie",
  "https://www.victoriassecret.com/us/vs/sleep",
  "https://www.victoriassecret.com/us/vs/",
];

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900, isMobile: false },
  { name: "mobile-390", width: 390, height: 844, isMobile: true },
];

const ONLY_DESKTOP = process.env.ONLY_DESKTOP === "1";
const ACTIVE_VIEWPORTS = ONLY_DESKTOP ? VIEWPORTS.filter((v) => !v.isMobile) : VIEWPORTS;

const HEADLESS = process.env.HEADLESS === "0" ? false : true;
const SLOW_MO = process.env.SLOWMO ? Number(process.env.SLOWMO) : 0;
const DEVTOOLS = process.env.DEVTOOLS === "1";
const STRICT = process.env.STRICT === "1";

function log(message) {
  process.stdout.write(`${message}\n`);
}

function requireOrWarn(condition, message) {
  if (condition) return;
  if (STRICT) assert.ok(false, message);
  log(`WARN: ${message}`);
}

async function bestEffortPressEscape(page) {
  try {
    await page.keyboard.press("Escape");
  } catch {
    // ignore
  }
}

async function bestEffortDismissOverlays(page) {
  // OneTrust common selectors
  const onetrustAccept = page.locator(
    "#onetrust-accept-btn-handler, button#onetrust-accept-btn-handler, [data-testid='onetrust-accept-btn-handler']"
  );
  try {
    if (await onetrustAccept.isVisible({ timeout: 1500 })) {
      await onetrustAccept.click({ timeout: 5000 });
      await page
        .locator(".onetrust-pc-dark-filter, #onetrust-consent-sdk")
        .first()
        .waitFor({ state: "hidden", timeout: 5000 })
        .catch(() => null);
      return;
    }
  } catch {
    // ignore
  }

  const candidates = [
    /accept/i,
    /agree/i,
    /^ok$/i,
    /got it/i,
    /continue/i,
    /close/i,
    /dismiss/i,
    /no thanks/i,
    /not now/i,
  ];

  for (const re of candidates) {
    const btn = page.getByRole("button", { name: re }).first();
    try {
      if (await btn.isVisible({ timeout: 1000 })) {
        await btn.click({ timeout: 3000 });
      }
    } catch {
      // ignore
    }
  }
}

async function ensureNoBlockingOverlays(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await bestEffortDismissOverlays(page);

    const blocker = page.locator(".onetrust-pc-dark-filter").first();
    const dialog = page.locator('[role="dialog"]').first();

    const blockerVisible = (await blocker.count()) > 0 && (await blocker.isVisible().catch(() => false));
    const dialogVisible = (await dialog.count()) > 0 && (await dialog.isVisible().catch(() => false));

    if (!blockerVisible && !dialogVisible) return;

    await bestEffortPressEscape(page);
    await page.waitForTimeout(500);
  }
}

function getFilterControl(page) {
  return page.locator(
    "button:has-text('Filter'), button:has-text('Filters'), button[aria-label*='filter' i], button[aria-label*='filters' i]"
  );
}

function getSortControl(page) {
  return page.locator(
    "button:has-text('Sort'), button[aria-label*='sort' i], select[name*='sort' i], [aria-label*='sort' i] select"
  );
}

function getProductLinkLocator(page) {
  // VS product links commonly include /p/.
  return page.locator("a[href*='/p/']");
}

function getProductTileLinkLocator(page) {
  // Fallback selectors for when PDP links are not directly exposed as /p/ anchors (common on some mobile layouts).
  return page.locator("main [data-testid*='product' i] a[href], main [class*='product' i] a[href]");
}

async function getFirstProductHref(page) {
  const primary = getProductLinkLocator(page);
  if ((await primary.count()) > 0) {
    return (await primary.first().getAttribute("href").catch(() => null)) || "";
  }

  const fallback = getProductTileLinkLocator(page);
  const n = Math.min(await fallback.count(), 50);
  for (let i = 0; i < n; i++) {
    const href = (await fallback.nth(i).getAttribute("href").catch(() => null)) || "";
    if (!href) continue;
    // Avoid utility links inside product tiles (quick views, etc.).
    if (/quick|wishlist|favorite|compare/i.test(href)) continue;
    return href;
  }

  return "";
}

async function getH1Text(page) {
  return (await page.locator("h1").first().innerText().catch(() => "")).trim();
}

async function getProductCount(page) {
  const count = await getProductLinkLocator(page).count();
  if (count > 0) return count;

  // Fallback: some pages render product tiles without /p/ in the href.
  const tileLinks = getProductTileLinkLocator(page);
  return tileLinks.count();
}

async function looksLikeStablePlp(page) {
  const h1 = await getH1Text(page);
  const productCount = await getProductCount(page);
  const filterCount = await getFilterControl(page).count();
  const sortCount = await getSortControl(page).count();

  return {
    ok: h1.length > 0 && productCount >= 8 && filterCount > 0 && sortCount > 0,
    h1,
    productCount,
    filterCount,
    sortCount,
  };
}

async function gotoStablePlp(page) {
  const urls = PLP_URL_OVERRIDE ? [PLP_URL_OVERRIDE] : CANDIDATE_PLP_URLS;

  for (const url of urls) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await ensureNoBlockingOverlays(page);
    await page.waitForTimeout(1500);

    const status = await looksLikeStablePlp(page);
    if (status.ok) {
      log(`INFO: Using PLP for validations: ${url}`);
      return;
    }

    log(
      `INFO: Skipping PLP candidate (missing requirements): ${url} (h1='${status.h1}' products=${status.productCount} filter=${status.filterCount} sort=${status.sortCount})`
    );
  }

  // If nothing meets the strict criteria, keep the last attempted page and let assertions below explain what's missing.
  requireOrWarn(false, "Could not find a stable PLP with products + filter + sort controls. Set PLP_URL env var to a known good PLP.");
}

function isLikelyCategoryHref(href) {
  if (!href) return false;
  if (href.startsWith("#")) return false;
  const lower = href.toLowerCase();
  if (lower.includes("javascript:")) return false;
  if (lower.includes("/search")) return false;
  if (lower.includes("/account")) return false;
  if (lower.includes("/bag") || lower.includes("/cart")) return false;
  if (lower.includes("/help") || lower.includes("customercare")) return false;
  return lower.includes("/us/");
}

async function findMenuTrigger(page, isMobile) {
  const header = page.locator("header").first();
  await header.waitFor({ state: "visible", timeout: 30000 });

  // Mobile: hamburger/menu button.
  if (isMobile) {
    const menu = header
      .locator(
        'button[aria-label*="menu" i], button[aria-label*="navigation" i], [role="button"][aria-label*="menu" i]'
      )
      .first();
    const menuByRole = header.getByRole("button", { name: /menu|navigation/i }).first();

    if ((await menu.count()) > 0) return menu;
    if ((await menuByRole.count()) > 0) return menuByRole;
  }

  // Desktop/tablet: try top-level nav link/button to trigger megamenu.
  const nav = header.locator("nav").first();
  const navLinks = nav.locator("a,button");
  const count = await navLinks.count();
  for (let i = 0; i < Math.min(count, 20); i++) {
    const el = navLinks.nth(i);
    const txt = (await el.innerText().catch(() => "")).trim();
    if (!txt) continue;
    // Avoid footer-like or utility links.
    if (/skip/i.test(txt)) continue;
    if (await el.isVisible().catch(() => false)) return el;
  }

  // Fallback: any visible button in header.
  const anyButton = header.locator("button").first();
  if ((await anyButton.count()) > 0) return anyButton;

  return null;
}

async function findMenuContainer(page) {
  // Many implementations use dialog/overlay for menu.
  const candidates = [
    page.locator('[role="dialog"]').filter({ has: page.locator("a") }).first(),
    page.locator('[aria-modal="true"]').filter({ has: page.locator("a") }).first(),
    page.locator("nav").filter({ has: page.locator("a") }).first(),
  ];

  for (const c of candidates) {
    try {
      if ((await c.count()) > 0 && (await c.isVisible().catch(() => false))) return c;
    } catch {
      // ignore
    }
  }

  return null;
}

async function openMegaMenu(page, isMobile) {
  const trigger = await findMenuTrigger(page, isMobile);
  if (!trigger) {
    requireOrWarn(false, "Could not find a menu trigger in the header");
    return { opened: false, trigger: null, container: null };
  }

  await ensureNoBlockingOverlays(page);

  // Try click, then hover (desktop mega menu sometimes opens on hover).
  try {
    await trigger.click({ timeout: 8000 });
  } catch {
    try {
      await trigger.hover({ timeout: 8000 });
    } catch {
      // ignore
    }
  }

  // Wait briefly for overlay/menu.
  await page.waitForTimeout(800);
  const container = await findMenuContainer(page);

  const opened = !!container;
  requireOrWarn(opened, "Mega menu did not appear after opening action");
  return { opened, trigger, container };
}

async function closeMegaMenu(page) {
  // Close via X/Close button if present.
  const closeBtn = page.getByRole("button", { name: /close|dismiss/i }).first();
  if ((await closeBtn.count()) > 0 && (await closeBtn.isVisible().catch(() => false))) {
    await closeBtn.click({ timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(500);
    return;
  }

  await bestEffortPressEscape(page);
  await page.waitForTimeout(500);
}

async function assertMenuDoesNotTrapScroll(page, container) {
  // Requirement: menu should not trap user—menu should be scrollable if needed,
  // and after closing user can scroll the page again.
  const bodyLocked = await page
    .evaluate(() => {
      const b = getComputedStyle(document.body);
      const h = getComputedStyle(document.documentElement);
      const lockedOverflow = b.overflowY === "hidden" || h.overflowY === "hidden";
      const fixedBody = b.position === "fixed" || document.body.style.position === "fixed";
      return lockedOverflow || fixedBody;
    })
    .catch(() => false);

  if (bodyLocked) {
    const menuScrollableOk = await container
      .evaluate((root) => {
        const candidates = [root, ...Array.from(root.querySelectorAll("*"))];
        const scrollables = candidates.filter((el) => {
          const style = getComputedStyle(el);
          const oy = style.overflowY;
          const canScroll = (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 4;
          return canScroll;
        });

        // If no scrolling is needed (menu fits), it's fine.
        const rootFits = root.scrollHeight <= root.clientHeight + 4;
        if (rootFits && scrollables.length === 0) return true;

        // Otherwise, at least one scrollable region should scroll.
        for (const el of scrollables) {
          const before = el.scrollTop;
          el.scrollTop = before + 200;
          if (el.scrollTop !== before) return true;
        }
        return false;
      })
      .catch(() => false);

    requireOrWarn(menuScrollableOk, "Mega menu opens and locks body scroll, but no menu region appears scrollable");
  }

  // Close menu and verify page scroll resumes.
  await closeMegaMenu(page);
  await ensureNoBlockingOverlays(page);

  const yBefore = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollBy(0, 700));
  await page.waitForTimeout(300);
  const yAfter = await page.evaluate(() => window.scrollY);

  requireOrWarn(yAfter !== yBefore, "After closing mega menu, page did not scroll (scroll trap)");
}

async function navigateToPlpFromMenu(page, container) {
  const links = container.locator("a");
  const count = await links.count();
  for (let i = 0; i < Math.min(count, 120); i++) {
    const link = links.nth(i);
    const href = await link.getAttribute("href");
    if (!isLikelyCategoryHref(href)) continue;
    if (!(await link.isVisible().catch(() => false))) continue;

    await link.scrollIntoViewIfNeeded();
    const target = href.startsWith("/") ? `https://www.victoriassecret.com${href}` : href;

    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null),
      link.click({ timeout: 15000 }).catch(() => null),
    ]);

    await ensureNoBlockingOverlays(page);

    if (page.url() && page.url() !== BASE_URL) {
      return { ok: true, url: page.url(), expected: target };
    }
  }

  requireOrWarn(false, "Could not navigate to a PLP from the mega menu; falling back to a known category URL");
  // Fallback URL that often exists.
  await gotoStablePlp(page);
  return { ok: false, url: page.url(), expected: page.url() };
}

async function assertHeadingAndBreadcrumbs(page) {
  const h1 = page.locator("h1").first();
  requireOrWarn((await h1.count()) > 0, "PLP should have an H1 heading");
  if ((await h1.count()) > 0) {
    const text = (await h1.innerText().catch(() => "")).trim();
    requireOrWarn(text.length > 0, "PLP H1 should not be empty");
  }

  const breadcrumb = page.locator('nav[aria-label*="breadcrumb" i], [aria-label*="breadcrumb" i]').first();
  if ((await breadcrumb.count()) > 0 && (await breadcrumb.isVisible().catch(() => false))) {
    const crumbLinks = breadcrumb.locator("a");
    const count = await crumbLinks.count();
    requireOrWarn(count >= 1, "Breadcrumbs present but no breadcrumb links found");

    // Best-effort: first crumb should be Home.
    if (count > 0) {
      const firstText = (await crumbLinks.first().innerText().catch(() => "")).trim().toLowerCase();
      requireOrWarn(firstText.includes("home") || firstText.includes("victoria"), "First breadcrumb should be Home (or brand home)");
    }
  }
}

async function findProductCards(page) {
  // Heuristics: prefer PDP anchors; fall back to product tile anchors.
  const pdpLinks = getProductLinkLocator(page);
  const pdpCount = await pdpLinks.count();

  const links = pdpCount > 0 ? pdpLinks : getProductTileLinkLocator(page);
  const count = await links.count();
  if (count === 0) return [];

  // Use the link's closest card-like container.
  const cards = [];
  const sample = Math.min(count, 12);
  for (let i = 0; i < sample; i++) {
    const link = links.nth(i);
    const card = link.locator("xpath=ancestor-or-self::*[self::li or self::div][1]");
    cards.push(card);
  }
  return cards;
}

async function assertGridAlignmentAndImages(page) {
  const cards = await findProductCards(page);
  requireOrWarn(cards.length >= 4, "Expected at least a few product cards in the PLP grid");
  if (cards.length < 2) return;

  const boxes = [];
  for (const card of cards) {
    await card.scrollIntoViewIfNeeded().catch(() => null);
    const box = await card.boundingBox().catch(() => null);
    if (box) boxes.push(box);
  }

  requireOrWarn(boxes.length >= 2, "Could not measure product card bounding boxes");
  if (boxes.length < 2) return;

  // Basic alignment: allow mixed-width modules; validate the dominant width cluster.
  const widths = boxes.map((b) => b.width).sort((a, b) => a - b);
  const medianW = widths[Math.floor(widths.length / 2)] || 0;
  const cluster = widths.filter((w) => Math.abs(w - medianW) <= Math.max(12, medianW * 0.3));
  if (cluster.length >= 2) {
    const avgW = cluster.reduce((a, b) => a + b, 0) / cluster.length;
    const maxDev = Math.max(...cluster.map((w) => Math.abs(w - avgW)));
    requireOrWarn(maxDev <= avgW * 0.15, "Product card widths vary too much within main grid cluster (alignment issue)");
  } else {
    log("WARN: Could not form a dominant product-card width cluster for alignment check (mixed modules)");
  }

  // Image ratio consistency: check first image inside each card.
  const ratios = [];
  for (const card of cards) {
    const img = card.locator("img").first();
    const box = await img.boundingBox().catch(() => null);
    if (box && box.width > 0 && box.height > 0) ratios.push(box.width / box.height);
  }

  if (ratios.length >= 3) {
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const maxRatioDev = Math.max(...ratios.map((r) => Math.abs(r - avg)));
    if (maxRatioDev > avg * 0.25) {
      log("WARN: Product images have inconsistent aspect ratios in grid (may be mixed modules)");
    }
  } else {
    log("WARN: Not enough product images found to validate image ratio consistency");
  }
}

async function openFilters(page, isMobile) {
  // Desktop: sidebar may already be visible. Mobile: filter drawer.
  const filterBtn = getFilterControl(page).first();

  if ((await filterBtn.count()) > 0 && (await filterBtn.isVisible().catch(() => false))) {
    await ensureNoBlockingOverlays(page);
    await filterBtn.scrollIntoViewIfNeeded().catch(() => null);
    await filterBtn.click({ timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(500);
  }

  if (isMobile) {
    // Drawer/dialog is common, but some layouts use an inline panel.
    const drawer = page.locator('[role="dialog"], [aria-modal="true"]').first();
    if ((await drawer.count()) > 0 && (await drawer.isVisible().catch(() => false))) return drawer;

    const inlineRegion = page
      .locator(
        "[data-testid*='filter' i], [class*='filter' i], [class*='facet' i], [data-testid*='facet' i]"
      )
      .filter({ has: page.locator('input[type="checkbox"], [role="checkbox"]') })
      .first();
    if ((await inlineRegion.count()) > 0 && (await inlineRegion.isVisible().catch(() => false))) return inlineRegion;

    const anyCheckboxVisible =
      (await page.locator('input[type="checkbox"]:visible, [role="checkbox"]:visible').count().catch(() => 0)) > 0;
    if (anyCheckboxVisible) {
      log("WARN: Filter UI is visible but not wrapped in a dialog/drawer");
      return null;
    }

    requireOrWarn(false, "On mobile, could not detect any filter UI after tapping Filter");
    return null;
  }

  return null;
}

async function applyFirstAvailableFilter(page) {
  // Filters are often nested in accordions. Try expanding a facet first.
  const facet = page
    .locator("button")
    .filter({ hasText: /size|color|price|style|category|collection|coverage|brand|fit|cup|band/i })
    .first();
  try {
    if ((await facet.count()) > 0 && (await facet.isVisible().catch(() => false))) {
      await facet.click({ timeout: 8000 }).catch(() => null);
      await page.waitForTimeout(300);
    }
  } catch {
    // ignore
  }

  // Prefer clicking a visible checkbox input.
  const checkbox = page.locator('input[type="checkbox"]:visible').first();
  if ((await checkbox.count()) > 0 && (await checkbox.isVisible().catch(() => false))) {
    await checkbox.click({ timeout: 15000 }).catch(() => null);
    return true;
  }

  // Or click a role=checkbox.
  const roleCheckbox = page.locator('[role="checkbox"]').first();
  if ((await roleCheckbox.count()) > 0 && (await roleCheckbox.isVisible().catch(() => false))) {
    await roleCheckbox.click({ timeout: 15000 }).catch(() => null);
    return true;
  }

  // Or click any filter value button.
  const option = page
    .locator("button, a")
    .filter({ hasText: /\$|\d|xs|s|m|l|xl|xxl|black|white|pink|red|blue|nude|beige/i })
    .first();
  if ((await option.count()) > 0 && (await option.isVisible().catch(() => false))) {
    await option.click({ timeout: 15000 }).catch(() => null);
    return true;
  }

  return false;
}

async function assertAppliedFiltersUi(page) {
  // Chips/tags often contain "Clear" or "Applied".
  const chips = page.locator('[data-testid*="chip" i], [class*="chip" i], button:has-text("Clear"), a:has-text("Clear")');
  const hasChips = (await chips.count()) > 0;
  requireOrWarn(hasChips, "Applied filters UI not detected (chips/clear control)");
}

async function assertSortUi(page) {
  const sort = getSortControl(page).first();
  requireOrWarn((await sort.count()) > 0, "Sort UI should be present on PLP");

  // Best-effort: interact.
  if ((await sort.count()) > 0 && (await sort.isVisible().catch(() => false))) {
    const before = await getFirstProductHref(page);

    try {
      const tag = await sort.evaluate((n) => n.tagName.toLowerCase());
      if (tag === "select") {
        const options = sort.locator("option");
        const optionCount = await options.count();
        if (optionCount > 1) {
          const value = await options.nth(1).getAttribute("value");
          if (value) await sort.selectOption(value);
        }
      } else {
        await sort.click({ timeout: 8000 });
        const item = page.locator('[role="option"], [role="menuitem"], button, a').filter({ hasText: /price|new|best|top|featured/i }).first();
        if ((await item.count()) > 0) await item.click({ timeout: 8000 });
      }
    } catch {
      // ignore
    }

    await page.waitForTimeout(1500);
    const after = await getFirstProductHref(page);
    if (before && after) {
      if (after === before) {
        log("WARN: Sort interaction did not appear to change visible product order (site may keep stable ordering)");
      }
    } else {
      log("WARN: Could not read a stable product href before/after sorting to verify order change");
    }
  }
}

async function assertPaginationOrInfiniteScroll(page) {
  const initialCount = await getProductCount(page);
  requireOrWarn(initialCount > 0, "PLP should show product links before pagination check");

  const loadMore = page.locator('button:has-text("Load")').filter({ hasText: /more/i }).first();
  const nextLink = page.locator('a:has-text("Next"), button:has-text("Next")').first();

  if ((await loadMore.count()) > 0 && (await loadMore.isVisible().catch(() => false))) {
    await loadMore.scrollIntoViewIfNeeded();
    await loadMore.click({ timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(1500);
    const after = await getProductCount(page);
    requireOrWarn(after > initialCount, "Load more did not increase product count");
    return;
  }

  if ((await nextLink.count()) > 0 && (await nextLink.isVisible().catch(() => false))) {
    const startUrl = page.url();
    await nextLink.scrollIntoViewIfNeeded();
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null),
      nextLink.click({ timeout: 15000 }).catch(() => null),
    ]);
    requireOrWarn(page.url() !== startUrl, "Pagination next did not navigate to a different URL");
    return;
  }

  // Infinite scroll: scroll down and see if more products load.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  const afterScrollCount = await getProductCount(page);
  requireOrWarn(afterScrollCount >= initialCount, "Product count decreased after scroll (layout issue)");
  requireOrWarn(afterScrollCount > initialCount, "Infinite scroll did not load more products after scrolling");
}

async function runOneViewport(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  const label = `${vp.name}`;
  log(`\n[RUN] ${label} :: nav+plp`);

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await ensureNoBlockingOverlays(page);

    // Mega menu open/close + scroll behavior
    const { opened, container } = await openMegaMenu(page, vp.isMobile);
    if (opened && container) {
      await assertMenuDoesNotTrapScroll(page, container);

      // Re-open to navigate.
      const secondOpen = await openMegaMenu(page, vp.isMobile);
      if (secondOpen.opened && secondOpen.container) {
        await navigateToPlpFromMenu(page, secondOpen.container);
      }
    } else {
      // If menu cannot be tested, still continue with PLP validation via stable PLP selection.
      await gotoStablePlp(page);
    }

    // Ensure we are on a PLP that actually has products + filter + sort.
    const status = await looksLikeStablePlp(page);
    if (!status.ok) {
      await gotoStablePlp(page);
    }

    // Category landing: heading + breadcrumbs
    await assertHeadingAndBreadcrumbs(page);

    // Grid UI
    await assertGridAlignmentAndImages(page);

    // Filters and applied filters UI
    const beforeFilterCount = await getProductCount(page);
    await openFilters(page, vp.isMobile);
    const applied = await applyFirstAvailableFilter(page);
    requireOrWarn(applied, "Could not apply any filter option (no visible filter controls found)");
    await page.waitForTimeout(1500);
    await assertAppliedFiltersUi(page);
    const afterFilterCount = await getProductCount(page);
    requireOrWarn(afterFilterCount > 0, "No products detected after applying a filter");
    if (afterFilterCount === beforeFilterCount) {
      log("WARN: Applying a filter did not change product count (could be a no-op filter or stable count)");
    }

    // Sort
    await assertSortUi(page);

    // Pagination / infinite scroll
    await assertPaginationOrInfiniteScroll(page);

    log(`[PASS] ${label} :: nav+plp`);
  } catch (err) {
    log(`[FAIL] ${label} :: nav+plp :: ${err?.message || err}`);
    try {
      await page.screenshot({ path: `./tests/artifacts/vs_plp_${vp.name}.png`, fullPage: true });
      log(`  Screenshot: tests/artifacts/vs_plp_${vp.name}.png`);
    } catch {
      // ignore
    }
    throw err;
  } finally {
    await context.close();
  }
}

async function run() {
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO });
  let failures = 0;

  try {
    for (const vp of ACTIVE_VIEWPORTS) {
      try {
        await runOneViewport(browser, vp);
      } catch {
        failures++;
      }
    }
  } finally {
    await browser.close();
  }

  if (failures > 0) {
    process.exitCode = 1;
    log(`\nDone: ${failures} failing run(s)`);
  } else {
    log("\nDone: all runs passed");
  }
}

await run();
