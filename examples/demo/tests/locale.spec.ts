import { test, expect } from '@playwright/test';
import { LOCALE_CODES, MESSAGES } from '../src/locales';
import { waitForHud, openMenu, shots, t } from './_helpers';

const DIR = shots('locales');

/**
 * The LOCALE MATRIX: open the menu in each of the 10 configured languages and save
 * a screenshot. open-ui localizes by safe key fall-through, so this proves the menu
 * renders correctly (and never blank/broken) in every locale — and the assertion
 * pins the translated section heading to the dictionary.
 */
test.describe('locale matrix — the menu in 10 languages', () => {
  for (const code of LOCALE_CODES) {
    test(`menu renders in "${code}"`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'the locale matrix runs once, on desktop');
      await page.goto(`/?bare=1&locale=${code}`);
      await waitForHud(page);
      await openMenu(page);

      const settings = await t(page, 'Settings');
      expect(settings).toBe(MESSAGES[code]?.Settings ?? 'Settings'); // translated (or English fall-through)

      await page.screenshot({ path: `${DIR}${code}.png` });
    });
  }
});
