# Open Slot UI — Guide for AI assistants

A drop-in slot-game HUD for **Pixi.js v8**. You describe the UI as one JSON `UISpec`
and mount it with a single call; the library renders the bottom bar (spin, autoplay,
turbo, bet ± , buy/bonus, menu), the top-left compliance readouts, the menu sheet,
and the notice/error modals. It is renderer-agnostic at the core and ships a Pixi
renderer.

This doc is written so an AI can wire the library into a host game correctly without
reading the source.

---

## 1. Install

```bash
npm i @open-slot-ui/core @open-slot-ui/pixi pixi.js
```

- `@open-slot-ui/core` — framework-agnostic state/controls (no Pixi).
- `@open-slot-ui/pixi` — the Pixi v8 renderer + `mountHud`.
- `pixi.js` v8 is a **peer dependency** — the host owns the `Application`.

---

## 2. Quick start

```ts
import { Application } from 'pixi.js';
import { mountHud } from '@open-slot-ui/pixi';

const app = new Application();
await app.init({ resizeTo: window, backgroundAlpha: 0 });
document.body.appendChild(app.canvas);

const hud = mountHud(app, {
  currency: { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 },
  betLadder: { levels: [0.5, 1, 2, 5, 10, 20], index: 1 },
  turbo: { modes: 2 },                       // 2-mode (off/on) — the only mode for now
  autoplay: { mode: 'options', options: [10, 25, 50, 100, Infinity] },
  rtp: 96,
  game: { name: 'My Slot', version: '1.0.0' },
});

const ui = hud.ui;
ui.balance.set(1000);

// The host runs the actual round; the HUD only asks for one.
ui.on('spinRequested', async () => {
  if (ui.balance.get() < ui.bet.get()) { hud.showRgsError('ERR_IPB'); return; }
  ui.spin.busy();
  const { win, bet } = await runYourRound();   // your game logic
  ui.balance.set(ui.balance.get() - bet + win);
  ui.reportRound(win, bet);                     // feeds net/RG/autoplay
  ui.spin.idle();
});
```

`mountHud(app, spec, opts)` returns a `BootedHud`. `hud.ui` is the `OpenUI` façade.
Call `hud.unmount()` to tear everything down (leak-free).

---

## 3. The contract (how the HUD talks to the host)

The HUD **never** runs your game. It emits intent; you drive the round and report
the result. Subscribe with `ui.on(event, fn)` (returns a disposer).

| Event | Payload | When |
|---|---|---|
| `spinRequested` | – | spin tapped / Space-Enter |
| `skipRequested` | – | tap during a spin to slam-stop the reels |
| `holdSpinStarted` / `holdSpinStopped` | – | press-and-hold spin (if `spin.press: 'hold-to-spin'`) |
| `autoplayStarted` | `{ count, lossLimit?, singleWinLimit? }` | autoplay began |
| `autoplayStopped` | – | autoplay ended (user / RG limit / out of funds) |
| `turboChanged` / `toggled` | `{ id, mode, index }` / `{ id, on }` | turbo flipped |
| `buttonActivated` | `{ id }` | a button fired (`bonus`, `mute`, `fullscreen`, `settings`, `bet-plus`, `bet-minus`) |
| `valueChanged` | `{ id, value }` | slider/stepper changed |
| `cardActivated` | `{ id }` | a buy-feature card (host modal) |
| `localeChanged` | `string` | language changed |
| `realityCheck` | `{ minutes, elapsedMs, totalStaked, totalWon }` | RTS-13 interval elapsed |
| `noticeShown` / `noticeDismissed` | `{ blocking }` / – | notice/error modal opened/closed |
| `panelToggled` / `stateChanged` / `visibilityChanged` / `optionSelected` | … | introspection/wiring |

After every settled round call **`ui.reportRound(win, bet)`** (major units). It
updates the net-position readout, the session totals, and enforces autoplay
count + RG loss/single-win limits (auto-stopping when hit, or when `balance < bet`).

---

## 4. `UISpec` — full config reference

Everything is optional; safe defaults fill the rest. Bad values are sanitized, never fatal.

```ts
mountHud(app, {
  // ── money ──
  currency: 'USD' | { code, decimals, symbol?, display?: 'symbol'|'code',
                      position?: 'prefix'|'suffix', separator?, decimalChar? },
  betLadder: { levels: number[], index?: number },

  // ── spin / turbo ──
  spin: { press: 'tap' | 'hold-to-spin' },
  turbo: { modes: 2, index?: 0 },   // ONLY 2-mode is supported right now (off/on)

  // ── autoplay (configurable; see §5) ──
  autoplay: { mode: 'options'|'infinite', options?: number[],
              lossLimits?: number[], winLimits?: number[] },

  // ── compliance ──
  rtp: 96,                          // shown only if jurisdiction.displayRTP
  jurisdiction: { /* see §6 */ },
  realityCheck: { everyMinutes: 60, title?, message?, showModal?: true },

  // ── presentation ──
  theme: 'default' | { color?, radius?, type?: { family? } },   // see §8
  responsive: { portrait?: { controls }, landscape?, mobile?, tablet?, desktop? },
  controls: { [id]: { layout?, label?, hidden?, disabled?, currency?, initial?, digits? } },
  menu: { settings?: BlockSpec[], paytable?: BlockSpec[], rules?: BlockSpec[] },
  audio: { startMuted?: false },

  // ── i18n (see §7) ──
  locale: { locale: 'en', messages: {...}, socialMessages?: {...} },

  // ── social / sweepstakes ──
  social: true | { coin?: 'GC' },
  game: { name, version },
}, /* renderer opts */ {
  expose?: true,                    // window.__OPENUI__ for tests
  menu?: BlockSpec[] | false,       // false = supply your own DOM menu
  intro?: 'shown' | 'hidden' | 'slide-in',
  autoplayPicker?: 'drawer' | 'radial',
  readoutColor?: string,            // dark text for a light background
  gsap?: GsapLike,                  // enables wide-value auto-downscale
  spinSkin?: SpinSkinFactory,       // custom spin-button art
  icons?: { turboOff, turboOn, autoIdle, autoActive, bonus, betPlus, betMinus, ... },
});
```

### Controls present on screen
spin · autoplay · turbo · bet− · bet+ · bonus/buy · ☰ menu · mute · fullscreen ·
balance · bet · RTP · net · session-timer.
Reposition any of them via `controls[id].layout = { anchor, offset:[x,y], scale?, rotation? }`
(reference frames: landscape **1920×1080**, portrait **1080×2337** — offsets are in
reference px, scaled to fit).

---

## 5. Autoplay (fully host-configurable)

```ts
autoplay: {
  mode: 'options',                       // tap opens a picker; 'infinite' starts at once
  options: [10, 25, 50, 100, Infinity],  // spin-count choices (Infinity = ∞) — always shown
  lossLimits: [10, 25, 50, Infinity],    // OPTIONAL: "stop on loss" appears ONLY if set
  winLimits:  [25, 50, 100, Infinity],   // OPTIONAL: "stop on single win" appears ONLY if set
}
```

- The **count** options always render in the picker.
- The two RG fields (stop-on-loss / stop-on-single-win, both in multiples of bet)
  **only appear when you pass `lossLimits` / `winLimits`**.
- While autoplay runs, the **autoplay button turns yellow + disabled** and the
  **SPIN button becomes `STOP N`** (or `STOP ∞`); tapping it stops autoplay.
- Limits are enforced from your `ui.reportRound(win, bet)` calls.

---

## 6. Regulation / jurisdiction config

`spec.jurisdiction` (or `hud.applyJurisdiction(cfg)` at runtime — e.g. after the RGS
authenticate response). All fields optional; each only acts when set.

| Flag | Effect |
|---|---|
| `displayRTP` | show the RTP readout (top-left) |
| `displayNetPosition` | show session net ± (top-left) |
| `displaySessionTimer` | show + start the session timer (top-left) |
| `disabledTurbo` | hide/disable turbo |
| `disabledAutoplay` | hide/disable autoplay (real guard) |
| `disabledBuyFeature` | hide/disable buy/bonus (`confirmBuy` no-ops) |
| `disabledSlamstop` | spin locks during a spin (no tap-to-skip) |
| `disabledSpacebar` | no keyboard spin; also disables hold-to-spin |
| `disabledFullscreen` | hide fullscreen |
| `socialCasino` | sweepstakes wording (see §7) |
| `minimumRoundDuration` | ms hint stored for the **game** to enforce (HUD never throttles) |

Read back with `ui.isDisabled('autoplay' | 'buyFeature' | 'turbo' | 'fullscreen' | 'slamstop' | 'spacebar')`.
Compliance hides are resize-proof. RTP/net/session are **always the top-left
semi-transparent readout block — never a header/footer bar.**

---

## 7. i18n & social localization

```ts
locale: {
  locale: 'en',
  messages: { es: { 'openui.bet': 'Apuesta' }, /* … */ },
  // SEPARATE social dictionary — used ONLY in social mode, same keys as `messages`.
  socialMessages: { en: { 'openui.bet': 'Play', 'openui.balance': 'Credits' } },
}
```

- Built-in keys live under `openui.*` and always resolve (never a raw key).
- **Social wording is a structurally separate dictionary** (`socialMessages`), not a
  suffix on normal keys — so normal and sweepstakes copy can never be mixed up by
  accident. Toggle with `hud.setSocial(true, 'GC'?)` or `jurisdiction.socialCasino`.
  In social mode `ui.t` resolves `socialMessages` → built-in social defaults
  (`Bet→Play`, `Balance→Credits`, `Win→Prize`, `Buy feature→Play bonus`) → normal chain.
- Switch language at runtime: `ui.setLocale('es')`.

---

## 8. Theming

One built-in theme: `default` (black & white + yellow accent). Hosts override a
**safe subset** only (so the layout/timing can't be broken):

```ts
theme: { color: { accent: '#ff3366' }, radius: { card: 12 }, type: { family: '"Montserrat", sans-serif' } }
```

Overridable: `color` (accent, accentText, surface, surfaceAlt, text, textDim,
disabled), `radius` (pill, card), `type.family`. Font sizes, spacing and motion are
fixed. Invalid values are dropped with a warning.

---

## 9. Buy-feature modal (host component, config-driven)

The buy/bonus flow is a host component you configure on init (see
`examples/demo/src/buyFeatureModal.ts` for the reference implementation). Fill in a
feature list — up to **4** cards, each **buyable** or **activatable** — with keys,
image links and price:

```ts
type FeatureSpec = {
  id: string;                 // your key, echoed back in callbacks
  name: string;
  variant: 'buy' | 'boost';   // buy = one-tap purchase · boost = toggle a bet surcharge
  cost: number;               // price (× current bet)
  image: string;              // image URL
};

mountBuyFeatureModal(app, hud, features /* ≤4 */, {
  activation: 'single',       // 'single' = activatables are MUTUALLY EXCLUSIVE (Stake)
  activationBlocksBuy: false,
  onBuy: (id, cost) => { /* deduct + run feature */ },
  onActivate: (activeIds, id, active) => { /* apply bet boost */ },
});
```

The bonus button (`buttonActivated` id `bonus`) opens it. For a simple confirm
dialog instead, use `hud.confirmBuy({ title?, message?, onConfirm })`.

---

## 10. `BootedHud` API (host-callable)

```
on(event, fn)                       subscribe to a bus event (returns disposer)
setBalance(n) / setBet(n)           update displayed amounts (major units)
setCurrency(spec)                   change currency for balance/bet/net
reportRound(win, bet)               REQUIRED after each round (net + RG + totals)
applyJurisdiction(cfg)              apply compliance config at runtime
setRtp(percent)                     update the RTP readout
setMuted(bool) / setSocial(on,coin?)
setFreeSpins(n)                     n>0 → spin shows "N FS"; 0 → normal
setReplay(on)                       replay mode (locks HUD + badge)
showNotice / showError / showRgsError / showFatal / hideNotice
confirmBuy({ title?, message?, onConfirm })
showControls() / hideControls() / setControlsVisible(bool)
lockInput() / unlockInput()
snapshot()                          ControlSnapshot[] (id, state, bounds, …) for tests
unmount()                           leak-free teardown
```

RGS error codes for `showRgsError`: `ERR_IPB` (insufficient balance), `ERR_IS`,
`ERR_ATE`, `ERR_GLE`, `ERR_BE`, `ERR_BNF`, `ERR_LOC`, `ERR_MAINTENANCE`, `ERR_VAL`,
`ERR_GEN`, `ERR_UE`, `ERR_TIMEOUT`.

---

## 11. Spin-button faces

`ui.spin` automatically shows the right face: normal · spinning · `STOP N`/`STOP ∞`
(during autoplay) · `N FS` (free spins, via `hud.setFreeSpins(n)`). Drive rounds with
`ui.spin.busy()` / `ui.spin.idle()`; tap-during-spin emits `skipRequested`.

---

## 12. Notes / current constraints

- **Turbo is 2-mode (off/on) only** right now. A 3-mode design will come later.
- **Modals contain plain headings + text** (no tinted "callout" boxes), matching the
  design. The `callout` block is still available for the **menu/rules** content.
- The standalone "rules button + slide-over" was removed — **rules live in the menu**
  (after the settings sliders). The notice/error modal and the menu are the only
  modal surfaces.
- Compliance readouts are **only** the top-left semi-transparent block.
