# @open-ui/site

The documentation site for **open-ui** — Astro + React islands + shadcn/ui
(new-york, zinc) on Tailwind v4, with **live PixiJS demos** that mount the real
`@open-ui/pixi` HUD onto a host app and a panel that reads controller state
through the public `window.__OPENUI__` introspection API.

Modeled on the `pixi-reels` docs site.

## Develop

```bash
# from the repo root
pnpm install
pnpm --filter @open-ui/site dev      # http://localhost:5210
```

`predev`/`prebuild` run `scripts/sync-assets.mjs`, which copies the HUD art from
`examples/demo/public` into `public/` so the live demos can load it.

## Build

```bash
pnpm --filter @open-ui/site build     # → dist/
pnpm --filter @open-ui/site preview
```

## How it's wired

- The site is **always built against local library source**. `astro.config.mjs`
  aliases `@open-ui/core` and `@open-ui/pixi` to `packages/*/src`, and
  `pixi-text-counter` to its built `dist`.
- `pixi.js` / `react` / `react-dom` / `gsap` are deduped so there is one
  instance shared between the host app and the library.
- Live demos are React islands (`OpenUiPlayground.tsx`) hydrated with
  `client:only="react"` — Pixi needs the browser, so they never SSR.

## Structure

```
src/
  layouts/      Base.astro, Docs.astro
  components/   Nav, Footer, ThemeToggle, DocsSidebar, Mermaid
    ui/         shadcn primitives (button, card, badge, separator)
    hudRuntime.ts        boots a host Pixi app + mounts open-ui
    OpenUiPlayground.tsx live HUD island + __OPENUI__ introspection table
  content/      nav.ts (sidebar/nav structure)
  pages/        index, guides/*, docs/*, recipes/*, demos, charter
  styles/       global.css (shadcn zinc tokens, light + dark)
```
