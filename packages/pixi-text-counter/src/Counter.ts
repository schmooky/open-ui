import { BlurFilter, Container, Ticker, type DestroyOptions } from 'pixi.js';
import { DigitColumn } from './DigitColumn';
import {
  digitAtPlace,
  getDecimalSeparatorAfter,
  getSeparatorAfter,
  leadingZeroCount,
  placeColumns,
} from './layout';
import {
  computeDuration,
  computeSteps,
  resolveDirection,
  resolveTargetIndex,
  type MotionResolved,
} from './math';
import { Scheduler } from './tween/Scheduler';
import { defaultEase, linear } from './tween/ease';
import type { EaseFn } from './tween/types';
import {
  DEFAULTS,
  type CellRenderer,
  type CounterOptions,
  type DigitSettleEvent,
  type FitOptions,
  type RollDirection,
  type RollEndEvent,
  type RollStartEvent,
  type SetValueOptions,
} from './types';

const pulseSin: EaseFn = (t) => Math.sin(Math.PI * t);

export class Counter extends Container {
  readonly digits: number;
  readonly digitWidth: number;
  readonly digitHeight: number;

  private readonly cellRenderer: CellRenderer;
  private readonly motion: MotionResolved;
  private readonly leadingZeros: Required<NonNullable<CounterOptions['leadingZeros']>>;
  private readonly blurOpt: Required<NonNullable<CounterOptions['blur']>>;
  private readonly tickerRef: Ticker;
  private readonly columns: DigitColumn[];
  private readonly separators: Container[];
  private readonly sepAfterCol: number[];
  private readonly sepAlwaysVisible: boolean[];
  private readonly digitRow: Container;
  private readonly blurFilter: BlurFilter | null;
  private readonly maxValue: number;
  readonly decimals: number;
  private readonly columnXLocal: number[];
  private readonly fullWidth: number;
  private readonly fitOpt: Required<Omit<FitOptions, 'gsap'>> & { gsap: FitOptions['gsap'] } | null;

  private readonly ALPHA_BASE: number;
  private readonly BLUR_INDEX: number;

  private value: number;
  private readonly scheduler: Scheduler;

  private prefixContainer: Container | null = null;
  private suffixContainer: Container | null = null;

  private currentRollId = 0;
  private activeRollCount = 0;
  private pendingResolve: (() => void) | null = null;
  private pendingOnComplete: (() => void) | null = null;

  private readonly _rollStartPayload: RollStartEvent = { from: 0, to: 0, direction: 'up' };
  private readonly _rollEndPayload: RollEndEvent = { value: 0 };
  private readonly _digitSettlePayload: DigitSettleEvent = { column: 0, digit: 0 };

  constructor(options: CounterOptions) {
    super();
    if (options.digits < 1) throw new Error('Counter: digits must be >= 1');
    this.digits = options.digits;
    this.digitWidth = options.digitWidth;
    this.digitHeight = options.digitHeight;
    this.cellRenderer = options.cellRenderer;
    this.tickerRef = options.ticker ?? Ticker.shared;
    this.decimals = options.decimals ?? 0;
    if (this.decimals < 0) throw new Error('Counter: decimals must be >= 0');
    if (this.decimals >= this.digits) {
      throw new Error('Counter: decimals must be less than digits');
    }
    this.maxValue = Math.pow(10, this.digits) - 1;
    this.value = this.clampValue(options.initialValue ?? 0);

    this.motion = {
      msPerStep: options.motion?.msPerStep ?? DEFAULTS.motion.msPerStep,
      staggerMs: options.motion?.staggerMs ?? DEFAULTS.motion.staggerMs,
      placeDurationBump: options.motion?.placeDurationBump ?? DEFAULTS.motion.placeDurationBump,
      minMs: options.motion?.minMs ?? DEFAULTS.motion.minMs,
      maxMs: options.motion?.maxMs ?? DEFAULTS.motion.maxMs,
      ease: options.motion?.ease ?? defaultEase,
    };
    this.leadingZeros = {
      mode: options.leadingZeros?.mode ?? DEFAULTS.leadingZeros.mode,
      alpha: options.leadingZeros?.alpha ?? DEFAULTS.leadingZeros.alpha,
      tweenMs: options.leadingZeros?.tweenMs ?? DEFAULTS.leadingZeros.tweenMs,
    };
    this.blurOpt = {
      enabled: options.blur?.enabled ?? DEFAULTS.blur.enabled,
      peak: options.blur?.peak ?? DEFAULTS.blur.peak,
    };

    this.ALPHA_BASE = this.digits;
    this.BLUR_INDEX = 2 * this.digits;

    if (options.prefix) {
      this.prefixContainer = this.coerceContainer(options.prefix);
      this.addChild(this.prefixContainer);
    }

    this.digitRow = new Container();
    this.addChild(this.digitRow);

    this.columns = new Array<DigitColumn>(this.digits);
    for (let i = 0; i < this.digits; i++) {
      const col = new DigitColumn(this.cellRenderer, this.digitWidth, this.digitHeight);
      col.positionTweenIndex = i;
      col.alphaTweenIndex = this.ALPHA_BASE + i;
      this.columns[i] = col;
      this.digitRow.addChild(col.container);
    }

    const sepChar = options.separator?.char;
    const sepEvery = options.separator?.every ?? DEFAULTS.separatorEvery;
    const decimalChar = options.decimalChar ?? '.';
    const thousandsCols = sepChar
      ? getSeparatorAfter(this.digits, sepEvery, this.decimals)
      : [];
    const decimalCol = getDecimalSeparatorAfter(this.digits, this.decimals);

    const sepCols: number[] = [];
    const sepChars: string[] = [];
    const sepAlwaysVisible: boolean[] = [];
    let ti = 0;
    for (let col = 0; col < this.digits - 1; col++) {
      if (ti < thousandsCols.length && thousandsCols[ti] === col) {
        sepCols.push(col);
        sepChars.push(sepChar!);
        sepAlwaysVisible.push(false);
        ti++;
      }
      if (col === decimalCol) {
        sepCols.push(col);
        sepChars.push(decimalChar);
        sepAlwaysVisible.push(true);
      }
    }

    this.separators = new Array(sepCols.length);
    this.sepAfterCol = new Array(this.digits).fill(-1);
    this.sepAlwaysVisible = sepAlwaysVisible;
    let sepWidth = 0;
    if (sepCols.length > 0 && this.cellRenderer.createSeparator) {
      for (let i = 0; i < sepCols.length; i++) {
        const sep = this.cellRenderer.createSeparator(sepChars[i]);
        this.separators[i] = sep;
        this.digitRow.addChild(sep);
        this.sepAfterCol[sepCols[i]] = i;
        if (sep.width > sepWidth) sepWidth = sep.width;
      }
    }

    const layout = placeColumns(this.digits, this.digitWidth, sepCols, sepWidth);
    this.columnXLocal = layout.columnX.slice();
    for (let i = 0; i < this.digits; i++) {
      this.columns[i].container.x = layout.columnX[i];
    }
    for (let i = 0; i < this.separators.length; i++) {
      this.separators[i].x = layout.separatorX[i];
    }

    if (this.prefixContainer) {
      const prefixWidth = this.prefixContainer.width;
      this.digitRow.x = prefixWidth;
    }
    let suffixWidth = 0;
    if (options.suffix) {
      this.suffixContainer = this.coerceContainer(options.suffix);
      this.suffixContainer.x = this.digitRow.x + layout.totalWidth;
      this.addChild(this.suffixContainer);
      suffixWidth = this.suffixContainer.width;
    }
    this.fullWidth = this.digitRow.x + layout.totalWidth + suffixWidth;

    if (options.fit) {
      this.fitOpt = {
        maxWidth: options.fit.maxWidth,
        minScale: options.fit.minScale ?? 0.4,
        duration: options.fit.duration ?? 0.3,
        ease: options.fit.ease ?? 'power2.out',
        anchor: options.fit.anchor ?? 'left',
        gsap: options.fit.gsap,
      };
      this.pivot.x = this.fitOpt.anchor === 'right' ? this.fullWidth : this.fitOpt.anchor === 'center' ? this.fullWidth / 2 : 0;
      const initialScale = this.computeFitScale(this.value);
      this.scale.set(initialScale);
    } else {
      this.fitOpt = null;
    }

    if (this.blurOpt.enabled) {
      this.blurFilter = new BlurFilter({ strength: 0, quality: 2 });
      this.blurFilter.strengthX = 0;
      this.digitRow.filters = [this.blurFilter];
    } else {
      this.blurFilter = null;
    }

    this.scheduler = new Scheduler(
      this.tickerRef,
      2 * this.digits + 1,
      this.onApply,
      this.onTweenComplete,
    );

    this.applyValueInstant(this.value);
  }

  getValue(): number {
    return this.value;
  }

  isAnimating(): boolean {
    return this.scheduler.hasActive;
  }

  setValue(value: number, opts: SetValueOptions = {}): Promise<void> {
    const target = this.clampValue(value);
    const oldValue = this.value;

    if (opts.instant) {
      this.resolvePending();
      this.scheduler.finishAll();
      this.value = target;
      this.applyValueInstant(target);
      this.applyFit(target, false);
      opts.onComplete?.();
      return Promise.resolve();
    }

    if (target === oldValue && !this.scheduler.hasActive) {
      opts.onComplete?.();
      return Promise.resolve();
    }

    this.applyFit(target, true);

    this.resolvePending();
    this.value = target;
    const direction = resolveDirection(opts.direction, oldValue, target);
    const now = performance.now();
    const rollId = ++this.currentRollId;

    this.activeRollCount = 0;
    this.finishStaleTweens(target, rollId);

    const changingCount = this.startColumnTweens(oldValue, target, direction, opts.duration, now, rollId);

    if (changingCount === 0) {
      this.startBlurTween(0, now, rollId);
      this.startLeadingZeroTweens(target, now, rollId);
      opts.onComplete?.();
      return Promise.resolve();
    }

    this.activeRollCount = changingCount;

    let longestEnd = 0;
    for (let col = 0; col < this.digits; col++) {
      const t = this.scheduler.get(col);
      if (t.active && t.rollId === rollId) {
        const end = t.delay + t.duration;
        if (end > longestEnd) longestEnd = end;
      }
    }

    this.startBlurTween(longestEnd, now, rollId);
    this.startLeadingZeroTweens(target, now, rollId);

    this._rollStartPayload.from = oldValue;
    this._rollStartPayload.to = target;
    this._rollStartPayload.direction = direction;
    this.emit('rollstart', this._rollStartPayload);

    return new Promise<void>((resolve) => {
      this.pendingResolve = resolve;
      this.pendingOnComplete = opts.onComplete ?? null;
    });
  }

  /**
   * Skip the in-flight animation straight to its current target value.
   *
   * - Every active position tween jumps to its target Y (the column shows the
   *   target digit, sharp).
   * - Leading-zero alpha tweens jump to their target alpha (dim / hidden / full).
   * - The blur tween snaps to 0 (no residual blur).
   * - `digitsettle` fires for each settling column, then `rollend` fires once.
   * - The pending `setValue` Promise resolves.
   *
   * Use it to fast-forward when the player has impatiently queued another input:
   *
   * ```ts
   * function onBetClick() {
   *   counter.cancel();            // snap any in-flight roll to its end
   *   counter.setValue(balance);   // start a fresh roll from there
   * }
   * ```
   *
   * If no roll is in flight, this is a cheap no-op. Safe to call on every input.
   */
  cancel(): void {
    this.scheduler.finishAll();
    this.resolvePending();
  }

  override destroy(options?: DestroyOptions): void {
    this.scheduler.destroy();
    this.resolvePending();
    if (this.fitOpt) this.fitOpt.gsap.killTweensOf(this.scale);
    for (let i = 0; i < this.columns.length; i++) this.columns[i].destroy();
    if (this.blurFilter) this.blurFilter.destroy();
    super.destroy(options);
  }

  private computeFitScale(value: number): number {
    if (!this.fitOpt) return 1;
    const visibleWidth = this.computeVisibleWidth(value);
    if (visibleWidth <= 0) return 1;
    const raw = this.fitOpt.maxWidth / visibleWidth;
    if (raw >= 1) return 1;
    return Math.max(this.fitOpt.minScale, raw);
  }

  private computeVisibleWidth(value: number): number {
    if (this.leadingZeros.mode !== 'hide') return this.fullWidth;
    const dimCount = leadingZeroCount(value, this.digits, this.decimals);
    if (dimCount >= this.digits) return 0;
    const leftEdge = this.columnXLocal[dimCount] + this.digitRow.x;
    return this.fullWidth - leftEdge;
  }

  private applyFit(value: number, animated: boolean): void {
    if (!this.fitOpt) return;
    const target = this.computeFitScale(value);
    const gsap = this.fitOpt.gsap;
    gsap.killTweensOf(this.scale);
    if (!animated || (this.scale.x === target && this.scale.y === target)) {
      this.scale.set(target);
      return;
    }
    gsap.to(this.scale, {
      x: target,
      y: target,
      duration: this.fitOpt.duration,
      ease: this.fitOpt.ease,
    });
  }

  private clampValue(value: number): number {
    const i = Math.floor(value);
    if (i < 0) return 0;
    if (i > this.maxValue) return this.maxValue;
    return i;
  }

  private coerceContainer(value: string | Container): Container {
    if (typeof value !== 'string') return value;
    if (this.cellRenderer.createSeparator) return this.cellRenderer.createSeparator(value);
    return new Container();
  }

  private applyValueInstant(value: number): void {
    for (let col = 0; col < this.digits; col++) {
      const placeFromRight = this.digits - 1 - col;
      const digit = digitAtPlace(value, placeFromRight);
      this.columns[col].setDigit(digit);
    }
    this.applyLeadingZerosInstant(value);
  }

  private applyLeadingZerosInstant(value: number): void {
    const dimCount =
      this.leadingZeros.mode === 'show'
        ? 0
        : leadingZeroCount(value, this.digits, this.decimals);
    const dimAlpha = this.leadingZeros.mode === 'hide' ? 0 : this.leadingZeros.alpha;
    for (let col = 0; col < this.digits; col++) {
      const wantAlpha = col < dimCount ? dimAlpha : 1;
      this.columns[col].container.alpha = wantAlpha;
      const sepIdx = this.sepAfterCol[col];
      if (sepIdx >= 0 && !this.sepAlwaysVisible[sepIdx]) {
        this.separators[sepIdx].alpha = wantAlpha;
      }
    }
  }

  private finishStaleTweens(target: number, _rollId: number): void {
    for (let col = 0; col < this.digits; col++) {
      const t = this.scheduler.get(col);
      if (!t.active) continue;
      const placeFromRight = this.digits - 1 - col;
      const newDigit = digitAtPlace(target, placeFromRight);
      const targetIdx = Math.round(-t.targetValue / this.digitHeight);
      const targetDigit = ((targetIdx % 10) + 10) % 10;
      if (newDigit === targetDigit) {
        this.scheduler.finish(col);
      }
    }
  }

  private startColumnTweens(
    oldValue: number,
    target: number,
    direction: RollDirection,
    durationOverride: number | undefined,
    now: number,
    rollId: number,
  ): number {
    let changingCount = 0;
    for (let col = 0; col < this.digits; col++) {
      const placeFromRight = this.digits - 1 - col;
      const oldDigit = digitAtPlace(oldValue, placeFromRight);
      const newDigit = digitAtPlace(target, placeFromRight);
      if (oldDigit === newDigit) continue;

      const column = this.columns[col];
      const rawFromIdx = -column.getStripY() / this.digitHeight;
      const { normalizedFromIdx, toIdx } = resolveTargetIndex(rawFromIdx, newDigit, direction);
      const distance = Math.abs(toIdx - normalizedFromIdx);

      const integerSteps = computeSteps(oldDigit, newDigit, direction);
      const distanceForDuration = distance > 0 ? distance : integerSteps;
      const duration =
        durationOverride ??
        computeDuration(distanceForDuration, placeFromRight, this.motion);
      const delay = changingCount * this.motion.staggerMs;

      const fromY = -normalizedFromIdx * this.digitHeight;
      const targetY = -toIdx * this.digitHeight;
      column.setStripY(fromY);
      column.paintFillers(Math.floor(normalizedFromIdx), toIdx);

      const t = this.scheduler.get(col);
      t.startValue = fromY;
      t.targetValue = targetY;
      t.duration = duration;
      t.delay = delay;
      t.ease = this.motion.ease;
      t.rollId = rollId;
      this.scheduler.start(col, now);

      changingCount++;
    }
    return changingCount;
  }

  private startBlurTween(longestEnd: number, now: number, rollId: number): void {
    if (!this.blurFilter) return;
    const t = this.scheduler.get(this.BLUR_INDEX);
    if (longestEnd <= 0) {
      this.blurFilter.strengthY = 0;
      if (t.active) this.scheduler.finish(this.BLUR_INDEX);
      return;
    }
    t.startValue = 0;
    t.targetValue = 1;
    t.duration = longestEnd;
    t.delay = 0;
    t.ease = pulseSin;
    t.rollId = rollId;
    this.scheduler.start(this.BLUR_INDEX, now);
  }

  private startLeadingZeroTweens(target: number, now: number, rollId: number): void {
    if (this.leadingZeros.mode === 'show') return;
    const dimCount = leadingZeroCount(target, this.digits, this.decimals);
    const dimAlpha = this.leadingZeros.mode === 'hide' ? 0 : this.leadingZeros.alpha;
    for (let col = 0; col < this.digits; col++) {
      const wantAlpha = col < dimCount ? dimAlpha : 1;
      const column = this.columns[col];
      const currentAlpha = column.container.alpha;
      if (Math.abs(currentAlpha - wantAlpha) < 0.001) continue;
      const t = this.scheduler.get(this.ALPHA_BASE + col);
      t.startValue = currentAlpha;
      t.targetValue = wantAlpha;
      t.duration = this.leadingZeros.tweenMs;
      t.delay = 0;
      t.ease = linear;
      t.rollId = rollId;
      this.scheduler.start(this.ALPHA_BASE + col, now);
    }
  }

  private onApply = (idx: number, value: number): void => {
    if (idx < this.digits) {
      this.columns[idx].setStripY(value);
      return;
    }
    if (idx < this.BLUR_INDEX) {
      const colIdx = idx - this.digits;
      this.columns[colIdx].container.alpha = value;
      const sepIdx = this.sepAfterCol[colIdx];
      if (sepIdx >= 0 && !this.sepAlwaysVisible[sepIdx]) {
        this.separators[sepIdx].alpha = value;
      }
      return;
    }
    if (this.blurFilter) this.blurFilter.strengthY = value * this.blurOpt.peak;
  };

  private onTweenComplete = (idx: number): void => {
    if (idx >= this.digits) return;

    const t = this.scheduler.get(idx);
    const finalIdx = Math.round(-t.targetValue / this.digitHeight);
    const column = this.columns[idx];
    column.commitIndex(finalIdx);

    this._digitSettlePayload.column = idx;
    this._digitSettlePayload.digit = column.currentDigit;
    this.emit('digitsettle', this._digitSettlePayload);

    if (t.rollId !== this.currentRollId) return;
    if (this.activeRollCount === 0) return;

    this.activeRollCount--;
    if (this.activeRollCount === 0) {
      this._rollEndPayload.value = this.value;
      this.emit('rollend', this._rollEndPayload);
      this.resolvePending();
    }
  };

  private resolvePending(): void {
    const resolve = this.pendingResolve;
    const onComplete = this.pendingOnComplete;
    this.pendingResolve = null;
    this.pendingOnComplete = null;
    if (resolve) resolve();
    if (onComplete) onComplete();
  }
}
