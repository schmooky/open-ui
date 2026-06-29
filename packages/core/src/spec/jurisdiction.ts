import type { OpenUI } from '../OpenUI';

/**
 * Stake Engine's per-player jurisdiction config — the object the RGS returns at
 * `/wallet/authenticate` as `config.jurisdiction`. It is the platform's regulatory
 * switchboard: each `disabled*` flag must HIDE/limit a feature, each `display*`
 * flag must SHOW a readout, and `minimumRoundDuration` is a hint the GAME enforces
 * (open-ui never throttles the round). Every field is optional — an omitted flag
 * leaves the HUD's configured default untouched.
 *
 * @see https://github.com/StakeEngine/web-sdk — packages/rgs-fetcher/src/schema.ts
 */
export interface JurisdictionConfig {
  /** Social / sweepstakes mode (coins shown as GC/SC). */
  socialCasino?: boolean;
  disabledFullscreen?: boolean;
  disabledTurbo?: boolean;
  disabledAutoplay?: boolean;
  disabledSlamstop?: boolean;
  disabledSpacebar?: boolean;
  disabledBuyFeature?: boolean;
  displayNetPosition?: boolean;
  displayRTP?: boolean;
  displaySessionTimer?: boolean;
  /** Minimum ms a round must take — stored on the HUD for the GAME to enforce. */
  minimumRoundDuration?: number;
}

/**
 * Apply a Stake Engine `jurisdiction` config to a live HUD — the whole switchboard
 * in one call. Safe to run at any time (typically right after the game
 * authenticates and learns the player's jurisdiction): it only acts on the flags
 * that are set, so it composes with the game's own `controls`/`responsive` config
 * and is idempotent. `disabled*` hides are made permanent (resize-proof) via
 * `ui.forceHidden`; `display*` flags reveal/hide the mandated readouts. It reuses
 * the primitives open-ui already has, so honoring the platform is one line.
 */
export function applyJurisdiction(ui: OpenUI, jur: JurisdictionConfig | undefined): void {
  if (!jur) return;

  const lockHidden = (id: string): void => {
    ui.forceHidden.add(id); // can never be re-shown by responsive (compliance)
    ui.setHidden(id, true);
  };

  // ── "disable X" → hide AND really disable the feature (not just visual) ───────
  if (jur.disabledFullscreen) lockHidden('fullscreen');
  if (jur.disabledTurbo) lockHidden('turbo');
  if (jur.disabledAutoplay) {
    lockHidden('autoplay');
    ui.autoplay.disable(); // a real guard: begin()/press() now no-op (state 'disabled')
  }
  if (jur.disabledBuyFeature) {
    lockHidden('bonus');
    ui.bonusButton.disable(); // the buy button can't be tapped; confirmBuy() also no-ops
  }
  // Slam-stop off → the spin button locks (dims) during the spin; no tap-to-stop.
  if (jur.disabledSlamstop) ui.spin.allowSlamStop.set(false);
  // Spacebar / hold-to-spin off → no keyboard spin + each cycle needs a fresh press.
  if (jur.disabledSpacebar) {
    ui.spin.holdToSpin = false;
    ui.spin.allowKeyboard.set(false);
  }

  // ── "display X" → reveal the mandated readout (jurisdiction owns these) ───────
  if (jur.displayRTP != null) ui.setHidden('rtp', !jur.displayRTP);
  if (jur.displayNetPosition != null) ui.setHidden('net-position', !jur.displayNetPosition);
  if (jur.displaySessionTimer != null) {
    ui.setHidden('session-timer', !jur.displaySessionTimer);
    if (jur.displaySessionTimer) ui.sessionTimer.start();
    else ui.sessionTimer.stop();
  }

  // Social / sweepstakes mode — swaps gambling wording (and shows GC/SC when the
  // game has set a social coin). The round-duration hint stays GAME-enforced.
  if (jur.socialCasino != null) ui.setSocial(jur.socialCasino);
  if (typeof jur.minimumRoundDuration === 'number' && Number.isFinite(jur.minimumRoundDuration)) {
    ui.minimumRoundDuration = Math.max(0, jur.minimumRoundDuration);
  }
}
