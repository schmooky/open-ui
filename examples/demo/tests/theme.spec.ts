import { test, expect } from '@playwright/test';
import { waitForHud, openMenu, shots, accent, controlCount } from './_helpers';

const DIR = shots('themes');
// open-ui ships ONE theme: black & white with a yellow accent.
const DEFAULT_ACCENT = '#ffc935';

/**
 * The single-theme proof + the "you can't break it" guarantee. open-ui ships one
 * canonical b&w + yellow theme; hosts only RECOLOUR it via `?accent=`. We screenshot
 * it (menu open, so themed surfaces show), then push a deliberately BROKEN accent and
 * assert the HUD still fully mounts with the accent fallen back to the safe token.
 */
test.describe('theme', () => {
  test('the default b&w + yellow theme renders', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'theme test runs on desktop');
    await page.goto('/?bare=1');
    await waitForHud(page);
    expect((await accent(page)).toLowerCase()).toBe(DEFAULT_ACCENT);
    await openMenu(page);
    await page.screenshot({ path: `${DIR}default.png` });
  });
});

test.describe('safe theming — configure, never break', () => {
  test('a valid accent override applies', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'runs on desktop');
    await page.goto('/?bare=1&accent=%23ff0000');
    await waitForHud(page);
    expect((await accent(page)).toLowerCase()).toBe('#ff0000');
    await page.screenshot({ path: `${DIR}override-valid.png` });
  });

  test('a BROKEN accent cannot break the HUD — it falls back to the default', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'runs on desktop');
    await page.goto('/?bare=1&accent=javascript:alert(1)');
    await waitForHud(page);
    // garbage rejected → the default yellow shows through; the HUD mounted fully
    expect((await accent(page)).toLowerCase()).toBe(DEFAULT_ACCENT);
    expect(await controlCount(page)).toBeGreaterThan(15);
    await openMenu(page);
    await page.screenshot({ path: `${DIR}override-broken-fallback.png` });
  });
});
