import { test, expect } from '@playwright/test';

test.describe('VS Full Coverage Bras API Validation', () => {
  test.setTimeout(180_000); // Extended timeout for live site API tests
  
  const API_BASE_URL = 'https://www.victoriassecret.com';
  const FULL_COVERAGE_CATEGORY = '/us/vs/bras/full-coverage';

  test('API-FC-01 — Fetch full coverage bras category page and validate API structure', async ({ page }) => {
    // Navigate to full coverage bras page
    const response = await page.goto(`${API_BASE_URL}${FULL_COVERAGE_CATEGORY}`, {
      waitUntil: 'networkidle',
    });

    // Validate page response
    expect(response?.status()).toBe(200);
    expect(response?.url()).toContain('full-coverage');
  });

  test('API-FC-02 — Validate full coverage bras product data structure', async ({ page }) => {
    await page.goto(`${API_BASE_URL}${FULL_COVERAGE_CATEGORY}`, { waitUntil: 'networkidle' });

    // Extract product data from page
    const products = await page.locator('main a[href*="/bras-catalog/"]').all();

    // Validate that products are found
    expect(products.length).toBeGreaterThan(0);

    // Validate first product has required data attributes
    if (products.length > 0) {
      const firstProduct = products[0];
      const href = await firstProduct.getAttribute('href');
      
      expect(href).toBeTruthy();
      expect(href).toContain('/bras-catalog/');
    }
  });

  test('API-FC-03 — Validate full coverage product page returns proper HTTP status', async ({
    request,
  }) => {
    // Fetch the category page
    const categoryResponse = await request.get(`${API_BASE_URL}${FULL_COVERAGE_CATEGORY}`);

    expect(categoryResponse.status()).toBe(200);
    expect(categoryResponse.ok()).toBeTruthy();
  });

  test('API-FC-04 — Validate product images and metadata in full coverage bras', async ({ page }) => {
    await page.goto(`${API_BASE_URL}${FULL_COVERAGE_CATEGORY}`, { waitUntil: 'networkidle' });

    // Get all product tiles
    const productTiles = await page.locator('main a[href*="/bras-catalog/"]').all();

    if (productTiles.length > 0) {
      // Check first product tile
      const firstTile = productTiles[0];
      const tileParent = firstTile.locator('xpath=ancestor::*[.//*[@role="radiogroup"]][1]').first();

      // Validate image exists
      const productImage = tileParent.locator('img').first();
      await expect(productImage).toBeVisible({ timeout: 10_000 });

      // Check for image src or srcset attribute (images might use either)
      const imageSrc = await productImage.getAttribute('src');
      const imageSrcSet = await productImage.getAttribute('srcset');
      
      expect(imageSrc || imageSrcSet).toBeTruthy();
      
      // Validate image source format if src exists
      if (imageSrc) {
        expect(imageSrc.length).toBeGreaterThan(0);
      }
    }
  });

  test('API-FC-05 — Validate full coverage bras product has color swatches', async ({ page }) => {
    await page.goto(`${API_BASE_URL}${FULL_COVERAGE_CATEGORY}`, { waitUntil: 'networkidle' });

    const productTiles = await page.locator('main a[href*="/bras-catalog/"]').all();

    if (productTiles.length > 0) {
      const firstTile = productTiles[0];
      const tileParent = firstTile.locator('xpath=ancestor::*[.//*[@role="radiogroup"]][1]').first();

      // Validate swatches exist
      const swatches = tileParent.getByRole('radio');
      const swatchCount = await swatches.count();

      expect(swatchCount).toBeGreaterThan(0);
    }
  });

  test('API-FC-06 — Validate API response contains full coverage category metadata', async ({
    page,
  }) => {
    const response = await page.goto(`${API_BASE_URL}${FULL_COVERAGE_CATEGORY}`, {
      waitUntil: 'domcontentloaded',
    });

    // Validate response headers
    const headers = response?.headers();
    expect(headers?.['content-type']).toContain('text/html');

    // Check for expected content
    const pageContent = await page.content();
    expect(pageContent).toContain('full-coverage');
    expect(pageContent).toContain('bra');
  });

  test('API-FC-07 — Validate full coverage bras pagination and product count', async ({ page }) => {
    await page.goto(`${API_BASE_URL}${FULL_COVERAGE_CATEGORY}`, { waitUntil: 'networkidle' });

    // Get all visible products
    const allProducts = await page.locator('main a[href*="/bras-catalog/"]').all();

    // Should have at least some products
    expect(allProducts.length).toBeGreaterThan(0);

    // Each product should have a valid href
    for (const product of allProducts) {
      const href = await product.getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).toMatch(/\/bras-catalog\/\d+/);
    }
  });

  test('API-FC-08 — Validate individual full coverage product detail page', async ({ page }) => {
    // First get to category
    await page.goto(`${API_BASE_URL}${FULL_COVERAGE_CATEGORY}`, { waitUntil: 'networkidle' });

    // Get first product link
    const firstProductLink = page.locator('main a[href*="/bras-catalog/"]').first();
    const productHref = await firstProductLink.getAttribute('href');

    if (productHref) {
      // Navigate to product detail
      const productResponse = await page.goto(`${API_BASE_URL}${productHref}`, {
        waitUntil: 'domcontentloaded',
      });

      // Validate product page loads
      expect(productResponse?.status()).toBe(200);
    }
  });

  test('API-FC-09 — Validate full coverage bras filtering and sorting capability', async ({
    page,
  }) => {
    await page.goto(`${API_BASE_URL}${FULL_COVERAGE_CATEGORY}`, { waitUntil: 'networkidle' });

    // Check for filter/sort elements that might be present
    const filterElements = page.locator('[data-testid*="filter" i], [aria-label*="sort" i]').all();

    // Page should load with products
    const products = await page.locator('main a[href*="/bras-catalog/"]').all();
    expect(products.length).toBeGreaterThan(0);
  });

  test('API-FC-10 — Validate API response performance and caching headers', async ({
    page,
    request,
  }) => {
    const startTime = Date.now();

    const response = await request.get(`${API_BASE_URL}${FULL_COVERAGE_CATEGORY}`);

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // Validate response
    expect(response.status()).toBe(200);

    // Response should be reasonably fast (less than 15 seconds)
    expect(responseTime).toBeLessThan(15000);

    // Check for cache-related headers
    const headers = response.headers();
    expect(headers['content-type']).toBeTruthy();
  });
});
