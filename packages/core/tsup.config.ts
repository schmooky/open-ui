import { defineConfig } from 'tsup';

// @open-ui/core is zero-dependency (Charter B-tier): nothing to externalize.
// Emit ESM + CJS + a single rolled-up .d.ts so the package is consumable from
// npm, plain Node, and any bundler — while `src/` stays the in-workspace source
// (see the `source` field + the host aliases in apps/site & examples/demo).
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
