
Source of truth: `vs_bra_selections_with_results.csv`

## Global rules (apply to every test)

- Market/site: US — https://www.victoriassecret.com/us/
- If any popup appears (cookies, marketing modal, surveys): close/dismiss it and continue.
- Product selection rule:
  - From the PLP for the requested bra type, click the **first product tile image** under the Filter/Sort area.
  - If that PDP does not have **both Band and Cup** selectors, go back and try the next product tile until you find a PDP with Band + Cup.
- Band selection rule:
  - Try bands in order: **34 → 32 → 36 → 38 → 40**.
  - Select the **first available band that is not crossed out / not disabled**.
- Cup selection rule:
  - Try Cup preferred first, then Cup fallback.
  - Select the first available cup that is not crossed out / not disabled.
- Color selection rule:
  - Try preferred color first, then fallbacks.
  - If none exist on the PDP, select the first available color and note it.
- Add to bag rule:
  - Click **Add to Bag**.
  - Expected result: You see “Added to bag/cart” confirmation OR the bag count updates OR a mini-bag opens.

---

## Test Case 1 — Push Up

**Type:** Push Up

**Selections**
- Color preferred: Black
- Color fallback #1: Nude
- Color fallback #2: White
- Bands (ordered): 34 | 32 | 36 | 38 | 40
- Cup preferred: B
- Cup fallback: C
- Quantity: 1

**Steps**
1. Go to https://www.victoriassecret.com/us/
2. Navigate to **Bras**.
3. Select **Push Up**.
4. On the PLP, click the **first product tile image**.
5. On PDP: select the color (preferred → fallbacks).
6. Select **Band**: pick first available from 34/32/36/38/40 (not crossed out).
7. Select **Cup**: B (fallback C if needed).
8. Click **Add to Bag**.

**Expected**
- Product is added successfully (confirmation / bag updates).

**Result**
- Status: PASS / FAIL
- Notes / Evidence link:

---

## Test Case 2 — Full-Coverage

**Type:** Full-Coverage

**Selections**
- Color preferred: Nude
- Color fallback #1: Black
- Color fallback #2: White
- Bands (ordered): 34 | 32 | 36 | 38 | 40
- Cup preferred: C
- Cup fallback: B
- Quantity: 1

**Steps**
1. Go to https://www.victoriassecret.com/us/
2. Navigate to **Bras**.
3. Select **Full Coverage**.
4. On the PLP, click the **first product tile image**.
5. On PDP: select the color (preferred → fallbacks).
6. Select **Band**: pick first available from 34/32/36/38/40 (not crossed out).
7. Select **Cup**: C (fallback B if needed).
8. Click **Add to Bag**.

**Expected**
- Product is added successfully (confirmation / bag updates).

**Result**
- Status: PASS / FAIL
- Notes / Evidence link:

---

## Test Case 3 — Wireless

**Type:** Wireless

**Selections**
- Color preferred: Black
- Color fallback #1: Nude
- Color fallback #2: White
- Bands (ordered): 34 | 32 | 36 | 38 | 40
- Cup preferred: B
- Cup fallback: C
- Quantity: 1

**Steps**
1. Go to https://www.victoriassecret.com/us/
2. Navigate to **Bras**.
3. Select **Wireless**.
4. On the PLP, click the **first product tile image**.
5. On PDP: select the color (preferred → fallbacks).
6. Select **Band**: pick first available from 34/32/36/38/40 (not crossed out).
7. Select **Cup**: B (fallback C if needed).
8. Click **Add to Bag**.

**Expected**
- Product is added successfully (confirmation / bag updates).

**Result**
- Status: PASS / FAIL
- Notes / Evidence link:

---

## Test Case 4 — Sport Bra

**Type:** Sport Bra

**Selections**
- Color preferred: Berrylicious (07ZP)
- Color fallback #1: Black
- Color fallback #2: White
- Bands (ordered): 34 | 32 | 36 | 38 | 40
- Cup preferred: C
- Cup fallback: B
- Quantity: 1

**Steps**
1. Go to https://www.victoriassecret.com/us/
2. Navigate to **Bras**.
3. Select **Sports Bras**.
4. On the PLP, click the **first product tile image**.
5. If no Band + Cup selectors are present, go back and try the next product tile until Band + Cup exists.
6. On PDP: select the color (preferred → fallbacks).
7. Select **Band**: pick first available from 34/32/36/38/40 (not crossed out).
8. Select **Cup**: C (fallback B if needed).
9. Click **Add to Bag**.

**Expected**
- Product is added successfully (confirmation / bag updates).

**Result**
- Status: PASS / FAIL
- Notes / Evidence link:

---

## Test Case 5 — Lightly Lined

**Type:** Lightly Lined

**Selections**
- Color preferred: Nude
- Color fallback #1: Black
- Color fallback #2: White
- Bands (ordered): 34 | 32 | 36 | 38 | 40
- Cup preferred: B
- Cup fallback: C
- Quantity: 1

**Steps**
1. Go to https://www.victoriassecret.com/us/
2. Navigate to **Bras**.
3. Select **Lightly Lined**.
4. On the PLP, click the **first product tile image**.
5. On PDP: select the color (preferred → fallbacks).
6. Select **Band**: pick first available from 34/32/36/38/40 (not crossed out).
7. Select **Cup**: B (fallback C if needed).
8. Click **Add to Bag**.

**Expected**
- Product is added successfully (confirmation / bag updates).

**Result**
- Status: PASS / FAIL
- Notes / Evidence link:

---

## Test Case 6 — Strapless

**Type:** Strapless

**Selections**
- Color preferred: Nude
- Color fallback #1: Black
- Color fallback #2: White
- Bands (ordered): 34 | 32 | 36 | 38 | 40
- Cup preferred: B
- Cup fallback: C
- Quantity: 1

**Steps**
1. Go to https://www.victoriassecret.com/us/
2. Navigate to **Bras**.
3. Select **Strapless**.
4. On the PLP, click the **first product tile image**.
5. On PDP: select the color (preferred → fallbacks).
6. Select **Band**: pick first available from 34/32/36/38/40 (not crossed out).
7. Select **Cup**: B (fallback C if needed).
8. Click **Add to Bag**.

**Expected**
- Product is added successfully (confirmation / bag updates).

**Result**
- Status: PASS / FAIL
- Notes / Evidence link:

---

## Test Case 7 — Unlined

**Type:** Unlined

**Selections**
- Color preferred: Black
- Color fallback #1: Nude
- Color fallback #2: White
- Bands (ordered): 34 | 32 | 36 | 38 | 40
- Cup preferred: B
- Cup fallback: C
- Quantity: 1

**Steps**
1. Go to https://www.victoriassecret.com/us/
2. Navigate to **Bras**.
3. Select **Unlined**.
4. On the PLP, click the **first product tile image**.
5. On PDP: select the color (preferred → fallbacks).
6. Select **Band**: pick first available from 34/32/36/38/40 (not crossed out).
7. Select **Cup**: B (fallback C if needed).
8. Click **Add to Bag**.

**Expected**
- Product is added successfully (confirmation / bag updates).

**Result**
- Status: PASS / FAIL
- Notes / Evidence link:

---

## Test Case 8 — T‑Shirt Bras

**Type:** T‑Shirt Bras

**Selections**
- Color preferred: Nude
- Color fallback #1: Black
- Color fallback #2: White
- Bands (ordered): 34 | 32 | 36 | 38 | 40
- Cup preferred: B
- Cup fallback: C
- Quantity: 1

**Steps**
1. Go to https://www.victoriassecret.com/us/
2. Navigate to **Bras**.
3. Select **T‑Shirt Bras**.
4. On the PLP, click the **first product tile image**.
5. On PDP: select the color (preferred → fallbacks).
6. Select **Band**: pick first available from 34/32/36/38/40 (not crossed out).
7. Select **Cup**: B (fallback C if needed).
8. Click **Add to Bag**.

**Expected**
- Product is added successfully (confirmation / bag updates).

**Result**
- Status: PASS / FAIL
- Notes / Evidence link:

---

## Test Case 9 — Matching Sets

**Type:** Matching Sets

**Selections**
- Color preferred: Black
- Color fallback #1: Nude
- Color fallback #2: White
- Bands (ordered): 34 | 32 | 36 | 38 | 40
- Cup preferred: B
- Cup fallback: C
- Panty size: M
- Quantity: 1

**Steps**
1. Go to https://www.victoriassecret.com/us/
2. Navigate to **Bras**.
3. Select **Matching Sets**.
4. On the PLP, click the **first product tile image**.
5. On PDP: select the color (preferred → fallbacks).
6. Select **Band**: pick first available from 34/32/36/38/40 (not crossed out).
7. Select **Cup**: B (fallback C if needed).
8. Select **Panty size**: M (if a panty/bottom size selector is present).
9. Click **Add to Bag**.

**Expected**
- Product is added successfully (confirmation / bag updates).

**Result**
- Status: PASS / FAIL
- Notes / Evidence link:
