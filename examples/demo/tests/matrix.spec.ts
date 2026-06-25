import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { waitForHud } from './_helpers';

/**
 * Run by playwright.matrix.config.ts ONLY (the default config ignores it). Each
 * device PROJECT fans this one test out with its own viewport/DPR; we shoot three
 * states — the HUD, the open menu, and the buy-feature modal — into
 * `screenshots/matrix/<category>/<device> - <orientation> - <n state>.png`.
 */
const ROOT = fileURLToPath(new URL('../screenshots/matrix/', import.meta.url));

interface Meta { category: string; device: string; orientation: string }

declare global {
  interface Window {
    ui: { settingsPanel: { openPanel(): void; closePanel(): void }; bus: { emit(t: string, p: unknown): void } };
  }
}

test('device matrix screenshots', async ({ page }, testInfo) => {
  const md = testInfo.project.metadata as unknown as Meta;
  const dir = `${ROOT}${md.category}/`;
  mkdirSync(dir, { recursive: true });
  const base = `${md.device} - ${md.orientation}`.replace(/[^\w.\- ]/g, '');

  await page.goto('/?bare=1');
  await waitForHud(page);
  await page.screenshot({ path: `${dir}${base} - 1 hud.png` });

  // the ☰ menu — in the device viewport (top)
  await page.evaluate(() => window.ui.settingsPanel.openPanel());
  await page.waitForTimeout(1100); // open transition + placehold.co logo
  await page.screenshot({ path: `${dir}${base} - 2 menu.png` });
  // the WHOLE menu — expand the scroll container + eager-load every image, then
  // element-screenshot the full card so the entire Settings→Paytable→Rules is seen
  await page.evaluate(() => {
    document.querySelectorAll('.ohm-root img').forEach((i) => i.setAttribute('loading', 'eager'));
    const card = document.querySelector<HTMLElement>('.ohm-card');
    const body = document.querySelector<HTMLElement>('.ohm-body');
    if (card) card.style.maxHeight = 'none';
    if (body) { body.style.maxHeight = 'none'; body.style.overflowY = 'visible'; }
  });
  await page.waitForTimeout(2000); // lazy→eager card art finishes loading
  await page.locator('.ohm-card').screenshot({ path: `${dir}${base} - 2 menu (full).png` });
  await page.evaluate(() => window.ui.settingsPanel.closePanel());
  await page.waitForTimeout(250);

  // the buy-feature modal (opened via the bonus button's event — works even where
  // the button is hidden on phones)
  await page.evaluate(() => window.ui.bus.emit('buttonActivated', { id: 'bonus' }));
  await page.waitForTimeout(1500); // let the card art load
  await page.screenshot({ path: `${dir}${base} - 3 buyfeature.png` });
});
