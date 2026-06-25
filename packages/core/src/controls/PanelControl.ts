import { Control, type StateMap } from '../control/Control';
import type { LayoutSpec } from '../layout/anchor';
import type { EventBus } from '../events';
import type { OpenUIEvents } from '../types';

export type PanelVariant = 'modal' | 'popover';

export interface PanelOptions {
  id: string;
  variant: PanelVariant;
  layout?: LayoutSpec;
  /** Title shown at the top of a modal. */
  title?: string;
}

/**
 * A panel that opens/closes. `modal` = full-screen backdrop + scrollable content
 * + close button; `popover` = small anchored cluster (e.g. the settings flyout).
 * State is the single source of truth (open|closed); the view animates it.
 */
export class PanelControl extends Control {
  readonly states: StateMap = {
    closed: { interactable: false },
    open: { interactable: true },
  };
  readonly variant: PanelVariant;
  readonly title?: string;

  constructor(opts: PanelOptions, private readonly bus?: EventBus<OpenUIEvents>) {
    super({ id: opts.id, role: 'dialog', layout: opts.layout ?? { anchor: 'center' } }, 'closed');
    this.variant = opts.variant;
    this.title = opts.title;
  }

  get isOpen(): boolean {
    return this.current === 'open';
  }

  openPanel(): void {
    if (this.isOpen) return;
    this.setState('open');
    this.bus?.emit('panelToggled', { id: this.id, open: true });
  }
  closePanel(): void {
    if (!this.isOpen) return;
    this.setState('closed');
    this.bus?.emit('panelToggled', { id: this.id, open: false });
  }
  toggle(): void {
    if (this.isOpen) this.closePanel();
    else this.openPanel();
  }
}
