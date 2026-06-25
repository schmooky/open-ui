import { chromium } from '@playwright/test';
import { readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Builds CONTACT SHEETS from screenshots/matrix/<category>/*.png — one overview
 * PNG per state (HUD / Menu / Buy-feature), each a grid of every device. Renders
 * an HTML grid with Playwright (the images are same-origin file:// so they load).
 */
const ROOT = fileURLToPath(new URL('../screenshots/matrix/', import.meta.url));
const CONTACT = ROOT + '_contact/';
mkdirSync(CONTACT, { recursive: true });

const CATS = ['phones', 'tablets', 'desktops'];
const STATES = [
  ['1 hud', 'HUD', 300, 380],
  ['2 menu', 'Menu', 300, 380],
  ['2 menu (full)', 'Whole menu', 320, 900],
  ['3 buyfeature', 'Buy-feature modal', 300, 380],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const [suffix, label, thumbW, thumbH] of STATES) {
  let sections = '';
  for (const cat of CATS) {
    const catDir = ROOT + cat;
    if (!existsSync(catDir)) continue;
    const files = readdirSync(catDir).filter((f) => f.endsWith(`${suffix}.png`)).sort();
    if (!files.length) continue;
    const cells = files
      .map((f) => {
        const name = f.replace(` - ${suffix}.png`, '');
        return `<figure class="cell"><img src="../${cat}/${encodeURIComponent(f)}"><figcaption>${name}</figcaption></figure>`;
      })
      .join('');
    sections += `<section><h2>${cat} — ${files.length}</h2><div class="grid">${cells}</div></section>`;
  }

  const html = `<!doctype html><html><head><meta charset="utf8"><style>
    body{margin:0;padding:30px;background:#0b0d12;color:#e7e9ee;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    h1{margin:0 0 4px;font-size:27px;letter-spacing:.2px}
    .sub{color:#8b919c;margin:0 0 26px;font-size:14px}
    h2{margin:30px 0 14px;font-size:15px;text-transform:capitalize;color:#cdd2da;border-bottom:1px solid #232936;padding-bottom:7px}
    .grid{display:flex;flex-wrap:wrap;gap:20px}
    .cell{margin:0;display:flex;flex-direction:column;align-items:center;gap:8px}
    .cell img{width:${thumbW}px;height:${thumbH}px;object-fit:contain;background:#000;border:1px solid #2a3140;border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.55)}
    figcaption{font-size:12px;color:#99a0ab;max-width:300px;text-align:center}
  </style></head><body>
    <h1>open-ui — ${label} across devices</h1>
    <p class="sub">Popular 2026 phones (portrait + landscape), tablets (both), and desktop resolutions · Playwright Chromium device emulation</p>
    ${sections}
  </body></html>`;

  const htmlPath = `${CONTACT}_sheet-${suffix.replace(/\W/g, '')}.html`;
  writeFileSync(htmlPath, html);
  await page.goto('file://' + htmlPath, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  const out = `${CONTACT}contact - ${label}.png`;
  await page.screenshot({ path: out, fullPage: true });
  console.log('wrote', out);
}

await browser.close();
