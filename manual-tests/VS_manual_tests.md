# Victoria’s Secret (US) — Manual Test Suites

Scope: Manual UI + functional test cases for the Victoria’s Secret US site (`https://www.victoriassecret.com/us/`) covering:
- 8.1 Global Header/Footer
- 8.2 Homepage
- 8.4 Search UI
- Navigation + Category Pages (PLP)

> Notes
> - These tests are designed for repeatable manual execution; selectors/wording may change on the live site.
> - When tests mention “desktop” and “mobile”, use the suggested viewports in **Test Environments**.

## Test Environments

- Desktop: 1440×900 (Chromium/Safari)
- Mobile: 390×844 (iPhone 12/13/14 size class)

## Common Preconditions

- Use a fresh session (Incognito/Private) for cookie/consent coverage.
- If a cookie consent / OneTrust banner appears, confirm it can be dismissed and does not block interactions.
- If geo/language prompts appear, choose US/English.

---

# 8.1 Global Header/Footer — Manual Test Cases

### GHF-TC-01 — Header renders and is usable
- Viewports: Desktop + Mobile
- Steps:
  1. Open `https://www.victoriassecret.com/us/`.
  2. Observe the top header area.
- Expected:
  - Header is visible without layout breakage.
  - Primary navigation entry point exists (desktop: top nav items; mobile: hamburger/menu).
  - Utility controls are present (at minimum: Search, Account entry point, Bag/Cart).

### GHF-TC-02 — Logo returns to Home
- Steps:
  1. Navigate to any non-home page (e.g., via a category link).
  2. Click the VS logo in the header.
- Expected:
  - Navigates back to the home page (`/us/`), without errors.

### GHF-TC-03 — Primary navigation access works
- Desktop Steps:
  1. Hover and/or click a top-level nav item.
- Mobile Steps:
  1. Tap the hamburger/menu button.
- Expected:
  - A navigation panel/mega menu opens.
  - Category links are visible and tappable/clickable.

### GHF-TC-04 — Search opens, accepts input, and returns results
- Steps:
  1. Activate Search from the header.
  2. Enter a common term (e.g., `bra`) and submit.
- Expected:
  - Search UI opens and accepts text.
  - A results page loads showing relevant items.
  - Back navigation returns to the prior page.

### GHF-TC-05 — Account entry point is reachable
- Steps:
  1. Click/tap the Account icon or account link.
- Expected:
  - Navigates to a sign-in / account page, or opens an account modal.
  - No broken link / 404.

### GHF-TC-06 — Bag/Cart entry point is reachable
- Steps:
  1. Click/tap the Bag/Cart icon.
- Expected:
  - Navigates to bag/cart view (or opens a mini-bag).
  - If empty, an empty-state message is shown.

### GHF-TC-07 — Sticky header behavior (if applicable)
- Steps:
  1. Scroll down the page.
  2. Observe whether the header stays visible or collapses.
- Expected:
  - Sticky/collapsing behavior (if present) does not block content.
  - Header controls remain usable.

### GHF-TC-08 — Header does not overlap main content
- Steps:
  1. Load home page.
  2. Verify the first meaningful content below header is not hidden.
- Expected:
  - Main content is fully visible and not covered by the header.

### GHF-TC-09 — Footer renders and contains core sections
- Steps:
  1. Scroll to the bottom of the page.
  2. Observe footer layout.
- Expected:
  - Footer is visible and not cut off.
  - Contains core link groups (e.g., Help/Customer Care, About, Stores, Legal/Privacy).

### GHF-TC-10 — Footer links navigate correctly
- Steps:
  1. Click at least 5 footer links across different groups.
- Expected:
  - Internal links load correct pages.
  - External links (if any) open appropriately and do not break the session.

### GHF-TC-11 — Newsletter signup (if present)
- Steps:
  1. In the footer, locate email/newsletter signup.
  2. Enter a valid email and submit.
- Expected:
  - User receives a confirmation message/state.
  - Validation errors appear for invalid email input.

### GHF-TC-12 — Social links (if present)
- Steps:
  1. Click social icons (e.g., Instagram, TikTok, Facebook).
- Expected:
  - Opens the correct social destination.

### GHF-TC-13 — Legal links are present
- Steps:
  1. Locate links like Terms, Privacy, Accessibility, Do Not Sell/Share (wording may vary).
  2. Open each in the footer.
- Expected:
  - Each legal link resolves to a valid page.

---

# 8.2 Homepage — Manual Test Cases

### HOME-TC-01 — Homepage loads without critical UI breakage
- Viewports: Desktop + Mobile
- Steps:
  1. Open `https://www.victoriassecret.com/us/`.
- Expected:
  - No blank screen.
  - Primary modules render (hero area, navigation entry, product/promotional sections).

### HOME-TC-02 — Hero module is visible and not broken
- Steps:
  1. Observe the hero (image/video).
- Expected:
  - Media loads (no broken image icon / empty player).
  - Hero headline/CTA (if present) is readable and not clipped.

### HOME-TC-03 — Hero CTA navigates to a relevant destination
- Steps:
  1. Click the main hero CTA (e.g., “Shop Now”).
- Expected:
  - Navigates to a relevant PLP/landing page.
  - Back navigation returns to the homepage.

### HOME-TC-04 — Featured content modules load and are clickable
- Steps:
  1. Scroll through the homepage.
  2. Click 3–5 promotional tiles/cards.
- Expected:
  - Each tile navigates to the expected category/landing page.

### HOME-TC-05 — Carousel/slider works (if present)
- Steps:
  1. Identify any carousel module.
  2. Use next/prev controls or swipe (mobile).
- Expected:
  - Carousel advances.
  - Visible content changes.

### HOME-TC-06 — No horizontal overflow (page should not side-scroll)
- Steps:
  1. On mobile, attempt to scroll horizontally.
- Expected:
  - Page does not unintentionally side-scroll.
  - No content extends off-screen.

### HOME-TC-07 — Links are distinguishable and tappable
- Viewports: Mobile
- Steps:
  1. Tap small CTAs/links inside modules.
- Expected:
  - Tap targets are not too small; taps register reliably.
  - No mis-taps due to overlapping elements.

### HOME-TC-08 — Performance sanity check
- Steps:
  1. Load homepage on a typical connection.
  2. Scroll from top to bottom.
- Expected:
  - No repeated long freezes.
  - Images progressively load (lazy load acceptable).

### HOME-TC-09 — Accessibility spot checks (homepage)
- Steps:
  1. Use keyboard `Tab` to traverse interactive elements near the top.
  2. Verify visible focus.
- Expected:
  - Focus is visible.
  - Hero CTA and nav controls are reachable.

---

# 8.4 Search UI — Manual Test Cases

> Suggested stable search term for execution: `bra`

### SEARCH-TC-01 — Search entry point is visible in header
- Viewports: Desktop + Mobile
- Steps:
  1. Open `https://www.victoriassecret.com/us/`.
  2. Observe header utilities.
- Expected:
  - A search control is visible (icon and/or input).
  - It is not blocked by overlays/banners.

### SEARCH-TC-02 — Search input opens and is aligned in the header
- Steps:
  1. Activate search.
  2. Observe search input placement.
- Expected:
  - Input is fully visible (not clipped).
  - Input does not overlap logo/nav/utility icons.
  - Clear/close controls (if present) are reachable.

### SEARCH-TC-03 — Search input interaction states
- Steps:
  1. Click into the input.
  2. Type `bra`.
  3. Use clear (X) if present; retype.
  4. Close/dismiss search (Esc or close button if present).
- Expected:
  - Visible focus state on the input.
  - Typed text is readable.
  - Clear action clears the input.
  - Close/dismiss returns to normal header state.

### SEARCH-TC-04 — Typeahead dropdown appears on typing
- Steps:
  1. With search open, type at least 2 characters (e.g., `br`).
- Expected:
  - A typeahead dropdown appears.
  - Suggestions/recommendations are visible.

### SEARCH-TC-05 — Typeahead dropdown readability (spacing + highlighting)
- Steps:
  1. In the typeahead dropdown, inspect the first 5 suggestions.
- Expected:
  - Text is readable (not cut off, not overlapping).
  - Spacing/padding makes items easy to scan.
  - Match highlighting is visible and does not reduce readability.

### SEARCH-TC-06 — Typeahead selection works (mouse/tap)
- Steps:
  1. Click/tap a suggestion.
- Expected:
  - Navigates to a relevant destination (SRP or PLP), or fills input and submits.

### SEARCH-TC-07 — Typeahead selection works (keyboard)
- Viewports: Desktop
- Steps:
  1. Type `bra`.
  2. Press ArrowDown to highlight a suggestion.
  3. Press Enter.
- Expected:
  - A suggestion is selected and navigation occurs (or query is applied).

### SEARCH-TC-08 — Submit search navigates to Search Results Page (SRP)
- Steps:
  1. Type `bra` in the search input.
  2. Press Enter / tap Search.
- Expected:
  - SRP loads without errors.
  - URL reflects the query (shareable/refreshable).

### SEARCH-TC-09 — SRP layout shows results count
- Steps:
  1. On SRP, locate results count (or “items” indicator).
- Expected:
  - Results count/indicator is visible.
  - It does not overlap other UI.

### SEARCH-TC-10 — SRP includes filter + sort controls
- Viewports: Desktop + Mobile
- Steps:
  1. Locate Filter and Sort controls.
  2. Open Filter UI.
  3. Open Sort UI.
- Expected:
  - Filter control is present and opens UI (desktop: sidebar/panel; mobile: drawer/dialog).
  - Sort control is present and can change selection.

### SEARCH-TC-11 — SRP results grid renders
- Steps:
  1. Inspect results grid/list.
- Expected:
  - Multiple products appear.
  - Tiles align properly; no overlap/cutoff.

### SEARCH-TC-12 — SRP no-results state is handled (edge case)
- Steps:
  1. Search for a nonsense term (e.g., `zzzxxyyqqq`).
- Expected:
  - Clear no-results message is displayed.
  - User has a path forward (suggestions, popular searches, navigation).

### BRAS-E2E-01 — E2E search BRAS → SRP → open first PDP
- Viewports: Desktop
- Steps:
  1. Open `https://www.victoriassecret.com/us/`.
  2. Dismiss any overlays (cookie/consent, email signup, etc.).
  3. Open Search in the header.
  4. Type `bras` and submit (Enter or Search icon).
  5. On the Search Results Page (SRP), click the first product in the results grid.
- Expected:
  - After submit, SRP loads without errors.
  - SRP URL reflects the query (contains `search` and `q=bras`).
  - Results grid renders with products.
  - Clicking the first product opens a Product Detail Page (PDP) (you leave the search page).
  - PDP shows a visible product title (H1).
  - PDP has an “Add to Bag” (or equivalent) CTA for purchasable items.

---

# Navigation + Category Pages (PLP) — Manual Test Cases

## NAV — Navigation Tests

### NAV-TC-01 — Global header navigation entry points render
- Viewports: Desktop + Mobile
- Steps:
  1. Open `https://www.victoriassecret.com/us/`.
- Expected:
  - Desktop: top nav items are visible.
  - Mobile: menu/hamburger is visible.

### NAV-TC-02 — Desktop mega menu opens via click
- Steps:
  1. Desktop viewport.
  2. Click a top-level nav item (e.g., Bras).
- Expected:
  - Mega menu opens with category links.

### NAV-TC-03 — Desktop mega menu opens via hover (if supported)
- Steps:
  1. Hover a top-level nav item.
- Expected:
  - Mega menu opens on hover OR hover does nothing but click still works.

### NAV-TC-04 — Mega menu closes (Close/X)
- Steps:
  1. Open mega menu.
  2. Click Close/X (if present).
- Expected:
  - Menu closes; page remains interactable.

### NAV-TC-05 — Mega menu closes (Esc / click outside)
- Steps:
  1. Open mega menu.
  2. Press `Esc`.
  3. Re-open and click outside.
- Expected:
  - Menu closes in at least one of these ways.

### NAV-TC-06 — No scroll trap when menu is open
- Steps:
  1. Open mega menu.
  2. Try scrolling the page and/or the menu.
- Expected:
  - If body scroll is locked, the menu content is scrollable when it overflows.

### NAV-TC-07 — Page scroll works after menu closes
- Steps:
  1. Close the menu.
  2. Scroll the page.
- Expected:
  - Page scroll works normally.

### NAV-TC-08 — Navigate to a category page (PLP) from menu
- Steps:
  1. Open menu.
  2. Click a category link.
- Expected:
  - Navigates to a PLP with a visible heading and product list/grid.

### NAV-TC-09 — Mobile menu opens
- Steps:
  1. Mobile viewport.
  2. Tap hamburger/menu.
- Expected:
  - Navigation panel opens and is usable.

### NAV-TC-10 — Mobile menu closes
- Steps:
  1. Close via Close/X or back gesture.
- Expected:
  - Menu closes without leaving a blocking overlay.

### NAV-TC-11 — History works (Back/Forward)
- Steps:
  1. Navigate from home → PLP.
  2. Use browser Back then Forward.
- Expected:
  - Navigation state is consistent; no broken screen.

## PLP — Category Page Tests

> Suggested stable PLP URL for execution: `https://www.victoriassecret.com/us/vs/bras`

### PLP-TC-01 — PLP loads and has a non-empty H1
- Steps:
  1. Open a PLP.
  2. Locate the page H1.
- Expected:
  - H1 exists and is not empty.

### PLP-TC-02 — Product grid/list renders with multiple products
- Steps:
  1. Observe product tiles/cards.
- Expected:
  - Multiple products appear (not an empty state).

### PLP-TC-03 — Product tile UI sanity
- Steps:
  1. Inspect 3 product tiles.
- Expected:
  - Each tile shows at least: image (or placeholder), name, and a way to open PDP.

### PLP-TC-04 — Navigate to PDP from a product tile
- Steps:
  1. Click a product tile or product title.
- Expected:
  - PDP opens.
  - Back returns to PLP.

### PLP-TC-05 — Filters are available and can be opened
- Desktop Expected:
  - Filter sidebar/accordion is visible or can be opened.
- Mobile Steps:
  1. Tap Filter/Filters.
- Mobile Expected:
  - Filter UI appears (drawer/dialog or inline panel).

### PLP-TC-06 — Apply a filter and verify applied state
- Steps:
  1. Open filters.
  2. Select a filter value (size/color/price).
- Expected:
  - PLP updates (product set may change).
  - An applied-filter indicator is visible (chip/tag/clear control).

### PLP-TC-07 — Clear filters (if supported)
- Steps:
  1. Click “Clear” or remove an applied filter chip.
- Expected:
  - Filters clear and the product set returns.

### PLP-TC-08 — Sort control is present and changes selection
- Steps:
  1. Open Sort.
  2. Choose a different sort option.
- Expected:
  - Sort selection updates (product order may change).

### PLP-TC-09 — Pagination / Load More / Infinite scroll
- Steps:
  1. Scroll toward bottom.
  2. If “Load more” exists, click it; otherwise continue scrolling.
- Expected:
  - More products load OR pagination navigates to next page.

### PLP-TC-10 — Responsive layout and usability
- Viewports: Desktop + Mobile
- Steps:
  1. Repeat a basic flow: open PLP → open filter → apply filter → open PDP.
- Expected:
  - No clipped UI; interactions remain possible in both viewports.

---

## Automation Reference (Optional)

Automated tests corresponding to these manual suites (desktop-only):

- Playwright Test Runner (one automated test per manual test case ID):
  - Header/Footer: `pw-tests/vs_global_header_footer.spec.ts`
  - Homepage: `pw-tests/vs_homepage.spec.ts`
  - Search UI: `pw-tests/vs_search_ui.spec.ts`
  - Navigation + PLP: `pw-tests/vs_navigation_plp.spec.ts`

- Legacy custom runner scripts (broader checks per file):
  - Header/Footer: `tests/vs_header_footer.ts`
  - Homepage: `tests/vs_homepage.ts`
  - Search UI: `tests/vs_search_ui.ts`
  - Navigation + PLP: `tests/vs_plp_navigation.ts`
