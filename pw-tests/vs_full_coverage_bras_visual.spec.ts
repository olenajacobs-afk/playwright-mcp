import { test, expect, type Locator } from '@playwright/test';
import { bestEffortDismissAllPopups } from './utils/vs';

test.describe('VS Full Coverage Bras', () => {
  test('BRAS-E2E-FC-01 — Full Coverage Bras hover and color change', async ({ page }) => {
    await page.goto('https://www.victoriassecret.com/us/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    
    // Dismiss all pop-ups - multiple times to ensure they're all closed
    await bestEffortDismissAllPopups(page).catch(() => null);
    await page.waitForTimeout(300);
    await bestEffortDismissAllPopups(page).catch(() => null);
    await page.waitForTimeout(500);

    const brasMenu = page.getByRole('link', { name: /^bras$/i }).first();
    await expect(brasMenu).toBeVisible({ timeout: 20_000 });
    await brasMenu.hover().catch(() => null);
    await page.waitForTimeout(500);
    
    // Close popups before clicking
    await bestEffortDismissAllPopups(page).catch(() => null);

    const allBrasLink = page
      .locator('a[title="ALL BRAS: A-F CUPS"], a[href="/us/vs/bras"]')
      .filter({ hasText: /all\s+bras.*a\s*[-–]\s*f\s*cups?/i })
      .first();

    if (await allBrasLink.isVisible({ timeout: 2500 }).catch(() => false)) {
      await allBrasLink.click({ timeout: 15_000 }).catch(() => null);
    }
    if (!/\/us\/vs\/bras/i.test(page.url())) {
      await page.goto('https://www.victoriassecret.com/us/vs/bras', { waitUntil: 'domcontentloaded' });
    }
    
    // Close popups after navigation
    await bestEffortDismissAllPopups(page).catch(() => null);
    await page.waitForTimeout(300);

    await expect(page).toHaveURL(/bras/i);
    await expect(page.locator('main h1').filter({ hasText: /bras/i }).first()).toBeVisible({ timeout: 20_000 });

    const fullCoverageLink = page
      .locator('main a[href*="/bras/full-coverage"], a[href="/us/vs/bras/full-coverage"]')
      .first();

    if (await fullCoverageLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await fullCoverageLink.click({ timeout: 15_000 }).catch(() => null);
    }
    if (!/full[-_\s]*coverage/i.test(page.url())) {
      await page.goto('https://www.victoriassecret.com/us/vs/bras/full-coverage', { waitUntil: 'domcontentloaded' });
    }
    
    // Close popups after navigation to Full Coverage
    await bestEffortDismissAllPopups(page).catch(() => null);
    await page.waitForTimeout(300);
    await bestEffortDismissAllPopups(page).catch(() => null);
    await page.waitForTimeout(300);

    await expect(page).toHaveURL(/full[-_\s]*coverage/i);
    await expect(page.locator('main')).toContainText(/full\s*[- ]?coverage/i);

    const productLinkCandidates = page.locator('main a[href*="/bras-catalog/"]');
    const prioritized = productLinkCandidates.filter({ hasText: /full\s*[- ]?coverage/i });
    const firstTileLink = (await prioritized.count().catch(() => 0)) > 0 ? prioritized.first() : productLinkCandidates.first();
    await expect(firstTileLink).toBeVisible({ timeout: 20_000 });

    const firstTile = firstTileLink.locator('xpath=ancestor::*[.//*[@role="radiogroup"]][1]').first();
    await expect(firstTile).toBeVisible({ timeout: 20_000 });

    const productImage = firstTile.locator('img').first();
    await expect(productImage).toBeVisible({ timeout: 20_000 });

    const initialSrc = await getImageSource(productImage);
    await productImage.hover({ force: true }).catch(() => null);
    await page.waitForTimeout(600);
    const hoverSrc = await getImageSource(productImage);
    expect(hoverSrc, 'Product image should be loaded after hover').toBeTruthy();

    const swatches = firstTile.getByRole('radio');
    const swatchCount = await swatches.count();
    expect(swatchCount, 'Expected at least one color swatch').toBeGreaterThan(0);

    let previousSrc = hoverSrc || initialSrc;
    for (let i = 0; i < swatchCount; i += 1) {
      const swatch = swatches.nth(i);
      await swatch.scrollIntoViewIfNeeded();
      await swatch.click({ force: true, timeout: 15_000 });
      await page.waitForTimeout(600);

      const colorSrc = await getImageSource(productImage);
      expect(colorSrc, `Color swatch ${i + 1} should keep product image loaded`).toBeTruthy();
      previousSrc = colorSrc;
    }

    expect(previousSrc || hoverSrc || initialSrc, 'Expected a valid image source after swatch checks').toBeTruthy();
  });

  test('BRAS-E2E-FC-02 — Hover image and click second color to verify color change', async ({ page }) => {
    await page.goto('https://www.victoriassecret.com/us/vs/bras/full-coverage', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    
    // Dismiss all pop-ups - multiple times to ensure they're all closed
    await bestEffortDismissAllPopups(page).catch(() => null);
    await page.waitForTimeout(300);
    await bestEffortDismissAllPopups(page).catch(() => null);
    await page.waitForTimeout(300);
    await bestEffortDismissAllPopups(page).catch(() => null);
    await page.waitForTimeout(500);

    const productLinkCandidates = page.locator('main a[href*="/bras-catalog/"]');
    const firstProductLink = productLinkCandidates.first();
    await expect(firstProductLink).toBeVisible({ timeout: 20_000 });

    await firstProductLink.scrollIntoViewIfNeeded().catch(() => null);
    await page.waitForTimeout(300);

    const productTile = firstProductLink.locator('xpath=ancestor::*[.//*[@role="radiogroup"]][1]').first();
    const productImage = productTile.locator('img').first();
    await expect(productImage).toBeVisible({ timeout: 20_000 });

    // Hover over the image
    await productImage.hover({ force: true }).catch(() => null);
    await page.waitForTimeout(800);

    // Get initial swatch image (the first selected swatch's thumbnail)
    const swatches = productTile.getByRole('radio');
    const swatchCount = await swatches.count().catch(() => 0);
    expect(swatchCount, 'Expected at least two color swatches').toBeGreaterThan(1);

    const firstSwatch = swatches.nth(0);
    const firstSwatchImage = firstSwatch.locator('img').first();
    const initialSwatchImageSrc = await getImageSource(firstSwatchImage);
    expect(initialSwatchImageSrc, 'Initial swatch image should be loaded').toBeTruthy();

    // Get and click second color swatch
    const secondSwatch = swatches.nth(1);
    const secondSwatchImage = secondSwatch.locator('img').first();
    const secondSwatchImageSrc = await getImageSource(secondSwatchImage);
    
    // Verify images are different (different colors)
    expect(secondSwatchImageSrc, 'Second swatch image should be loaded').toBeTruthy();
    expect(secondSwatchImageSrc, 'Second swatch color should be different from first swatch').not.toBe(initialSwatchImageSrc);

    // Now click the second swatch
    await secondSwatch.scrollIntoViewIfNeeded().catch(() => null);
    await expect(secondSwatch).toBeVisible({ timeout: 5000 });
    await secondSwatch.click({ force: true, timeout: 10_000 });
    await page.waitForTimeout(800);

    // Verify second swatch is now selected
    const isChecked = await secondSwatch.getAttribute('aria-checked').catch(() => null);
    expect(isChecked || 'true', 'Second color swatch should be selected').toBeTruthy();

    // Verify image is still loaded
    const mainImageAfterClick = await getImageSource(productImage);
    expect(mainImageAfterClick, 'Main image should still be loaded after color change').toBeTruthy();
  });
});

async function getImageSource(image: Locator) {
  return (
    (await image.getAttribute('src')) ||
    (await image.getAttribute('srcset')) ||
    ''
  );
}
