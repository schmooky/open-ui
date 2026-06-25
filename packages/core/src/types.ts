/** Shared types with no dependencies — safe for everything to import. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The façade's outbound event vocabulary (grows as controls are added).
 * A `type` (not `interface`) so it satisfies the EventBus `Record` constraint.
 */
export type OpenUIEvents = {
  /** The player asked to spin (spin control activated while interactable). */
  spinRequested: void;
  /** The player asked to slam-stop / skip the reels (autoplay-engaged tap). */
  skipRequested: void;
  /** A control changed state — useful for analytics / e2e logging. */
  stateChanged: { id: string; from: string; to: string };
  /** A generic button was activated. */
  buttonActivated: { id: string };
  /** A slider/value control changed (e.g. sound volume 0..1). */
  valueChanged: { id: string; value: number };
  /** A panel opened or closed. */
  panelToggled: { id: string; open: boolean };
  /** A toggle (e.g. turbo) flipped. `on` = "any mode past the first". */
  toggled: { id: string; on: boolean };
  /** A turbo control changed mode (covers 2-mode AND 3-mode cyclers). */
  turboChanged: { id: string; mode: string; index: number };
  /** A select control chose an option (its own typed event — never overloads valueChanged). */
  optionSelected: { id: string; value: string; index: number };
  /** Autoplay started with a chosen count (Infinity = ∞). */
  autoplayStarted: { count: number };
  /** Autoplay stopped. */
  autoplayStopped: void;
  /** The player began a press-and-hold turbo spin on the spin button. */
  holdSpinStarted: void;
  /** The player released the held spin button (stop the turbo loop). */
  holdSpinStopped: void;
  /** A control was hidden or shown at runtime (e.g. a responsive breakpoint change). */
  visibilityChanged: { id: string; hidden: boolean };
  /** A buy-feature card was activated. */
  cardActivated: { id: string };
  /** Locale was changed via the façade. */
  localeChanged: string;
};

/** A serializable snapshot of one control, for the e2e/introspection API. */
export interface ControlSnapshot {
  id: string;
  role: string;
  state: string;
  interactable: boolean;
  bounds: Rect | null;
  animating: boolean;
}
