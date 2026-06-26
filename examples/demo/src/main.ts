import { Application, Assets, Container, Graphics, Rectangle, Texture } from 'pixi.js';
import { mountHud, svgSpinSkin, StatusBarView } from '@open-ui/pixi';
import type { UISpec, CurrencySpec, ThemePreset, JurisdictionConfig } from '@open-ui/core';
import { MESSAGES } from './locales';
import { RULES_BLOCKS, FEATURES } from './content';
import { mountHtmlMenu } from './htmlMenu';
import { mountBuyFeatureModal } from './buyFeatureModal';
import { gsap } from 'gsap';

/**
 * The open-ui EXAMPLE CLIENT — a throwaway host "game" (a shuffling pip grid) with
 * the real @open-ui HUD mounted on top in ONE call. Everything the HUD looks and
 * behaves like is set by a plain JSON UISpec, here read from the URL so the
 * Playwright suites can screenshot every permutation:
 *
 *   ?turbo=3&autoplay=infinite&spin=hold&currency=BTC&locale=ja&bare=1
 *   ?accent=%23ff0000   (recolour the one b&w+yellow theme — a broken value can't break it)
 */

const legendEl = document.getElementById('legend') as HTMLDivElement;
const q = new URLSearchParams(location.search);
if (q.get('bare') === '1') document.body.classList.add('bare');

// Each entry exercises a different facet: symbol-vs-code display, the minimal-unit
// precision (decimals after the .), and big numbers that make the counter auto-scale.
//   ?currency=USD|EUR|mBTC|SATS|BTC
const CURRENCIES: Record<string, { spec: CurrencySpec; balance: number; bet: number }> = {
  // symbol display ($ sits tight before the number) · 2-decimal minor unit
  USD: { spec: { code: 'USD', symbol: '$', display: 'symbol', position: 'prefix', decimals: 2 }, balance: 12345.67, bet: 1 },
  EUR: { spec: { code: 'EUR', symbol: '€', display: 'symbol', position: 'prefix', decimals: 2, decimalChar: ',', separator: '.' }, balance: 12345.67, bet: 1 },
  // crypto CODES (no symbol) with different minimal units → different decimals,
  // and wide values that trigger the counter's auto-downscale.
  mBTC: { spec: { code: 'mBTC', decimals: 5 }, balance: 1234.56789, bet: 0.01 },
  SATS: { spec: { code: 'SATS', decimals: 0 }, balance: 123456789, bet: 100 },
  BTC: { spec: { code: 'BTC', symbol: '₿', display: 'symbol', position: 'prefix', decimals: 8 }, balance: 1.23456789, bet: 0.0001 },
};

const cfg = {
  // open-ui ships ONE theme — black & white with a yellow accent. `?accent=` recolours it.
  theme: 'default' as ThemePreset,
  accent: q.get('accent') ?? undefined,
  turbo: q.get('turbo') === '3' ? (3 as const) : (2 as const),
  autoplay: q.get('autoplay') === 'infinite' ? ('infinite' as const) : ('options' as const),
  spin: q.get('spin') === 'hold' ? ('hold-to-spin' as const) : ('tap' as const),
  currency: (q.get('currency') && CURRENCIES[q.get('currency')!] ? q.get('currency')! : 'USD'),
  locale: q.get('locale') && MESSAGES[q.get('locale')!] ? q.get('locale')! : 'en',
  // buy-feature: ?activation=single|multi (default multi) · ?blockbuy=1
  activation: (q.get('activation') === 'single' ? 'single' : 'multi') as 'single' | 'multi',
  blockBuy: q.get('blockbuy') === '1',
  // status bar edge for the compliance readouts: ?statusbar=top|bottom|off (default top)
  statusBar: (q.get('statusbar') === 'bottom' ? 'bottom' : q.get('statusbar') === 'off' ? undefined : 'top') as 'top' | 'bottom' | undefined,
  // reality-check interval in minutes (?reality=0.2 ≈ 12s, for demoing); replay mode
  reality: Number(q.get('reality')) || 0,
  replay: q.get('replay') === '1',
  // initial HUD visibility: ?intro=shown|hidden|slide-in (default shown)
  intro: (['hidden', 'slide-in'].includes(q.get('intro') ?? '') ? q.get('intro') : 'shown') as 'shown' | 'hidden' | 'slide-in',
};

/** Parse `?juris=rtp,net,timer,noturbo,noslam,…` into a Stake Engine JurisdictionConfig
 *  (a demo knob — a real game gets this from the RGS authenticate response). Defaults
 *  to showing the three compliance readouts so they're visible out of the box. */
function parseJurisdiction(raw: string | null): JurisdictionConfig {
  const f = new Set((raw ?? 'rtp,net,timer').split(',').map((s) => s.trim()).filter(Boolean));
  return {
    displayRTP: f.has('rtp'),
    displayNetPosition: f.has('net'),
    displaySessionTimer: f.has('timer'),
    disabledTurbo: f.has('noturbo'),
    disabledSuperTurbo: f.has('nosuper'),
    disabledAutoplay: f.has('noauto'),
    disabledSlamstop: f.has('noslam'),
    disabledSpacebar: f.has('nohold'),
    disabledBuyFeature: f.has('nobuy'),
    disabledFullscreen: f.has('nofs'),
    socialCasino: f.has('social'),
  };
}
const JURISDICTION = parseJurisdiction(q.get('juris'));

/** The whole HUD as one config object — the public surface a real slot would ship. */
function buildSpec(): UISpec {
  const cur = CURRENCIES[cfg.currency]!;
  return {
    // A bad ?accent is sanitized away (the preset accent shows through) — never broken.
    theme: cfg.accent ? { preset: cfg.theme, overrides: { color: { accent: cfg.accent } } } : cfg.theme,
    currency: cur.spec,
    betLadder: { levels: [0.5, 1, 2, 5, 10, 20], index: 1 },
    turbo: { modes: cfg.turbo },
    autoplay: { mode: cfg.autoplay, options: [5, 10, 25, 50, 100, Infinity], lossLimits: [5, 10, 25, 50, Infinity], winLimits: [10, 25, 50, 100, Infinity] },
    spin: { press: cfg.spin },
    // Stake Engine compliance: an RTP figure + the jurisdiction switchboard (the demo
    // reads ?juris=…; a real game gets this from the RGS authenticate response).
    rtp: 96,
    jurisdiction: JURISDICTION,
    statusBar: cfg.statusBar,
    game: { name: 'Scrolls of Fate', version: '1.0.0' },
    realityCheck: cfg.reality > 0 ? { everyMinutes: cfg.reality } : undefined,
    // Desktop button layout CLONED from the reference UI design (Dev.svg): a bottom
    // bar — balance · play · SPIN · turbo · bet (+ steppers to its right) — with the
    // bonus on the right rail and the ☰ menu on the lower left. The design has no
    // tilted buttons (rotation 0), but LayoutSpec.rotation now supports it. (Portrait
    // reflows below; audio/rules live in the ☰ menu, not on a left rail.)
    controls: {
      spin: { layout: { anchor: 'bottom-center', offset: [0, -150], scale: 1.25, rotation: 0 } },
      autoplay: { layout: { anchor: 'bottom-center', offset: [-240, -140] } },
      turbo: { layout: { anchor: 'bottom-center', offset: [240, -140] } },
      // balance + bet read large — the two figures the player checks most (scale 1.35).
      balance: { layout: { anchor: 'bottom-left', offset: [205, -64], scale: 1.35 } },
      bet: { layout: { anchor: 'bottom-right', offset: [-345, -64], scale: 1.35 } },
      'bet-plus': { layout: { anchor: 'bottom-right', offset: [-118, -92] } },
      'bet-minus': { layout: { anchor: 'bottom-right', offset: [-118, -40] } },
      // bonus (buy) on the right rail + ☰ menu on the lower left, both lifted a little.
      bonus: { layout: { anchor: 'bottom-right', offset: [-208, -258] } },
      settings: { layout: { anchor: 'bottom-left', offset: [95, -182] } },
    },
    // The unified ☰ menu — every part is a modular, configurable BLOCK: a banner
    // image, a divider+settings, a multiplier paytable with symbol icons, and rules
    // with bold inline text + a stat grid + a callout. All localizable; images use
    // placehold.co so the desired dimensions/resolutions show even offline.
    menu: {
      banner: { src: 'https://placehold.co/1000x120/1f2430/ffd166?text=Scrolls+of+Fate', width: 1000, height: 120 },
      settings: [
        { kind: 'toggle', id: 'quick', label: 'Quick spin' },
        { kind: 'select', id: 'gfx', label: 'Graphics', index: 2, options: [
          { value: 'low', label: 'Low' }, { value: 'med', label: 'Medium' }, { value: 'high', label: 'High' },
        ] },
      ],
      // A 3-column multiplier grid with symbol icons (placehold.co → real dimensions).
      paytable: [
        { kind: 'paytable', id: 'pt', columns: 3, rows: [
          { symbol: 'Wild', icon: 'https://placehold.co/72x72/ef4444/ffffff?text=W', payouts: '8-9: 10.00x\n10-11: 25.00x\n12+: 50.00x' },
          { symbol: 'Scatter', icon: 'https://placehold.co/72x72/3b82f6/ffffff?text=S', payouts: '8-9: 8.00x\n10-11: 20.00x\n12+: 40.00x' },
          { symbol: 'Star', icon: 'https://placehold.co/72x72/f59e0b/000000?text=ST', payouts: '8-9: 6.00x\n10-11: 15.00x\n12+: 30.00x' },
          { symbol: 'Ace', icon: 'https://placehold.co/72x72/22c55e/ffffff?text=A', payouts: '8-9: 5.00x\n10-11: 12.00x\n12+: 25.00x' },
          { symbol: 'King', icon: 'https://placehold.co/72x72/a855f7/ffffff?text=K', payouts: '8-9: 2.00x\n10-11: 6.00x\n12+: 12.00x' },
          { symbol: 'Queen', icon: 'https://placehold.co/72x72/ec4899/ffffff?text=Q', payouts: '8-9: 1.50x\n10-11: 4.00x\n12+: 8.00x' },
        ] },
      ],
      // A rich rules section showing off the whole block palette — defined once in
      // content.ts and shared with the HTML menu, so both render identical, fully
      // localized content (the English text doubles as the i18n key).
      rules: RULES_BLOCKS,
    },
    // 10-locale dictionary + starting locale; a Language switch appears in Settings.
    locale: { messages: MESSAGES, locale: cfg.locale },
    // Portrait reflow: a thumb-friendly stack that holds together down to the
    // narrowest phone. SPIN drops to the same row as autoplay + turbo (which move
    // out to the screen sides); the bet steppers tuck directly below SPIN; the buy
    // (bonus) + ☰ menu sit on the row above. The buy button is NEVER hidden.
    responsive: {
      portrait: {
        controls: {
          spin: { layout: { anchor: 'bottom-center', offset: [0, -300], scale: 1.15 } },
          autoplay: { layout: { anchor: 'bottom-center', offset: [-370, -300] } },
          turbo: { layout: { anchor: 'bottom-center', offset: [370, -300] } },
          'bet-minus': { layout: { anchor: 'bottom-center', offset: [-95, -140] } },
          'bet-plus': { layout: { anchor: 'bottom-center', offset: [95, -140] } },
          bonus: { layout: { anchor: 'bottom-center', offset: [-300, -490] } },
          settings: { layout: { anchor: 'bottom-center', offset: [300, -490] } },
          balance: { layout: { anchor: 'bottom-left', offset: [215, -56], scale: 1.25 } },
          bet: { layout: { anchor: 'bottom-right', offset: [-215, -56], scale: 1.25 } },
        },
      },
    },
  };
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    backgroundAlpha: 0, // transparent canvas → the page's themed background shows through
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.body.appendChild(app.canvas);
  app.canvas.style.outline = 'none';

  const reels = buildReels();
  app.stage.addChild(reels.container);

  // ---- load the bundled SVG art ----
  const load = async (src: string): Promise<Texture> => {
    const t = await Assets.load<Texture>({ src, data: { resolution: 3 } });
    t.source.autoGenerateMipmaps = true;
    t.source.style.scaleMode = 'linear';
    t.source.style.mipmapFilter = 'linear';
    t.source.update();
    return t;
  };
  const spinDefault = await load('/spin/default.svg');
  const spinAuto = await load('/spin/auto.svg');
  const rulesTex = await load('/icons/rules.svg');
  const musicTrack = await load('/icons/slider-music-track.svg');
  const soundTrack = await load('/icons/slider-sound-track.svg');
  const turboTex = await load('/icons/turbo.svg');
  const [turboOff, turboOn] = sliceRows(turboTex, 2);
  const autoTex = await load('/icons/auto.svg');
  const autoFrames = sliceRows(autoTex, 4);
  const bonusTex = await load('/icons/bonus.svg');
  const plusTex = await load('/icons/plus.svg');
  const minusTex = await load('/icons/minus.svg');

  // ---- mount the whole HUD in ONE call (Charter B9) ----
  const hud = mountHud(app, buildSpec(), {
    expose: true,
    gsap, // enables the value counter's auto-downscale for wide currencies
    menu: false, // the one biased menu design is the HTML one, mounted below
    intro: cfg.intro, // ?intro=shown|hidden|slide-in

    spinSkin: () => svgSpinSkin({ default: spinDefault, auto: spinAuto }),
    icons: {
      // menu (☰), fullscreen + mute render as b&w "mono" glyph buttons like turbo —
      // no settings art passed, so the library draws the mono ☰ (toggles to ✕).
      rules: rulesTex,
      sliderMusic: musicTrack,
      sliderSound: soundTrack,
      turboOff,
      turboOn,
      // 3-mode turbo reuses the off/on art + the built-in level pips overlay
      autoIdle: autoFrames[0],
      autoActive: autoFrames[2],
      bonus: bonusTex,
      betPlus: plusTex,
      betMinus: minusTex,
    },
  });
  const ui = hud.ui;
  mountHtmlMenu(app, hud);
  // Buy-feature modal (opened by the bonus coin). Buying CLOSES it and the host
  // deducts the cost + would start the feature; activating a bet boost keeps it
  // open. Activation is configurable (single/multi, blocks-buy) via the URL.
  mountBuyFeatureModal(app, hud, FEATURES, {
    activation: cfg.activation,
    activationBlocksBuy: cfg.blockBuy,
    onBuy: (id, cost) => {
      const dec = ui.balance.currency.get().decimals;
      const p = 10 ** dec;
      ui.balance.set(Math.max(0, Math.round((ui.balance.get() - cost) * p) / p)); // deduct
      console.log(`[demo] bought "${id}" for ${cost} — running the feature…`);
      // a real game would now run the bought feature (e.g. free spins)
    },
    onActivate: (activeIds) => console.log('[demo] active boosts:', activeIds),
  });

  const start = CURRENCIES[cfg.currency]!;
  ui.balance.set(start.balance);
  if (cfg.replay) hud.setReplay(true); // ?replay=1 → REPLAY badge + locked HUD

  // ---- talk to it from the outside: events out, façade in ----
  const round = (x: number, d: number): number => {
    const p = 10 ** d;
    return Math.round(x * p) / p;
  };
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const turboEngaged = (): boolean => ui.turbo.isOn;

  /** One round, driven by the host. `turbo` shortens the reel spin. */
  async function playSpin(turbo = turboEngaged()): Promise<void> {
    const dec = ui.balance.currency.get().decimals;
    const bet = ui.bet.get();
    ui.spin.busy();
    ui.balance.set(round(ui.balance.get() - bet, dec));
    await reels.spin(app, turbo);
    const win = Math.random() < 0.45 ? round(bet * (1 + Math.random() * 24), dec) : 0;
    if (win > 0) ui.balance.set(round(ui.balance.get() + win, dec));
    // feed the settled round to the HUD → net-position readout + autoplay RG limits
    ui.reportRound(win, bet);
  }

  ui.on('spinRequested', async () => {
    // Stake Engine error UX: block + surface insufficient funds in a menu-style modal.
    if (ui.balance.get() < ui.bet.get()) {
      hud.showRgsError('ERR_IPB'); // default localized message (override per-call if you like)
      return;
    }
    await playSpin();
    ui.spin.stopState();
    await wait(turboEngaged() ? 120 : 420);
    ui.spin.idle();
  });
  ui.on('skipRequested', () => reels.skip());

  // autoplay: the host runs the loop; open-ui owns the picker, the live count, AND the
  // RG limits — each round is fed back via playSpin → ui.reportRound, which decrements
  // the count and stops autoplay on the loss / single-win limits picked in the drawer.
  ui.on('autoplayStarted', async () => {
    while (ui.autoplay.isActive) {
      if (ui.balance.get() < ui.bet.get()) {
        ui.autoplay.stop();
        break;
      }
      await playSpin();
      ui.spin.idle();
      await wait(turboEngaged() ? 120 : 240);
    }
  });

  // hold-to-spin: turbo-spin on a loop while the button is held
  let holding = false;
  ui.on('holdSpinStarted', async () => {
    holding = true;
    while (holding) {
      await playSpin(true);
      ui.spin.idle();
      await wait(90);
    }
  });
  ui.on('holdSpinStopped', () => {
    holding = false;
  });

  // ---- a few keyboard conveniences (the demo, not the library) ----
  let controlsShown = true;
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'a') ui.spin.current === 'auto' ? ui.spin.idle() : ui.spin.auto();
    else if (k === '+' || k === '=') ui.betStepper.inc();
    else if (k === '-') ui.betStepper.dec();
    else if (k === 't') ui.turbo.cycle();
    else if (k === '2') ui.turbo.setModes(['off', 'on']);
    else if (k === '3') ui.turbo.setModes(['off', 'turbo', 'super']);
    else if (k === 'm') ui.toggleMute();
    else if (k === 'e')
      hud.showError('A consistent internet connection is required. Reload to finish any uncompleted bets.', {
        title: 'Connection lost',
        actions: [
          { label: 'openui.reload', variant: 'primary', onSelect: () => location.reload() },
          { label: 'openui.ok', variant: 'secondary' },
        ],
      });
    else if (k === 'h') {
      controlsShown = !controlsShown;
      hud.setControlsVisible(controlsShown); // slide the whole interactive HUD in/out
    }
  });

  (window as unknown as Record<string, unknown>).ui = ui;

  // center the reels on resize
  const layoutReels = (): void => reels.layout(app.screen.width, app.screen.height);
  // Keep the status bar uncovered by the HTML menu: inset the menu by the bar height
  // (the bar is in the Pixi canvas; the menu is DOM, so it gets a CSS top/bottom inset).
  const setMenuInset = (): void => {
    const h = cfg.statusBar ? StatusBarView.heightFor(ui.screen.get()) : 0;
    const root = document.documentElement.style;
    root.setProperty('--ohm-top', cfg.statusBar === 'top' ? `${h}px` : '0px');
    root.setProperty('--ohm-bottom', cfg.statusBar === 'bottom' ? `${h}px` : '0px');
  };
  app.renderer.on('resize', () => {
    layoutReels();
    setMenuInset();
  });
  layoutReels();
  setMenuInset();

  // ---- tiny legend (host chrome, not part of open-ui) ----
  const fmt = (n: number): string => n.toLocaleString(undefined, { maximumFractionDigits: 8 });
  const drawLegend = (): void => {
    if (document.body.classList.contains('bare')) return;
    const s = ui.screen.get();
    const code = ui.balance.currency.get().code;
    legendEl.innerHTML =
      `<b>open-ui</b> · example client\n` +
      `theme   <span class="k">${String(cfg.theme)}</span>\n` +
      `turbo   <span class="k">${ui.turbo.modeCount}-mode</span> · <span class="k">${ui.turbo.mode}</span>\n` +
      `auto    <span class="k">${ui.autoplay.mode}</span>\n` +
      `spin    <span class="k">${cfg.spin}</span>\n` +
      `locale  <span class="k">${ui.locale.get()}</span>\n` +
      `screen  <span class="k">${s.breakpoint}/${s.orientation}</span>\n` +
      `balance <span class="k">${fmt(ui.balance.get())} ${code}</span>\n` +
      `<span class="d">keys: A auto · ± bet · T turbo · 2/3 modes</span>`;
  };
  app.ticker.add(drawLegend);
}

/** A throwaway placeholder "game": a 5×3 grid that shuffles while spinning. */
function buildReels(): {
  container: Container;
  layout: (w: number, h: number) => void;
  spin: (app: Application, turbo?: boolean) => Promise<void>;
  skip: () => void;
} {
  const COLS = 5;
  const ROWS = 3;
  const CELL = 150;
  const GAP = 14;
  const PALETTE = [0x4cc9f0, 0xf72585, 0xffc935, 0x80ed99, 0xb5179e];

  const container = new Container();
  const grid = new Container();
  container.addChild(grid);

  const pips: Graphics[] = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const cell = new Container();
      cell.x = c * (CELL + GAP);
      cell.y = r * (CELL + GAP);
      const bg = new Graphics();
      bg.roundRect(0, 0, CELL, CELL, 16).fill({ color: 0x161b22 }).stroke({ width: 2, color: 0x222b36 });
      const pip = new Graphics();
      pip.x = CELL / 2;
      pip.y = CELL / 2;
      drawPip(pip, PALETTE[(c + r) % PALETTE.length] ?? 0xffffff);
      cell.addChild(bg, pip);
      grid.addChild(cell);
      pips.push(pip);
    }
  }

  const gridW = COLS * CELL + (COLS - 1) * GAP;
  const gridH = ROWS * CELL + (ROWS - 1) * GAP;

  const layout = (w: number, h: number): void => {
    const portrait = w / h < 0.85;
    const scale = Math.min(portrait ? (w * 0.92) / gridW : (w * 0.62) / gridW, (h * 0.42) / gridH);
    container.scale.set(scale);
    container.x = (w - gridW * scale) / 2;
    container.y = (h - gridH * scale) / 2 - h * (portrait ? 0.16 : 0.12);
  };

  let skipFlag = false;
  const shuffle = (): void => {
    for (const pip of pips) drawPip(pip, PALETTE[Math.floor(Math.random() * PALETTE.length)] ?? 0xffffff);
  };
  const spin = (app: Application, turbo = false): Promise<void> =>
    new Promise<void>((resolve) => {
      skipFlag = false;
      let elapsed = 0;
      let acc = 0;
      const duration = turbo ? 360 : 1100;
      const step = turbo ? 45 : 70;
      const fn = (): void => {
        const dt = app.ticker.deltaMS;
        elapsed += dt;
        acc += dt;
        if (acc > step) {
          acc = 0;
          shuffle();
        }
        if (elapsed >= duration || skipFlag) {
          app.ticker.remove(fn);
          shuffle();
          resolve();
        }
      };
      app.ticker.add(fn);
    });
  const skip = (): void => {
    skipFlag = true;
  };

  return { container, layout, spin, skip };
}

function drawPip(g: Graphics, color: number): void {
  g.clear();
  g.roundRect(-44, -44, 88, 88, 14).fill({ color });
}

/** Slice a vertically-stacked icon sheet (e.g. Menu = [☰, ✕]) into frames. */
function sliceRows(tex: Texture, rows: number): Texture[] {
  const src = tex.source;
  const rh = src.height / rows;
  return Array.from({ length: rows }, (_, i) => new Texture({ source: src, frame: new Rectangle(0, i * rh, src.width, rh) }));
}

void main();
