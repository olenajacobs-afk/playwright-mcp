import { test, expect } from '@playwright/test';
import {
  VS_BASE_URL,
  bestEffortDismissOverlays,
  ensureNoBlockingOverlays,
  getHeader,
} from '../utils/vs';

test.describe('SMOKE: Authentication', () => {
  test('SMOKE-AUTH-01 — Sign in page loads', async ({ page }) => {
    const signInUrl = `${VS_BASE_URL}account/signin`;

    const response = await page.goto(signInUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    expect(response?.status()).toBe(200);
    console.log('✓ Sign in page loaded');
  });

  test('SMOKE-AUTH-02 — Email input field is visible', async ({ page }) => {
    const signInUrl = `${VS_BASE_URL}account/signin`;
    await page.goto(signInUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const emailInput = page.locator(
      'input[type="email"], input[autocomplete="email"], input[inputmode="email"], input[name*="email" i], input[id*="email" i]'
    ).first();

    await expect(emailInput).toBeVisible();
    console.log('✓ Email input is visible');
  });

  test('SMOKE-AUTH-03 — Password input field is visible', async ({ page }) => {
    const signInUrl = `${VS_BASE_URL}account/signin`;
    await page.goto(signInUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const passwordInput = page.locator('input[type="password"]').first();
    const isVisible = await passwordInput.isVisible({ timeout: 3000 }).catch(() => false);

    expect(isVisible).toBeTruthy();
    console.log('✓ Password input is visible');
  });

  test('SMOKE-AUTH-04 — Sign in button is visible', async ({ page }) => {
    const signInUrl = `${VS_BASE_URL}account/signin`;
    await page.goto(signInUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const signInButton = page.locator(
      'button:has-text("Sign In"), button:has-text("Login"), button:has-text("Continue")'
    ).first();

    await expect(signInButton).toBeVisible();
    console.log('✓ Sign in button is visible');
  });

  test('SMOKE-AUTH-05 — Forgot password link is visible', async ({ page }) => {
    const signInUrl = `${VS_BASE_URL}account/signin`;
    await page.goto(signInUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const forgotPasswordLink = page.locator(
      'a:has-text("Forgot"), a[href*="forgot"], a[href*="reset"]'
    ).first();

    const isVisible = await forgotPasswordLink.isVisible({ timeout: 3000 }).catch(() => false);
    expect(isVisible).toBeTruthy();
    console.log('✓ Forgot password link is visible');
  });

  test('SMOKE-AUTH-06 — Sign up link is visible', async ({ page }) => {
    const signInUrl = `${VS_BASE_URL}account/signin`;
    await page.goto(signInUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const signUpLink = page.locator(
      'a:has-text("Sign Up"), a:has-text("Register"), a[href*="signup"], a[href*="register"]'
    ).first();

    const isVisible = await signUpLink.isVisible({ timeout: 3000 }).catch(() => false);
    expect(isVisible).toBeTruthy();
    console.log('✓ Sign up link is visible');
  });

  test('SMOKE-AUTH-07 — Account icon leads to login', async ({ page }) => {
    await page.goto(VS_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);

    const header = await getHeader(page);
    const accountLink = header.locator(
      'a[href*="signin"], a[href*="account"], button[aria-label*="account" i]'
    ).first();

    await expect(accountLink).toBeVisible();

    const href = await accountLink.getAttribute('href');
    if (href) {
      expect(href).toMatch(/signin|account|login/i);
    }

    console.log('✓ Account icon links to login');
  });
});
