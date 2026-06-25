# @open-ui/pixi

The **PixiJS v8 renderer** for [open-ui](https://github.com/schmooky/open-ui) — a biased,
themeable UI library for slot games. Mount a complete, responsive, themeable HUD onto your
existing Pixi scene in **one call**, then drive its look and behavior with plain, typed,
string-literal options.

```bash
pnpm add @open-ui/core @open-ui/pixi pixi.js
```

> `pixi.js@^8` is a **peer dependency** — `@open-ui/pixi` binds to *your* single Pixi
> instance, it never bundles its own.

## Usage

```ts
import { mountHud } from '@open-ui/pixi';

const hud = mountHud(app, {
  theme:    'neon',                    // 'default' | 'midnight' | 'neon' | 'light'
  turbo:    { modes: 3 },              // 2-mode toggle or 3-mode switcher
  autoplay: { mode: 'options' },       // 'options' drawer, or 'infinite'
  spin:     { press: 'hold-to-spin' }, // 'tap', or hold-to-turbo-spin
});

hud.on('spinRequested', () => game.spin()); // events out
hud.ui.spin.busy();                          // commands in
hud.setBalance(1234);
```

That's the whole integration. The HUD owns its layout, theming, animation, responsive
reflow and teardown — you own the game. The model, state machines, theme tokens and layout
all live in the zero-dependency [`@open-ui/core`](https://www.npmjs.com/package/@open-ui/core);
this package is the thin view + controller binding that mounts a single `Container`.

See the [main README](https://github.com/schmooky/open-ui#readme) for the full configuration
surface and the [Charter](https://github.com/schmooky/open-ui/blob/main/CHARTER.md) for the
doctrine.

## Bundled software

The mechanical-reel value counter ([`pixi-text-counter`](https://github.com/schmooky/pixi-text-counter),
MIT © schmooky) is compiled into this package's `dist`, so there is no extra runtime
dependency to install. See [LICENSE](./LICENSE) for the attribution notice.

## License

[MIT](./LICENSE) © schmooky and the open-ui contributors.
