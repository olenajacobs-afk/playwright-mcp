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

  timeout: 120_000,
  fullyParallel: true,
  workers: 5,

  // 4. CLEAN TERMINAL: List only the test names
  reporter: [['list'], ['html']],

  use: {
    baseURL: 'https://www.victoriassecret.com',
    trace: 'on-first-retry',
    headless: headless,
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