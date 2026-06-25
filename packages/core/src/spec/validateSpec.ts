/**
 * Never-throw spec validator (Charter P11/B9). Returns a report; callers
 * (createUI) drop only the offending pieces and degrade — a malformed HUD still
 * boots. Every guardrail check lives here; it is pure and unit-tested.
 */
import type { UISpec, BlockSpec, SpecIssue } from './types';
import { BLOCK_KINDS } from './types';

const ANCHORS = new Set([
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]);

const AUTOPLAY_MODES = new Set(['options', 'infinite']);
const SPIN_PRESS = new Set(['tap', 'hold-to-spin']);
const RESPONSIVE_KEYS = new Set(['mobile', 'tablet', 'desktop', 'portrait', 'landscape']);

export function validateSpec(spec: UISpec): { ok: boolean; issues: SpecIssue[] } {
  const issues: SpecIssue[] = [];
  const add = (level: SpecIssue['level'], path: string, code: string, message: string): void => {
    issues.push({ level, path, code, message });
  };
  const ids = new Set<string>();
  const seeId = (id: string | undefined, path: string): void => {
    if (!id || !id.trim()) add('error', path, 'blank-id', 'control id must be a non-empty string');
    else if (ids.has(id)) add('error', path, 'dup-id', `duplicate control id "${id}"`);
    else ids.add(id);
  };
  const checkLayout = (anchor: string | undefined, path: string): void => {
    if (anchor && !ANCHORS.has(anchor)) add('error', path, 'bad-anchor', `unknown anchor "${anchor}"`);
  };

  try {
    if (spec.betLadder) {
      const lv = spec.betLadder.levels;
      if (!Array.isArray(lv) || lv.length === 0) {
        add('error', 'betLadder.levels', 'empty-levels', 'bet ladder needs at least one level');
      } else if (spec.betLadder.index != null && (spec.betLadder.index < 0 || spec.betLadder.index >= lv.length)) {
        add('error', 'betLadder.index', 'index-oor', `index ${spec.betLadder.index} is out of range 0..${lv.length - 1}`);
      }
    }

    if (spec.autoplay?.options) {
      spec.autoplay.options.forEach((o, i) => {
        if (!(typeof o === 'number' && o > 0)) {
          add('error', `autoplay.options[${i}]`, 'bad-option', `autoplay option must be > 0 (Infinity allowed), got ${String(o)}`);
        }
      });
    }
    if (spec.autoplay?.mode && !AUTOPLAY_MODES.has(spec.autoplay.mode)) {
      add('error', 'autoplay.mode', 'bad-mode', `autoplay.mode must be 'options' or 'infinite', got "${String(spec.autoplay.mode)}"`);
    }
    for (const key of ['lossLimits', 'winLimits'] as const) {
      const arr = spec.autoplay?.[key];
      if (arr) {
        arr.forEach((o, i) => {
          if (!(typeof o === 'number' && o > 0)) add('error', `autoplay.${key}[${i}]`, 'bad-limit', `autoplay ${key} must be > 0 (Infinity allowed), got ${String(o)}`);
        });
      }
    }

    if (spec.turbo) {
      const m = spec.turbo.modes;
      if (Array.isArray(m)) {
        if (m.length < 2) add('error', 'turbo.modes', 'turbo-too-few', 'a turbo ladder needs at least 2 modes (first = off)');
        if (m.some((x) => typeof x !== 'string' || !x.trim())) add('error', 'turbo.modes', 'turbo-bad-mode', 'turbo mode names must be non-empty strings');
        if (new Set(m).size !== m.length) add('error', 'turbo.modes', 'turbo-dup-mode', 'turbo mode names must be unique');
      } else if (m != null && m !== 2 && m !== 3) {
        add('error', 'turbo.modes', 'turbo-bad-count', `turbo.modes preset must be 2 or 3, got ${String(m)}`);
      }
      const len = Array.isArray(m) ? m.length : (m ?? 2);
      if (spec.turbo.index != null && (spec.turbo.index < 0 || spec.turbo.index >= len)) {
        add('error', 'turbo.index', 'index-oor', `turbo.index ${spec.turbo.index} is out of range 0..${len - 1}`);
      }
    }

    if (spec.spin?.press && !SPIN_PRESS.has(spec.spin.press)) {
      add('error', 'spin.press', 'bad-press', `spin.press must be 'tap' or 'hold-to-spin', got "${String(spec.spin.press)}"`);
    }

    if (spec.responsive) {
      for (const [key, ov] of Object.entries(spec.responsive)) {
        if (!RESPONSIVE_KEYS.has(key)) {
          add('error', `responsive.${key}`, 'bad-bucket', `unknown responsive bucket "${key}" (expected ${[...RESPONSIVE_KEYS].join(', ')})`);
        }
        if (ov?.controls) {
          for (const [id, co] of Object.entries(ov.controls)) {
            checkLayout(co.layout?.anchor, `responsive.${key}.controls.${id}.layout.anchor`);
          }
        }
      }
    }

    if (spec.currency && typeof spec.currency.decimals === 'number') {
      const d = spec.currency.decimals;
      if (d < 0 || d > 8) add('warn', 'currency.decimals', 'decimals-range', `decimals ${d} clamped to 0..8`);
    }

    if (spec.jurisdiction) {
      for (const [k, v] of Object.entries(spec.jurisdiction)) {
        if (k === 'minimumRoundDuration') {
          if (v != null && !(typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
            add('error', `jurisdiction.${k}`, 'bad-duration', `minimumRoundDuration must be a non-negative number, got ${String(v)}`);
          }
        } else if (v != null && typeof v !== 'boolean') {
          add('error', `jurisdiction.${k}`, 'bad-flag', `jurisdiction.${k} must be a boolean, got ${String(v)}`);
        }
      }
    }
    if (spec.rtp != null && !(typeof spec.rtp === 'number' && Number.isFinite(spec.rtp))) {
      add('error', 'rtp', 'bad-rtp', `rtp must be a number, got ${String(spec.rtp)}`);
    }
    if (spec.statusBar != null && spec.statusBar !== 'top' && spec.statusBar !== 'bottom') {
      add('error', 'statusBar', 'bad-statusbar', `statusBar must be 'top' or 'bottom', got "${String(spec.statusBar)}"`);
    }

    if (spec.controls) {
      for (const [id, ov] of Object.entries(spec.controls)) {
        checkLayout(ov.layout?.anchor, `controls.${id}.layout.anchor`);
      }
    }

    const walkBlocks = (blocks: BlockSpec[] | undefined, base: string): void => {
      blocks?.forEach((b, i) => {
        const p = `${base}[${i}]`;
        if (!BLOCK_KINDS.includes(b.kind as (typeof BLOCK_KINDS)[number])) {
          add('error', `${p}.kind`, 'unknown-kind', `unknown block kind "${String(b.kind)}"`);
          return;
        }
        seeId(b.id, `${p}.id`);
        if (b.kind === 'select' && (!b.options || b.options.length === 0)) {
          add('error', `${p}.options`, 'select-empty', 'a select block needs at least one option');
        }
        if (b.kind === 'slider' && b.initial != null && (b.initial < 0 || b.initial > 1)) {
          add('error', `${p}.initial`, 'slider-range', `slider initial ${b.initial} must be 0..1`);
        }
        if (b.kind === 'stepper' && (!b.levels || b.levels.length === 0)) {
          add('error', `${p}.levels`, 'empty-levels', 'a stepper block needs at least one level');
        }
        if (b.kind === 'stat-grid' && (!b.items || b.items.length === 0)) {
          add('warn', `${p}.items`, 'empty-grid', 'a stat-grid block has no items');
        }
        if (b.kind === 'steps' && (!b.items || b.items.length === 0)) {
          add('warn', `${p}.items`, 'empty-steps', 'a steps block has no items');
        }
        if (b.kind === 'paytable' && (!b.rows || b.rows.length === 0)) {
          add('warn', `${p}.rows`, 'empty-paytable', 'a paytable block has no rows');
        }
        if (b.kind === 'image' && (!b.src || !b.src.trim())) {
          add('error', `${p}.src`, 'image-src', 'an image block needs a src');
        }
        if (b.kind === 'image' && ((b.width != null && b.width <= 0) || (b.height != null && b.height <= 0))) {
          add('error', `${p}.width`, 'image-dims', 'image width/height must be > 0 when set');
        }
        if (b.kind === 'media' && (!b.src || !b.src.trim())) {
          add('error', `${p}.src`, 'image-src', 'a media block needs an image src');
        }
        if (b.kind === 'media' && ((b.width != null && b.width <= 0) || (b.height != null && b.height <= 0))) {
          add('error', `${p}.width`, 'image-dims', 'media width/height must be > 0 when set');
        }
        if (b.kind === 'cards' && (!b.items || b.items.length === 0)) {
          add('warn', `${p}.items`, 'empty-cards', 'a cards block has no items');
        }
        if (b.kind === 'table' && (!b.rows || b.rows.length === 0)) {
          add('warn', `${p}.rows`, 'empty-table', 'a table block has no rows');
        }
        if (b.kind === 'group') walkBlocks(b.children, `${p}.children`);
      });
    };

    if (spec.menu?.banner && (!spec.menu.banner.src || !spec.menu.banner.src.trim())) {
      add('error', 'menu.banner.src', 'image-src', 'a menu banner needs a src');
    }
    walkBlocks(spec.menu?.settings, 'menu.settings');
    walkBlocks(spec.menu?.paytable, 'menu.paytable');
    walkBlocks(spec.menu?.rules, 'menu.rules');
    walkBlocks(spec.rules, 'rules');
    spec.panels?.forEach((pn, i) => {
      seeId(pn.id, `panels[${i}].id`);
      checkLayout(pn.layout?.anchor, `panels[${i}].layout.anchor`);
      walkBlocks(pn.blocks, `panels[${i}].blocks`);
    });
  } catch (e) {
    // The validator must never throw — a crash here is itself a reportable issue.
    add('error', '', 'validator-crash', e instanceof Error ? e.message : String(e));
  }

  return { ok: !issues.some((i) => i.level === 'error'), issues };
}
