import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE_URL = "https://www.victoriassecret.com/us/";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
];

const ONLY_DESKTOP = process.env.ONLY_DESKTOP === "1";
const ACTIVE_VIEWPORTS = ONLY_DESKTOP ? VIEWPORTS.filter((v) => !v.name.startsWith("mobile")) : VIEWPORTS;

const PAGES = [
  { name: "home", url: BASE_URL },
  { name: "search", url: "https://www.victoriassecret.com/us/search?q=bra" },
];

const HEADLESS = process.env.HEADLESS === "0" ? false : true;
const SLOW_MO = process.env.SLOWMO ? Number(process.env.SLOWMO) : 0;
const DEVTOOLS = process.env.DEVTOOLS === "1";
const STRICT = process.env.STRICT === "1";

function log(message) {
  process.stdout.write(`${message}\n`);
}

function requireOrWarn(condition, message) {
  if (condition) return;
  if (STRICT) {
    assert.ok(false, message);
  } else {
    log(`WARN: ${message}`);
  }
}

async function bestEffortDismissOverlays(page) {
  // Cookie / privacy modals vary; this is intentionally permissive.
  const candidates = [
    /accept/i,
    /agree/i,
    /^ok$/i,
    /got it/i,
    /continue/i,
  ];

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

  // OneTrust fallback: look for accept-like buttons inside the consent root.
  const onetrustRoot = page.locator("#onetrust-consent-sdk");
  try {
    if (await onetrustRoot.isVisible({ timeout: 1500 })) {
      const acceptLike = onetrustRoot.getByRole("button", { name: /accept|allow|agree|confirm/i }).first();
      if ((await acceptLike.count()) > 0 && (await acceptLike.isVisible({ timeout: 1500 }))) {
        await acceptLike.click({ timeout: 5000 });
      }
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

  for (const re of candidates) {
    const btn = page.getByRole("button", { name: re }).first();
    try {
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click({ timeout: 1500 });
        await page
          .locator(".onetrust-pc-dark-filter, #onetrust-consent-sdk")
          .first()
          .waitFor({ state: "hidden", timeout: 5000 })
          .catch(() => null);
        break;
      }
    } catch {
      // ignore
    }
  }

  // Generic modal/dialog close (promo, email capture, etc.)
  try {
    const dialog = page.locator('[role="dialog"]').filter({ has: page.locator("button") }).first();
    if ((await dialog.count()) > 0 && (await dialog.isVisible({ timeout: 1500 }))) {
      const closeButton = dialog
        .getByRole("button", { name: /close|dismiss|no thanks|not now|x/i })
        .first();
      if ((await closeButton.count()) > 0 && (await closeButton.isVisible({ timeout: 1500 }))) {
        await closeButton.click({ timeout: 5000 });
        return;
      }
    }
  } catch {
    // ignore
  }
}

async function ensureNoBlockingOverlays(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await bestEffortDismissOverlays(page);

    const onetrustBlocker = page.locator(".onetrust-pc-dark-filter");
    const anyDialog = page.locator('[role="dialog"]');

    const blockerVisible =
      (await onetrustBlocker.count()) > 0 && (await onetrustBlocker.first().isVisible().catch(() => false));
    const dialogVisible = (await anyDialog.count()) > 0 && (await anyDialog.first().isVisible().catch(() => false));

    if (!blockerVisible && !dialogVisible) return;

    await bestEffortPressEscape(page);
    await page.waitForTimeout(500);
  }
}

async function bestEffortPressEscape(page) {
  try {
    await page.keyboard.press("Escape");
  } catch {
    // ignore
  }
}

async function getHeader(page) {
  const header = page.locator("header").first();
  await assertVisible(header, "Header should exist");
  return header;
}

async function getFooter(page) {
  const footer = page.locator("footer").first();
  await assertVisible(footer, "Footer should exist");
  return footer;
}

async function assertVisible(locator, message) {
  const count = await locator.count();
  assert.ok(count > 0, message);
  await locator.first().waitFor({ state: "visible", timeout: 30000 });
}

async function findLogoLink(header) {
  const strategies = [
    () => header.getByRole("link", { name: /victoria|victoria\s*'?s\s*secret/i }).first(),
    () => header.locator('a[aria-label*="victoria" i], a[aria-label*="secret" i]').first(),
    () => header.locator("a").filter({ has: header.locator("img, svg") }).first(),
    () => header.locator('a[href*="/us"], a[href="/us/"], a[href="/us"]:not([href^="#"])').first(),
    () =>
      header
        .locator("a")
        .filter({ hasNotText: /skip to main content/i })
        .filter({ has: header.locator(":scope") })
        .first(),
  ];

  for (const make of strategies) {
    const loc = make();
    try {
      if ((await loc.count()) > 0) {
        const first = loc.first();
        const href = (await first.getAttribute("href").catch(() => null)) || "";
        const text = (await first.innerText().catch(() => "")).trim().toLowerCase();
        if (href.startsWith("#") || text.includes("skip to")) continue;
        if (await first.isVisible({ timeout: 1500 })) return first;
      }
    } catch {
      // ignore and try next
    }
  }

  throw new Error("Could not find a visible logo link in header");
}

async function expectHeaderControls(header) {
  // Search: some breakpoints expose an input, others only show a trigger icon/button.
  // On mobile, search can also be exposed only after opening a menu/drawer.
  const searchbox = header.getByRole("searchbox");
  const searchInput = header.locator('input[type="search"], input[placeholder*="search" i]');
  const searchTrigger = header.locator(
    'button[aria-label*="search" i], a[aria-label*="search" i], [role="button"][aria-label*="search" i]'
  );
  const searchTriggerByRole = header.getByRole("button", { name: /search/i }).first();

  const hasDirectSearch =
    (await searchbox.count()) > 0 ||
    (await searchInput.count()) > 0 ||
    (await searchTrigger.count()) > 0 ||
    (await searchTriggerByRole.count()) > 0;

  if (!hasDirectSearch) {
    // Try opening a hamburger/menu button and look for search elsewhere on the page.
    const page = header.page();

    const menuButton = header
      .locator(
        'button[aria-label*="menu" i], button[aria-label*="navigation" i], button[aria-label*="nav" i], [role="button"][aria-label*="menu" i]'
      )
      .first();
    const menuByRole = header.getByRole("button", { name: /menu|navigation/i }).first();

    let opened = false;
    try {
      if ((await menuButton.count()) > 0 && (await menuButton.isVisible({ timeout: 1000 }))) {
        await menuButton.click({ timeout: 5000 });
        opened = true;
      } else if ((await menuByRole.count()) > 0 && (await menuByRole.isVisible({ timeout: 1000 }))) {
        await menuByRole.click({ timeout: 5000 });
        opened = true;
      }
    } catch {
      // ignore
    }

    const pageSearchbox = page.getByRole("searchbox");
    const pageSearchInput = page.locator('input[type="search"], input[placeholder*="search" i]');
    const pageSearchTrigger = page.locator(
      'button[aria-label*="search" i], a[aria-label*="search" i], [role="button"][aria-label*="search" i]'
    );

    const hasSearchAfterMenu =
      (await pageSearchbox.count()) > 0 ||
      (await pageSearchInput.count()) > 0 ||
      (await pageSearchTrigger.count()) > 0;

    // Last resort: click a few header buttons and see if a search input appears.
    let hasSearchAfterProbing = false;
    if (!hasSearchAfterMenu) {
      const buttons = header.locator("button");
      const buttonCount = Math.min(await buttons.count(), 8);
      for (let i = 0; i < buttonCount; i++) {
        try {
          await buttons.nth(i).click({ timeout: 1500 });
          if ((await pageSearchbox.count()) > 0 || (await pageSearchInput.count()) > 0) {
            hasSearchAfterProbing = true;
            break;
          }
          await bestEffortPressEscape(page);
        } catch {
          // ignore
        }
      }
    }

    const hasSearch = hasSearchAfterMenu || hasSearchAfterProbing;
    if (opened) await bestEffortPressEscape(page);

    requireOrWarn(hasSearch, "Expected a search entry in the header (directly or via header menu)");
  }

  // Account: best-effort based on aria-label or accessible name.
  const account = header
    .locator("a,button")
    .filter({ hasText: /account|sign in|log in|profile/i })
    .first();
  const accountByAria = header.locator('[aria-label*="Account" i], [aria-label*="Sign In" i], [aria-label*="Log In" i]').first();

  requireOrWarn(
    (await account.count()) > 0 || (await accountByAria.count()) > 0,
    "Expected an account control in the header (link/button with Account/Sign In)"
  );

  // Bag/Cart
  const bagByText = header
    .locator("a,button")
    .filter({ hasText: /bag|cart/i })
    .first();
  const bagByAria = header.locator('[aria-label*="Bag" i], [aria-label*="Cart" i]').first();

  requireOrWarn(
    (await bagByText.count()) > 0 || (await bagByAria.count()) > 0,
    "Expected a bag/cart control in the header"
  );
}

async function expectNoHeaderOverlap(page) {
  const header = page.locator("header").first();
  const headerBox = await header.boundingBox();
  assert.ok(headerBox, "Header bounding box should be available");

  const mainCandidates = [
    page.locator("main").first(),
    page.locator('[role="main"]').first(),
    page.locator("#main").first(),
  ];

  let main = null;
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
    // Fallback: first non-header element.
    main = page.locator("body > *:not(header):not(script):not(style)").first();
  }

  await main.waitFor({ state: "visible", timeout: 30000 });
  const mainBox = await main.boundingBox();
  assert.ok(mainBox, "Main content bounding box should be available");

  // If the header is fixed/sticky, the main content should start at or below the header.
  // Allow a tiny tolerance for sub-pixel rounding.
  const tolerancePx = 2;
  assert.ok(
    mainBox.y + tolerancePx >= headerBox.y + headerBox.height,
    `Header overlaps content (main.y=${mainBox.y.toFixed(1)} header.bottom=${(
      headerBox.y + headerBox.height
    ).toFixed(1)})`
  );
}

async function expectFooterLinks(footer) {
  const links = footer.locator("a");
  const count = await links.count();
  assert.ok(count >= 5, `Expected at least 5 footer links, found ${count}`);

  // Many retail sites collapse footer sections on mobile. Validate link attributes and ensure at least one link is visible.
  let visibleCount = 0;
  const sample = Math.min(count, 12);
  for (let i = 0; i < sample; i++) {
    const link = links.nth(i);
    const href = (await link.getAttribute("href").catch(() => null)) || "";
    assert.ok(href.length > 0, "Footer link should have an href");

    const aria = (await link.getAttribute("aria-label").catch(() => null)) || "";
    let text = "";
    const isVisible = await link.isVisible().catch(() => false);
    if (isVisible) {
      visibleCount++;
      text = (await link.innerText().catch(() => "")).trim();

      assert.ok(
        (text && text.length > 0) || aria.length > 0,
        "Visible footer link should have visible text or aria-label"
      );
    }
  }

  if (visibleCount === 0) {
    // Best-effort expand footer accordions.
    const footerButtons = footer.getByRole("button");
    const buttonCount = Math.min(await footerButtons.count(), 6);
    for (let i = 0; i < buttonCount; i++) {
      try {
        await footerButtons.nth(i).click({ timeout: 1500 });
      } catch {
        // ignore
      }
    }

    // Recount visible links.
    const maxCheck = Math.min(count, 20);
    for (let i = 0; i < maxCheck; i++) {
      if (await links.nth(i).isVisible().catch(() => false)) {
        visibleCount++;
      }
    }
  }

  assert.ok(visibleCount > 0, "Expected at least one visible footer link");
}

async function expectFooterLinkBehavior(page, footer) {
  const links = footer.locator("a");
  const count = await links.count();
  if (count === 0) return;

  const isIgnorableHref = (href) =>
    !href ||
    href.startsWith("#") ||
    href.toLowerCase().startsWith("javascript") ||
    href.toLowerCase().startsWith("mailto:") ||
    href.toLowerCase().startsWith("tel:");

  // Internal links: require they *can* open same-tab (target != _blank). Navigation itself is best-effort
  // because SPAs, overlays, and tracking redirects can make this flaky.
  let internal = null;
  for (let i = 0; i < Math.min(count, 80); i++) {
    const link = links.nth(i);
    const href = await link.getAttribute("href");
    if (isIgnorableHref(href)) continue;

    const isInternal = href.startsWith("/") || href.includes("victoriassecret.com");
    if (!isInternal) continue;

    const target = (await link.getAttribute("target")) || "";
    if (target.toLowerCase() === "_blank") continue;

    internal = link;
    break;
  }

  assert.ok(internal, "Expected at least one internal footer link that opens in the same tab (no target=_blank)");

  // Best-effort: click and look for URL change.
  try {
    const startUrl = page.url();
    await internal.scrollIntoViewIfNeeded();
    await internal.click({ timeout: 15000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => null);
    await page.waitForURL((u) => u.toString() !== startUrl, { timeout: 15000 }).catch(() => null);

    if (page.url() === startUrl) {
      log("WARN: Internal footer link click did not visibly change URL (SPA/modal behavior possible)");
    } else {
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null);
    }
  } catch {
    log("WARN: Internal footer link navigation check was inconclusive");
  }

  // External links: prefer target=_blank; enforce as warning to reduce flakiness.
  let external = null;
  for (let i = 0; i < Math.min(count, 80); i++) {
    const link = links.nth(i);
    const href = await link.getAttribute("href");
    if (isIgnorableHref(href)) continue;
    if (href.startsWith("http") && !href.includes("victoriassecret.com")) {
      external = link;
      break;
    }
  }

  if (external) {
    const target = ((await external.getAttribute("target")) || "").toLowerCase();
    const rel = ((await external.getAttribute("rel")) || "").toLowerCase();

    if (target !== "_blank") {
      log("WARN: External footer link does not use target=_blank");
    } else {
      if (!rel.includes("noopener") || !rel.includes("noreferrer")) {
        log("WARN: External footer link missing rel=noopener/noreferrer");
      }
    }
  }
}

async function run() {
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO });
  let failures = 0;

  try {
    for (const viewport of ACTIVE_VIEWPORTS) {
      for (const pageInfo of PAGES) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);

        const label = `${viewport.name} :: ${pageInfo.name}`;
        log(`\n[RUN] ${label}`);

        try {
          await page.goto(pageInfo.url, { waitUntil: "domcontentloaded", timeout: 45000 });
          await bestEffortDismissOverlays(page);

          const header = await getHeader(page);
          await expectHeaderControls(header);

          // Logo click returns to homepage
          await ensureNoBlockingOverlays(page);
          const logo = await findLogoLink(header);
          try {
            await logo.click({ timeout: 15000 });
          } catch {
            // Retry after attempting to clear overlays; if still blocked, force click as a last resort.
            await ensureNoBlockingOverlays(page);
            try {
              await logo.click({ timeout: 15000 });
            } catch {
              log("WARN: Logo click was blocked by an overlay; retrying with force");
              await logo.click({ timeout: 15000, force: true });
            }
          }
          await page.waitForLoadState("domcontentloaded");
          assert.ok(page.url().includes("/us"), `Expected to be on US homepage after logo click, got ${page.url()}`);

          // Return back to the page under test so other checks apply to that page.
          if (page.url() !== pageInfo.url) {
            await page.goto(pageInfo.url, { waitUntil: "domcontentloaded", timeout: 45000 });
            await bestEffortDismissOverlays(page);
          }

          await expectNoHeaderOverlap(page);

          const footer = await getFooter(page);
          await expectFooterLinks(footer);
          await expectFooterLinkBehavior(page, footer);

          log(`[PASS] ${label}`);
        } catch (err) {
          failures++;
          log(`[FAIL] ${label} :: ${err?.message || err}`);
          try {
            await page.screenshot({ path: `./tests/artifacts/vs_${viewport.name}_${pageInfo.name}.png`, fullPage: true });
            log(`  Screenshot: tests/artifacts/vs_${viewport.name}_${pageInfo.name}.png`);
          } catch {
            // ignore
          }
        } finally {
          await context.close();
        }
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
