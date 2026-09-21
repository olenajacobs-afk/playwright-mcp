import { defineConfig, devices } from '@playwright/test';

const isHeaded = process.env.HEADLESS === '0';
const headless = isHeaded ? false : true;

export default defineConfig({
  // 1. Look in the root for all files
  testDir: './',

  // 2. Match all .ts files
  testMatch: '**/*.ts',

  // 3. Ignore helper folders and config to prevent errors
  testIgnore: [
    '**/node_modules/**',
    'playwright.config.ts',
    '**/utils/**',
    '**/dist/**',
    '**/*.d.ts'
  ],

  timeout: 180_000,           // Increased to 180s for live site
  fullyParallel: true,
  workers: 5,
  retries: 1,                 // Retry once on failure

  // 4. CLEAN TERMINAL: List only the test names
  reporter: [['list'], ['html']],

  use: {
    baseURL: 'https://www.victoriassecret.com',
    trace: 'on-first-retry',
    headless: headless,
    navigationTimeout: 60_000,  // 60s for navigation
    actionTimeout: 30_000,      // 30s for actions
  },

  // 5. THE MULTIPLIER: Running 2 projects will turn 258 files into 516 tests
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox', 
      use: { ...devices['Desktop Firefox'] },
    },
  ],
});