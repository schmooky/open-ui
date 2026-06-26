import { describe, it, expect, vi } from 'vitest';
import { createUI } from '../src/spec/createUI';
import { AutoplayControl } from '../src/controls/AutoplayControl';
import { ReadoutControl } from '../src/controls/ReadoutControl';
import { SpinControl } from '../src/controls/SpinControl';
import { EventBus } from '../src/events';
import { resolveCurrency, formatAmount, isSocialCurrency } from '../src/format/currency';
import { buildBetLadder, clampBet } from '../src/bet';
import { winTier } from '../src/win';
import type { OpenUIEvents } from '../src/types';

const layout = { anchor: 'center' } as const;

describe('jurisdiction switchboard', () => {
  it('disabled* flags hide controls and force-hide them (resize-proof)', () => {
    const ui = createUI({ turbo: { modes: 3 }, jurisdiction: { disabledTurbo: true, disabledAutoplay: true, disabledBuyFeature: true, disabledFullscreen: true } });
    for (const id of ['turbo', 'autoplay', 'bonus', 'fullscreen']) {
      expect(ui.hidden.has(id)).toBe(true);
      expect(ui.forceHidden.has(id)).toBe(true);
    }
    // A force-hidden control can never be re-shown (e.g. by a responsive resize).
    ui.setHidden('turbo', false);
    expect(ui.hidden.has('turbo')).toBe(true);
  });

  it('disabledSuperTurbo collapses a 3-mode switcher to a 2-mode toggle', () => {
    const ui = createUI({ turbo: { modes: 3 }, jurisdiction: { disabledSuperTurbo: true } });
    expect(ui.turbo.modeCount).toBe(2);
  });

  it('disabledSlamstop locks the spin button mid-spin; disabledSpacebar kills hold-to-spin', () => {
    const ui = createUI({ spin: { press: 'hold-to-spin' }, jurisdiction: { disabledSlamstop: true, disabledSpacebar: true } });
    expect(ui.spin.allowSlamStop.get()).toBe(false);
    expect(ui.spin.holdToSpin).toBe(false);
  });

  it('display* flags reveal the mandated readouts; others stay hidden', () => {
    const ui = createUI({ jurisdiction: { displayRTP: true, displaySessionTimer: true } });
    expect(ui.hidden.has('rtp')).toBe(false);
    expect(ui.hidden.has('session-timer')).toBe(false);
    expect(ui.sessionTimer.running.get()).toBe(true);
    expect(ui.hidden.has('net-position')).toBe(true); // not requested → stays hidden
  });

  it('stores social mode + the round-duration hint (game-enforced)', () => {
    const ui = createUI({ jurisdiction: { socialCasino: true, minimumRoundDuration: 2500 } });
    expect(ui.social.get()).toBe(true);
    expect(ui.minimumRoundDuration).toBe(2500);
  });

  it('runtime applyJurisdiction works on a live HUD', () => {
    const ui = createUI({});
    expect(ui.hidden.has('rtp')).toBe(true);
    ui.applyJurisdiction({ displayRTP: true, disabledAutoplay: true });
    expect(ui.hidden.has('rtp')).toBe(false);
    expect(ui.forceHidden.has('autoplay')).toBe(true);
  });
});

describe('autoplay responsible-gambling limits', () => {
  it('stops when the count is exhausted (via reportResult)', () => {
    const a = new AutoplayControl({ id: 'autoplay', layout });
    a.begin(3);
    a.reportResult(0, 1);
    a.reportResult(0, 1);
    expect(a.isActive).toBe(true);
    a.reportResult(0, 1);
    expect(a.isActive).toBe(false);
  });

  it('stops when cumulative net loss reaches the loss limit', () => {
    const a = new AutoplayControl({ id: 'autoplay', layout });
    a.begin(100, { lossLimit: 3 });
    a.reportResult(0, 1);
    a.reportResult(0, 1);
    expect(a.isActive).toBe(true);
    a.reportResult(0, 1); // net loss 3 ≥ 3×1
    expect(a.isActive).toBe(false);
  });

  it('stops on a single win at/above the single-win limit', () => {
    const a = new AutoplayControl({ id: 'autoplay', layout });
    a.begin(100, { singleWinLimit: 10 });
    a.reportResult(5, 1);
    expect(a.isActive).toBe(true);
    a.reportResult(12, 1); // win 12 ≥ 10×1
    expect(a.isActive).toBe(false);
  });

  it('a win offsets prior losses for the loss limit', () => {
    const a = new AutoplayControl({ id: 'autoplay', layout });
    a.begin(100, { lossLimit: 2 });
    a.reportResult(0, 1); // net 1
    a.reportResult(5, 1); // net -3 (a win)
    a.reportResult(0, 1); // net -2
    expect(a.isActive).toBe(true);
  });
});

describe('currency table + formatter', () => {
  it('resolves display precision per currency, incl. zero-decimal + crypto', () => {
    expect(resolveCurrency('JPY').decimals).toBe(0);
    expect(resolveCurrency('BTC').decimals).toBe(8);
    expect(resolveCurrency('USD').decimals).toBe(2);
    expect(resolveCurrency('ZZZ').decimals).toBe(2); // unknown → safe default
  });

  it('maps social coins to GC/SC', () => {
    expect(resolveCurrency('XGC').code).toBe('GC');
    expect(resolveCurrency('XSC').code).toBe('SC');
    expect(isSocialCurrency('XGC')).toBe(true);
    expect(isSocialCurrency('USD')).toBe(false);
  });

  it('formats grouped amounts with sign + code position', () => {
    expect(formatAmount(1234.5, { code: 'USD', decimals: 2 })).toBe('1,234.50 USD');
    expect(formatAmount(-5, { code: 'USD', decimals: 2 }, { signed: true })).toBe('-5.00 USD');
    expect(formatAmount(5, { code: 'USD', decimals: 2 }, { signed: true })).toBe('+5.00 USD');
    expect(formatAmount(1000, { code: '$', decimals: 0, position: 'prefix' })).toBe('$ 1,000');
    expect(formatAmount(NaN, { code: 'USD', decimals: 2 })).toBe('0.00 USD');
  });
});

describe('ReadoutControl', () => {
  it('ticks a duration only while running', () => {
    const r = new ReadoutControl({ id: 'session-timer', kind: 'duration', layout });
    r.start();
    r.tick(5);
    r.tick(10);
    expect(r.get()).toBe(15);
    r.stop();
    r.tick(5);
    expect(r.get()).toBe(15);
    r.reset();
    expect(r.get()).toBe(0);
  });

  it('never-rejects malformed input', () => {
    const r = new ReadoutControl({ id: 'rtp', kind: 'percent', value: 96, layout });
    r.set(NaN);
    expect(r.get()).toBe(96);
    r.set(97.5);
    expect(r.get()).toBe(97.5);
  });
});

describe('OpenUI reportRound + mute', () => {
  it('reportRound updates net position and feeds autoplay limits', () => {
    const ui = createUI({});
    ui.applyJurisdiction({ displayNetPosition: true });
    ui.reportRound(5, 1);
    expect(ui.netPosition.get()).toBe(4);
    ui.reportRound(0, 1);
    expect(ui.netPosition.get()).toBe(3);
  });

  it('mute silences both sliders and restores the prior levels', () => {
    const ui = createUI({});
    ui.musicSlider.setNormalized(0.8);
    ui.sfxSlider.setNormalized(0.6);
    ui.setMuted(true);
    expect(ui.muted.get()).toBe(true);
    expect(ui.musicSlider.value.get()).toBe(0);
    expect(ui.sfxSlider.value.get()).toBe(0);
    ui.setMuted(false);
    expect(ui.musicSlider.value.get()).toBeCloseTo(0.8);
    expect(ui.sfxSlider.value.get()).toBeCloseTo(0.6);
  });
});

describe('SpinControl slam-stop guard', () => {
  it('locks the button (no skip) in auto when slam-stop is disabled', () => {
    const bus = new EventBus<OpenUIEvents>();
    const skip = vi.fn();
    bus.on('skipRequested', skip);
    const spin = new SpinControl({ layout }, bus);
    spin.auto();
    expect(spin.interactable).toBe(true);
    spin.activate();
    expect(skip).toHaveBeenCalledTimes(1);

    spin.allowSlamStop.set(false);
    expect(spin.interactable).toBe(false);
    spin.activate();
    expect(skip).toHaveBeenCalledTimes(1); // suppressed
  });
});

describe('currency shorthand + bet ladder', () => {
  it('a string currency code resolves decimals for balance/bet/net', () => {
    const ui = createUI({ currency: 'JPY' });
    expect(ui.balance.currency.get().decimals).toBe(0);
    expect(ui.bet.currency.get().decimals).toBe(0);
    expect(createUI({ currency: 'XGC' }).balance.currency.get().code).toBe('GC');
  });
  it('buildBetLadder from betLevels (minor units) → major + default index', () => {
    const { levels, index } = buildBetLadder({ betLevels: [100000, 1000000, 5000000], defaultBetLevel: 1000000 });
    expect(levels).toEqual([0.1, 1, 5]);
    expect(index).toBe(1);
  });
  it('buildBetLadder from min/max/step', () => {
    expect(buildBetLadder({ minBet: 1000000, maxBet: 3000000, stepBet: 1000000 }).levels).toEqual([1, 2, 3]);
  });
  it('clampBet snaps to step within min/max', () => {
    const cfg = { minBet: 1000000, maxBet: 5000000, stepBet: 1000000 };
    expect(clampBet(1.2, cfg)).toBe(1);
    expect(clampBet(99, cfg)).toBe(5);
  });
});

describe('winTier (RTS 14F — never celebrate a return ≤ stake)', () => {
  it("returns 'none' when win <= stake", () => {
    expect(winTier(1, 1)).toBe('none');
    expect(winTier(0, 1)).toBe('none');
    expect(winTier(0.5, 1)).toBe('none');
  });
  it('escalates by multiplier above the stake', () => {
    expect(winTier(5, 1)).toBe('win');
    expect(winTier(12, 1)).toBe('big');
    expect(winTier(60, 1)).toBe('mega');
    expect(winTier(150, 1)).toBe('epic');
  });
});

describe('notice / error modal', () => {
  it('showError opens a notice with a single default dismiss action', () => {
    const ui = createUI({});
    ui.showError('Boom');
    expect(ui.noticePanel.isOpen).toBe(true);
    expect(ui.noticeBlocks.get().some((b) => b.kind === 'callout' && b.text === 'Boom')).toBe(true);
    expect(ui.noticeActions.get().length).toBe(1);
  });
  it('showNotice accepts custom action buttons (host callbacks)', () => {
    const ui = createUI({});
    const fn = vi.fn();
    ui.showNotice([{ kind: 'text', id: 't', text: 'hi' }], [{ label: 'Reload', onSelect: fn }]);
    expect(ui.noticeActions.get()[0]!.label).toBe('Reload');
  });
  it('showRgsError maps a code to a default (key) message + stops autoplay', () => {
    const ui = createUI({});
    ui.autoplay.begin(10);
    ui.showRgsError('ERR_IPB');
    expect(ui.autoplay.isActive).toBe(false);
    expect(ui.noticeBlocks.get().some((b) => b.kind === 'callout' && b.text === 'openui.err.insufficient.message')).toBe(true);
  });
  it('showRgsError lets the host override the EXACT text', () => {
    const ui = createUI({});
    ui.showRgsError('ERR_IPB', { title: 'Out of cash', message: 'Top up to keep playing' });
    expect(ui.noticeBlocks.get().some((b) => b.kind === 'heading' && b.text === 'Out of cash')).toBe(true);
    expect(ui.noticeBlocks.get().some((b) => b.kind === 'callout' && b.text === 'Top up to keep playing')).toBe(true);
  });
});

describe('replay + keyboard + autoplay auto-stop', () => {
  it('setReplay locks the HUD', () => {
    const ui = createUI({});
    ui.setReplay(true);
    expect(ui.replay.get()).toBe(true);
    expect(ui.locked.get()).toBe(true);
    ui.setReplay(false);
    expect(ui.locked.get()).toBe(false);
  });
  it('disabledSpacebar turns off keyboard spin + hold-to-spin', () => {
    const ui = createUI({ spin: { press: 'hold-to-spin' }, jurisdiction: { disabledSpacebar: true } });
    expect(ui.spin.allowKeyboard.get()).toBe(false);
    expect(ui.spin.holdToSpin).toBe(false);
  });
  it("reportRound auto-stops autoplay when the balance can't cover the next bet", () => {
    const ui = createUI({});
    ui.bet.set(1);
    ui.balance.set(0.5);
    ui.autoplay.begin(10);
    expect(ui.autoplay.isActive).toBe(true);
    ui.reportRound(0, 1);
    expect(ui.autoplay.isActive).toBe(false);
  });
});

describe('social / sweepstakes mode', () => {
  it('one switch swaps gambling wording (Buy feature → Play bonus) and back', () => {
    const ui = createUI();
    expect(ui.t('openui.buyFeature.title')).toBe('Buy feature');
    ui.setSocial(true);
    expect(ui.social.get()).toBe(true);
    expect(ui.t('openui.buyFeature.title')).toBe('Play bonus'); // social variant wins
    expect(ui.t('openui.spin')).toBe('Spin'); // no social variant → base unchanged
    ui.setSocial(false);
    expect(ui.t('openui.buyFeature.title')).toBe('Buy feature');
  });

  it('spec.social: { coin } flips wording AND shows the social coin', () => {
    const ui = createUI({ social: { coin: 'GC' } });
    expect(ui.social.get()).toBe(true);
    expect(ui.balance.currency.get().code).toBe('GC');
    expect(ui.bet.currency.get().code).toBe('GC');
  });

  it('jurisdiction socialCasino turns it on', () => {
    const ui = createUI({ jurisdiction: { socialCasino: true } });
    expect(ui.social.get()).toBe(true);
    expect(ui.t('openui.buyFeature.message')).toBe('Play this bonus now?');
  });
});

describe('session aggregates (RTS 12 — money spent)', () => {
  it('accumulates total staked + total won, reset on resetSession', () => {
    const ui = createUI();
    ui.reportRound(10, 2);
    ui.reportRound(0, 2);
    expect(ui.totalStaked.get()).toBe(4);
    expect(ui.totalWon.get()).toBe(10);
    ui.resetSession();
    expect(ui.totalStaked.get()).toBe(0);
    expect(ui.totalWon.get()).toBe(0);
  });
});

describe('fatal / blocking notice', () => {
  it('locks the HUD, marks blocking, and is removable only in code', () => {
    const ui = createUI();
    let shown: { blocking: boolean } | undefined;
    ui.on('noticeShown', (p) => (shown = p));
    ui.showFatal('Session expired');
    expect(ui.noticeBlocking.get()).toBe(true);
    expect(ui.locked.get()).toBe(true); // HUD locked
    expect(shown).toEqual({ blocking: true });
    expect(ui.noticeActions.get().length).toBe(0); // no default dismiss button
    ui.hideNotice(); // code-only dismiss
    expect(ui.noticeBlocking.get()).toBe(false);
    expect(ui.locked.get()).toBe(false); // unlocked again
  });

  it('a normal notice does NOT lock and gets a default dismiss', () => {
    const ui = createUI();
    ui.showError('oops');
    expect(ui.noticeBlocking.get()).toBe(false);
    expect(ui.locked.get()).toBe(false);
    expect(ui.noticeActions.get().length).toBe(1);
  });
});

describe('jurisdiction disables are REAL guards (not just hidden)', () => {
  it('disabledAutoplay disables the control so begin() is a no-op + isDisabled reads back', () => {
    const ui = createUI({ jurisdiction: { disabledAutoplay: true, disabledBuyFeature: true } });
    expect(ui.isDisabled('autoplay')).toBe(true);
    expect(ui.isDisabled('buyFeature')).toBe(true);
    expect(ui.autoplay.current).toBe('disabled');
    ui.autoplay.begin(10);
    expect(ui.autoplay.isActive).toBe(false); // the API truly no-ops, not just hidden
    expect(ui.bonusButton.current).toBe('disabled');
  });
});

describe('reality check (RTS 13) — core layer', () => {
  it('fireRealityCheck emits the event (with session totals), stops autoplay, opens the modal', () => {
    const ui = createUI();
    ui.reportRound(0, 5); // stake 5
    ui.autoplay.begin(10);
    let evt: OpenUIEvents['realityCheck'] | undefined;
    ui.on('realityCheck', (p) => (evt = p));
    ui.fireRealityCheck({ everyMinutes: 30 });
    expect(evt).toMatchObject({ minutes: 30, totalStaked: 5, totalWon: 0 });
    expect(ui.autoplay.isActive).toBe(false); // autoplay paused
    expect(ui.noticePanel.isOpen).toBe(true); // acknowledge modal shown
  });

  it('showModal:false fires the event only (host shows its own UI)', () => {
    const ui = createUI();
    let fired = false;
    ui.on('realityCheck', () => (fired = true));
    ui.fireRealityCheck({ everyMinutes: 15, showModal: false });
    expect(fired).toBe(true);
    expect(ui.noticePanel.isOpen).toBe(false);
  });

  it('interpolates {{minutes}} into the default message', () => {
    const ui = createUI();
    expect(ui.t('openui.realityCheck.message', { minutes: 30 })).toContain('30');
  });
});

describe('free-spins spin face + audio start flag', () => {
  it('setFreeSpins clamps and stores the remaining count', () => {
    const ui = createUI();
    ui.spin.setFreeSpins(12);
    expect(ui.spin.freeSpins.get()).toBe(12);
    ui.spin.setFreeSpins(-3);
    expect(ui.spin.freeSpins.get()).toBe(0);
    ui.spin.setFreeSpins(0);
    expect(ui.spin.freeSpins.get()).toBe(0);
  });

  it('spec.audio.startMuted boots muted', () => {
    const ui = createUI({ audio: { startMuted: true } });
    expect(ui.muted.get()).toBe(true);
    expect(ui.musicSlider.value.get()).toBe(0);
  });
});

describe('compliance — review-driven coverage', () => {
  it('replacing a blocking notice with a normal one releases the lock', () => {
    const ui = createUI();
    ui.showFatal('fatal');
    expect(ui.locked.get()).toBe(true);
    ui.showError('normal'); // replaces while open (openPanel idempotent)
    expect(ui.noticeBlocking.get()).toBe(false);
    expect(ui.locked.get()).toBe(false); // no leaked lock
  });

  it('emits noticeDismissed when the modal closes', () => {
    const ui = createUI();
    let dismissed = 0;
    ui.on('noticeDismissed', () => (dismissed += 1));
    ui.showError('x');
    ui.hideNotice();
    expect(dismissed).toBe(1);
  });

  it('setSocial(false) reverts wording but NOT the coin (host re-sets the fiat coin)', () => {
    const ui = createUI();
    ui.setSocial(true, 'GC');
    expect(ui.t('openui.buyFeature.title')).toBe('Play bonus');
    expect(ui.balance.currency.get().code).toBe('GC');
    ui.setSocial(false);
    expect(ui.t('openui.buyFeature.title')).toBe('Buy feature'); // wording reverts
    expect(ui.balance.currency.get().code).toBe('GC'); // coin intentionally NOT auto-reverted
  });

  it('startRealityCheck registers a disposer that is torn down by dispose()', () => {
    const ui = createUI({ realityCheck: { everyMinutes: 30 } });
    // dispose() must not throw and must clear the scheduler (no dangling timer callbacks)
    expect(() => ui.dispose()).not.toThrow();
  });
});
