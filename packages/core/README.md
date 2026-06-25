# @open-ui/core

The **headless core** of [open-ui](https://github.com/schmooky/open-ui) — a biased,
themeable UI library for slot games. This package is the **M + C**: all state, logic,
layout and theming, with **zero runtime dependencies**. It renders nothing on its own;
pair it with a view binding such as [`@open-ui/pixi`](https://www.npmjs.com/package/@open-ui/pixi).

```bash
pnpm add @open-ui/core
```

## What's inside

- **`Signal`** — a tiny observable value (the reactive primitive everything is built on).
- **`Control` state-machines** — every button/toggle/value is an FSM; interactability is
  *derived* from state, never a stored boolean.
- **`OpenUI` façade** — the narrow, typed surface a host talks to (`ui.spin.busy()`,
  `ui.balance.set(…)`, `ui.bus.on(…)`, `ui.setLocale(…)`).
- **Theme tokens** — semantic design tokens with safe fallbacks (`default`, `midnight`,
  `neon`, `light`). A bad token degrades, never throws.
- **Layout** — anchor + offset + scale (+ rotation) resolved against a reference
  resolution, with per-device responsive overrides.
- **`UISpec`** — one typed, string-literal config object validated without ever throwing
  (a bad value is reported and ignored — see the never-reject boundary in the Charter).
- **Introspection** — `window.__OPENUI__` reports every control's state, interactability
  and bounds, so end-to-end tests never read a pixel.

## Usage

You normally don't construct core directly — a renderer like `@open-ui/pixi` builds it
from your `UISpec` via `mountHud`. Reach for `@open-ui/core` directly when you're writing
your **own** renderer (DOM, Canvas, another engine) against the same headless model.

```ts
import { OpenUI, defaultTheme } from '@open-ui/core';
```

See the [main README](https://github.com/schmooky/open-ui#readme) and the
[Charter](https://github.com/schmooky/open-ui/blob/main/CHARTER.md) for the full doctrine.

## License

[MIT](./LICENSE) © schmooky and the open-ui contributors.
