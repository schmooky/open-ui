import { defineConfig } from '@playwright/test';

/**
 * DEVICE MATRIX — the idiomatic Playwright way: one PROJECT per device/orientation,
 * each carrying its real viewport + device-pixel-ratio + touch flags. Running it
 * fans the SAME spec (tests/matrix.spec.ts) across every project in parallel and
 * drops a screenshot of the HUD, the menu and the buy-feature modal into
 * `screenshots/matrix/<category>/`. A 2026-ish set of popular phones (portrait +
 * landscape), tablets (both orientations) and desktop resolutions.
 *
 *   pnpm --dir examples/demo matrix        # capture + build contact sheets
 */

type Dev = readonly [name: string, w: number, h: number];

// CSS-viewport sizes (portrait) for popular 2026 devices.
const PHONES: Dev[] = [
  ['iPhone 16 Pro Max', 440, 956],
  ['iPhone 16 Pro', 402, 874],
  ['iPhone 15', 393, 852],
  ['iPhone SE', 375, 667],
  ['Galaxy S24 Ultra', 384, 824],
  ['Pixel 9', 412, 915],
];
const TABLETS: Dev[] = [
  ['iPad Pro 12.9', 1024, 1366],
  ['iPad Pro 11', 834, 1194],
  ['iPad Air', 820, 1180],
  ['Galaxy Tab S9', 800, 1280],
];
const DESKTOPS: Dev[] = [
  ['Laptop 13in', 1280, 800],
  ['Laptop 15in', 1440, 900],
  ['Full HD 1080p', 1920, 1080],
  ['QHD 1440p', 2560, 1440],
];

// dpr capped at 2 for mobile/tablet (3 only inflates file size — layout is identical).
const touch = (category: string, devices: Dev[]) =>
  devices.flatMap(([name, w, h]) =>
    (['portrait', 'landscape'] as const).map((orientation) => ({
      name: `${category}__${name}__${orientation}`,
      metadata: { category, device: name, orientation },
      use: {
        browserName: 'chromium' as const,
        viewport: orientation === 'portrait' ? { width: w, height: h } : { width: h, height: w },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    })),
  );

const screens = (category: string, devices: Dev[]) =>
  devices.map(([name, w, h]) => ({
    name: `${category}__${name}`,
    metadata: { category, device: name, orientation: 'landscape' },
    use: { browserName: 'chromium' as const, viewport: { width: w, height: h }, deviceScaleFactor: 1 },
  }));

export default defineConfig({
  testDir: './tests',
  testMatch: '**/matrix.spec.ts',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 4, // be gentle on the placehold.co art the menu/modal load
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5199', headless: true },
  projects: [...touch('phones', PHONES), ...touch('tablets', TABLETS), ...screens('desktops', DESKTOPS)],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
