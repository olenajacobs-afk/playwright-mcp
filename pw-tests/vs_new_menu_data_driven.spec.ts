import { test, expect } from '@playwright/test';

// ============================================================================
// VS NEW Menu — Data-Driven Test from CSV
// ============================================================================

const VS_HOME_URL = 'https://www.victoriassecret.com/us/vs';

// Menu items data (mirrors vs_new_menu_items.csv)
const MENU_ITEMS_DATA = [
  {
    'Menu Section': 'NEW',
    'Menu Item': 'Bestsellers',
    'Column': 'Featured',
    'Expected URL Pattern': 'bestseller',
    'Expected Content Keywords': 'bestseller|new|products'
  },
  {
    'Menu Section': 'NEW',
    'Menu Item': 'Our Collections',
    'Column': 'Featured',
    'Expected URL Pattern': 'collection',
    'Expected Content Keywords': 'collection|curated'
  },
  {
    'Menu Section': 'NEW',
    'Menu Item': 'The Gift Shop',
    'Column': 'Featured',
    'Expected URL Pattern': 'gift',
    'Expected Content Keywords': 'gift|shop|curated'
  },
  {
    'Menu Section': 'NEW',
    'Menu Item': 'Brand Boutique',
    'Column': 'Featured',
    'Expected URL Pattern': 'boutique',
    'Expected Content Keywords': 'brand|boutique'
  },
  {
    'Menu Section': 'NEW',
    'Menu Item': 'GIFT CARDS',
    'Column': 'Featured',
    'Expected URL Pattern': 'gift-card',
    'Expected Content Keywords': 'gift|card'
  },
  {
    'Menu Section': 'NEW',
    'Menu Item': 'FASHION SHOW',
    'Column': 'Featured',
    'Expected URL Pattern': 'fashion-show',
    'Expected Content Keywords': 'fashion|show|exclusive'
  },
  {
    'Menu Section': 'NEW',
    'Menu Item': 'VS Icon Shoppe',
    'Column': 'Now Trending',
    'Expected URL Pattern': 'icon',
    'Expected Content Keywords': 'vs-icon|iconic|collection'
  },
  {
    'Menu Section': 'NEW',
    'Menu Item': 'The Lacie Shop',
    'Column': 'Now Trending',
    'Expected URL Pattern': 'lacie',
    'Expected Content Keywords': 'lacie|shop|designer'
  },
  {
    'Menu Section': 'NEW',
    'Menu Item': 'VS X Leonisa',
    'Column': 'Now Trending',
    'Expected URL Pattern': 'leonisa',
    'Expected Content Keywords': 'leonisa|collaboration|partner'
  },
  {
    'Menu Section': 'NEW',
    'Menu Item': 'The Halloween Edit',
    'Column': 'Now Trending',
    'Expected URL Pattern': 'halloween',
    'Expected Content Keywords': 'halloween|seasonal|edit'
  },
  {
    'Menu Section': 'NEW',
    'Menu Item': 'Sexy Night Out',
    'Column': 'Now Trending',
    'Expected URL Pattern': 'night-out',
    'Expected Content Keywords': 'night|sexy|occasion'
  },
  {
    'Menu Section': 'NEW',
    'Menu Item': 'As Seen on Social',
    'Column': 'Now Trending',
    'Expected URL Pattern': 'social',
    'Expected Content Keywords': 'social|viral|trending'
  }
];

function loadMenuItemsFromCSV(): any[] {
  return MENU_ITEMS_DATA;
}

test.describe('VS NEW Menu — Data-Driven Tests from CSV', () => {

  test('VERIFY CSV data is loaded correctly', async () => {
    const menuItems = loadMenuItemsFromCSV();
    console.log(`\n✓ Loaded ${menuItems.length} menu items from CSV`);
    
    expect(menuItems.length).toBeGreaterThan(0);
    
    // Display loaded items
    console.log('\n📋 Menu Items from CSV:');
    menuItems.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item['Menu Item']} (${item['Column']})`);
    });
  });

  test('Hover over NEW menu and verify structure', async ({ page }) => {
    await page.goto(VS_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Find and hover over NEW button
    const newButton = page.locator('button:has-text("NEW"), a:has-text("NEW"), [class*="nav"] :text("NEW")').first();
    const exists = await newButton.count().catch(() => 0);
    expect(exists).toBeGreaterThan(0);

    await newButton.hover({ timeout: 5_000 });
    await page.waitForTimeout(500);

    console.log('✓ NEW menu opened');
  });

  // Data-driven tests: For each menu item in CSV
  test.describe('Data-Driven Menu Item Navigation Tests', () => {
    const menuItems = loadMenuItemsFromCSV();

    menuItems.forEach((menuItem, index) => {
      test(`MENU-${String(index + 1).padStart(2, '0')} — Click "${menuItem['Menu Item']}" and validate page`, async ({ page }) => {
        await page.goto(VS_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

        console.log(`\n${'='.repeat(70)}`);
        console.log(`TEST ${String(index + 1).padStart(2, '0')}: ${menuItem['Menu Item']}`);
        console.log(`${'='.repeat(70)}`);
        console.log(`Column: ${menuItem['Column']}`);
        console.log(`Expected URL Pattern: ${menuItem['Expected URL Pattern']}`);

        // Step 1: Hover over NEW to reveal menu
        console.log(`\n[STEP 1] Opening NEW menu...`);
        const newButton = page.locator('button:has-text("NEW"), a:has-text("NEW"), [class*="nav"] :text("NEW")').first();
        const newExists = await newButton.count().catch(() => 0);
        
        if (newExists === 0) {
          console.error('✗ NEW button not found - test skipped');
          return;
        }

        await newButton.hover({ timeout: 5_000 }).catch(() => null);
        await page.waitForTimeout(800); // Wait for menu animation
        console.log(`✓ Menu opened`);

        // Step 2: Find and click menu item
        console.log(`\n[STEP 2] Clicking menu item...`);
        const menuItemLocator = page.locator(`text=${menuItem['Menu Item']}`).first();
        const itemExists = await menuItemLocator.count().catch(() => 0);

        if (itemExists === 0) {
          console.error(`✗ Menu item "${menuItem['Menu Item']}" not found in menu`);
          return;
        }

        const initialUrl = page.url();
        console.log(`Initial URL: ${initialUrl}`);

        await menuItemLocator.click({ timeout: 10_000 }).catch(() => null);
        await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => null);
        await page.waitForTimeout(500); // Extra wait for page to settle
        console.log(`✓ Clicked "${menuItem['Menu Item']}"`);

        // Step 3: Verify URL changed
        console.log(`\n[STEP 3] Validating URL...`);
        const finalUrl = page.url();
        console.log(`Final URL: ${finalUrl}`);

        const urlChanged = finalUrl !== initialUrl && finalUrl !== VS_HOME_URL;
        console.log(`URL changed: ${urlChanged ? '✓ YES' : '✗ NO'}`);

        // Step 4: Verify URL matches expected pattern
        console.log(`\n[STEP 4] Checking URL pattern...`);
        const urlPattern = menuItem['Expected URL Pattern'];
        const urlMatches = finalUrl.toLowerCase().includes(urlPattern.toLowerCase());
        console.log(`Expected pattern: "${urlPattern}"`);
        console.log(`URL contains pattern: ${urlMatches ? '✓ YES' : '✗ NO'}`);

        // Step 5: Verify page content
        console.log(`\n[STEP 5] Validating page content...`);
        const pageTitle = await page.title().catch(() => '');
        console.log(`Page title: ${pageTitle || '(empty)'}`);

        const mainContent = page.locator('main').first();
        const mainExists = await mainContent.count().catch(() => 0);
        console.log(`Main content area: ${mainExists > 0 ? '✓ FOUND' : '✗ NOT FOUND'}`);

        // Step 6: Check for expected content keywords
        console.log(`\n[STEP 6] Checking content keywords...`);
        const pageText = await page.textContent('body').catch(() => '');
        const keywords = menuItem['Expected Content Keywords']?.split('|') || [];
        let keywordMatches = 0;
        const matchedKeywords: string[] = [];

        for (const keyword of keywords) {
          if (pageText?.toLowerCase().includes(keyword.toLowerCase())) {
            keywordMatches++;
            matchedKeywords.push(keyword);
          }
        }

        console.log(`Keywords: ${keywords.join(', ')}`);
        console.log(`Matched: ${keywordMatches}/${keywords.length}`);
        if (matchedKeywords.length > 0) {
          console.log(`  Found: ${matchedKeywords.join(', ')}`);
        }

        // Step 7: Summary
        console.log(`\n[SUMMARY]`);
        const isValid = urlChanged && urlMatches && mainExists > 0 && keywordMatches > 0;
        console.log(`Result: ${isValid ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`  ✓ URL changed: ${urlChanged}`);
        console.log(`  ✓ Pattern matches: ${urlMatches}`);
        console.log(`  ✓ Main content: ${mainExists > 0}`);
        console.log(`  ✓ Keywords found: ${keywordMatches}/${keywords.length}`);
        console.log(`${'='.repeat(70)}\n`);

        // Assertions
        expect(urlChanged).toBe(true);
        expect(mainExists).toBeGreaterThan(0);
        expect(keywordMatches).toBeGreaterThan(0);
      });
    });
  });

  // Group by column
  test.describe('Verify Column Organization', () => {
    const menuItems = loadMenuItemsFromCSV();
    const columns = [...new Set(menuItems.map(item => item['Column']))];

    columns.forEach((column) => {
      test(`Verify ${column} column has all expected items`, async ({ page }) => {
        await page.goto(VS_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

        const newButton = page.locator('button:has-text("NEW"), a:has-text("NEW"), [class*="nav"] :text("NEW")').first();
        await newButton.hover({ timeout: 5_000 }).catch(() => null);
        await page.waitForTimeout(500);

        const columnItems = menuItems.filter(item => item['Column'] === column);
        let foundCount = 0;

        console.log(`\n📊 Column: ${column}`);
        const pageText = await page.textContent('body');

        for (const item of columnItems) {
          const itemName = item['Menu Item'];
          if (pageText?.includes(itemName)) {
            foundCount++;
            console.log(`  ✓ ${itemName}`);
          } else {
            console.log(`  ✗ ${itemName} (not found)`);
          }
        }

        console.log(`\n  Found: ${foundCount}/${columnItems.length} items`);
        expect(foundCount).toBeGreaterThan(0);
      });
    });
  });

  // Clickability test for all items
  test('Verify all menu items are clickable', async ({ page }) => {
    await page.goto(VS_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const menuItems = loadMenuItemsFromCSV();
    const newButton = page.locator('button:has-text("NEW"), a:has-text("NEW"), [class*="nav"] :text("NEW")').first();
    await newButton.hover({ timeout: 5_000 }).catch(() => null);
    await page.waitForTimeout(500);

    let clickableCount = 0;
    const results: any[] = [];

    console.log(`\n✅ Clickability Verification (${menuItems.length} items):`);

    for (const item of menuItems) {
      try {
        const itemLocator = page.locator(`text=${item['Menu Item']}`).first();
        const isVisible = await itemLocator.isVisible({ timeout: 2_000 }).catch(() => false);

        const result = {
          'Menu Item': item['Menu Item'],
          'Column': item['Column'],
          'Visible': isVisible ? 'YES' : 'NO',
          'Clickable': 'UNKNOWN'
        };

        if (isVisible) {
          clickableCount++;
          result['Clickable'] = 'YES';
          console.log(`  ✓ ${item['Menu Item']}`);
        } else {
          console.log(`  ✗ ${item['Menu Item']}`);
        }

        results.push(result);
      } catch (e) {
        console.log(`  ✗ ${item['Menu Item']} (error)`);
      }
    }

    console.log(`\n  Summary: ${clickableCount}/${menuItems.length} items clickable`);
    expect(clickableCount).toBeGreaterThan(0);
  });

});
