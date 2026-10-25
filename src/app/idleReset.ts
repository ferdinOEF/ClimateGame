/**
 * Section 30.12 (festival mode, owner decision): after 3 minutes with no input the game goes back to the menu, for
 * the next visitor. Never while a storm plays (the clock starts again when it ends). Any key, click, wheel or
 * pointer movement counts as input.
 */
export const IDLE_RESET_MS = 3 * 60 * 1000;
/** Section 34: the warning before the reset ("Still there?"); any input cancels it. Players lost whole runs to a silent reset. */
export const IDLE_WARN_MS = 30 * 1000;

export class IdleReset {
  private last: number;
  private fired = false;
  private warned = false;

  constructor(
    private readonly onIdle: () => void,
    private readonly paused: () => boolean,
    private readonly timeoutMs = IDLE_RESET_MS,
    now = Date.now(),
    /** Section 34: told the seconds left once the warning starts, and every check after; null when input cancels it. */
    private readonly onWarn: (secondsLeft: number | null) => void = () => undefined,
    private readonly warnMs = IDLE_WARN_MS
  ) {
    this.last = now;
  }

  /** Input happened. */
  poke(now = Date.now()): void {
    this.last = now;
    if (this.warned) {
      this.warned = false;
      this.onWarn(null);
    }
  }

  /** Whether the warning is showing. */
  get warning(): boolean {
    return this.warned;
  }

  /** Checks the clock; fires once when the time has run out. A storm playing holds it (and starts it again). */
  check(now = Date.now()): boolean {
    if (this.fired) return false;
    if (this.paused()) {
      this.poke(now);
      return false;
    }
    const left = this.timeoutMs - (now - this.last);
    if (left > this.warnMs) return false;
    if (left > 0) {
      this.warned = true;
      this.onWarn(Math.ceil(left / 1000));
      return false;
    }
    this.fired = true;
    if (this.warned) this.onWarn(null);
    this.warned = false;
    this.onIdle();
    return true;
  }
}

/** Watches the page's input for `idle` and checks it every few seconds. Returns the way to stop. */
export function watchIdle(idle: IdleReset, target: Window = window): () => void {
  const poke = (): void => idle.poke();
  const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
  for (const name of events) target.addEventListener(name, poke, { passive: true, capture: true });
  // Every second once the warning shows (its countdown), else every few seconds.
  let since = 0;
  const timer = target.setInterval(() => {
    since += 1000;
    if (idle.warning || since >= 5000) {
      since = 0;
      idle.check();
    }
  }, 1000);
  return () => {
    for (const name of events) target.removeEventListener(name, poke, { capture: true });
    target.clearInterval(timer);
  };
}
