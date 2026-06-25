import { defineConfig } from 'tsup';

// @open-ui/pixi is the renderer binding. Keep the heavy, instance-sensitive deps
// OUT of the bundle (Charter B2 — one shared pixi.js): `pixi.js` is a peer and
// `@open-ui/core` ships separately, so both stay external.
//
// `pixi-text-counter` is deliberately BUNDLED (it's a workspace devDependency, so
// tsup inlines it rather than externalizing it): the only published fork is a
// vendored 0.2.0 that isn't on npm, so inlining keeps `@open-ui/pixi` self-
// contained and installable without an unpublished dependency. It pulls in no
// extra imports — gsap is passed in by the caller (never imported) and its
// pixi.js peer collapses onto our single external pixi.js. MIT, © schmooky;
// attribution lives in the package README + NOTICE.
//
// NOTE: the .d.ts rollup resolves `@open-ui/core` via its built `dist`, so build
// core BEFORE pixi (the root `build` script enforces this order).
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  // Inline `pixi-text-counter`'s *types* into the rollup too (the JS is already
  // bundled because it's a devDep). Without this the .d.ts keeps an `import …
  // from 'pixi-text-counter'`, which breaks consumers since it isn't shipped.
  // `@open-ui/core` and `pixi.js` stay external in the types (they're real deps).
  dts: { resolve: ['pixi-text-counter'] },
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['pixi.js', '@open-ui/core'],
});
