import { test, expect } from '@playwright/test';
import {
  VS_BASE_URL,
  bestEffortDismissOverlays,
  ensureNoBlockingOverlays,
  makeWarn,
} from './utils/vs';

test.describe('8.x Login / Sign in (Desktop)', () => {
  test('LOG-TC-01 — Login page or modal shows sign-in entry controls', async ({ page }, testInfo) => {
    const warn = makeWarn(testInfo);

    const signInUrl = `${VS_BASE_URL}account/signin`;

    await page.goto(signInUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await bestEffortDismissOverlays(page);
    await ensureNoBlockingOverlays(page);

    // Sign-in fields can sit in a dialog overlay or on the main document.
    const dialog = page.locator('[role="dialog"]').first();
    const hasDialog = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
    const scope = hasDialog ? dialog : page;

    await expect(page, 'Expected sign-in/account route').toHaveURL(/signin|sign-in|account/i, { timeout: 25_000 });

    const emailLike = scope
      .locator(
        'input[type="email"], input[autocomplete="email"], input[inputmode="email"], input[name*="email" i], input[id*="email" i]'
      )
      .first();
    const password = scope.locator('input[type="password"]').first();
    const continueButton = scope.getByRole('button', { name: /continue/i }).first();

    if ((await emailLike.count()) === 0)
      warn('No email-like input found yet (site may hydrate slowly or change selectors).');
    if ((await password.count()) === 0) warn('No password input found yet (site may be using an email-first sign-in flow).');

    await expect
      .poll(async () => (await emailLike.count()) > 0 && (await emailLike.isVisible().catch(() => false)), {
        timeout: 30_000,
        message: 'Email field should become visible on sign-in UI',
      })
      .toBeTruthy();

    const passwordVisible =
      (await password.count().catch(() => 0)) > 0 && (await password.isVisible().catch(() => false));
    const continueVisible =
      (await continueButton.count().catch(() => 0)) > 0 && (await continueButton.isVisible().catch(() => false));

    expect(
      passwordVisible || continueVisible,
      'Expected either a password field or a Continue button on sign-in UI'
    ).toBeTruthy();
  });
});
