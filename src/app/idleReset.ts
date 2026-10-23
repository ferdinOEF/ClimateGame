/**
 * Section 30.12 (festival mode, owner decision): after 3 minutes with no input the game goes back to the menu, for
 * the next visitor. Never while a storm plays (the clock starts again when it ends). Any key, click, wheel or
 * pointer movement counts as input.
 */
export const IDLE_RESET_MS = 3 * 60 * 1000;

export class IdleReset {
  private last: number;
  private fired = false;

  constructor(
    private readonly onIdle: () => void,
    private readonly paused: () => boolean,
    private readonly timeoutMs = IDLE_RESET_MS,
    now = Date.now()
  ) {
    this.last = now;
  }

  /** Input happened. */
  poke(now = Date.now()): void {
    this.last = now;
  }

  /** Checks the clock; fires once when the time has run out. A storm playing holds it (and starts it again). */
  check(now = Date.now()): boolean {
    if (this.fired) return false;
    if (this.paused()) {
      this.last = now;
      return false;
    }
    if (now - this.last < this.timeoutMs) return false;
    this.fired = true;
    this.onIdle();
    return true;
  }
}

/** Watches the page's input for `idle` and checks it every few seconds. Returns the way to stop. */
export function watchIdle(idle: IdleReset, target: Window = window): () => void {
  const poke = (): void => idle.poke();
  const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
  for (const name of events) target.addEventListener(name, poke, { passive: true, capture: true });
  const timer = target.setInterval(() => idle.check(), 5000);
  return () => {
    for (const name of events) target.removeEventListener(name, poke, { capture: true });
    target.clearInterval(timer);
  };
}
