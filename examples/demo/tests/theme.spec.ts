import { test, expect } from '@playwright/test';
import { waitForHud, openMenu, shots, accent, controlCount } from './_helpers';

const DIR = shots('themes');
const PRESETS = ['default', 'midnight', 'neon', 'light'] as const;
const PRESET_ACCENT: Record<string, string> = { default: '#ffc935', midnight: '#6ea8fe', neon: '#ff2d95', light: '#d99000' };

/**
 * The THEME MATRIX + the "you can't break it" proof. We screenshot each preset
 * (menu open, so themed surfaces show), then push deliberately BROKEN overrides
 * through the public `?accent=` knob and assert the HUD still fully mounts with the
 * accent fallen back to the safe token — configuration that cannot break the UI.
 */
test.describe('theme matrix', () => {
  for (const preset of PRESETS) {
    test(`preset "${preset}" renders`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'theme matrix runs on desktop');
      await page.goto(`/?bare=1&theme=${preset}`);
      await waitForHud(page);
      expect((await accent(page)).toLowerCase()).toBe(PRESET_ACCENT[preset]);
      await openMenu(page);
      await page.screenshot({ path: `${DIR}preset-${preset}.png` });
    });
  }
});

test.describe('safe theming — configure, never break', () => {
  test('a valid accent override applies', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'runs on desktop');
    await page.goto('/?bare=1&theme=midnight&accent=%23ff0000');
    await waitForHud(page);
    expect((await accent(page)).toLowerCase()).toBe('#ff0000');
    await page.screenshot({ path: `${DIR}override-valid.png` });
  });

  test('a BROKEN accent cannot break the HUD — it falls back to the preset', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'runs on desktop');
    await page.goto('/?bare=1&theme=neon&accent=javascript:alert(1)');
    await waitForHud(page);
    // garbage rejected → neon's accent shows through; the HUD mounted fully
    expect((await accent(page)).toLowerCase()).toBe('#ff2d95');
    expect(await controlCount(page)).toBeGreaterThan(15);
    await openMenu(page);
    await page.screenshot({ path: `${DIR}override-broken-fallback.png` });
  });
});
