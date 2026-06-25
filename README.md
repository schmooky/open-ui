# open-ui

[![CI](https://github.com/schmooky/open-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/schmooky/open-ui/actions/workflows/ci.yml)
[![@open-ui/core](https://img.shields.io/npm/v/@open-ui/core?label=%40open-ui%2Fcore)](https://www.npmjs.com/package/@open-ui/core)
[![@open-ui/pixi](https://img.shields.io/npm/v/@open-ui/pixi?label=%40open-ui%2Fpixi)](https://www.npmjs.com/package/@open-ui/pixi)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A **biased, themeable PixiJS UI library for slot games**. Mount the whole HUD onto
your existing Pixi scene in one call, then set how it looks and behaves with plain,
typed, string-literal options.

```bash
pnpm add @open-ui/core @open-ui/pixi pixi.js
```

```ts
import { mountHud } from '@open-ui/pixi';

const hud = mountHud(app, {
  theme:    'neon',              // 'default' | 'midnight' | 'neon'
  turbo:    { modes: 3 },        // 2-mode toggle or 3-mode switcher
  autoplay: { mode: 'options' }, // 'options' drawer, or 'infinite'
  spin:     { press: 'hold-to-spin' }, // 'tap', or hold-to-turbo-spin
});

hud.on('spinRequested', () => game.spin()); // events out
hud.ui.spin.busy();                          // commands in
hud.setBalance(1234);
```

That's the whole integration. The HUD owns its layout, theming, animation,
responsive reflow and teardown — you own the game.

## Why

- **Configure, don't fork.** One JSON `UISpec` drives the theme, turbo modes,
  autoplay style, spin behavior, money formatting and per-device layout. A typo is
  a compile error; a bad value is reported, never fatal.
- **Headless core, thin renderer.** All state, logic, layout and theming live in
  zero-dependency `@open-ui/core`. `@open-ui/pixi` is a thin view binding.
- **Every control is a state machine.** State is the single source of truth for
  look, interactivity and tests — interactability is derived, never stored.
- **Introspection is first-class.** `window.__OPENUI__` reports every control's
  state, interactability and bounds, so e2e never reads a pixel.

See the doctrine in [CHARTER.md](./CHARTER.md).

## Packages

| Package | Role |
| --- | --- |
| [`@open-ui/core`](./packages/core) | Headless M + C — signals, control state-machines, theme tokens, layout, façade, event bus, introspection. **Zero dependencies.** |
| [`@open-ui/pixi`](./packages/pixi) | The PixiJS v8 view + controller binding. Mounts one `Container`. Peer-dep `pixi.js ^8`. |

## Configuration at a glance

| Option | Values | What it does |
| --- | --- | --- |
| `theme` | `'default' \| 'midnight' \| 'neon'` | Re-skins the whole HUD by tokens. |
| `turbo.modes` | `2 \| 3 \| string[]` | 2-mode toggle or 3-mode (off/turbo/super) switcher. |
| `autoplay.mode` | `'options' \| 'infinite'` | A bottom drawer to pick a count, or one-tap infinite. |
| `spin.press` | `'tap' \| 'hold-to-spin'` | One spin per tap, or turbo-spin while held. |
| `responsive` | `{ mobile, tablet, desktop, portrait, landscape }` | Reflow / hide controls per device & orientation. |
| `menu` | `{ settings, paytable, rules }` | One scrollable ☰ menu — Settings → Paytable → Rules. |
| `locale` | `{ messages, locale }` | i18n — safe key fall-through, with an auto Language switch. |
| `currency`, `betLadder`, `controls` | … | Money, formatting, per-control overrides. |

Configuration is the **only** way to change the UI — and it's guardrailed: a bad
value is reported and dropped, never fatal. You can localize and theme it; you
can't break it.

Full reference: **[the Configuration guide](https://open-ui.schmooky.dev/guides/configuration/)**.

## Stake Engine compliance

open-ui renders the HUD; your game owns the [Stake Engine](https://stake-engine.com)
RGS contract (session, wallet, book/event playback). To publish, the UI just has to
honor the platform's per-player **`jurisdiction`** switchboard (returned by
`/wallet/authenticate`) and surface the responsible-gambling controls — one call:

```ts
hud.applyJurisdiction(jurisdiction); // the 12-flag config, verbatim from the RGS

hud.reportRound(win, bet); // feeds the net-position readout + autoplay loss/win limits
hud.setRtp(96);            // the RTP readout
hud.showError('Session expired. Reload to continue.'); // a themed, menu-style modal
```

| Concern | open-ui |
| --- | --- |
| `disabled{Turbo,SuperTurbo,Autoplay,Slamstop,Spacebar,BuyFeature,Fullscreen}` | hides / locks the control (resize-proof) |
| `display{RTP,NetPosition,SessionTimer}` | reveals the matching readout |
| `socialCasino` · social coins (XGC→GC, XSC→SC) · zero-decimal currencies (JPY…) | currency table + `resolveCurrency` |
| Autoplay **loss-limit** + **single-win stop** + stop-anytime | in the picker; enforced via `reportRound` |
| Slam-stop disabled | the spin button dims + locks during the spin |
| Insufficient funds / session expired / maintenance / disconnect | `hud.showNotice` / `showError` |
| Master mute + fullscreen | black-and-white icon controls at the screen edge |

Put the readouts in a thin strip with **`statusBar: 'top' | 'bottom'`** (otherwise
they sit at screen corners). `minimumRoundDuration` is surfaced as
`ui.minimumRoundDuration` for the **game** to enforce — open-ui never throttles the
round. Try the flags live:
`localhost:5199/?juris=rtp,net,timer,noturbo,noslam&statusbar=top`.

## Repo layout

```
packages/core     @open-ui/core  — headless library (Vitest)
packages/pixi     @open-ui/pixi  — PixiJS renderer
examples/demo     standalone example client + Playwright device tests
apps/site         the docs site (Astro)
```

## Develop

```bash
pnpm install
pnpm dev                      # the example client → http://localhost:5199
pnpm test                     # @open-ui/core unit tests
pnpm typecheck                # all packages
pnpm build                    # build both libraries

pnpm --dir examples/demo test:visual   # Playwright device screenshots → screenshots/
pnpm --dir apps/site dev               # the docs site → http://localhost:5210
```

The example client reads its config from the URL, so you can see any permutation —
e.g. `localhost:5199/?theme=neon&turbo=3&autoplay=infinite&spin=hold`.

## License

[MIT](./LICENSE)
