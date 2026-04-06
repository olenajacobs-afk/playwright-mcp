import { defineConfig } from '@playwright/test';

const isHeaded = process.env.HEADLESS === '0';
const headless = isHeaded ? false : true;
const slowMo = process.env.SLOWMO ? Number(process.env.SLOWMO) : 0;

// Headed + slowMo runs are primarily for interactive demos; they need more time
// and fewer parallel windows to avoid flaky page/context closures.
const globalTimeout = isHeaded ? (slowMo > 0 ? 240_000 : 180_000) : 90_000;
const expectTimeout = isHeaded ? (slowMo > 0 ? 25_000 : 20_000) : 15_000;

export default defineConfig({
  testDir: './pw-tests',
  timeout: globalTimeout,
  expect: { timeout: expectTimeout },
  fullyParallel: true,
  workers: isHeaded ? 1 : undefined,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    headless,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    launchOptions: { slowMo },
  },
  projects: [
    {
      name: 'chromium-desktop-1440',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'chromium-desktop-1920',
      use: {
        browserName: 'chromium',
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
});
