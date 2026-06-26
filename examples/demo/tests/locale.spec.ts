import { test, expect } from '@playwright/test';
import { LOCALE_CODES, MESSAGES } from '../src/locales';
import { waitForHud, openMenu, shots, t } from './_helpers';

const DIR = shots('locales');

/**
 * The LOCALE MATRIX — FULL coverage: open the menu in each of Stake Engine's 16
 * locales, on EVERY device × orientation (the Playwright projects). open-ui localizes
 * by safe key fall-through, so this proves the menu renders correctly (never blank or
 * broken) in every language on every screen; the assertion pins the translated section
 * heading to the dictionary, and each run saves a per-device/orientation screenshot.
 * 16 locales × 7 device/orientation projects = 112 cases.
 */
test.describe('locale matrix — 16 Stake locales × every device + orientation', () => {
  for (const code of LOCALE_CODES) {
    test(`menu renders in "${code}"`, async ({ page }, testInfo) => {
      await page.goto(`/?bare=1&locale=${code}`);
      await waitForHud(page);
      await openMenu(page);

      const settings = await t(page, 'Settings');
      expect(settings).toBe(MESSAGES[code]?.Settings ?? 'Settings'); // translated (or English fall-through)

      // namespaced by project so device/orientation shots don't overwrite each other
      await page.screenshot({ path: `${DIR}${testInfo.project.name}__${code}.png` });
    });
  }
});
