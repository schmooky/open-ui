import { defineConfig, devices } from '@playwright/test';

/**
 * Visual + introspection tests for the open-ui EXAMPLE CLIENT. They run against
 * this app's own dev server (port 5199) — completely separate from the docs site —
 * and screenshot the HUD on a matrix of real devices so you can SEE how it looks
 * on a phone, tablet and desktop. Screenshots land in `screenshots/`.
 *
 *   pnpm --dir examples/demo test:visual
 */
export default defineConfig({
  testDir: './tests',
  testIgnore: '**/matrix.spec.ts', // the device matrix has its own config (playwright.matrix.config.ts)
  timeout: 40_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'line' : [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    headless: true,
    trace: 'on-first-retry',
  },
  // One project per device — Playwright's descriptors carry the real viewport,
  // device-pixel-ratio and touch flags, so the shots match the device. We pin the
  // engine to Chromium so the suite needs only `playwright install chromium`
  // (mobile descriptors otherwise default to WebKit). Emulation is enough for
  // layout screenshots; swap to WebKit if you want true Safari rendering.
  // One project per device × ORIENTATION, so the locale matrix + screenshots cover
  // phone / tablet / desktop in BOTH portrait and landscape.
  projects: [
    { name: 'iphone-13', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'iphone-13-landscape', use: { ...devices['iPhone 13 landscape'], browserName: 'chromium' } },
    { name: 'pixel-5', use: { ...devices['Pixel 5'], browserName: 'chromium' } },
    { name: 'pixel-5-landscape', use: { ...devices['Pixel 5 landscape'], browserName: 'chromium' } },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'], browserName: 'chromium' } },
    { name: 'ipad-landscape', use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
