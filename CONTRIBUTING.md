# Contributing to open-ui

Thanks for helping out. open-ui is a small, opinionated library — the
[Charter](./CHARTER.md) is the design spec, so a change should fit its postulates.

## Setup

```bash
pnpm install
```

Node 20+ and pnpm. The packages are a pnpm workspace; `examples/demo` and
`apps/site` consume the library straight from source (no build step needed to run
them).

## The loop

```bash
pnpm test           # @open-ui/core unit tests (Vitest)
pnpm typecheck      # core + pixi + demo
pnpm build          # build both libraries (tsup → ESM + CJS + d.ts)
pnpm dev            # the example client, for eyeballing changes
```

Before opening a PR, make sure all four are green, plus:

```bash
pnpm --dir examples/demo test:visual   # Playwright device screenshots
pnpm --dir apps/site build             # the docs build
```

## Where things live

- **`packages/core`** — the headless model + controllers. New behavior starts
  here, in a `Control` state machine, with a unit test. Zero runtime dependencies.
- **`packages/pixi`** — the PixiJS view binding. Views are dumb: they draw and
  forward input; the truth is in core.
- **`examples/demo`** — the standalone example client and its Playwright tests.
- **`apps/site`** — the docs (Astro, static). No Pixi or React runtime.

## Conventions

- **Configuration is string-literal.** New options should be typed unions so a
  typo won't compile, validated in `validateSpec` (never throw — report and
  degrade), and applied in `createUI`.
- **Test-first for core.** Control FSMs, the spec layer and the responsive layer
  all have Vitest coverage; keep it that way.
- **Leak-free.** Every subscription, tween and timer returns a disposer.

## Commits & PRs

Keep PRs focused. Describe the behavior change and link any Charter postulate it
touches. CI runs typecheck, unit tests, builds and the device-screenshot suite.
