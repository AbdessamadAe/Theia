/**
 * The shared interrupt/retarget policy for reactive animation (Part A reactive
 * morphs, Part B followers). It guarantees: never queue a backlog, never lag the
 * slider, never stack animations.
 *
 * Policy (one rule, applied per update):
 *   - prefers-reduced-motion → render instantly, no tween.
 *   - updates arriving faster than `fastMs` apart (a drag in progress) → render
 *     instantly (track the value); cancel any in-flight tween. This is the
 *     graceful-degradation path: while dragging we follow the value exactly.
 *   - a slower, deliberate change → cancel any in-flight tween and start a new
 *     one from wherever the visual currently is toward the new target (retarget).
 * Because the last `input` of a drag (on release) lands the exact value via the
 * instant path, the visual settles cleanly with no extra animation.
 *
 * The actual rendering is injected (`instant`, `animate`) so the same policy
 * drives glyph morphs and geometric follower tweens alike. `now` is injected so
 * the logic is unit-testable with a synthetic clock.
 */

export interface AnimHandle {
  cancel(): void;
}

export interface RetargetOptions<T> {
  /** Render `value` immediately, no animation. */
  instant: (value: T) => void;
  /** Begin a tween from the current visual toward `value`; return a canceller. */
  animate: (value: T) => AnimHandle;
  /** True to always take the instant path (prefers-reduced-motion). */
  reducedMotion?: () => boolean;
  /** Updates closer together than this (ms) are treated as a drag. */
  fastMs?: number;
  /** Injectable clock (defaults to performance.now / Date.now). */
  now?: () => number;
}

export class RetargetController<T> {
  private last: number;
  private active: AnimHandle | null = null;
  private readonly fastMs: number;
  private readonly now: () => number;

  constructor(private readonly opts: RetargetOptions<T>) {
    this.fastMs = opts.fastMs ?? 90;
    this.now =
      opts.now ??
      (typeof performance !== "undefined"
        ? () => performance.now()
        : () => Date.now());
    // Seed the clock so the first update (the initial paint) takes the instant
    // path rather than a spurious tween from a value to itself.
    this.last = this.now();
  }

  /** Request that the visual move to `value`, choosing instant vs tween. */
  set(value: T): void {
    const reduced = this.opts.reducedMotion?.() ?? false;
    const t = this.now();
    const dt = t - this.last;
    this.last = t;

    if (reduced || dt < this.fastMs) {
      this.cancelActive(); // never let a tween fight an instant track
      this.opts.instant(value);
      return;
    }
    this.cancelActive(); // retarget: drop the in-flight tween, start fresh
    this.active = this.opts.animate(value);
  }

  /** Called by the animation when it finishes on its own. */
  settled(handle: AnimHandle): void {
    if (this.active === handle) this.active = null;
  }

  /** Is a tween currently in flight? (Exposed for tests.) */
  get animating(): boolean {
    return this.active !== null;
  }

  private cancelActive(): void {
    if (this.active) {
      this.active.cancel();
      this.active = null;
    }
  }
}
