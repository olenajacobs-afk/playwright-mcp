import { chromium } from "playwright";

const BASE_URL = "https://www.victoriassecret.com/us/";
const QUERY = process.env.SEARCH_QUERY || "bra";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900, isMobile: false },
  { name: "mobile-390", width: 390, height: 844, isMobile: true },
];

async function main() {
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
    });

    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1500);

    // open search (best-effort)
    const searchInput = page.locator("input[type='search'], input[placeholder*='search' i], input[aria-label*='search' i]").first();
    const searchBtn = page.locator("header button[aria-label*='search' i], header button:has-text('Search')").first();

    if (await searchInput.isVisible().catch(() => false)) {
      // already visible
    } else if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click().catch(() => null);
      await page.waitForTimeout(500);
    }

    await searchInput.fill(QUERY).catch(() => null);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null),
      searchInput.press("Enter").catch(() => null),
    ]);

    await page.waitForTimeout(1500);

    const url = page.url();

    const metrics = {
      url,
      h1: (await page.locator("h1").first().innerText().catch(() => "")).trim(),
      product_p_links: await page.locator("a[href*='/p/']").count(),
      any_checkbox: await page.locator("input[type='checkbox']").count(),
      role_checkbox: await page.locator("[role='checkbox']").count(),
      filter_btn_text: await page.locator("button").filter({ hasText: /filter|filters|refine/i }).count(),
      filter_aria: await page.locator("[aria-label*='filter' i], [aria-label*='filters' i], [aria-label*='refine' i]").count(),
      sort_btn_text: await page.locator("button").filter({ hasText: /sort/i }).count(),
      sort_aria: await page.locator("[aria-label*='sort' i]").count(),
      facet_class: await page.locator("[class*='facet' i], [class*='filter' i]").count(),
      testid_facet: await page.locator("[data-testid*='facet' i], [data-testid*='filter' i]").count(),
    };

    console.log(`\n[${vp.name}]`, metrics);

    await page.screenshot({ path: `tests/artifacts/probe_search_${vp.name}.png`, fullPage: true }).catch(() => null);
    await context.close();
  }

  await browser.close();
}

await main();
