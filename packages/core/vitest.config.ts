import { defineConfig } from 'vitest/config';

// Tests run straight against TS source (vitest transpiles on the fly) — no build
// step required. Headless core is pure logic, so the plain `node` environment is
// enough; no DOM, no Pixi.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
