/* ============================================================
   JUICE HELPER 1 - TWEENS
   A numeric property from A to B over a duration, on an easing
   curve, stepped by the main loop. Generic on purpose: anything
   with a number on it can be animated, so the next effect (a win
   flourish, a level wipe) does not need new machinery.
   ============================================================ */

export const Ease = {
  linear:    (t: number) => t,
  outQuad:   (t: number) => t * (2 - t),
  outCubic:  (t: number) => 1 - Math.pow(1 - t, 3),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  // overshoots the end value and settles back - the "spring" in squash/stretch
  outBack:   (t: number) => { const c = 1.70158, u = t - 1;
                              return 1 + (c + 1) * u * u * u + c * u * u; },
};

export type EaseFn = (t: number) => number;

interface Tween<T> {
  target: T; prop: keyof T;
  from: number; to: number;
  dur: number; ease: EaseFn; t: number;
  done: (() => void) | null;
}

export class TweenSystem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tweens: Tween<any>[] = [];

  /** One tween per property: a re-trigger restarts rather than fighting. */
  add<T extends object>(
    target: T, prop: { [K in keyof T]: T[K] extends number ? K : never }[keyof T],
    from: number, to: number,
    durationMs: number, ease: EaseFn = Ease.outQuad, onDone?: () => void,
  ): void {
    for (let i = this.tweens.length - 1; i >= 0; i--)
      if (this.tweens[i].target === target && this.tweens[i].prop === prop)
        this.tweens.splice(i, 1);
    (target as Record<string, unknown>)[prop as string] = from;
    this.tweens.push({ target, prop, from, to,
                       dur: Math.max(1, durationMs), ease, t: 0, done: onDone ?? null });
  }

  update(dt: number): void {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = tw.t >= tw.dur ? 1 : tw.t / tw.dur;
      tw.target[tw.prop] = tw.from + (tw.to - tw.from) * tw.ease(k);
      if (k === 1) { this.tweens.splice(i, 1); tw.done?.(); }
    }
  }

  clear(): void { this.tweens.length = 0; }

  /** Live tween count - for the test hook, never for game logic. */
  get count(): number { return this.tweens.length; }
}
