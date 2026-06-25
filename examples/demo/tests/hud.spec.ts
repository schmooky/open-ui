import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHOTS = fileURLToPath(new URL('../screenshots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

/** Wait until the HUD has booted and is reporting through the public e2e API. */
async function waitForHud(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const api = (window as unknown as { __OPENUI__?: { snapshot(): unknown[] } }).__OPENUI__;
      return !!api && api.snapshot().length > 10;
    },
    undefined,
    { timeout: 25_000 },
  );
  await page.waitForTimeout(700); // let entry transitions + async art settle
}

const ids = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __OPENUI__: { snapshot(): { id: string }[] } }).__OPENUI__.snapshot().map((s) => s.id));

const CONFIGS = [
  { name: 'default', query: 'bare=1' },
  { name: 'showcase', query: 'bare=1&theme=neon&turbo=3&autoplay=infinite&spin=hold&currency=BTC' },
];

test.describe('open-ui HUD — device screenshots', () => {
  for (const cfg of CONFIGS) {
    test(`renders the ${cfg.name} HUD`, async ({ page }, testInfo) => {
      await page.goto(`/?${cfg.query}`);
      await waitForHud(page);

      // It actually mounted, and the reference controls are present.
      const present = await ids(page);
      for (const id of ['spin', 'turbo', 'autoplay', 'balance', 'bet']) expect(present).toContain(id);

      await page.screenshot({ path: `${SHOTS}${testInfo.project.name}__${cfg.name}.png` });
    });
  }
});

test.describe('open-ui HUD — behavior via __OPENUI__', () => {
  test('the showcase config is applied end to end', async ({ page }) => {
    await page.goto('/?bare=1&turbo=3&autoplay=infinite&spin=hold');
    await waitForHud(page);
    const state = await page.evaluate(() => {
      const ui = (window as unknown as { ui: { turbo: { modeCount: number }; autoplay: { mode: string }; spin: { holdToSpin: boolean } } }).ui;
      return { modeCount: ui.turbo.modeCount, autoMode: ui.autoplay.mode, hold: ui.spin.holdToSpin };
    });
    expect(state).toEqual({ modeCount: 3, autoMode: 'infinite', hold: true });
  });

  test('the menu is closed on load and does not cover the HUD (spin is clickable)', async ({ page }) => {
    await page.goto('/?bare=1');
    await waitForHud(page);
    // panel state is closed AND a real click reaches the spin button (a covering
    // menu overlay would eat the click — the regression we just fixed).
    const closed = await page.evaluate(() => (window as unknown as { __OPENUI__: { getState(id: string): string } }).__OPENUI__.getState('settings-panel'));
    expect(closed).toBe('closed');
    const before = await page.evaluate(() => (window as unknown as { ui: { balance: { get(): number } } }).ui.balance.get());
    const b = await page.evaluate(() => (window as unknown as { __OPENUI__: { bounds(id: string): { x: number; y: number; width: number; height: number } } }).__OPENUI__.bounds('spin'));
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { ui: { balance: { get(): number } } }).ui.balance.get()))
      .not.toBe(before); // the click reached spin → the stake was taken
  });

  test('a spin locks the whole HUD (derived interactability)', async ({ page }) => {
    await page.goto('/?bare=1');
    await waitForHud(page);
    const locked = await page.evaluate(() => {
      const w = window as unknown as { ui: { spin: { busy(): void } }; __OPENUI__: { isInteractable(id: string): boolean } };
      w.ui.spin.busy();
      return { spin: w.__OPENUI__.isInteractable('spin'), betPlus: w.__OPENUI__.isInteractable('bet-plus') };
    });
    expect(locked.spin).toBe(false);
    expect(locked.betPlus).toBe(false);
  });
});

// The interactive surfaces (drawer, menu, modal) — captured once, on desktop.
test.describe('open-ui HUD — UI states', () => {
  test('autoplay drawer, settings menu and rules modal', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'state shots captured on desktop only');
    await page.goto('/?bare=1');
    await waitForHud(page);

    await page.evaluate(() => (window as unknown as { ui: { autoplay: { press(): void } } }).ui.autoplay.press());
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}state__autoplay-drawer.png` });
    await page.evaluate(() => (window as unknown as { ui: { autoplay: { cancelPicker(): void } } }).ui.autoplay.cancelPicker());
    await page.waitForTimeout(350);

    await page.evaluate(() => (window as unknown as { ui: { settingsPanel: { openPanel(): void } } }).ui.settingsPanel.openPanel());
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}state__settings-menu.png` });
    await page.evaluate(() => (window as unknown as { ui: { settingsPanel: { closePanel(): void } } }).ui.settingsPanel.closePanel());
    await page.waitForTimeout(350);

    await page.evaluate(() => (window as unknown as { ui: { infoPanel: { openPanel(): void } } }).ui.infoPanel.openPanel());
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}state__rules-modal.png` });
  });
});
