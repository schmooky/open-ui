import { type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** A typed handle on the introspection API the client exposes on `window`. */
interface DemoWindow {
  ui: {
    t(key: string): string;
    locale: { get(): string };
    theme: { color: { accent: string } };
    settingsPanel: { openPanel(): void; closePanel(): void };
  };
  __OPENUI__: { snapshot(): Array<{ id: string }> };
}

/** Make (and return) a screenshots subdir, e.g. `shots('locales')`. */
export function shots(sub: string): string {
  const dir = fileURLToPath(new URL(`../screenshots/${sub}/`, import.meta.url));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Wait until the HUD has booted and is reporting through `window.__OPENUI__`. */
export async function waitForHud(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const api = (window as unknown as Partial<DemoWindow>).__OPENUI__;
      return !!api && api.snapshot().length > 10;
    },
    undefined,
    { timeout: 25_000 },
  );
  await page.waitForTimeout(650); // settle transitions + async art
}

/** Open the ☰ menu and let it settle. */
export async function openMenu(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as DemoWindow).ui.settingsPanel.openPanel());
  await page.waitForTimeout(400);
}

/** Read `ui.t(key)` from the live client. */
export function t(page: Page, key: string): Promise<string> {
  return page.evaluate((k) => (window as unknown as DemoWindow).ui.t(k), key);
}

/** Read the resolved accent colour from the live theme. */
export function accent(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as DemoWindow).ui.theme.color.accent);
}

/** Number of registered controls (mount sanity). */
export function controlCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as DemoWindow).__OPENUI__.snapshot().length);
}
