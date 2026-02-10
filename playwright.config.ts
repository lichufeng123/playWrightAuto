import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env (optional)
// - Default: .env in repo root
// - Override via ENV_FILE, e.g. ENV_FILE=.env.prod
const envFile = process.env.ENV_FILE || '.env';
const envPath = path.resolve(__dirname, envFile);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

function resolveBaseURL(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;

  const env = (process.env.PW_ENV || 'test').toLowerCase();
  if (env === 'prod' || env === 'production' || env === '正式' || env === 'release') {
    return 'https://base-platform.insight-aigc.com';
  }
  return 'https://test-base-platform.insight-aigc.com';
}

function defaultAuthUserForBaseURL(url: string): 'testUser' | 'prodUser' {
  try {
    const host = new URL(url).host;
    return host.startsWith('test-') ? 'testUser' : 'prodUser';
  } catch {
    return 'testUser';
  }
}

function normalizeAuthUser(value: string | undefined, baseURLForDefault: string): string {
  const raw = (value || '').trim();
  if (!raw) return defaultAuthUserForBaseURL(baseURLForDefault);

  const lowered = raw.toLowerCase();

  // Backward-compatible aliases
  if (lowered === 'vip' || lowered === 'vipuser') return 'testUser';
  if (lowered === 'normal' || lowered === 'normaluser') return 'prodUser';

  // New canonical values
  if (lowered === 'test' || lowered === 'testuser') return 'testUser';
  if (lowered === 'prod' || lowered === 'produser') return 'prodUser';

  return raw;
}

function safeHostForFileName(baseURL: string): string {
  try {
    return new URL(baseURL).host.replace(/[:]/g, '_');
  } catch {
    return baseURL.replace(/^https?:\/\//i, '').replace(/[^a-z0-9._-]/gi, '_');
  }
}

const baseURL = resolveBaseURL();
const authUser = normalizeAuthUser(process.env.PW_USER, baseURL);
const storageStatePath =
  process.env.STORAGE_STATE ||
  path.join('playwright', '.auth', `state.${safeHostForFileName(baseURL)}.${authUser}.json`);

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({

  globalSetup: require.resolve('./auth/global-setup'),
  testDir: './tests',
  expect: {
    timeout: 15000,
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    // baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    // Priority: BASE_URL > PW_ENV mapping (test/prod)
    baseURL,
    headless: false,
    trace: 'on-first-retry',
    // Per-env & per-user storageState (avoids mixing test/prod cookies)
    storageState: storageStatePath,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
