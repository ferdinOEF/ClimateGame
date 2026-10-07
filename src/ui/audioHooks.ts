// STEP_PROMPT_pacing_telegraph_preview.md Section 1: "hazard_arrival"
// is the countdown-hits-zero beat itself (distinct from "hazard_telegraph",
// which plays once when the countdown *window* opens) — see Hud.
// flashArrival()'s matching visual beat in main.ts's checkHazardSchedule().
// Section 2: "hazard_breach"/"hazard_overwhelmed" play per-tile, as each
// tile's staggered reveal fires in applyHazardResult() — a catastrophic
// engineered failure shouldn't sound the same as a defense quietly holding
// (the existing "hazard_resolve" cue, unchanged, stays the once-per-event
// "something happened" sound).
export type SoundId =
  | "tile_settle"
  | "build"
  | "hazard_telegraph"
  | "hazard_arrival"
  | "hazard_resolve"
  | "hazard_breach"
  | "hazard_overwhelmed"
  | "era_end"
  // Panjim 2050
  | "clock_tick"
  | "coin"
  | "chime"
  | "combo"
  | "star"
  | "collect";

/**
 * Sound, synthesised rather than sampled: a few short WebAudio tones.
 *
 * There are still no audio assets. These are deliberately small, soft and
 * pitched (a tick, a coin, a chime) so the Panjim 2050 run has the feedback
 * its design leans on without shipping files. Every call site goes through
 * here, so real samples can replace the tones later in one place.
 *
 * The AudioContext is created lazily on the first sound, which in practice
 * follows a click, so browsers that require a gesture before audio are
 * satisfied. Any failure is swallowed: sound is never worth an error.
 */
type Tone = { freqs: number[]; duration: number; type?: OscillatorType; gain?: number; gapMs?: number };

const TONES: Partial<Record<SoundId, Tone>> = {
  clock_tick: { freqs: [1320], duration: 0.04, type: "square", gain: 0.035 },
  coin: { freqs: [988, 1319], duration: 0.08, type: "triangle", gain: 0.08, gapMs: 60 },
  collect: { freqs: [784, 988, 1319], duration: 0.07, type: "triangle", gain: 0.08, gapMs: 45 },
  chime: { freqs: [659, 880, 1109], duration: 0.18, type: "sine", gain: 0.07, gapMs: 90 },
  combo: { freqs: [523, 659, 784, 1047], duration: 0.16, type: "sine", gain: 0.08, gapMs: 70 },
  star: { freqs: [1047, 1568], duration: 0.14, type: "triangle", gain: 0.07, gapMs: 80 },
  build: { freqs: [392, 523], duration: 0.07, type: "triangle", gain: 0.05, gapMs: 40 },
  hazard_telegraph: { freqs: [220, 196], duration: 0.25, type: "sine", gain: 0.06, gapMs: 200 },
  hazard_arrival: { freqs: [110], duration: 0.5, type: "sawtooth", gain: 0.04 },
  hazard_breach: { freqs: [98], duration: 0.3, type: "sawtooth", gain: 0.035 },
  era_end: { freqs: [392, 330, 262], duration: 0.2, type: "sine", gain: 0.05, gapMs: 150 }
};

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (context) return context;
  try {
    const Ctor = (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    context = Ctor ? new Ctor() : null;
  } catch {
    context = null;
  }
  return context;
}

export function playSound(id: SoundId): void {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug(`[audio] ${id}`);
  }
  const tone = TONES[id];
  if (!tone) return;
  const ctx = audio();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    tone.freqs.forEach((freq, i) => {
      const start = ctx.currentTime + (i * (tone.gapMs ?? 0)) / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type ?? "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(tone.gain ?? 0.05, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + tone.duration + 0.02);
    });
  } catch {
    // Sound is decoration; never let it break a frame.
  }
}
