import type { BlockSpec } from '@open-ui/core';

/**
 * The RULES section content as declarative BLOCKS — the single source of truth
 * shared by BOTH renderers (the Pixi `menu.rules` in main.ts AND the HTML menu in
 * htmlMenu.ts). Because the English text here doubles as the i18n KEY, defining it
 * once guarantees both renderers translate against the same dictionary entries
 * (see locales.ts). Every block's text flows through `ui.t`, so the whole section
 * localizes; images use placehold.co so a designer can swap the link.
 *
 * This array is a tour of the full rules block palette:
 *   text · media (image+text) · subheading · cards · steps · table · image ·
 *   stat-grid · callout (bonus + warning) · divider · legal
 */
export const RULES_BLOCKS: BlockSpec[] = [
  // — just text, with **bold** inline runs —
  {
    kind: 'text',
    id: 'r-intro',
    text: 'Match symbols on a line to win — **bigger symbols pay more**, and **Wild** substitutes for all.',
  },

  // — image + text, side by side (the "media" layout) —
  {
    kind: 'media',
    id: 'r-fs',
    side: 'left',
    width: 320,
    height: 200,
    src: 'https://placehold.co/320x200/2a2f3a/ffd166?text=BONUS',
    alt: 'Free Spins',
    title: 'Free Spins',
    text: 'Land 3 or more **Scatters** to trigger 10 free spins with a rising multiplier.',
  },

  // — a sub-section title + a row of feature cards (icon + title + text) —
  { kind: 'subheading', id: 'r-feat-h', text: 'Features' },
  {
    kind: 'cards',
    id: 'r-cards',
    items: [
      { icon: 'https://placehold.co/72x72/ef4444/ffffff?text=W', title: 'Wild', text: 'Substitutes for every paying symbol.' },
      { icon: 'https://placehold.co/72x72/3b82f6/ffffff?text=S', title: 'Scatter', text: 'Pays anywhere on the reels.' },
      { icon: 'https://placehold.co/72x72/f59e0b/000000?text=x2', title: 'Multiplier', text: 'Boosts every win during the bonus.' },
    ],
  },

  // — an ordered list of steps —
  { kind: 'subheading', id: 'r-play-h', text: 'How to play' },
  {
    kind: 'steps',
    id: 'r-steps',
    ordered: true,
    items: [
      'Set your bet with the - and + buttons.',
      'Press spin once, or **hold** for turbo.',
      'Land 3 or more **Scatters** to start the bonus.',
    ],
  },

  // — a generic table (header row + body rows) —
  { kind: 'subheading', id: 'r-pay-h', text: 'Symbol payouts' },
  {
    kind: 'table',
    id: 'r-table',
    columns: ['Symbol', '3', '4', '5'],
    rows: [
      ['Wild', '5x', '20x', '50x'],
      ['Scatter', '3x', '10x', '40x'],
      ['Star', '2x', '8x', '30x'],
      ['Ace', '1x', '5x', '20x'],
    ],
  },

  // — a full-width feature image (designer-supplied art; placehold.co stands in) —
  {
    kind: 'image',
    id: 'r-banner',
    src: 'https://placehold.co/1000x180/2a2f3a/ffd166?text=MAX+WIN+5%2C000x',
    alt: 'Max win 5,000x',
    width: 1000,
    height: 180,
  },

  // — a label/value stat grid —
  {
    kind: 'stat-grid',
    id: 'r-stats',
    items: [
      { label: 'RTP', value: '96.50%' },
      { label: 'Volatility', value: 'High' },
      { label: 'Lines', value: '20' },
      { label: 'Max win', value: '5,000x' },
    ],
  },

  // — highlighted callouts: a bonus tip and a warning notice —
  { kind: 'callout', id: 'r-tip', tone: 'bonus', title: 'Tip', text: 'Hold spin for turbo.' },
  { kind: 'callout', id: 'r-note', tone: 'warning', title: 'Please note', text: 'Malfunction voids all pays and play.' },

  // — a divider, then small legal / fine print —
  { kind: 'divider', id: 'r-div' },
  { kind: 'legal', id: 'r-legal', text: 'Play responsibly. 18+. Terms and conditions apply.' },
];

/**
 * BUY-FEATURE options for the buy-feature modal (up to 4). Two variants:
 *  - `'buy'`  → a one-tap purchase ("Buy"): pay `cost × bet` to trigger the feature.
 *  - `'boost'`→ an activatable bet boost ("Activate"): a per-spin surcharge of
 *               `cost × bet` that toggles on/off.
 * Names are localized (the English text is the i18n key); images use placehold.co
 * so a designer swaps in the real feature art.
 */
export interface FeatureSpec {
  id: string;
  name: string;
  variant: 'buy' | 'boost';
  /** buy → purchase multiple of the bet; boost → per-spin surcharge fraction. */
  cost: number;
  image: string;
}

export const FEATURES: FeatureSpec[] = [
  { id: 'free-spins', name: 'Free Spins', variant: 'buy', cost: 100, image: 'https://placehold.co/480x300/7c3aed/ffffff?text=FREE+SPINS' },
  { id: 'super-spins', name: 'Super Spins', variant: 'buy', cost: 300, image: 'https://placehold.co/480x300/db2777/ffffff?text=SUPER+SPINS' },
  { id: 'ante-bet', name: 'Ante Bet', variant: 'boost', cost: 0.25, image: 'https://placehold.co/480x300/2563eb/ffffff?text=ANTE+BET' },
  { id: 'double-chance', name: 'Double Chance', variant: 'boost', cost: 0.5, image: 'https://placehold.co/480x300/059669/ffffff?text=DOUBLE+CHANCE' },
];
