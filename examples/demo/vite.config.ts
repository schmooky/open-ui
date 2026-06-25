import { defineConfig } from 'vite';

// Repo root, derived from this config's own location (no node: imports, so this
// stays typecheckable under the workspace's zero-`@types` tsconfig).
const root = new URL('../../', import.meta.url);
const fromRoot = (p: string): string => new URL(p, root).pathname;

// Share ONE pixi.js instance between the host app and the lib (Charter B2), and
// read the workspace packages straight from TS source. The package `exports` now
// point at built `dist/` (so the lib is publishable), so we alias @open-ui/* back
// to `src/` here — the demo is ALWAYS run against source, never a build.
// (apps/site does the same in astro.config.mjs; keep the two in sync.)
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@open-ui\/core$/, replacement: fromRoot('packages/core/src/index.ts') },
      { find: /^@open-ui\/pixi$/, replacement: fromRoot('packages/pixi/src/index.ts') },
      { find: /^pixi-text-counter$/, replacement: fromRoot('vendor/pixi-text-counter/dist/index.js') },
    ],
    dedupe: ['pixi.js'],
  },
  optimizeDeps: { exclude: ['@open-ui/core', '@open-ui/pixi'] },
  server: { fs: { allow: [root.pathname] }, port: 5199, strictPort: true },
});
