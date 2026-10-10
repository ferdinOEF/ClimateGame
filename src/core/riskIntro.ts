import config from "@data/riskIntro.json";

/**
 * The first-warning risk sequence, as pure timing and rules (no DOM): when it
 * plays, what each moment looks like, and which visual pieces each mode may
 * create. The drawing is in src/ui/riskIntroFx.ts.
 *
 * THE SEQUENCE (full mode)
 *   0 → fillIn          the risk area fills red to `fillOpacity`;
 *   0 → wave            a breaking wave crosses it left to right, the fill
 *                       easing to `restOpacity` behind the crest;
 *   wave → +droplets    the crest bursts into droplets at the right edge;
 *   … → hold            the sheet rests at `restOpacity`;
 *   hold → +fold        it folds in on itself into a ball;
 *   … → +flight         the ball flies on a curve to the Show Risk button,
 *                       shrinking, and lands with a ripple;
 *   … → +landing        the button pulses once.
 *
 * Reduced motion: the fill appears, eases to rest over `reducedEaseSeconds`,
 * fades out, and the button pulses once in place. No wave, fold or flight.
 * Low quality: flat. The sheet fades to rest, holds, then a plain 2D disc
 * tweens to the button. No particles, no shader.
 */
export type RiskIntroConfig = typeof config;
export const RISK_INTRO: RiskIntroConfig = config;

export type RiskIntroMode = "full" | "reduced" | "flat";

export function riskIntroMode(reducedMotion: boolean, quality: "low" | "medium" | "high"): RiskIntroMode {
  if (reducedMotion) return "reduced";
  return quality === "low" ? "flat" : "full";
}

/** Which costly pieces a mode may create: only the full sequence has droplets (particles) and the shaded ball (a shader). */
export function componentsFor(mode: RiskIntroMode): { particles: boolean; shader: boolean } {
  return mode === "full" ? { particles: true, shader: true } : { particles: false, shader: false };
}

/**
 * Once per playthrough, on the first warning only. `offer` is called with the
 * challenge whose warning is showing; it says yes exactly once, for the first
 * challenge it is ever offered, and never again (not for that challenge after
 * it played or was cancelled, and not for any later one).
 */
export class RiskIntroGate {
  private first: string | null = null;
  private done = false;

  offer(challengeId: string): boolean {
    if (this.done) return false;
    if (this.first === null) this.first = challengeId;
    if (challengeId !== this.first) {
      this.done = true;
      return false;
    }
    this.done = true;
    return true;
  }

  /** Whether it has been used up. */
  get spent(): boolean {
    return this.done;
  }
}

/** Phase boundaries, in seconds from the start. */
export function timeline(mode: RiskIntroMode, c: RiskIntroConfig = RISK_INTRO) {
  if (mode === "reduced") {
    const rest = c.fillInSeconds + c.reducedEaseSeconds;
    const fadeEnd = rest + c.reducedFadeSeconds;
    return { fillEnd: c.fillInSeconds, waveEnd: c.fillInSeconds, dropletsEnd: c.fillInSeconds, foldStart: fadeEnd, foldEnd: fadeEnd, flightEnd: fadeEnd, end: fadeEnd + c.landingSeconds, rest, fadeEnd };
  }
  const foldStart = c.holdSeconds;
  const foldEnd = mode === "full" ? foldStart + c.foldSeconds : foldStart;
  const flightEnd = foldEnd + c.flightSeconds;
  return { fillEnd: c.fillInSeconds, waveEnd: c.waveSeconds, dropletsEnd: c.waveSeconds + c.dropletSeconds, foldStart, foldEnd, flightEnd, end: flightEnd + c.landingSeconds, rest: c.waveSeconds, fadeEnd: foldStart };
}

/** Smooth start and end. */
export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Fast start, soft landing. */
export function easeOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

export interface RiskIntroFrame {
  /** Opacity of the sheet where the wave has not reached (ahead of the crest). */
  aheadOpacity: number;
  /** Opacity of the sheet behind the crest. */
  behindOpacity: number;
  /** 0 → 1 across the area; null when there is no wave. */
  crest: number | null;
  /** 0 → 1 while folding; null otherwise. */
  fold: number | null;
  /** 0 → 1 while flying; null otherwise. */
  flight: number | null;
  /** True while the button pulses. */
  landing: boolean;
  /** Seconds since the crest broke at the right edge (droplets); null outside that window. */
  droplets: number | null;
  done: boolean;
}

/** What the sequence looks like at `t` seconds. Pure, so it can be tested and seeked. */
export function frameAt(t: number, mode: RiskIntroMode, c: RiskIntroConfig = RISK_INTRO): RiskIntroFrame {
  const tl = timeline(mode, c);
  const fillIn = c.fillOpacity * easeOut(t / c.fillInSeconds);
  if (mode === "reduced") {
    let opacity = fillIn;
    if (t >= tl.fillEnd) opacity = c.fillOpacity + (c.restOpacity - c.fillOpacity) * easeInOut((t - tl.fillEnd) / c.reducedEaseSeconds);
    if (t >= tl.rest) opacity = c.restOpacity * (1 - easeInOut((t - tl.rest) / c.reducedFadeSeconds));
    return { aheadOpacity: opacity, behindOpacity: opacity, crest: null, fold: null, flight: null, landing: t >= tl.fadeEnd && t < tl.end, droplets: null, done: t >= tl.end };
  }
  if (t < tl.foldStart) {
    if (mode === "flat") {
      // No wave: the whole sheet eases from fill to rest over the wave's time.
      const opacity = t < tl.fillEnd ? fillIn : c.fillOpacity + (c.restOpacity - c.fillOpacity) * easeInOut((t - tl.fillEnd) / (c.waveSeconds - tl.fillEnd));
      return { aheadOpacity: opacity, behindOpacity: opacity, crest: null, fold: null, flight: null, landing: false, droplets: null, done: false };
    }
    const crest = t < c.waveSeconds ? easeInOut(t / c.waveSeconds) : null;
    // Behind the crest the sheet eases down from fill to rest; after the wave it all rests.
    const behind = t < c.waveSeconds ? c.fillOpacity + (c.restOpacity - c.fillOpacity) * easeInOut(t / c.waveSeconds) : c.restOpacity;
    const ahead = t < c.waveSeconds ? fillIn : c.restOpacity;
    const droplets = t >= c.waveSeconds && t < tl.dropletsEnd ? t - c.waveSeconds : null;
    return { aheadOpacity: ahead, behindOpacity: behind, crest, fold: null, flight: null, landing: false, droplets, done: false };
  }
  if (t < tl.foldEnd) {
    return { aheadOpacity: c.restOpacity, behindOpacity: c.restOpacity, crest: null, fold: easeInOut((t - tl.foldStart) / c.foldSeconds), flight: null, landing: false, droplets: null, done: false };
  }
  if (t < tl.flightEnd) {
    return { aheadOpacity: 0, behindOpacity: 0, crest: null, fold: null, flight: easeInOut((t - tl.foldEnd) / c.flightSeconds), landing: false, droplets: null, done: false };
  }
  return { aheadOpacity: 0, behindOpacity: 0, crest: null, fold: null, flight: null, landing: t < tl.end, droplets: null, done: t >= tl.end };
}
