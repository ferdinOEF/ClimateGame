import { addAudioTestExtras, audioOut, onAudioUnlock, soundEnabled } from "./audioHooks";

/**
 * Section 36: the game's recorded sounds (public/sound/), fetched and decoded once each, by name, into an
 * AudioBuffer on the game's audio context.
 *
 * Each file is there twice: Ogg Vorbis, and MP3 for a browser that cannot play Ogg (Safari). Nothing is fetched
 * before the player's first click (the audio unlock in audioHooks), so first paint never waits for a sound; a sound
 * that fails to load is skipped, silently, and the game never waits for one.
 */
export const BUILD_SAMPLES = ["build_seawall", "build_breakwater", "build_dam"] as const;
export const BIRD_SAMPLES = ["bird_kingfisher", "bird_kite", "bird_drongo", "bird_eagle"] as const;
export const MUSIC_SAMPLE = "farar_far_panjim_loop";
export type SampleName = (typeof BUILD_SAMPLES)[number] | (typeof BIRD_SAMPLES)[number] | typeof MUSIC_SAMPLE;
/** The order a session loads them in: the seven short ones first, the music last. */
export const SAMPLE_ORDER: readonly SampleName[] = [...BUILD_SAMPLES, ...BIRD_SAMPLES, MUSIC_SAMPLE];

export interface SampleBankDeps {
  /** The context to decode on; null while sound may not play yet. */
  context: () => BaseAudioContext | null;
  fetch: (url: string) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>;
  /** What `HTMLMediaElement.canPlayType` says for Ogg Vorbis: "" when it cannot. */
  canPlayOgg: () => string;
  /** Where public/sound/ is served. */
  base: string;
}

/** The file to fetch for `name`: the Ogg, or the MP3 when the browser cannot play Ogg. */
export function sampleUrl(name: SampleName, canPlayOgg: string, base = "/sound/"): string {
  return `${base}${name}.${canPlayOgg ? "ogg" : "mp3"}`;
}

export class SampleBank {
  private readonly loads = new Map<SampleName, Promise<AudioBuffer | null>>();
  private readonly ready = new Map<SampleName, AudioBuffer>();

  constructor(private readonly deps: SampleBankDeps) {}

  /** The decoded sample, or null if it has not loaded (yet, or ever). */
  get(name: SampleName): AudioBuffer | null {
    return this.ready.get(name) ?? null;
  }

  /** Fetches and decodes `name` once; resolves to null, never rejects, when it cannot (or sound may not play yet). */
  load(name: SampleName): Promise<AudioBuffer | null> {
    const known = this.loads.get(name);
    if (known) return known;
    let ctx: BaseAudioContext | null;
    let ogg = "";
    try {
      ctx = this.deps.context();
      ogg = this.deps.canPlayOgg();
    } catch {
      ctx = null;
    }
    // Before the unlock: nothing loads, and a later call tries again.
    if (!ctx) return Promise.resolve(null);
    const context = ctx;
    const loading = (async (): Promise<AudioBuffer | null> => {
      try {
        const response = await this.deps.fetch(sampleUrl(name, ogg, this.deps.base));
        if (!response.ok) return null;
        const data = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(data);
        this.ready.set(name, buffer);
        return buffer;
      } catch {
        // Sound is never worth an error: this one is skipped.
        return null;
      }
    })();
    this.loads.set(name, loading);
    return loading;
  }

  /** Every sample, in SAMPLE_ORDER: the short ones together, then the music. */
  async preloadAll(): Promise<void> {
    const short = SAMPLE_ORDER.filter((name) => name !== MUSIC_SAMPLE);
    await Promise.all(short.map((name) => this.load(name)));
    await this.load(MUSIC_SAMPLE);
  }
}

function canPlayOgg(): string {
  try {
    return typeof document === "undefined" ? "" : document.createElement("audio").canPlayType("audio/ogg; codecs=vorbis");
  } catch {
    return "";
  }
}

/** The game's one bank. */
export const samples = new SampleBank({
  context: () => audioOut()?.ctx ?? null,
  fetch: (url) => fetch(url),
  canPlayOgg,
  base: `${import.meta.env?.BASE_URL ?? "/"}sound/`
});

/** A Panjim or Tutorial session opened: load every sample in the background once the player has clicked. */
export function preloadSamples(): void {
  onAudioUnlock(() => {
    // After this click's own work: the decoding never competes with the frame the click starts.
    window.setTimeout(() => void samples.preloadAll().catch(() => {}), 0);
  });
}

/**
 * Section 36.4: one shot samples (the build sounds), each through its own gain at 0.8 of the master, at most two at
 * once (a third is dropped), each a little higher or lower (±4%) so a repeat never sounds the same.
 */
export const ONE_SHOT_GAIN = 0.8;
export const ONE_SHOT_MAX = 2;
export const ONE_SHOT_PITCH = 0.04;

export interface OneShotDeps {
  out: () => { ctx: BaseAudioContext; out: AudioNode } | null;
  buffer: (name: SampleName) => AudioBuffer | null;
  random: () => number;
}

/** "played", "dropped" (two already playing, or sound off) or "missing" (not loaded: the caller may play its tone). */
export type OneShotResult = "played" | "dropped" | "missing";

export class OneShots {
  private playing = 0;
  /** Every sample asked to play and played, in order (for the browser checks). */
  readonly played: SampleName[] = [];

  constructor(private readonly deps: OneShotDeps) {}

  get active(): number {
    return this.playing;
  }

  play(name: SampleName): OneShotResult {
    try {
      const io = this.deps.out();
      if (!io) return "dropped";
      const buffer = this.deps.buffer(name);
      if (!buffer) return "missing";
      if (this.playing >= ONE_SHOT_MAX) return "dropped";
      const src = io.ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 1 + (this.deps.random() * 2 - 1) * ONE_SHOT_PITCH;
      const gain = io.ctx.createGain();
      gain.gain.value = ONE_SHOT_GAIN;
      src.connect(gain).connect(io.out);
      this.playing++;
      src.onended = () => {
        this.playing = Math.max(0, this.playing - 1);
        try {
          gain.disconnect();
        } catch {
          // Already gone.
        }
      };
      src.start();
      this.played.push(name);
      if (this.played.length > 32) this.played.shift();
      return "played";
    } catch {
      return "dropped";
    }
  }
}

const oneShots = new OneShots({
  out: () => (soundEnabled() ? audioOut() : null),
  buffer: (name) => samples.get(name),
  random: Math.random
});
addAudioTestExtras(() => ({ samples: [...oneShots.played] }));

/** Plays a one shot sample; false only when it has not loaded, so the caller can play its tone instead. */
export function playSample(name: SampleName): boolean {
  const result = oneShots.play(name);
  // Not loaded yet (a build in the first seconds): ask for it, for next time.
  if (result === "missing") void samples.load(name);
  return result !== "missing";
}

/** Section 36.4: which sample a defence lands with. The living coast ("bird") takes the next bird call. */
export const DEFENCE_SAMPLE: Record<string, SampleName | "bird"> = {
  seawall: "build_seawall",
  breakwater: "build_breakwater",
  small_dam: "build_dam",
  mangrove: "bird",
  khazan: "bird",
  dune: "bird",
  sandy_vegetation: "bird"
};

/** The birds' turn, one per living coast build: no call twice in a row. */
export const BIRD_CYCLE: readonly SampleName[] = [
  "bird_kingfisher",
  "bird_drongo",
  "bird_kite",
  "bird_eagle",
  "bird_kingfisher",
  "bird_kite",
  "bird_drongo",
  "bird_eagle"
];

/** A session's build sounds: the bird cycle's place lives here, and starts again with each session. */
export class BuildSounds {
  private birds = 0;

  /** The sample for a build of `elementId`, or null for anything without one (it keeps the synthesised tone). */
  sampleFor(elementId: string): SampleName | null {
    const sample = DEFENCE_SAMPLE[elementId];
    if (!sample) return null;
    if (sample !== "bird") return sample;
    return BIRD_CYCLE[this.birds++ % BIRD_CYCLE.length];
  }
}
