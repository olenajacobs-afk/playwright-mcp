# Smoke Tests — Victoria's Secret Website

Comprehensive smoke test suite covering all major user journeys and critical website functionality.

## 📋 Test Coverage

### 1. **Homepage Tests** (`smoke_homepage.spec.ts`)
- Homepage loads successfully (200 status)
- Page body is visible
- Header is present and visible
- Main content area is visible
- No console errors

### 2. **Header & Navigation** (`smoke_header_navigation.spec.ts`)
- Header renders with navigation links
- Search icon/button is visible
- Account/Login link is visible
- Shopping bag icon is visible
- Logo/Home link is clickable

### 3. **Search Functionality** (`smoke_search.spec.ts`)
- Search input is accessible
- Can type in search field
- Search suggestions appear
- Can submit search
- Search results page loads

### 4. **Product Navigation (PLP)** (`smoke_plp_navigation.spec.ts`)
- PLP page loads successfully
- Product list is visible (with item count)
- First product is clickable
- Can navigate to product detail page
- Filter controls are visible
- Sort options are available
- Pagination or load more is available

### 5. **Product Details (PDP)** (`smoke_product_details.spec.ts`)
- Can navigate to product detail page
- Product image is visible
- Product name/title is visible
- Product price is visible
- Size selection is available
- Color selection is available
- Add to Bag button is visible
- Can add item to bag successfully

### 6. **Authentication** (`smoke_authentication.spec.ts`)
- Sign in page loads
- Email input field is visible
- Password input field is visible
- Sign in button is visible
- Forgot password link is visible
- Sign up link is visible
- Account icon leads to login

### 7. **Footer & Links** (`smoke_footer.spec.ts`)
- Footer is present and visible
- Footer contains links
- Copyright/Legal information is present
- Footer has multiple columns/sections
- Social media links are present
- Newsletter signup is available
- Key footer links are clickable

### 8. **Menu & Navigation** (`smoke_menu_navigation.spec.ts`)
- NEW menu is accessible
- BRAS menu is accessible
- PANTIES menu is accessible
- Can hover over NEW menu
- Menu items are clickable
- Mega menu structure is present
- Can navigate from menu

### 9. **Full Website Journeys** (`smoke_full_journey.spec.ts`)
- **Journey 1**: Home → Search → PLP → PDP → Cart
- **Journey 2**: Home → Menu → Category Page
- **Journey 3**: Home → Account Page

## 🚀 Running Smoke Tests

### Run all smoke tests:
```bash
npx playwright test pw-tests/smoke --project=chromium --reporter=line
```

### Run specific smoke test file:
```bash
npx playwright test pw-tests/smoke/smoke_homepage.spec.ts --project=chromium
```

### Run with HTML report:
```bash
npx playwright test pw-tests/smoke --project=chromium --reporter=html
```

### Run in headed mode (see browser):
```bash
npx playwright test pw-tests/smoke --project=chromium --headed
```

### Run with debug mode:
```bash
npx playwright test pw-tests/smoke --project=chromium --debug
```

## 📊 Test Statistics

| Category | File | Tests |
|----------|------|-------|
| Homepage | `smoke_homepage.spec.ts` | 5 |
| Header | `smoke_header_navigation.spec.ts` | 5 |
| Search | `smoke_search.spec.ts` | 5 |
| PLP | `smoke_plp_navigation.spec.ts` | 7 |
| PDP | `smoke_product_details.spec.ts` | 8 |
| Auth | `smoke_authentication.spec.ts` | 7 |
| Footer | `smoke_footer.spec.ts` | 7 |
| Menu | `smoke_menu_navigation.spec.ts` | 7 |
| Full Journey | `smoke_full_journey.spec.ts` | 3 |
| **TOTAL** | **9 files** | **54 tests** |

## ✅ Expected Results

All smoke tests should pass with:
- ✓ 54 passed
- ✗ 0 failed
- ⏱️ ~60-90 seconds total execution time

## 🔍 Test Strategy

### What's Tested:
- ✅ Page loads (HTTP 200)
- ✅ Critical UI elements visible
- ✅ Navigation functionality
- ✅ Search operations
- ✅ Product discovery & selection
- ✅ Shopping cart operations
- ✅ Authentication flows
- ✅ End-to-end user journeys

### What's NOT Tested:
- ❌ Payment processing (requires credentials)
- ❌ Checkout completion (payment gateways)
- ❌ Account creation (email verification)
- ❌ Order history (requires login)
- ❌ Detailed product specifications

## 🛠️ Maintenance

### When to Update Smoke Tests:
1. **Website redesign** → Update selectors & expectations
2. **New menu items** → Update menu navigation tests
3. **Feature changes** → Update affected test cases
4. **Broken tests** → Fix selectors or update logic

### Common Issues:

| Issue | Solution |
|-------|----------|
| "Element not found" | Check if selector changed or page structure updated |
| "Timeout waiting" | Increase timeout or add `page.waitForTimeout()` |
| "Navigation failed" | Verify URL patterns and link targets |
| "Search not working" | Check if search input selector changed |

## 📚 Related Test Suites

- **E2E Tests**: `pw-tests/vs_*.spec.ts` (detailed functionality)
- **Performance Tests**: `pw-tests/*_performance.spec.ts` (load times, metrics)
- **Menu Tests**: `pw-tests/vs_new_menu_*.spec.ts` (NEW menu structure)

## 🎯 CI/CD Integration

### Recommended CI/CD Usage:
```yaml
# Run smoke tests first (quick validation)
- name: Run Smoke Tests
  run: npx playwright test pw-tests/smoke --project=chromium --reporter=line

# Only run detailed tests if smoke tests pass
- name: Run Full Test Suite
  run: npx playwright test pw-tests --reporter=html
  if: success()
```

## 📝 Notes

- Tests use `bestEffortDismissOverlays()` to handle cookie consent and other popups
- Some tests gracefully skip if features aren't found (optional UI elements)
- Console logging helps identify which step failed during test runs
- Tests are independent and can run in parallel

## 🤝 Contributing

When adding new smoke tests:
1. Create tests in appropriate category file
2. Follow naming convention: `SMOKE-CATEGORY-##`
3. Add clear console logs for debugging
4. Update this README with new test counts
5. Ensure tests are stable and don't create side effects

---

**Last Updated**: September 2026  
**Test Count**: 54  
**Status**: ✅ All tests passing
