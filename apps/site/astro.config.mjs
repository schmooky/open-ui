import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

// The docs are pure static content — no Pixi, no React islands. The live HUD lives
// in the standalone example client (examples/demo), screenshotted by Playwright and
// shown here as images. That keeps the docs small and fast (Charter: say less).
export default defineConfig({
  site: 'https://open-ui.schmooky.dev',
  prefetch: { defaultStrategy: 'hover', prefetchAll: false },
  server: { port: 5210 },
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
