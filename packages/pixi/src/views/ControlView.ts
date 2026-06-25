import { Container } from 'pixi.js';
import { resolvePlacement, type Control, type OpenUI, type Rect, type ScreenState } from '@open-ui/core';

/**
 * Base view: a Pixi Container bound to a core Control. Owns layout placement and
 * registers the introspection hook so the core can report bounds/animation state.
 * Subclasses draw and wire input. Dumb on its own (Charter B3).
 */
export abstract class ControlView extends Container {
  protected animating = false;
  protected readonly disposers: Array<() => void> = [];

  constructor(
    protected readonly control: Control,
    protected readonly ui: OpenUI,
  ) {
    super();
    this.control.viewInspect = () => ({ bounds: this.computeRect(), animating: this.animating });
  }

  /** Position + fit-scale from the control's layout spec against the screen. */
  applyLayout(screen: ScreenState): void {
    const p = resolvePlacement(this.control.layout, screen);
    this.position.set(p.x, p.y);
    this.scale.set(p.scale);
    this.rotation = p.rotation;
  }

  private computeRect(): Rect | null {
    if (this.destroyed) return null;
    const b = this.getBounds();
    return { x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY };
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.control.viewInspect = undefined;
    if (!this.destroyed) this.destroy({ children: true });
  }
}
