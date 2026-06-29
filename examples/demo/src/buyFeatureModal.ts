import type { Application } from 'pixi.js';
import type { BootedHud } from '@open-slot-ui/pixi';
import type { CurrencySpec } from '@open-slot-ui/core';
import { FEATURES, type FeatureSpec } from './content';

/**
 * The BUY-FEATURE modal — opened by the bonus (☰ coin) button. A blurred backdrop,
 * a corner ✕, a bet amount with − / + steppers, and up to 4 feature CARDS laid out
 * in a row (2×2 on narrow screens). Each card mirrors the reference design: art
 * image → gold strip → name → price, with a button beneath it that is either
 *  - "Buy"      → a one-tap purchase (cost = feature.cost × bet), or
 *  - "Activate" → an activatable bet boost that toggles on/off.
 *
 * Wired to real open-ui state: the steppers drive `ui.betStepper`, prices recompute
 * from `ui.bet`, and actions emit on the bus. One biased white design with a black
 * border, matching the menu. Fully localized; re-renders on locale change.
 */

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', BTC: '₿', ETH: 'Ξ' };

function money(amount: number, cur: CurrencySpec): string {
  const sym = SYMBOLS[cur.code] ?? '';
  const s = amount.toFixed(Math.min(cur.decimals ?? 2, 8));
  return sym ? `${sym}${s}` : `${s} ${cur.code}`;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Configurable behavior of the activatable bet-boost cards. */
export interface BuyFeatureOptions {
  /** `'single'` → only one boost active at a time · `'multi'` → combine them. Default `'multi'`. */
  activation?: 'single' | 'multi';
  /** When any boost is active, disable the Buy buttons. Default `false`. */
  activationBlocksBuy?: boolean;
  /** Host hook for a confirmed Buy (the modal has just closed): deduct + start the feature. */
  onBuy?: (id: string, cost: number) => void;
  /** Host hook whenever the active-boost set changes (the modal stays open). */
  onActivate?: (activeIds: string[], id: string, active: boolean) => void;
}

export function mountBuyFeatureModal(
  app: Application,
  hud: BootedHud,
  features: FeatureSpec[] = FEATURES,
  opts: BuyFeatureOptions = {},
): void {
  const ui = hud.ui;
  const tr = (k: string): string => ui.t(k);
  const list = features.slice(0, 4); // up to 4
  // The buy button is hidden by default — reveal it now that a buy feature exists.
  ui.setHidden('bonus', list.length === 0);
  const boosts = new Set<string>(); // active bet-boost ids
  const activation = opts.activation ?? 'multi';
  const blocksBuy = opts.activationBlocksBuy ?? false;

  const host = document.createElement('div');
  host.className = 'bfm-root';
  // The same biased white palette as the menu (independent of the game theme).
  const vars: Record<string, string> = {
    '--accent': '#d99000', '--accent-text': '#1a1200',
    '--surface': '#ffffff', '--surface-alt': '#eef1f6',
    '--text': '#181b20', '--text-dim': '#5b6472',
    '--font': ui.theme.type.family,
  };
  for (const [k, v] of Object.entries(vars)) host.style.setProperty(k, v);

  host.innerHTML = `
    <div class="bfm-backdrop" data-close></div>
    <button class="bfm-x" data-close aria-label="Close">✕</button>
    <div class="bfm-panel" role="dialog" aria-modal="true">
      <div class="bfm-fit" id="bfm-fit">
        <h2 class="bfm-title" data-t="Buy Feature">${esc(tr('Buy Feature'))}</h2>
        <div class="bfm-bet">
          <button class="bfm-step" id="bfm-minus" aria-label="Decrease bet">−</button>
          <div class="bfm-betbox"><span class="bfm-betlabel" data-t="Bet">${esc(tr('Bet'))}</span><b id="bfm-betval">—</b></div>
          <button class="bfm-step" id="bfm-plus" aria-label="Increase bet">+</button>
        </div>
        <div class="bfm-cards" id="bfm-cards"></div>
      </div>
    </div>`;

  const style = document.createElement('style');
  style.textContent = BFM_CSS;
  host.appendChild(style);
  document.body.appendChild(host);

  const $ = <T extends Element>(sel: string): T => host.querySelector(sel) as T;
  const panel = $<HTMLElement>('.bfm-panel');
  const fitEl = $<HTMLElement>('#bfm-fit');
  const cardsEl = $<HTMLElement>('#bfm-cards');
  const betValEl = $<HTMLElement>('#bfm-betval');

  // Fit the modal to the viewport by UNIFORM scale (proportional — never squished).
  // Cards keep their natural 16:10 aspect and fill the available width; 4 in a line
  // when the screen is wide or short, a 2×2 grid otherwise; then the whole block is
  // scaled down only if it's taller than the screen.
  const layout = (): void => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cols = vh <= 540 || vw >= 900 ? 4 : 2;
    cardsEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    const fitW = Math.min(vw * 0.96, cols === 4 ? 1180 : 760);
    fitEl.style.width = `${fitW}px`;
    fitEl.style.transform = 'none';
    const natH = fitEl.offsetHeight; // natural height at this width (forces layout)
    const s = Math.min(1, (vh * 0.95) / natH);
    fitEl.style.transform = `translateX(-50%) scale(${s})`;
    panel.style.width = `${Math.ceil(fitW * s)}px`;
    panel.style.height = `${Math.ceil(natH * s)}px`;
  };

  // ── render the cards (re-run on bet/locale/boost change) ────────────────────
  const renderCards = (): void => {
    const bet = ui.bet.get();
    const cur = ui.bet.currency.get();
    cardsEl.innerHTML = list
      .map((f) => {
        const active = boosts.has(f.id);
        const buyBlocked = f.variant === 'buy' && blocksBuy && boosts.size > 0;
        const price = f.variant === 'buy' ? money(f.cost * bet, cur) : `+${money(f.cost * bet, cur)}`;
        const label = f.variant === 'buy' ? tr('Buy') : active ? tr('Activated') : tr('Activate');
        const cls = `bfm-action bfm-action--${f.variant}${active ? ' is-active' : ''}${buyBlocked ? ' is-blocked' : ''}`;
        return `
        <div class="bfm-cell">
          <div class="bfm-card">
            <div class="bfm-cardimg" style="background-image:url('${f.image}')"></div>
            <div class="bfm-strip"></div>
            <div class="bfm-cardbody">
              <span class="bfm-name">${esc(tr(f.name))}</span>
              <b class="bfm-price">${esc(price)}</b>
            </div>
          </div>
          <button class="${cls}" data-id="${f.id}" data-variant="${f.variant}"${buyBlocked ? ' disabled' : ''}>${esc(label)}</button>
        </div>`;
      })
      .join('');
    betValEl.textContent = money(bet, cur);
    // wire each action button
    cardsEl.querySelectorAll<HTMLButtonElement>('.bfm-action').forEach((b) => {
      b.addEventListener('click', () => onAction(b.dataset.id!, b.dataset.variant as FeatureSpec['variant']));
    });
    layout();
  };

  const onAction = (id: string, variant: FeatureSpec['variant']): void => {
    if (variant === 'boost') {
      // Activation NEVER closes the modal. 'single' keeps at most one boost on.
      const wasActive = boosts.has(id);
      if (activation === 'single') boosts.clear();
      // Toggle: an already-active boost turns OFF; otherwise it turns ON. (In multi
      // mode the clear() above doesn't run, so we must delete explicitly to deactivate.)
      if (wasActive) boosts.delete(id);
      else boosts.add(id);
      ui.bus.emit('cardActivated', { id });
      renderCards();
      opts.onActivate?.([...boosts], id, boosts.has(id));
    } else {
      // Buying CLOSES the modal and hands the cost to the host (deduct + start it).
      if (blocksBuy && boosts.size > 0) return; // blocked while a boost is active
      const f = list.find((x) => x.id === id);
      const cost = (f?.cost ?? 0) * ui.bet.get();
      ui.bus.emit('cardActivated', { id });
      close();
      opts.onBuy?.(id, cost);
    }
  };

  // ── bet steppers ────────────────────────────────────────────────────────────
  $<HTMLButtonElement>('#bfm-minus').addEventListener('click', () => ui.betStepper.dec());
  $<HTMLButtonElement>('#bfm-plus').addEventListener('click', () => ui.betStepper.inc());
  ui.bet.value.subscribe(() => renderCards()); // prices follow the bet

  // ── open / close ────────────────────────────────────────────────────────────
  const open = (): void => { renderCards(); host.classList.add('open'); };
  const close = (): void => host.classList.remove('open');
  host.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  ui.on('buttonActivated', ({ id }) => { if (id === 'bonus') open(); });
  window.addEventListener('resize', () => { if (host.classList.contains('open')) layout(); });

  // ── locale ──────────────────────────────────────────────────────────────────
  ui.locale.subscribe(() => {
    host.querySelectorAll<HTMLElement>('[data-t]').forEach((n) => (n.textContent = tr(n.dataset.t!)));
    renderCards();
  });

  renderCards();
}

const BFM_CSS = `
.bfm-root { position: fixed; inset: 0; z-index: 11000; display: grid; place-items: center; font-family: var(--font); opacity: 0; pointer-events: none; transition: opacity .18s ease; }
.bfm-root.open { opacity: 1; pointer-events: auto; }
/* Backdrop blur ANIMATES in (the filter radius ramps up), instead of snapping on. */
.bfm-backdrop { position: absolute; inset: 0; background: rgba(8,6,4,0); backdrop-filter: blur(0px) saturate(1); -webkit-backdrop-filter: blur(0px) saturate(1); transition: background .4s ease, backdrop-filter .4s ease, -webkit-backdrop-filter .4s ease; }
.bfm-root.open .bfm-backdrop { background: rgba(8,6,4,.5); backdrop-filter: blur(10px) saturate(1.1); -webkit-backdrop-filter: blur(10px) saturate(1.1); }
.bfm-x { position: absolute; top: 18px; right: 22px; width: 46px; height: 46px; border-radius: 999px; border: 0; background: rgba(18,14,10,.82); color: #fff; font-size: 18px; cursor: pointer; display: grid; place-items: center; box-shadow: 0 6px 18px rgba(0,0,0,.45); z-index: 2; transition: transform .12s, background .12s; }
.bfm-x:hover { transform: scale(1.08); background: rgba(18,14,10,.95); }
.bfm-root *, .bfm-root *::before, .bfm-root *::after { box-sizing: border-box; }
.bfm-panel { position: relative; transform: translateY(8px) scale(.985); transition: transform .18s ease; }
.bfm-root.open .bfm-panel { transform: none; }
/* one block, scaled UNIFORMLY to fit by JS (proportional — never squished) */
.bfm-fit { position: absolute; top: 0; left: 50%; transform: translateX(-50%); transform-origin: top center; }
.bfm-title { margin: 0 0 14px; text-align: center; color: #fff; font-size: 30px; font-weight: 800; letter-spacing: 1px; text-shadow: 0 2px 12px rgba(0,0,0,.6); }
.bfm-bet { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 0 0 24px; }
.bfm-betbox { min-width: 200px; padding: 10px 22px; border-radius: 12px; background: var(--surface); border: 3px solid #000; display: flex; flex-direction: column; align-items: center; line-height: 1.1; }
.bfm-betlabel { font-size: 12px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; }
.bfm-betbox b { font-size: 24px; color: var(--text); }
.bfm-step { flex: none; width: 54px; height: 54px; border-radius: 999px; border: 3px solid #000; background: var(--surface); color: var(--text); font-size: 28px; font-weight: 800; cursor: pointer; display: grid; place-items: center; line-height: 1; transition: transform .1s, background .12s; box-shadow: 0 4px 12px rgba(0,0,0,.3); }
.bfm-step:hover { background: var(--surface-alt); }
.bfm-step:active { transform: scale(.92); }
.bfm-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; align-items: start; }
.bfm-cell { display: flex; flex-direction: column; min-width: 0; }
.bfm-card { background: var(--surface); border: 4px solid #000; border-radius: 14px; overflow: hidden; box-shadow: 0 14px 34px rgba(0,0,0,.45); }
.bfm-cardimg { width: 100%; aspect-ratio: 16 / 10; background-size: cover; background-position: center; }
.bfm-strip { height: 8px; background: linear-gradient(90deg, #f0a500, #ffd166, #f0a500); }
.bfm-cardbody { padding: 12px 14px 16px; text-align: center; }
.bfm-name { display: block; font-size: 15px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bfm-price { display: block; margin-top: 2px; font-size: 22px; font-weight: 800; color: var(--text); }
.bfm-action { display: block; width: 100%; margin-top: 12px; padding: 14px 10px; border-radius: 12px; border: 4px solid #000; background: var(--surface); color: var(--text); font-size: 15px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; cursor: pointer; transition: transform .1s, background .12s, color .12s; box-shadow: 0 5px 14px rgba(0,0,0,.35); white-space: nowrap; }
.bfm-action:hover { background: var(--surface-alt); }
.bfm-action:active { transform: scale(.96); }
.bfm-action.is-active { background: var(--accent); color: var(--accent-text); border-color: #000; }
.bfm-action.is-blocked, .bfm-action:disabled { opacity: .38; cursor: not-allowed; box-shadow: none; }
.bfm-action.is-blocked:hover, .bfm-action:disabled:hover { background: var(--surface); }
`;
