/**
 * Tiny delta-time tween + timer runner.
 *
 * Everything animated in the game is driven from a single Tweens
 * instance that Game.update() ticks, so there are no stray setTimeouts
 * that could fire after a restart.
 */

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  /** Overshoots slightly then settles — good for pops and bounces. */
  outBack: (t) => {
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

class Tween {
  constructor(opts) {
    this.duration = Math.max(1, opts.duration ?? 200);
    this.delay = opts.delay ?? 0;
    this.ease = opts.ease ?? Ease.outQuad;
    this.onUpdate = opts.onUpdate ?? null;
    this.onComplete = opts.onComplete ?? null;
    /** Called instead of onComplete if the runner is cleared mid-flight. */
    this.onCancel = opts.onCancel ?? null;
    this.elapsed = 0;
    this.done = false;
    this.started = false;
  }

  advance(dtMs) {
    if (this.done) return;
    if (this.delay > 0) {
      this.delay -= dtMs;
      if (this.delay > 0) return;
      dtMs = -this.delay;
      this.delay = 0;
    }
    this.started = true;
    this.elapsed += dtMs;
    const raw = Math.min(1, this.elapsed / this.duration);
    if (this.onUpdate) this.onUpdate(this.ease(raw), raw);
    if (raw >= 1) {
      this.done = true;
      if (this.onComplete) this.onComplete();
    }
  }

  cancel() {
    this.done = true;
    this.onComplete = null;
  }
}

export class Tweens {
  constructor() {
    this.active = [];
    this.timers = [];
    /** Bumped by clear(); pending waits resolve as "cancelled". */
    this.generation = 0;
  }

  /**
   * @param {{duration?:number, delay?:number, ease?:Function,
   *          onUpdate?:(v:number, raw:number)=>void, onComplete?:()=>void}} opts
   */
  add(opts) {
    const tween = new Tween(opts);
    this.active.push(tween);
    return tween;
  }

  /** Run `fn` after `ms`. Returns a handle that can be cancelled. */
  after(ms, fn) {
    const timer = { remaining: ms, fn, cancelled: false };
    this.timers.push(timer);
    return timer;
  }

  /**
   * Await a delay from inside an async gameplay sequence.
   * Resolves with `false` if the tween runner was cleared meanwhile,
   * which lets sequences bail out cleanly on restart.
   */
  wait(ms) {
    const gen = this.generation;
    return new Promise((resolve) => {
      if (ms <= 0) {
        resolve(gen === this.generation);
        return;
      }
      this.after(ms, () => resolve(gen === this.generation));
    });
  }

  update(dtMs) {
    // Timers first: they commonly spawn new tweens.
    if (this.timers.length) {
      const due = [];
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const timer = this.timers[i];
        timer.remaining -= dtMs;
        if (timer.remaining <= 0) {
          this.timers.splice(i, 1);
          if (!timer.cancelled) due.push(timer);
        }
      }
      for (let i = due.length - 1; i >= 0; i--) due[i].fn();
    }

    if (this.active.length) {
      // Snapshot: onComplete handlers routinely append new tweens.
      const list = this.active.slice();
      for (const tween of list) tween.advance(dtMs);
      this.active = this.active.filter((t) => !t.done);
    }
  }

  /**
   * Drop everything without firing completions (used on restart).
   * Cancelled tweens get `onCancel` instead, which lets awaited
   * animation promises settle rather than hang forever.
   */
  clear() {
    this.generation++;
    const cancelled = this.active.slice();
    this.active.length = 0;
    for (const timer of this.timers) timer.cancelled = true;
    this.timers.length = 0;
    for (const tween of cancelled) {
      tween.onComplete = null;
      tween.done = true;
      const onCancel = tween.onCancel;
      tween.onCancel = null;
      try {
        onCancel?.();
      } catch (err) {
        console.error('[Tweens] onCancel failed:', err);
      }
    }
  }
}

/** Random float in [min, max) — used all over the effects code. */
export const rand = (min, max) => min + Math.random() * (max - min);

/** Fisher-Yates on a copy. */
export function shuffled(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
