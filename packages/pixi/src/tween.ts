import { type Container, type Ticker } from 'pixi.js';
import { type Transition, type Theme } from '@open-ui/core';

type Frame = (ticker: Ticker) => void;

/**
 * Minimal ticker-driven tween that interprets core `Transition` descriptors.
 * Kill-and-replace: every `run()` resets the target and cancels the prior tween,
 * so re-triggering a state never stacks transforms (Charter B6).
 */
export class Tweener {
  private readonly frames = new Set<Frame>();
  private loopResolve: (() => void) | null = null;

  constructor(private readonly ticker: Ticker) {}

  stop(): void {
    for (const fn of this.frames) this.ticker.remove(fn);
    this.frames.clear();
    if (this.loopResolve) {
      const resolve = this.loopResolve;
      this.loopResolve = null;
      resolve();
    }
  }

  run(target: Container, transition: Transition | undefined, _theme: Theme): Promise<void> {
    this.stop();
    target.scale.set(1);
    target.rotation = 0;
    target.alpha = 1;
    if (!transition) return Promise.resolve();
    return this.exec(target, transition);
  }

  private add(fn: Frame): void {
    this.frames.add(fn);
    this.ticker.add(fn);
  }

  private done(fn: Frame): void {
    this.ticker.remove(fn);
    this.frames.delete(fn);
  }

  private exec(target: Container, t: Transition): Promise<void> {
    switch (t.kind) {
      case 'squish':
      case 'pulse':
        return this.scaleYoyo(target, t.scale, t.ms);
      case 'fade':
        return this.fadeTo(target, t.alpha, t.ms);
      case 'turn':
        return this.turn(target, t.rps);
      case 'sequence':
        return this.runSequence(target, t.steps);
      case 'parallel':
        return Promise.all(t.steps.map((s) => this.exec(target, s))).then(() => undefined);
      default:
        return Promise.resolve();
    }
  }

  private scaleYoyo(target: Container, peak: number, ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let elapsed = 0;
      const half = Math.max(ms / 2, 1);
      const fn: Frame = (ticker) => {
        elapsed += ticker.deltaMS;
        const k = elapsed < half ? elapsed / half : 1 - (elapsed - half) / half;
        const s = 1 + (peak - 1) * Math.min(Math.max(k, 0), 1);
        target.scale.set(s);
        if (elapsed >= ms) {
          target.scale.set(1);
          this.done(fn);
          resolve();
        }
      };
      this.add(fn);
    });
  }

  private fadeTo(target: Container, alpha: number, ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let elapsed = 0;
      const from = target.alpha;
      const dur = Math.max(ms, 1);
      const fn: Frame = (ticker) => {
        elapsed += ticker.deltaMS;
        const k = Math.min(elapsed / dur, 1);
        target.alpha = from + (alpha - from) * k;
        if (k >= 1) {
          this.done(fn);
          resolve();
        }
      };
      this.add(fn);
    });
  }

  /** Continuous rotation; the promise resolves when `stop()` is next called. */
  private turn(target: Container, rps: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.loopResolve = resolve;
      const fn: Frame = (ticker) => {
        target.rotation += rps * Math.PI * 2 * (ticker.deltaMS / 1000);
      };
      this.add(fn);
    });
  }

  private async runSequence(target: Container, steps: Transition[]): Promise<void> {
    for (const step of steps) await this.exec(target, step);
  }
}
