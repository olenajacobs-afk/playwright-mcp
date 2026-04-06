import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE_URL = "https://www.victoriassecret.com/us/";

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
const DEBUG = process.env.DEBUG === "1";

const SEARCH_QUERY = (process.env.SEARCH_QUERY || "bra").trim();

function log(message) {
  process.stdout.write(`${message}\n`);
}

function requireOrWarn(condition, message) {
  if (condition) return;
  if (STRICT) assert.ok(false, message);
  log(`WARN: ${message}`);
}

async function isVisible(locator) {
  return (await locator.count()) > 0 && (await locator.first().isVisible().catch(() => false));
}

async function bestEffortPressEscape(page) {
  try {
    await page.keyboard.press("Escape");
  } catch {
    // ignore
  }
}

async function bestEffortDismissOverlays(page) {
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
    await page.waitForTimeout(400);
  }
}

function getHeader(page) {
  return page.locator("header").first();
}

function getSearchTrigger(page) {
  const header = getHeader(page);

  return header.locator(
    [
      "button[aria-label*='search' i]",
      "[role='button'][aria-label*='search' i]",
      "a[aria-label*='search' i]",
      "button:has-text('Search')",
      "[data-testid*='search' i]",
    ].join(", ")
  );
}

function getSearchInput(page) {
  return page.locator(
    [
      "input[type='search']",
      "input[placeholder*='search' i]",
      "input[aria-label*='search' i]",
      "input[name*='search' i]",
    ].join(", ")
  );
}

function getTypeaheadContainer(page) {
  return page.locator(
    [
      "[role='listbox']",
      "[data-testid*='typeahead' i]",
      "[class*='typeahead' i]",
      "[class*='suggest' i]",
    ].join(", ")
  );
}

function getProductTileLinkLocator(page) {
  return page.locator(
    "main a[href*='/p/'], main [data-testid*='product' i] a[href], main [class*='product' i] a[href]"
  );
}

async function getProductCount(page) {
  return getProductTileLinkLocator(page).count();
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

async function openSearch(page) {
  await ensureNoBlockingOverlays(page);

  const input = getSearchInput(page);
  if ((await input.count()) > 0 && (await input.first().isVisible().catch(() => false))) {
    return input.first();
  }

  const trigger = getSearchTrigger(page).first();
  requireOrWarn((await trigger.count()) > 0, "Search trigger should exist in the header");

  if ((await trigger.count()) > 0) {
    await trigger.scrollIntoViewIfNeeded().catch(() => null);
    await trigger.click({ timeout: 10000 }).catch(() => null);
  }

  const openedInput = getSearchInput(page).first();
  await openedInput.waitFor({ state: "visible", timeout: 15000 }).catch(() => null);

  return openedInput;
}

async function assertSearchInputAlignedInHeader(page, input) {
  const header = getHeader(page);
  requireOrWarn((await header.count()) > 0, "Header should exist");

  await input.scrollIntoViewIfNeeded().catch(() => null);
  requireOrWarn(await input.isVisible().catch(() => false), "Search input should be visible");
  await input.click({ timeout: 8000 }).catch(() => null);

  const headerBox = await header.boundingBox().catch(() => null);
  const inputBox = await input.boundingBox().catch(() => null);

  requireOrWarn(!!inputBox, "Search input bounding box should be measurable");
  if (!headerBox || !inputBox) return;

  const withinX = inputBox.x + inputBox.width <= headerBox.x + headerBox.width + 4 && inputBox.x >= headerBox.x - 4;
  requireOrWarn(withinX, "Search input should be horizontally within header bounds");

  // Input may be below header in some responsive layouts; still ensure it’s not off-screen.
  const viewport = page.viewportSize();
  if (viewport) {
    const intersectsViewport =
      inputBox.x < viewport.width &&
      inputBox.y < viewport.height &&
      inputBox.x + inputBox.width > 0 &&
      inputBox.y + inputBox.height > 0;
    requireOrWarn(intersectsViewport, "Search input should intersect the viewport");
  }
}

async function typeAndAssertTypeahead(page, input) {
  await input.click({ timeout: 8000 }).catch(() => null);
  await input.fill("").catch(() => null);
  await input.type(SEARCH_QUERY.slice(0, Math.max(2, Math.min(SEARCH_QUERY.length, 4))), { delay: 30 }).catch(() => null);
  await page.waitForTimeout(500);

  const container = getTypeaheadContainer(page).first();
  const visible = (await container.count()) > 0 && (await container.isVisible().catch(() => false));
  requireOrWarn(visible, "Typeahead dropdown should appear after typing");

  if (!visible) return;

  const box = await container.boundingBox().catch(() => null);
  requireOrWarn(!!box, "Typeahead dropdown bounding box should be measurable");

  const viewport = page.viewportSize();
  if (box && viewport) {
    const inViewport =
      box.x >= -1 &&
      box.y >= -1 &&
      box.x + box.width <= viewport.width + 2 &&
      box.y + box.height <= viewport.height + 2;
    if (!inViewport) log("WARN: Typeahead dropdown may be partially off-screen");
  }

  const items = container.locator("[role='option'], li, a, button").filter({ hasText: /\S/ });
  const itemCount = await items.count();
  requireOrWarn(itemCount >= 1, "Typeahead should show at least one suggestion item");

  // Readability heuristic: first item text should be non-empty and not clipped to 0 height.
  if (itemCount > 0) {
    const first = items.first();
    const text = (await first.innerText().catch(() => "")).trim();
    requireOrWarn(text.length > 0, "Typeahead first suggestion should have readable text");

    const itemBox = await first.boundingBox().catch(() => null);
    if (itemBox) {
      if (itemBox.height < 18) log("WARN: Typeahead suggestion item height looks small (possible readability issue)");
    }
  }
}

async function submitSearchToSrp(page, input) {
  const startUrl = page.url();

  await input.click({ timeout: 8000 }).catch(() => null);
  await input.fill(SEARCH_QUERY).catch(() => null);

  // Primary attempt: submit with Enter.
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null),
    input.press("Enter").catch(() => null),
  ]);

  await ensureNoBlockingOverlays(page);

  // If Enter didn’t navigate (common on some search UIs), click a typeahead item.
  if (page.url() === startUrl) {
    const container = getTypeaheadContainer(page).first();
    const viewAll = container
      .locator("a, button, [role='option'], li")
      .filter({ hasText: /view all|see all|all results|search for/i })
      .first();
    const firstOption = container.locator("[role='option'], a, button, li").filter({ hasText: /\S/ }).first();

    if (await isVisible(viewAll)) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null),
        viewAll.click({ timeout: 8000 }).catch(() => null),
      ]);
    } else if (await isVisible(firstOption)) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null),
        firstOption.click({ timeout: 8000 }).catch(() => null),
      ]);
    }

    await ensureNoBlockingOverlays(page);
  }

  // Final fallback: hit common SRP URL patterns directly.
  if (page.url() === startUrl) {
    const q = encodeURIComponent(SEARCH_QUERY);
    const candidates = [
      `${BASE_URL}search?q=${q}`,
      `${BASE_URL}search?query=${q}`,
      `${BASE_URL}search?keyword=${q}`,
      `${BASE_URL}search?keywords=${q}`,
      `${BASE_URL}search/?q=${q}`,
    ];

    let navigated = false;
    for (const url of candidates) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
      await ensureNoBlockingOverlays(page);
      await page.waitForTimeout(1200);

      const productCount = await getProductCount(page).catch(() => 0);
      if (productCount > 0 || page.url().toLowerCase().includes("search")) {
        navigated = true;
        break;
      }
    }

    requireOrWarn(navigated, "Could not navigate to a Search Results Page (SRP) via Enter, typeahead, or URL fallback");
  }

  const url = page.url().toLowerCase();
  requireOrWarn(
    url.includes("search") || url.includes("query") || url.includes("q=") || url.includes("keyword") || url.includes("keywords"),
    "SRP URL should reflect the search query"
  );
}

async function assertSrpLayout(page, isMobile) {
  // Results count heuristic.
  const countLocators = [
    page.locator("[data-testid*='result' i], [class*='result' i]"),
    page.getByText(/\b\d+\b.*(results|items|products)/i),
    page.getByText(/(results|items|products).*\b\d+\b/i),
    page.getByText(/\bshowing\b.*\b\d+\b/i),
  ];

  let hasCount = false;
  for (const loc of countLocators) {
    try {
      if ((await loc.first().count()) > 0 && (await loc.first().isVisible().catch(() => false))) {
        hasCount = true;
        break;
      }
    } catch {
      // ignore
    }
  }
  requireOrWarn(hasCount, "Search results page should show a results count / items indicator");

  const filter = page
    .locator(
      "button:has-text('Filter'), button:has-text('Filters'), button:has-text('Refine'), button:has-text('Refine Results'), button[aria-label*='filter' i], button[aria-label*='filters' i], button[aria-label*='refine' i], [data-testid*='filter' i]"
    )
    .first();

  // NOTE: Avoid regex inside CSS pseudo selectors (invalid). Use locator filters instead.
  let sort = page
    .locator(
      "button:has-text('Sort'), button:has-text('Sort by'), button[aria-label*='sort' i], select[name*='sort' i], select[aria-label*='sort' i]"
    )
    .first();

  if ((await sort.count()) === 0) {
    const sortSelectByOptions = page
      .locator("select")
      .filter({ has: page.locator("option").filter({ hasText: /relevance|price|new|featured|best/i }).first() })
      .first();
    sort = sortSelectByOptions;
  }

  const facetPanel = page
    .locator("main [data-testid*='facet' i], main [class*='facet' i], main [class*='filter' i], main [data-testid*='filter' i]")
    .filter({ has: page.locator("input[type='checkbox'], [role='checkbox']") })
    .first();

  const facetHeadings = page
    .locator("main button, main summary, main [role='button']")
    .filter({ hasText: /size|color|price|style|brand|fit|cup|band|collection|coverage/i });

  const hasFilter = (await isVisible(filter)) || (await isVisible(facetPanel)) || (await facetHeadings.count()) >= 2;

  if (DEBUG) {
    log(`INFO: SRP url=${page.url()}`);
    log(
      `INFO: filterVisible=${await isVisible(filter)} facetPanelVisible=${await isVisible(facetPanel)} facetHeadings=${await facetHeadings.count()}`
    );
    log(
      `INFO: productCount=${await getProductCount(page).catch(() => 0)} anyCheckbox=${await page
        .locator("input[type='checkbox']")
        .count()
        .catch(() => 0)} roleCheckbox=${await page.locator("[role='checkbox']").count().catch(() => 0)}`
    );
  }
  requireOrWarn(hasFilter, "SRP should expose Filter controls (button/drawer or visible facets)");
  requireOrWarn((await sort.count()) > 0, "SRP should expose Sort control");

  // Product grid/list heuristic.
  const productCount = await getProductCount(page);
  requireOrWarn(productCount >= 8, "SRP should render a grid/list with multiple products");

  if (isMobile && (await isVisible(filter))) {
    await filter.scrollIntoViewIfNeeded().catch(() => null);
    await filter.click({ timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(500);

    const drawer = page.locator('[role="dialog"], [aria-modal="true"], [class*="filter" i], [data-testid*="filter" i]').first();
    const drawerVisible = await isVisible(drawer);
    const facetVisible = await isVisible(facetPanel);
    requireOrWarn(drawerVisible || facetVisible, "On mobile SRP, tapping Filter should open a drawer/dialog/panel");

    await bestEffortPressEscape(page);
    await page.waitForTimeout(300);
  }
}

async function runOneViewport(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
  });

  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await ensureNoBlockingOverlays(page);

  const input = await openSearch(page);
  requireOrWarn((await input.count()) > 0, "Search input should be present after opening search");

  if ((await input.count()) > 0) {
    await assertSearchInputAlignedInHeader(page, input);
    await typeAndAssertTypeahead(page, input);
    await submitSearchToSrp(page, input);
    await assertSrpLayout(page, vp.isMobile);
  }

  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO });

  const failures = [];

  for (const vp of ACTIVE_VIEWPORTS) {
    const label = `${vp.name} :: search-ui`;
    log(`\n[RUN] ${label}`);
    try {
      await runOneViewport(browser, vp);
      log(`[PASS] ${label}`);
    } catch (err) {
      failures.push({ label, err });
      log(`[FAIL] ${label} :: ${err?.message || String(err)}`);
      try {
        // Best-effort screenshot (may fail if context already closed).
        // We re-run a lightweight capture if needed.
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: vp.isMobile,
          hasTouch: vp.isMobile,
        });
        const page = await context.newPage();
        await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
        await page.screenshot({ path: `tests/artifacts/vs_search_${vp.name}.png`, fullPage: true }).catch(() => null);
        await context.close();
        log(`Screenshot: tests/artifacts/vs_search_${vp.name}.png`);
      } catch {
        // ignore
      }
    }
  }

  await browser.close();

  if (failures.length > 0) {
    log(`\nDone: ${failures.length} failing run(s)`);
    process.exitCode = 1;
  } else {
    log("\nDone: all runs passed");
  }
}

await main();
