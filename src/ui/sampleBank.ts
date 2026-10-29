import { audioOut, onAudioUnlock } from "./audioHooks";

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
