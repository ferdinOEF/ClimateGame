import { audioOut, onAudioUnlock, addAudioTestExtras } from "./audioHooks";
import { MUSIC_SAMPLE, samples } from "./sampleBank";

/**
 * Section 36: the music, one loop (public/sound/farar_far_panjim_loop) under Panjim and the Tutorial.
 *
 * Its level is a small state machine (`MusicMachine`, pure, with an injected clock): full while the player builds,
 * off while a storm plays (the storm's own sound, stormSound.ts, takes over), soft for the finale. The audio side
 * only follows the machine, with `setTargetAtTime` on the music's own gain, which feeds the master gain in
 * audioHooks: the sound switch (S) and the volume cover the music as they cover everything else.
 *
 * The loop's last half second fades out (it is about 8 dB under its first), so a straight loop would step. Two
 * sources take turns instead: each next one starts 1.5 s before the current one ends, and the two cross over with
 * equal power fades.
 *
 * Nothing plays before the player's first click, nothing is fetched before it, and any failure is swallowed.
 */
export type MusicState = "off" | "full" | "soft";

/** The levels, as fractions of the master gain. */
export const MUSIC_LEVEL: Record<MusicState, number> = { off: 0, full: 0.35, soft: 0.2 };

/** Fade times, seconds: out to silence (a storm), in to full, between full and soft, and on closing before the stop. */
export const MUSIC_FADE = { out: 2.5, in: 4, soft: 1.5, close: 1 } as const;

/** setTargetAtTime's time constant for a fade of `seconds`: within 2% of the target when the fade is over. */
export function fadeTimeConstant(seconds: number): number {
  return seconds / 4;
}

export type MusicEvent = "open" | "stormBegin" | "stormEnd" | "finale" | "close";

export class MusicMachine {
  state: MusicState = "off";
  /** A Panjim or Tutorial session is open. */
  isOpen = false;
  private from = 0;
  private since = 0;
  private fadeSeconds: number = MUSIC_FADE.close;

  constructor(private readonly now: () => number) {}

  /** Moves to the event's state; returns whether anything changed. */
  send(event: MusicEvent): boolean {
    const was = this.state;
    let next: MusicState = was;
    let fade = this.fadeSeconds;
    if (event === "open") {
      this.isOpen = true;
      next = "full";
      fade = MUSIC_FADE.in;
    } else if (event === "close") {
      if (!this.isOpen) return false;
      this.isOpen = false;
      next = "off";
      fade = MUSIC_FADE.close;
    } else if (!this.isOpen) {
      return false;
    } else if (event === "stormBegin") {
      next = "off";
      fade = MUSIC_FADE.out;
    } else if (event === "stormEnd") {
      // Back to full after a storm; the finale's soft level is left alone.
      if (was !== "off") return false;
      next = "full";
      fade = MUSIC_FADE.in;
    } else if (event === "finale") {
      next = "soft";
      fade = was === "off" ? MUSIC_FADE.in : MUSIC_FADE.soft;
    }
    if (next === was && event !== "open") return false;
    this.from = this.levelAt();
    this.since = this.now();
    this.fadeSeconds = fade;
    this.state = next;
    return true;
  }

  /** The level the audio is heading for, and how long it takes to get there. */
  target(): { level: number; fade: number } {
    return { level: MUSIC_LEVEL[this.state], fade: this.fadeSeconds };
  }

  /** The level now, as `setTargetAtTime` moves it. */
  levelAt(at = this.now()): number {
    const to = MUSIC_LEVEL[this.state];
    const t = Math.max(0, at - this.since);
    return to + (this.from - to) * Math.exp(-t / fadeTimeConstant(this.fadeSeconds));
  }
}

/** The crossover at the loop point, seconds. */
export const LOOP_CROSSFADE = 1.5;

function curve(rise: boolean): Float32Array {
  const points = new Float32Array(32);
  for (let i = 0; i < points.length; i++) {
    const x = (i / (points.length - 1)) * (Math.PI / 2);
    points[i] = rise ? Math.sin(x) : Math.cos(x);
  }
  return points;
}

class MusicPlayer {
  readonly machine = new MusicMachine(() => performance.now() / 1000);
  private gain: GainNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  /** Bumped on every teardown: a late decode or a late `onended` from before it does nothing. */
  private generation = 0;
  private nextAt = 0;
  private stopTimer = 0;
  private starting = false;

  /** A Panjim or Tutorial session opened: the music starts (on the first click, if there has been none). */
  open(): void {
    window.clearTimeout(this.stopTimer);
    this.machine.send("open");
    this.follow();
    this.log("open");
    // After the click's own work, like the preload (sampleBank.ts): nothing starts loading inside the click's frame.
    onAudioUnlock(() => window.setTimeout(() => void this.start(), 0));
  }

  /** The session closed (Exit, Play again, the idle reset): a one second fade, then the loop stops. */
  close(): void {
    if (!this.machine.send("close")) return;
    this.follow();
    this.log("close");
    window.clearTimeout(this.stopTimer);
    this.stopTimer = window.setTimeout(() => this.teardown(), MUSIC_FADE.close * 1000 + 50);
  }

  send(event: "stormBegin" | "stormEnd" | "finale"): void {
    if (this.machine.send(event)) this.follow();
    this.log(event);
  }

  /** The last few events and the state each left, for the browser checks. */
  readonly history: string[] = [];
  private log(event: string): void {
    this.history.push(`${event}:${this.machine.state}`);
    if (this.history.length > 24) this.history.shift();
  }

  private follow(): void {
    const io = audioOut();
    if (!this.gain || !io) return;
    try {
      const { level, fade } = this.machine.target();
      this.gain.gain.setTargetAtTime(level, io.ctx.currentTime, fadeTimeConstant(fade));
    } catch {
      // Sound is decoration.
    }
  }

  private async start(): Promise<void> {
    if (this.gain || this.starting || !this.machine.isOpen) return;
    this.starting = true;
    const generation = this.generation;
    try {
      // After the seven short samples (Section 36.1): the music is the last to load.
      await samples.preloadAll();
      const buffer = samples.get(MUSIC_SAMPLE);
      const io = audioOut();
      if (!buffer || !io || generation !== this.generation || !this.machine.isOpen || this.gain) return;
      const gain = io.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(io.out);
      this.gain = gain;
      this.follow();
      const step = buffer.duration - Math.min(LOOP_CROSSFADE, buffer.duration / 4);
      const first = io.ctx.currentTime + 0.05;
      this.queue(io.ctx, buffer, first, false, generation);
      this.nextAt = first + step;
      this.queue(io.ctx, buffer, this.nextAt, true, generation);
      this.nextAt += step;
    } catch {
      // Sound is decoration.
    } finally {
      this.starting = false;
    }
    // Closed and opened again while the file was loading: start for the new session.
    if (generation !== this.generation && this.machine.isOpen && !this.gain) void this.start();
  }

  /** One pass of the loop at `at`, fading in over the crossover (but the first) and out over its last 1.5 s. */
  private queue(ctx: AudioContext, buffer: AudioBuffer, at: number, fadeIn: boolean, generation: number): void {
    if (!this.gain) return;
    const cross = Math.min(LOOP_CROSSFADE, buffer.duration / 4);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const env = ctx.createGain();
    if (fadeIn) env.gain.setValueCurveAtTime(curve(true), at, cross);
    else env.gain.setValueAtTime(1, at);
    env.gain.setValueCurveAtTime(curve(false), at + buffer.duration - cross, cross);
    src.connect(env).connect(this.gain);
    src.onended = () => {
      try {
        env.disconnect();
      } catch {
        // Already gone.
      }
      this.sources = this.sources.filter((s) => s !== src);
      // While the music plays there is always one pass queued after the current one.
      if (generation !== this.generation || !this.gain) return;
      try {
        this.queue(ctx, buffer, this.nextAt, true, generation);
        this.nextAt += buffer.duration - cross;
      } catch {
        // Sound is decoration.
      }
    };
    src.start(at);
    src.stop(at + buffer.duration);
    this.sources.push(src);
  }

  private teardown(): void {
    if (this.machine.isOpen) return;
    this.generation++;
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources = [];
    try {
      this.gain?.disconnect();
    } catch {
      // Already gone.
    }
    this.gain = null;
  }

  /** For the browser checks: the state, and whether a loop is playing. */
  probe(): { state: MusicState; playing: boolean; history: string[] } {
    return { state: this.machine.state, playing: this.sources.length > 0, history: [...this.history] };
  }
}

const player = new MusicPlayer();
addAudioTestExtras(() => {
  const { state, playing, history } = player.probe();
  return { music: state, musicPlaying: playing, musicHistory: history };
});

export const music = {
  open: (): void => player.open(),
  close: (): void => player.close(),
  stormBegin: (): void => player.send("stormBegin"),
  stormEnd: (): void => player.send("stormEnd"),
  finale: (): void => player.send("finale")
};

/** The music's state now ("off" | "full" | "soft"). */
export function musicState(): MusicState {
  return player.probe().state;
}

/** For the browser checks: is a loop source actually running. */
export function musicPlaying(): boolean {
  return player.probe().playing;
}
