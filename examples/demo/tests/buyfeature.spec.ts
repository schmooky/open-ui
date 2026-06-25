import { test, expect } from '@playwright/test';
import { waitForHud, shots } from './_helpers';

/**
 * The BUY-FEATURE modal: opened by the bonus button, it shows up to 4 cards
 * (each a one-tap "Buy" or an activatable "Activate" bet boost), a bet amount
 * with − / + steppers that re-price every card, and localizes like everything else.
 */
const DIR = shots('buyfeature');

test.describe('buy-feature modal', () => {
  test('4 cards (2 buy + 2 activate), steppers re-price, boost toggles, localizes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    await page.goto('/?bare=1');
    await waitForHud(page);

    // open via the bonus button's event
    await page.evaluate(() => (window as unknown as { ui: { bus: { emit(t: string, p: unknown): void } } }).ui.bus.emit('buttonActivated', { id: 'bonus' }));
    const root = page.locator('.bfm-root');
    await expect(root).toHaveClass(/open/);

    await expect(page.locator('.bfm-card')).toHaveCount(4);
    const labels = await page.locator('.bfm-action').allTextContents();
    expect(labels.filter((l) => /buy/i.test(l)).length).toBe(2);
    expect(labels.filter((l) => /activate/i.test(l)).length).toBe(2);

    // the bet steppers re-price every card
    const before = await page.locator('.bfm-price').first().textContent();
    await page.locator('#bfm-plus').click();
    await expect(page.locator('.bfm-price').first()).not.toHaveText(before ?? '');

    // a boost card toggles its active state on click
    const boost = page.locator('.bfm-action--boost').first();
    await boost.click();
    await expect(boost).toHaveClass(/is-active/);

    await page.screenshot({ path: `${DIR}desktop.png` });

    // activating a boost keeps the modal open (it never closes on activate)
    await expect(root).toHaveClass(/open/);

    // it localizes (switch to German → "Buy Feature" becomes "Feature kaufen")
    await page.evaluate(() => (window as unknown as { ui: { setLocale(l: string): void } }).ui.setLocale('de'));
    await expect(page.locator('.bfm-title')).toHaveText('Feature kaufen');

    // BUYING closes the modal and deducts the cost from the balance
    const balBefore = await page.evaluate(() => (window as unknown as { ui: { balance: { get(): number } } }).ui.balance.get());
    await page.locator('.bfm-action--buy').first().click();
    await expect(root).not.toHaveClass(/open/);
    const balAfter = await page.evaluate(() => (window as unknown as { ui: { balance: { get(): number } } }).ui.balance.get());
    expect(balAfter).toBeLessThan(balBefore);
  });
});
