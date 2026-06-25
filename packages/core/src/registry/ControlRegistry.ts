/**
 * Resolves a declarative BlockSpec into a real Control. This is the swap-by-class
 * seam (Charter P7): the defaults can be overridden per kind, so a game can drop
 * in its own control class without forking. Keyed by block `kind`.
 */
import type { Control } from '../control/Control';
import type { EventBus } from '../events';
import type { OpenUIEvents } from '../types';
import type { BlockSpec } from '../spec/types';
import { SliderControl } from '../controls/SliderControl';
import { ToggleControl } from '../controls/ToggleControl';
import { ButtonControl } from '../controls/ButtonControl';
import { SelectControl } from '../controls/SelectControl';
import { StepperControl } from '../controls/StepperControl';
import { ValueDisplay } from '../controls/ValueDisplay';

export type BlockFactory = (block: BlockSpec, bus: EventBus<OpenUIEvents>) => Control | null;

/** Leaf controls are laid out by the panel body, so they anchor at center here. */
const CENTER = { anchor: 'center' } as const;

export class ControlRegistry {
  private readonly factories = new Map<string, BlockFactory>();

  register(kind: string, factory: BlockFactory): void {
    this.factories.set(kind, factory);
  }

  has(kind: string): boolean {
    return this.factories.has(kind);
  }

  /** Build the Control for a block, or null for non-control blocks / unknown kinds. */
  resolve(block: BlockSpec, bus: EventBus<OpenUIEvents>): Control | null {
    return this.factories.get(block.kind)?.(block, bus) ?? null;
  }

  /** A registry with every built-in block kind wired to its reference control. */
  static defaults(): ControlRegistry {
    const r = new ControlRegistry();
    r.register('slider', (b, bus) =>
      b.kind === 'slider' ? new SliderControl({ id: b.id, layout: CENTER, label: b.label, initial: b.initial }, bus) : null);
    r.register('toggle', (b, bus) =>
      b.kind === 'toggle' ? new ToggleControl({ id: b.id, layout: CENTER, on: b.on }, bus) : null);
    r.register('button', (b, bus) =>
      b.kind === 'button' ? new ButtonControl({ id: b.id, layout: CENTER, label: b.label, role: b.role }, bus) : null);
    r.register('select', (b, bus) =>
      b.kind === 'select' ? new SelectControl({ id: b.id, layout: CENTER, options: b.options, index: b.index, label: b.label }, bus) : null);
    r.register('stepper', (b, bus) =>
      b.kind === 'stepper' ? new StepperControl({ id: b.id, layout: CENTER, levels: b.levels, index: b.index, label: b.label }, bus) : null);
    r.register('value', (b) =>
      b.kind === 'value' ? new ValueDisplay({ id: b.id, layout: CENTER, label: b.label, currency: b.currency ?? { code: 'USD', decimals: 2 }, initial: b.initial }) : null);
    // 'text' and 'group' carry no control — buildPanel handles them directly.
    return r;
  }
}
