import { Application, Assets, Container, Graphics, Rectangle, Texture } from 'pixi.js';
import { mountHud, svgSpinSkin } from '@open-slot-ui/pixi';
import type { UISpec, CurrencySpec, ThemePreset, JurisdictionConfig } from '@open-slot-ui/core';
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
 *   ?autoplay=infinite&spin=hold&currency=BTC&locale=ja&bare=1
 *   ?accent=%23ff0000   (recolour the one b&w+yellow theme — a broken value can't break it)
 */

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
  autoplay: q.get('autoplay') === 'infinite' ? ('infinite' as const) : ('options' as const),
  spin: q.get('spin') === 'hold' ? ('hold-to-spin' as const) : ('tap' as const),
  currency: (q.get('currency') && CURRENCIES[q.get('currency')!] ? q.get('currency')! : 'USD'),
  locale: q.get('locale') && MESSAGES[q.get('locale')!] ? q.get('locale')! : 'en',
  // buy-feature: ?activation=single|multi (default multi) · ?blockbuy=1
  activation: (q.get('activation') === 'single' ? 'single' : 'multi') as 'single' | 'multi',
  blockBuy: q.get('blockbuy') === '1',
  // reality-check interval in minutes (?reality=0.2 ≈ 12s, for demoing); replay mode
  reality: Number(q.get('reality')) || 0,
  replay: q.get('replay') === '1',
  // ?fs=12 → switch the spin button to its free-spins face; ?fatal=1 → blocking modal
  fs: Number(q.get('fs')) || 0,
  fatal: q.get('fatal') === '1',
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
    // The Figma "default" look is set in Montserrat (Black for the HUD figures). A bad
    // ?accent is sanitized away (the preset accent shows through) — never broken.
    theme: {
      preset: cfg.theme,
      overrides: { type: { family: '"Montserrat", system-ui, sans-serif' }, ...(cfg.accent ? { color: { accent: cfg.accent } } : {}) },
    },
    currency: cur.spec,
    betLadder: { levels: [0.5, 1, 2, 5, 10, 20], index: 1 },
    // Turbo is a 2-mode (off/on) toggle — the only supported mode for now.
    turbo: { modes: 2 },
    // Autoplay is host-configurable: the spin-count options always show; the two RG
    // fields (stop-on-loss / stop-on-single-win) only appear when you pass them.
    autoplay: { mode: cfg.autoplay, options: [5, 10, 25, 50, 100, Infinity], lossLimits: [5, 10, 25, 50, Infinity], winLimits: [10, 25, 50, 100, Infinity] },
    spin: { press: cfg.spin },
    // Stake Engine compliance: an RTP figure + the jurisdiction switchboard (the demo
    // reads ?juris=…; a real game gets this from the RGS authenticate response).
    rtp: 96,
    jurisdiction: JURISDICTION,
    game: { name: 'Scrolls of Fate', version: '1.0.0' },
    realityCheck: cfg.reality > 0 ? { everyMinutes: cfg.reality } : undefined,
    // Desktop button layout CLONED from the reference UI design (Dev.svg): a bottom
    // bar — balance · play · SPIN · turbo · bet (+ steppers to its right) — with the
    // bonus on the right rail and the ☰ menu on the lower left. The design has no
    // tilted buttons (rotation 0), but LayoutSpec.rotation now supports it. (Portrait
    // reflows below; audio/rules live in the ☰ menu, not on a left rail.)
    // Positions cloned 1:1 from the Figma "Desk DEF" frame (1920×1080 = our landscape
    // reference, so the px map directly). Balance/Bet labels are tilted ∓5° like the
    // design; the ☰ menu shares the −5° tilt.
    controls: {
      spin: { layout: { anchor: 'bottom-center', offset: [0, -140], scale: 0.9, rotation: 0 } },
      autoplay: { layout: { anchor: 'bottom-center', offset: [-204, -112] } },
      turbo: { layout: { anchor: 'bottom-center', offset: [204, -112] } },
      balance: { layout: { anchor: 'bottom-left', offset: [135, -104], rotation: -5 } },
      bet: { layout: { anchor: 'bottom-right', offset: [-186, -104], rotation: 5 } },
      'bet-plus': { layout: { anchor: 'bottom-right', offset: [-120, -188], rotation: 5 } },
      'bet-minus': { layout: { anchor: 'bottom-right', offset: [-120, -104], rotation: 5 } },
      // The buy button is hidden by default; this demo HAS a buy feature, so show it.
      bonus: { hidden: false, layout: { anchor: 'bottom-center', offset: [740, -320] } },
      settings: { layout: { anchor: 'bottom-center', offset: [-740, -320], rotation: -5 } },
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
      // Cloned 1:1 from the Figma "Mobile DEF" frame (360-wide → ×3 to our 1080
      // portrait reference). Row: buy · play · SPIN · turbo · ☰ menu; the bet ±
      // steppers sit centred below SPIN; balance/bet are tilted ∓5° in the corners.
      portrait: {
        controls: {
          // Mobile sizes run ~1.5× the desktop base (the Figma mobile frame draws the
          // controls larger relative to its width), so the buttons read well on a phone.
          spin: { layout: { anchor: 'bottom-center', offset: [0, -510], scale: 1.35 } },
          autoplay: { layout: { anchor: 'bottom-center', offset: [-258, -510], scale: 1.5 } },
          turbo: { layout: { anchor: 'bottom-center', offset: [258, -510], scale: 1.5 } },
          bonus: { layout: { anchor: 'bottom-center', offset: [-438, -480], scale: 1.3 } },
          settings: { layout: { anchor: 'bottom-center', offset: [438, -480], scale: 1.5, rotation: -5 } },
          'bet-minus': { layout: { anchor: 'bottom-center', offset: [-105, -267], scale: 1.5 } },
          'bet-plus': { layout: { anchor: 'bottom-center', offset: [105, -267], scale: 1.5 } },
          mute: { layout: { anchor: 'top-right', offset: [-159, 57], scale: 1.5 } },
          fullscreen: { layout: { anchor: 'top-right', offset: [-57, 57], scale: 1.5 } },
          // Compliance readouts scale up ~2× on mobile (Figma draws them larger
          // relative to the narrow frame) with wider line spacing so they don't crowd.
          rtp: { layout: { anchor: 'top-left', offset: [14, 14], scale: 2 } },
          'session-timer': { layout: { anchor: 'top-left', offset: [14, 44], scale: 2 } },
          'net-position': { layout: { anchor: 'top-left', offset: [14, 80], scale: 2 } },
          balance: { layout: { anchor: 'bottom-left', offset: [36, -110], scale: 1.0, rotation: -5 } },
          bet: { layout: { anchor: 'bottom-right', offset: [-36, -110], scale: 1.0, rotation: 5 } },
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

  // Make sure the Montserrat faces are loaded before any Pixi Text is measured, so the
  // balance/bet odometer + labels + readouts get correct glyph metrics from the start.
  if (document.fonts?.load) {
    await Promise.all([
      document.fonts.load('400 12px "Montserrat"'),
      document.fonts.load('900 48px "Montserrat"'),
    ]).catch(() => undefined);
  }

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
  if (cfg.fs > 0) hud.setFreeSpins(cfg.fs); // ?fs=12 → spin button shows "12 FS"
  if (cfg.fatal) hud.showFatal('Your session has expired. Reload the game to continue.', { title: 'openui.err.session.title' });

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

  // Spin via Spacebar/Enter is handled inside the library (the only keyboard input);
  // the demo registers no extra key shortcuts.

  (window as unknown as Record<string, unknown>).ui = ui;

  // center the reels on resize
  const layoutReels = (): void => reels.layout(app.screen.width, app.screen.height);
  app.renderer.on('resize', () => {
    layoutReels();
  });
  layoutReels();

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
