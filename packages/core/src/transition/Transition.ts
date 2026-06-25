/**
 * Transitions are composable OOP descriptors (Charter B6) — pure data, renderer-agnostic.
 * The renderer interprets the `kind`; the core never animates anything itself.
 * Some controls turn, some squish, some tick up, some emit particles — all from these.
 */

export class Squish {
  readonly kind = 'squish' as const;
  constructor(public scale = 0.92, public ms = 120) {}
}

export class Pulse {
  readonly kind = 'pulse' as const;
  constructor(public scale = 1.06, public ms = 160) {}
}

export class Turn {
  readonly kind = 'turn' as const;
  /** Rotations per second; loops until the state changes. */
  constructor(public rps = 1, public loop = true) {}
}

export class Fade {
  readonly kind = 'fade' as const;
  constructor(public alpha = 0.4, public ms = 160) {}
}

export class Sequence {
  readonly kind = 'sequence' as const;
  constructor(public steps: Transition[]) {}
}

export class Parallel {
  readonly kind = 'parallel' as const;
  constructor(public steps: Transition[]) {}
}

export type Transition = Squish | Pulse | Turn | Fade | Sequence | Parallel;
