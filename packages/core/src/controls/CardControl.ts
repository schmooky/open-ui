import { Control, type StateMap } from '../control/Control';
import { Squish, Pulse, Fade } from '../transition/Transition';
import type { LayoutSpec } from '../layout/anchor';
import type { EventBus } from '../events';
import type { OpenUIEvents } from '../types';

export interface CardOptions {
  id: string;
  layout: LayoutSpec;
  /** Card title (e.g. the feature name). */
  title?: string;
  /** Price / cost shown on the card (formatted string or number). */
  price?: string;
  /** Asset id/key for the card image (resolved by the view/host). */
  image?: string;
}

/**
 * A selectable buy-feature card: image + title + price + a buy action.
 * Emits `cardActivated` on a valid press-release. Lives inside a buy-feature panel.
 */
export class CardControl extends Control {
  readonly states: StateMap = {
    idle: { interactable: true, transition: new Squish(0.96, 110) },
    hover: { interactable: true, transition: new Pulse(1.04, 140) },
    pressed: { interactable: true, transition: new Squish(0.9, 70) },
    disabled: { interactable: false, transition: new Fade(0.4, 150) },
  };
  title?: string;
  price?: string;
  image?: string;

  constructor(opts: CardOptions, private readonly bus?: EventBus<OpenUIEvents>) {
    super({ id: opts.id, role: 'button', layout: opts.layout }, 'idle');
    this.title = opts.title;
    this.price = opts.price;
    this.image = opts.image;
  }

  enable(): void {
    if (this.current === 'disabled') this.setState('idle');
  }
  disable(): void {
    this.setState('disabled');
  }

  /** The view calls this on a valid press-release. */
  activate(): void {
    if (this.interactable) this.bus?.emit('cardActivated', { id: this.id });
  }
}
