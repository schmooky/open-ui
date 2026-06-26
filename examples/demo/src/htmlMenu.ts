import { Sprite, type Application } from 'pixi.js';
import { HTMLSource } from 'pixi.js/html-source';
import type { BootedHud } from '@open-ui/pixi';
import { LOCALE_LABELS, type BlockSpec } from '@open-ui/core';
import { MESSAGES } from './locales';
import { RULES_BLOCKS } from './content';

/**
 * A "dope" HTML/CSS menu wired to the open-ui state, demonstrating Pixi v8.19's
 * `pixi.js/html-source`: where the browser supports laying out canvas-child DOM
 * (`<canvas layoutsubtree>`), the live element is mirrored into the WebGL scene as
 * a texture (in-canvas, still interactive). Where it isn't yet (e.g. Chromium 148),
 * it falls back to a DOM overlay over the canvas — identical look, works everywhere.
 */

/** Feature-detect the canvas-DOM-layout capability html-source needs. */
function supportsCanvasLayout(): boolean {
  try {
    const c = document.createElement('canvas');
    c.width = 10;
    c.height = 10;
    c.setAttribute('layoutsubtree', '');
    c.style.cssText = 'position:fixed;left:-9999px;width:10px;height:10px';
    const d = document.createElement('div');
    d.style.cssText = 'width:8px;height:8px';
    c.appendChild(d);
    document.body.appendChild(c);
    void c.offsetWidth;
    const ok = d.offsetWidth > 0;
    document.body.removeChild(c);
    return ok;
  } catch {
    return false;
  }
}

// (native language names come from @open-ui/core's LOCALE_LABELS — covers all 16 Stake locales)

const PAYTABLE = [
  { e: '🃏', p: ['8-9: 10.00x', '10-11: 25.00x', '12+: 50.00x'] },
  { e: '💎', p: ['8-9: 8.00x', '10-11: 20.00x', '12+: 40.00x'] },
  { e: '⭐', p: ['8-9: 6.00x', '10-11: 15.00x', '12+: 30.00x'] },
  { e: '👑', p: ['8-9: 5.00x', '10-11: 12.00x', '12+: 25.00x'] },
  { e: '🔔', p: ['8-9: 2.00x', '10-11: 6.00x', '12+: 12.00x'] },
  { e: '🍒', p: ['8-9: 1.50x', '10-11: 4.00x', '12+: 8.00x'] },
];

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Escape, then turn **bold** runs into <b> — the same inline syntax the Pixi renderer uses. */
const rich = (s: string): string => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

/**
 * Render a declarative BlockSpec[] to HTML — the HTML-menu twin of the library's
 * Pixi `buildBlockColumn`. EVERY piece of text flows through `tr` (= ui.t), so the
 * whole section localizes; re-running this on locale change re-translates it. This
 * is what makes the rules section "modular, configurable by blocks, and never
 * stuck in English". Covers the full rules palette; controls aren't used here.
 */
function renderBlocks(blocks: BlockSpec[], tr: (s: string) => string): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case 'text':
        out.push(`<p>${rich(tr(b.text))}</p>`);
        break;
      case 'heading':
        out.push(`<div class="ohm-sec"><span>${esc(tr(b.text))}</span></div>`);
        break;
      case 'subheading':
        out.push(`<h4 class="ohm-subh">${esc(tr(b.text))}</h4>`);
        break;
      case 'legal':
        out.push(`<p class="ohm-legal">${rich(tr(b.text))}</p>`);
        break;
      case 'divider':
        out.push('<hr class="ohm-hr">');
        break;
      case 'image':
        out.push(`<img class="ohm-feature" alt="${esc(tr(b.alt ?? ''))}" src="${b.src}" loading="lazy">`);
        break;
      case 'media': {
        const img = `<img alt="${esc(tr(b.alt ?? ''))}" src="${b.src}" loading="lazy">`;
        const body = `<div class="ohm-media-body">${b.title ? `<h4>${esc(tr(b.title))}</h4>` : ''}<p>${rich(tr(b.text))}</p></div>`;
        out.push(`<div class="ohm-media ohm-media--${b.side ?? 'left'}">${img}${body}</div>`);
        break;
      }
      case 'cards': {
        const cards = b.items
          .map((it) => `<div class="ohm-fcard">${it.icon ? `<img src="${it.icon}" alt="" loading="lazy">` : ''}<h5>${esc(tr(it.title))}</h5>${it.text ? `<p>${rich(tr(it.text))}</p>` : ''}</div>`)
          .join('');
        out.push(`<div class="ohm-cards">${cards}</div>`);
        break;
      }
      case 'table': {
        const head = b.columns && b.columns.length
          ? `<thead><tr>${b.columns.map((c) => `<th>${esc(tr(c))}</th>`).join('')}</tr></thead>`
          : '';
        const body = b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(tr(c))}</td>`).join('')}</tr>`).join('');
        out.push(`<table class="ohm-table">${head}<tbody>${body}</tbody></table>`);
        break;
      }
      case 'stat-grid': {
        const rows = b.items.map((it) => `<div><dt>${esc(tr(it.label))}</dt><dd>${esc(tr(it.value))}</dd></div>`).join('');
        out.push(`<dl class="ohm-stats">${rows}</dl>`);
        break;
      }
      case 'steps': {
        const items = b.items.map((s) => `<li>${rich(tr(s))}</li>`).join('');
        out.push(b.ordered ? `<ol class="ohm-steps">${items}</ol>` : `<ul class="ohm-steps">${items}</ul>`);
        break;
      }
      case 'callout':
        out.push(`<div class="ohm-callout ohm-callout--${b.tone ?? 'info'}">${b.title ? `<b>${esc(tr(b.title))}</b>` : ''}<p>${rich(tr(b.text))}</p></div>`);
        break;
      default:
        break; // paytable/group/controls aren't part of the rules palette
    }
  }
  return out.join('\n');
}

export function mountHtmlMenu(app: Application, hud: BootedHud): void {
  const ui = hud.ui;
  const t = ui.theme;
  const inCanvas = supportsCanvasLayout();

  const host = document.createElement('div');
  host.className = 'ohm-root';
  // One biased, polished design — a white rules card with gold accents (the
  // reference look), independent of the game theme so it always looks its best.
  const vars: Record<string, string> = {
    '--accent': '#d99000', '--accent-text': '#1a1200',
    '--surface': '#ffffff', '--surface-alt': '#eef1f6',
    '--text': '#181b20', '--text-dim': '#5b6472',
    '--card-radius': '8px', '--font': t.type.family,
  };
  for (const [k, v] of Object.entries(vars)) host.style.setProperty(k, v);

  const tr = (k: string): string => ui.t(k);
  const langOptions = Object.keys(MESSAGES)
    .map((c) => `<option value="${c}"${c === ui.locale.get() ? ' selected' : ''}>${LOCALE_LABELS[c] ?? c}</option>`)
    .join('');
  const payCells = PAYTABLE.map((s) => `
    <div class="ohm-sym">
      <span class="ohm-emoji">${s.e}</span>
      <div class="ohm-pay">${s.p.map((line) => { const i = line.indexOf(':'); return `<div><b>${line.slice(0, i)}</b><span>${line.slice(i + 1)}</span></div>`; }).join('')}</div>
    </div>`).join('');

  // Quick spin reflects the turbo control: a 2-mode toggle, or an N-mode segmented
  // control when turbo has 3+ modes (off / turbo / super) — the appropriate control.
  const turbo = ui.turbo;
  const capKey = (m: string): string => m.charAt(0).toUpperCase() + m.slice(1);
  const turboRow = turbo.modeCount <= 2
    ? `<label class="ohm-row ohm-check"><span data-t="Quick spin">${tr('Quick spin')}</span><span class="ohm-ctl"><input id="ohm-turbo-toggle" type="checkbox"></span></label>`
    : `<div class="ohm-row ohm-check"><span data-t="Quick spin">${tr('Quick spin')}</span><span class="ohm-ctl"><div class="ohm-segmented" id="ohm-turbo-seg">${turbo.modes.map((m, i) => `<button class="ohm-seg" data-i="${i}" data-t="${capKey(m)}">${tr(capKey(m))}</button>`).join('')}</div></span></div>`;

  host.innerHTML = `
    <div class="ohm-backdrop" data-close></div>
    <button class="ohm-x" data-close aria-label="Close">✕</button>
    <div class="ohm-card" role="dialog" aria-modal="true">
      <div class="ohm-body">
        <img class="ohm-logo" alt="LOGO" width="640" height="200" src="https://placehold.co/640x200?text=LOGO" />

        <div class="ohm-sec"><span data-t="Settings">${tr('Settings')}</span></div>
        <label class="ohm-row ohm-check"><span data-t="Sound">${tr('Sound')}</span>
          <span class="ohm-ctl"><input id="ohm-soundtoggle" type="checkbox" checked></span></label>
        <label class="ohm-row"><span data-t="Music">${tr('Music')}</span>
          <input id="ohm-music" type="range" min="0" max="100" value="70"></label>
        <label class="ohm-row"><span data-t="Effects">${tr('Effects')}</span>
          <input id="ohm-effects" type="range" min="0" max="100" value="50"></label>
        <label class="ohm-row"><span data-t="Language">${tr('Language')}</span>
          <select id="ohm-lang">${langOptions}</select></label>
        ${turboRow}

        <div class="ohm-sec"><span data-t="Paytable">${tr('Paytable')}</span></div>
        <div class="ohm-grid">${payCells}</div>

        <div class="ohm-sec"><span data-t="Rules">${tr('Rules')}</span></div>
        <div class="ohm-rules" id="ohm-rules">${renderBlocks(RULES_BLOCKS, tr)}</div>
      </div>
    </div>`;

  const style = document.createElement('style');
  style.textContent = OHM_CSS;
  host.appendChild(style);

  // ── wire controls to open-ui state ──────────────────────────────────────────
  const $ = <T extends Element>(sel: string): T => host.querySelector(sel) as T;
  const soundToggle = $<HTMLInputElement>('#ohm-soundtoggle');
  const music = $<HTMLInputElement>('#ohm-music');
  const effects = $<HTMLInputElement>('#ohm-effects');
  const lang = $<HTMLSelectElement>('#ohm-lang');
  const rulesEl = $<HTMLElement>('#ohm-rules');
  music.value = String(Math.round(ui.musicSlider.value.get() * 100));
  effects.value = String(Math.round(ui.sfxSlider.value.get() * 100));
  music.addEventListener('input', () => ui.musicSlider.setNormalized(+music.value / 100));
  effects.addEventListener('input', () => ui.sfxSlider.setNormalized(+effects.value / 100));
  lang.addEventListener('change', () => ui.setLocale(lang.value));

  // Master Sound toggle: disables the Music/Effects sliders when off.
  const applySound = (): void => { const on = soundToggle.checked; music.disabled = !on; effects.disabled = !on; };
  soundToggle.addEventListener('change', applySound);
  applySound();

  // Turbo / quick-spin → drives ui.turbo (toggle for 2 modes, segmented for 3+).
  if (turbo.modeCount <= 2) {
    const tg = $<HTMLInputElement>('#ohm-turbo-toggle');
    tg.checked = turbo.isOn;
    tg.addEventListener('change', () => turbo.set(tg.checked));
    turbo.index.subscribe(() => { tg.checked = turbo.isOn; });
  } else {
    const segs = Array.from(host.querySelectorAll<HTMLButtonElement>('.ohm-seg'));
    segs.forEach((b) => b.addEventListener('click', () => turbo.setIndex(Number(b.dataset.i))));
    const sync = (): void => segs.forEach((b, i) => b.classList.toggle('active', i === turbo.index.get()));
    turbo.index.subscribe(sync);
    sync();
  }
  host.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => ui.settingsPanel.closePanel()));

  // re-translate on locale change: simple labels via [data-t], and the whole rules
  // section by re-rendering its blocks (so **bold**/nested markup survives).
  ui.locale.subscribe(() => {
    host.querySelectorAll<HTMLElement>('[data-t]').forEach((n) => (n.textContent = tr(n.dataset.t!)));
    rulesEl.innerHTML = renderBlocks(RULES_BLOCKS, tr);
    lang.value = ui.locale.get();
  });

  // open / close follows the settings panel state (opacity + pointer-events; when
  // closed the overlay is click-through so the canvas ☰ button still gets the tap).
  ui.settingsPanel.state.subscribe(() => host.classList.toggle('open', ui.settingsPanel.isOpen));

  // ── mount: mirror into canvas where supported, else overlay over it ──────────
  if (inCanvas) {
    host.classList.add('ohm-incanvas');
    app.canvas.appendChild(host); // direct child of the Pixi canvas (required)
    const sprite = Sprite.from(new HTMLSource({ resource: host, autoUpdate: true }));
    sprite.zIndex = 10_000;
    app.stage.addChild(sprite);
  } else {
    document.body.appendChild(host); // DOM overlay over the canvas
  }
}

const OHM_CSS = `
.ohm-root { position: fixed; top: var(--ohm-top, 0); right: 0; bottom: var(--ohm-bottom, 0); left: 0; z-index: 10000; display: grid; place-items: center; font-family: var(--font); opacity: 0; pointer-events: none; transition: opacity .18s ease; }
.ohm-root.open { opacity: 1; pointer-events: auto; }
.ohm-incanvas { position: absolute; }
.ohm-backdrop { position: absolute; inset: 0; background: rgba(8,6,4,.34); backdrop-filter: blur(6px) saturate(1.1); }
.ohm-card { position: relative; width: min(92%, 1100px); max-height: 86vh; display: flex; flex-direction: column; background: var(--surface); color: var(--text); border: 1.5px solid #000; border-radius: var(--card-radius); box-shadow: 0 30px 80px rgba(0,0,0,.5); overflow: hidden; transform: translateY(8px) scale(.99); transition: transform .18s ease; }
.ohm-root.open .ohm-card { transform: none; }
.ohm-x { position: absolute; top: 18px; right: 22px; width: 46px; height: 46px; border-radius: 999px; border: 0; background: rgba(18,14,10,.82); color: #fff; font-size: 18px; cursor: pointer; display: grid; place-items: center; box-shadow: 0 6px 18px rgba(0,0,0,.45); z-index: 2; transition: transform .12s, background .12s; }
.ohm-x:hover { transform: scale(1.08); background: rgba(18,14,10,.95); }
.ohm-body { padding: 24px 26px 26px; overflow-y: scroll; }
/* always-visible (overflow:scroll reserves it) black bar, inset ~6px from the edge
   via a transparent border + padding-box clip so it sits a little left of the side. */
.ohm-body::-webkit-scrollbar { width: 18px; }
.ohm-body::-webkit-scrollbar-track { background: transparent; margin: 12px 0; }
.ohm-body::-webkit-scrollbar-thumb { background-color: #111; border: 6px solid transparent; background-clip: padding-box; border-radius: 999px; min-height: 44px; }
.ohm-body::-webkit-scrollbar-thumb:hover { background-color: #000; }
.ohm-logo { display: block; margin: 6px auto 18px; max-width: 64%; height: auto; }
.ohm-sec { display: flex; align-items: center; gap: 14px; margin: 26px 0 14px; color: var(--text); font-weight: 800; letter-spacing: 1px; }
.ohm-sec::before, .ohm-sec::after { content: ""; flex: 1; height: 2px; background: color-mix(in srgb, var(--text) 80%, transparent); border-radius: 2px; }
.ohm-row { display: flex; align-items: center; gap: 16px; margin: 14px 0; font-weight: 700; }
.ohm-row > span:first-child { min-width: 120px; }
/* inputs don't stretch full width — capped (dvw-based, with a px ceiling so they
   never get giant on wide screens nor too small on phones). */
.ohm-row input[type=range] { flex: 1; max-width: min(440px, 60dvw); accent-color: var(--accent); height: 6px; }
.ohm-row select { flex: 1; max-width: min(440px, 60dvw); padding: 11px 14px; border-radius: 4px; border: 2px solid var(--accent); background: var(--surface-alt); color: var(--text); font-weight: 700; font-size: 15px; cursor: pointer; }
/* the open dropdown list reads differently from the closed pill: white options, accent-highlighted selection */
.ohm-row select option { background: var(--surface); color: var(--text); font-weight: 600; }
.ohm-row select option:checked { background: var(--accent); color: var(--accent-text); }
/* toggles/segmented sit in the same capped column as the sliders/select, right-
   aligned, so their right edge lines up with the inputs' right border. */
.ohm-ctl { flex: 1; max-width: min(440px, 60dvw); display: flex; align-items: center; justify-content: flex-end; }
.ohm-check input[type=checkbox] { appearance: none; -webkit-appearance: none; width: 50px; height: 28px; border-radius: 999px; background: color-mix(in srgb, var(--text-dim) 38%, transparent); position: relative; cursor: pointer; transition: background .15s; flex: none; }
.ohm-check input[type=checkbox]:checked { background: var(--accent); }
.ohm-check input[type=checkbox]::before { content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 999px; background: #fff; transition: left .15s; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.ohm-check input[type=checkbox]:checked::before { left: 25px; }
.ohm-row input[type=range]:disabled { opacity: .4; cursor: not-allowed; }
.ohm-segmented { display: inline-flex; gap: 4px; padding: 4px; background: var(--surface-alt); border-radius: 999px; border: 1px solid color-mix(in srgb, var(--text-dim) 30%, transparent); }
.ohm-seg { border: 0; background: transparent; color: var(--text-dim); font-weight: 700; font-size: 14px; padding: 8px 18px; border-radius: 999px; cursor: pointer; transition: background .12s, color .12s; }
.ohm-seg.active { background: var(--accent); color: var(--accent-text); }
.ohm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.ohm-sym { display: flex; align-items: center; gap: 16px; padding: 6px 4px; }
.ohm-emoji { font-size: 48px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,.3)); }
.ohm-pay { font-size: 13px; line-height: 1.6; }
.ohm-pay div { display: flex; gap: 6px; }
.ohm-pay b { min-width: 42px; }
.ohm-pay span { color: var(--accent); font-weight: 700; }
.ohm-body p { color: var(--text-dim); line-height: 1.6; }
.ohm-body p b { color: var(--text); }
.ohm-feature { display: block; width: 100%; height: auto; margin: 10px 0; }
.ohm-stats { margin: 12px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
.ohm-stats > div { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid color-mix(in srgb, var(--text-dim) 20%, transparent); }
.ohm-stats dt { color: var(--text-dim); margin: 0; } .ohm-stats dd { margin: 0; font-weight: 700; }
.ohm-callout { margin: 16px 0 4px; padding: 14px 16px; border-radius: 12px; border-left: 4px solid var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); }
.ohm-callout b { color: var(--accent); } .ohm-callout p { margin: 4px 0 0; color: var(--text); }
.ohm-callout--warning { border-left-color: #e0a106; background: color-mix(in srgb, #e0a106 10%, transparent); }
.ohm-callout--warning b { color: #b07d09; }
/* — rules block palette — */
.ohm-subh { margin: 22px 0 8px; font-size: 15px; font-weight: 800; letter-spacing: .5px; color: var(--text); }
.ohm-legal { font-size: 12px; line-height: 1.6; color: var(--text-dim); opacity: .85; }
.ohm-hr { border: 0; border-top: 1px solid color-mix(in srgb, var(--text-dim) 30%, transparent); margin: 18px 0; }
.ohm-media { display: flex; align-items: center; gap: 18px; margin: 14px 0; }
.ohm-media--right { flex-direction: row-reverse; }
.ohm-media > img { width: 40%; max-width: 320px; height: auto; flex: none; }
.ohm-media-body { flex: 1; }
.ohm-media-body h4 { margin: 0 0 6px; font-size: 16px; color: var(--text); }
.ohm-media-body p { margin: 0; }
.ohm-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 12px 0; }
.ohm-fcard { padding: 8px 6px; text-align: center; }
.ohm-fcard img { display: block; width: 48px; height: 48px; margin: 0 auto 8px; }
.ohm-fcard h5 { margin: 0 0 4px; font-size: 14px; color: var(--text); }
.ohm-fcard p { margin: 0; font-size: 12px; line-height: 1.5; }
.ohm-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
.ohm-table th { text-align: left; padding: 8px 10px; font-weight: 800; color: var(--text); border-bottom: 2px solid color-mix(in srgb, var(--text-dim) 35%, transparent); }
.ohm-table td { padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, var(--text-dim) 18%, transparent); }
.ohm-table td:first-child { color: var(--text); font-weight: 700; }
.ohm-table td:not(:first-child) { color: var(--accent); font-weight: 700; }
.ohm-steps { margin: 12px 0; padding-left: 22px; color: var(--text-dim); line-height: 1.7; }
.ohm-steps li { margin: 5px 0; }
.ohm-steps b { color: var(--text); }
`;
