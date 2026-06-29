/**
 * The responsive layer: re-apply per-device / per-orientation control overrides
 * every time the screen bucket changes. Pure assembly over the existing layout
 * machinery — it only ever sets `control.layout` and toggles `ui.setHidden`, both
 * of which the views already react to (Charter P6/P10). No new rendering concepts.
 */
import type { OpenUI } from '../OpenUI';
import type { Dispose } from '../signal';
import type { LayoutSpec } from '../layout/anchor';
import type { ScreenState } from '../layout/screen';
import type { ResponsiveKey, ResponsiveOverride } from './types';

type Responsive = Partial<Record<ResponsiveKey, ResponsiveOverride>>;

interface Base {
  layout: LayoutSpec;
  hidden: boolean;
}

function cloneLayout(l: LayoutSpec): LayoutSpec {
  return { anchor: l.anchor, offset: l.offset ? [l.offset[0], l.offset[1]] : undefined, scale: l.scale, rotation: l.rotation };
}

/** The buckets that apply to a screen, least → most specific (size wins over orientation). */
function activeKeys(screen: ScreenState): ResponsiveKey[] {
  return [screen.orientation, screen.breakpoint];
}

/**
 * Install responsive overrides. Snapshots each referenced control's CURRENT layout
 * + hidden state as the "base" (so callers must apply static `controls` overrides
 * first), then on every screen change re-derives base → orientation → size and
 * applies it. Returns a disposer. Runs once immediately for the current screen.
 */
export function installResponsive(ui: OpenUI, responsive: Responsive): Dispose {
  // Every control id mentioned in any bucket.
  const ids = new Set<string>();
  for (const key of Object.keys(responsive) as ResponsiveKey[]) {
    const ov = responsive[key];
    if (ov?.controls) for (const id of Object.keys(ov.controls)) ids.add(id);
  }
  if (!ids.size) return () => {};

  // Snapshot the base layout + visibility for each (the post-`controls` truth).
  const base = new Map<string, Base>();
  for (const id of ids) {
    const c = ui.control(id);
    if (!c) continue;
    base.set(id, { layout: cloneLayout(c.layout), hidden: ui.hidden.has(id) });
  }

  const apply = (screen: ScreenState): void => {
    const keys = activeKeys(screen);
    for (const [id, b] of base) {
      const c = ui.control(id);
      if (!c) continue;
      let layout = b.layout;
      let hidden = b.hidden;
      for (const key of keys) {
        const ov = responsive[key]?.controls?.[id];
        if (!ov) continue;
        if (ov.layout) layout = ov.layout;
        if (ov.hidden != null) hidden = ov.hidden;
      }
      c.layout = cloneLayout(layout);
      ui.setHidden(id, hidden);
    }
  };

  // Subscribe in createUI (before the renderer mounts) so this runs BEFORE the
  // views' own screen subscribers — they then read the freshly-set layouts.
  const off = ui.screen.subscribe(apply);
  apply(ui.screen.get());
  return off;
}
