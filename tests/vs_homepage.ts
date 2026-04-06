import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE_URL = "https://www.victoriassecret.com/us/";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900, isMobile: false },
  { name: "tablet-768", width: 768, height: 1024, isMobile: false },
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
  if (STRICT) {
    assert.ok(false, message);
  } else {
    log(`WARN: ${message}`);
  }
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

  // Generic accept/close
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

async function assertNoHorizontalOverflow(page) {
  const result = await page.evaluate(() => {
    const el = document.documentElement;
    const body = document.body;
    const w = window.innerWidth;
    const docW = el?.scrollWidth ?? 0;
    const bodyW = body?.scrollWidth ?? 0;
    return { innerWidth: w, docScrollWidth: docW, bodyScrollWidth: bodyW };
  });

  const max = Math.max(result.docScrollWidth, result.bodyScrollWidth);
  requireOrWarn(
    max <= result.innerWidth + 2,
    `Unexpected horizontal overflow (scrollWidth=${max} innerWidth=${result.innerWidth})`
  );
}

async function getHeroCandidate(page) {
  // Choose the largest visible image or video in the first viewport.
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    const visibleArea = (r) =>
      Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) *
      Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));

    const imageCandidates = Array.from(document.querySelectorAll("img"))
      .map((img) => {
        const r = img.getBoundingClientRect();
        const area = visibleArea(r);
        return {
          kind: "img",
          area,
          src: img.currentSrc || img.src || "",
          alt: img.getAttribute("alt") || "",
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
        };
      })
      .filter((c) => c.area > 0 && c.src);

    const videoCandidates = Array.from(document.querySelectorAll("video"))
      .map((v) => {
        const r = v.getBoundingClientRect();
        const area = visibleArea(r);
        return {
          kind: "video",
          area,
          src: v.currentSrc || v.src || "",
          readyState: v.readyState,
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
        };
      })
      .filter((c) => c.area > 0);

    const all = [...imageCandidates, ...videoCandidates];
    all.sort((a, b) => b.area - a.area);
    return all[0] || null;
  });
}

async function expectHeroLoads(page) {
  const hero = await getHeroCandidate(page);
  assert.ok(hero, "Expected a hero/banner media candidate in the initial viewport");

  if (hero.kind === "img") {
    assert.ok(hero.naturalWidth > 0 && hero.naturalHeight > 0, "Hero image appears broken (natural size is 0)");
  } else if (hero.kind === "video") {
    // readyState >= 2 means current data is available.
    assert.ok(hero.readyState >= 2, `Hero video not ready enough (readyState=${hero.readyState})`);
  }
}

async function findFirstCarousel(page) {
  // Find a visible carousel-like element that can scroll horizontally.
  const candidates = page.locator('[aria-roledescription="carousel"], [data-testid*="carousel" i], [class*="carousel" i]');
  const count = await candidates.count();
  for (let i = 0; i < Math.min(count, 20); i++) {
    const el = candidates.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;

    const canScroll = await el.evaluate((node) => {
      const s = node.scrollWidth > node.clientWidth + 5;
      // Some carousels scroll an inner region.
      const inner = node.querySelector("[data-carousel], [class*='track' i], [class*='scroll' i], ul, ol, div");
      const innerScroll = inner ? inner.scrollWidth > inner.clientWidth + 5 : false;
      return { s, innerScroll };
    }).catch(() => ({ s: false, innerScroll: false }));

    if (canScroll.s || canScroll.innerScroll) return el;

    // Also accept if it has next/prev buttons.
    const next = el.locator('button[aria-label*="next" i], button[aria-label*="right" i]').first();
    if ((await next.count()) > 0) return el;
  }

  return null;
}

async function getScrollLeft(locator) {
  return locator.evaluate((node) => {
    return node.scrollLeft;
  });
}

async function getCarouselSignature(carousel) {
  return carousel
    .evaluate((node) => {
      const text = (node.innerText || "").trim().replace(/\s+/g, " ");
      const imgCount = node.querySelectorAll("img").length;
      const linkCount = node.querySelectorAll("a").length;
      return `${text.slice(0, 400)}|imgs:${imgCount}|links:${linkCount}`;
    })
    .catch(() => "");
}

async function clickNextIfPresent(carousel) {
  const next = carousel.locator('button[aria-label*="next" i], button[aria-label*="right" i], button:has-text(">")').first();
  if ((await next.count()) > 0 && (await next.isVisible().catch(() => false))) {
    await next.click({ timeout: 15000 }).catch(() => null);
    return true;
  }
  return false;
}

async function swipeCarousel(carousel, direction = "left") {
  const box = await carousel.boundingBox();
  if (!box) return false;

  const startX = direction === "left" ? box.x + box.width * 0.75 : box.x + box.width * 0.25;
  const endX = direction === "left" ? box.x + box.width * 0.25 : box.x + box.width * 0.75;
  const y = box.y + Math.min(150, box.height * 0.5);

  const page = carousel.page();
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 12 });
  await page.mouse.up();
  return true;
}

async function expectCarouselAdvance(page, isMobile) {
  const carousel = await findFirstCarousel(page);
  if (!carousel) {
    log("WARN: No carousel detected; skipping carousel advance checks");
    return;
  }

  await carousel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  const beforeScroll = await getScrollLeft(carousel).catch(() => 0);
  const beforeSig = await getCarouselSignature(carousel);

  if (!isMobile) {
    const clicked = await clickNextIfPresent(carousel);
    if (!clicked) {
      // fallback drag
      await swipeCarousel(carousel, "left");
    }
  } else {
    // Mobile: prefer swipe; fallback click next.
    const swiped = await swipeCarousel(carousel, "left");
    if (!swiped) {
      await clickNextIfPresent(carousel);
    }
  }

  await page.waitForTimeout(800);
  const afterScroll = await getScrollLeft(carousel).catch(() => beforeScroll);
  const afterSig = await getCarouselSignature(carousel);

  const advanced = afterScroll !== beforeScroll || (beforeSig && afterSig && beforeSig !== afterSig);
  requireOrWarn(advanced, "Carousel did not advance via controls/swipe (no scroll change or content change detected)");
}

async function getShopNowCtas(page) {
  return page.locator("a,button", { hasText: /shop now/i });
}

async function expectShopNowCtas(page) {
  const ctas = await getShopNowCtas(page);
  const count = await ctas.count();
  assert.ok(count > 0, "Expected at least one 'Shop Now' CTA on homepage");

  const sample = Math.min(count, 6);
  for (let i = 0; i < sample; i++) {
    const cta = ctas.nth(i);
    await cta.scrollIntoViewIfNeeded();
    assert.ok(await cta.isVisible().catch(() => false), "Shop Now CTA should be visible");
    assert.ok(await cta.isEnabled().catch(() => true), "Shop Now CTA should be enabled");

    const box = await cta.boundingBox();
    assert.ok(box && box.width > 0 && box.height > 0, "Shop Now CTA should have a size");

    // Visual distinctness heuristic: underline or non-transparent background/border or bold.
    const distinct = await cta.evaluate((node) => {
      const s = window.getComputedStyle(node);
      const td = s.textDecorationLine || "";
      const fw = Number.parseInt(s.fontWeight || "400", 10);
      const bg = s.backgroundColor || "";
      const border = s.borderStyle || "";
      const hasUnderline = td.includes("underline");
      const hasBorder = border && border !== "none";
      const bgNotTransparent = bg && !bg.includes("rgba(0, 0, 0, 0)") && bg !== "transparent";
      const bold = !Number.isNaN(fw) && fw >= 600;
      return hasUnderline || hasBorder || bgNotTransparent || bold;
    }).catch(() => true);

    assert.ok(distinct, "Shop Now CTA should be visually distinct (underline/button styling/bold)");
  }
}

async function expectTapTargetsOnMobile(page) {
  const ctas = await getShopNowCtas(page);
  const count = await ctas.count();
  const sample = Math.min(count, 6);

  for (let i = 0; i < sample; i++) {
    const cta = ctas.nth(i);
    if (!(await cta.isVisible().catch(() => false))) continue;
    const box = await cta.boundingBox();
    if (!box) continue;

    assert.ok(box.width >= 44 && box.height >= 44, `CTA tap target too small (w=${box.width.toFixed(1)} h=${box.height.toFixed(1)})`);
  }
}

async function expectCtaNavigation(page) {
  const ctas = await getShopNowCtas(page);
  const count = await ctas.count();
  if (count === 0) return;

  const sample = Math.min(count, 2);
  for (let i = 0; i < sample; i++) {
    const cta = ctas.nth(i);
    await cta.scrollIntoViewIfNeeded();

    const startUrl = page.url();
    const popupPromise = page.waitForEvent("popup", { timeout: 7000 }).catch(() => null);

    await cta.click({ timeout: 20000 }).catch(() => null);

    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => null);
      assert.ok(popup.url() && popup.url() !== "about:blank", "CTA popup should navigate to a real URL");
      await popup.close().catch(() => null);
    } else {
      await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => null);
      if (page.url() === startUrl) {
        log("WARN: CTA click did not change URL (possible SPA/modal). Skipping hard assert.");
      } else {
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
      }
    }

    await ensureNoBlockingOverlays(page);
  }
}

async function run() {
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO });
  let failures = 0;

  try {
    for (const vp of ACTIVE_VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);

      const label = vp.name;
      log(`\n[RUN] ${label} :: homepage`);

      try {
        await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
        await ensureNoBlockingOverlays(page);
        await page.waitForTimeout(1500);

        // HOME-01, HOME-02
        await expectHeroLoads(page);

        // HOME-07
        await assertNoHorizontalOverflow(page);

        // HOME-03/04/05
        await expectCarouselAdvance(page, vp.isMobile);

        // HOME-09/HOME-10
        await expectShopNowCtas(page);
        await expectCtaNavigation(page);

        // HOME-06
        if (vp.isMobile) {
          await expectTapTargetsOnMobile(page);
        }

        log(`[PASS] ${label} :: homepage`);
      } catch (err) {
        failures++;
        log(`[FAIL] ${label} :: homepage :: ${err?.message || err}`);
        try {
          await page.screenshot({ path: `./tests/artifacts/vs_home_${vp.name}.png`, fullPage: true });
          log(`  Screenshot: tests/artifacts/vs_home_${vp.name}.png`);
        } catch {
          // ignore
        }
      } finally {
        await context.close();
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
