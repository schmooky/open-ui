import { Control, type StateMap } from '../control/Control';
import { Signal } from '../signal';
import type { LayoutSpec } from '../layout/anchor';
import type { EventBus } from '../events';
import type { OpenUIEvents } from '../types';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export interface SliderOptions {
  id: string;
  layout: LayoutSpec;
  /** Initial value, 0..1. Default 0.5. */
  initial?: number;
  label?: string;
}

/**
 * A 0..1 slider (sound volume, etc.). The view drives `setNormalized` while
 * dragging; the lib holds the value and emits `valueChanged`. The host applies
 * the actual effect (e.g. sets audio volume).
 */
export class SliderControl extends Control {
  readonly states: StateMap = {
    idle: { interactable: true },
    dragging: { interactable: true },
  };
  readonly value = new Signal<number>(0.5);
  readonly label?: string;

  constructor(opts: SliderOptions, private readonly bus?: EventBus<OpenUIEvents>) {
    super({ id: opts.id, role: 'slider', layout: opts.layout }, 'idle');
    this.label = opts.label;
    if (opts.initial != null) this.value.set(clamp01(opts.initial));
  }

  /** Set the normalized value (0..1) and notify. */
  setNormalized(v: number): void {
    const c = clamp01(v);
    if (c === this.value.get()) return;
    this.value.set(c);
    this.bus?.emit('valueChanged', { id: this.id, value: c });
  }

  beginDrag(): void {
    this.setState('dragging');
  }
  endDrag(): void {
    this.setState('idle');
  }
}
