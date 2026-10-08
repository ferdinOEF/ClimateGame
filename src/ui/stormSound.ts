import { audioOut, soundEnabled } from "./audioHooks";

/**
 * The storm's sound, synthesised with Web Audio: no audio files.
 *
 *   - wind: band-passed noise whose pitch wanders and whose level follows
 *     the storm's wind (so the lull before the hit is heard as a hush);
 *   - waves: low-passed noise swelling and ebbing slowly with the sea;
 *   - rain: high-passed noise following the rain;
 *   - thunder: a low noise burst with a long tail, after a flash;
 *   - a calm bed: two soft detuned tones and a few birdsong chirps, for the
 *     calm after the finale.
 *
 * Everything goes through the master gain in audioHooks, so the sound switch
 * (S) and the volume cover it. Nothing is built until the player has clicked
 * (audioOut is null before), and every call is safe to make with sound off.
 */
interface Graph {
  ctx: AudioContext;
  wind: GainNode;
  windFilter: BiquadFilterNode;
  waves: GainNode;
  rain: GainNode;
  calm: GainNode;
  noise: AudioBuffer;
  sources: AudioScheduledSourceNode[];
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Brownish noise: softer than white, closer to wind and surf.
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
    data[i] = last * 3.2;
  }
  return buffer;
}

export class StormSound {
  private graph: Graph | null = null;
  private calmTimer = 0;
  private disposed = false;

  private build(): Graph | null {
    if (this.disposed) return null;
    if (this.graph) return this.graph;
    const io = audioOut();
    if (!io) return null;
    const { ctx, out } = io;
    try {
      const noise = noiseBuffer(ctx);
      const sources: AudioScheduledSourceNode[] = [];
      const loop = (): AudioBufferSourceNode => {
        const src = ctx.createBufferSource();
        src.buffer = noise;
        src.loop = true;
        src.loopStart = Math.random();
        src.start(0, Math.random() * 1.5);
        sources.push(src);
        return src;
      };
      const gain = (): GainNode => {
        const g = ctx.createGain();
        g.gain.value = 0;
        g.connect(out);
        return g;
      };
      // Wind.
      const wind = gain();
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = "bandpass";
      windFilter.frequency.value = 420;
      windFilter.Q.value = 0.8;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.13;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 180;
      lfo.connect(lfoDepth).connect(windFilter.frequency);
      lfo.start();
      sources.push(lfo);
      loop().connect(windFilter).connect(wind);
      // Waves.
      const waves = gain();
      const waveFilter = ctx.createBiquadFilter();
      waveFilter.type = "lowpass";
      waveFilter.frequency.value = 340;
      const surf = ctx.createGain();
      surf.gain.value = 0.6;
      const surfLfo = ctx.createOscillator();
      surfLfo.frequency.value = 0.11;
      const surfDepth = ctx.createGain();
      surfDepth.gain.value = 0.4;
      surfLfo.connect(surfDepth).connect(surf.gain);
      surfLfo.start();
      sources.push(surfLfo);
      loop().connect(waveFilter).connect(surf).connect(waves);
      // Rain.
      const rain = gain();
      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = "highpass";
      rainFilter.frequency.value = 2400;
      loop().connect(rainFilter).connect(rain);
      // Calm bed.
      const calm = gain();
      for (const [freq, detune] of [[196, -4], [293.7, 5]] as const) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const soft = ctx.createGain();
        soft.gain.value = 0.18;
        osc.connect(soft).connect(calm);
        osc.start();
        sources.push(osc);
      }
      this.graph = { ctx, wind, windFilter, waves, rain, calm, noise, sources };
      return this.graph;
    } catch {
      return null;
    }
  }

  /** The storm's levels, 0–1 each, eased. */
  levels(wind: number, sea: number, rain: number): void {
    if (!soundEnabled()) return;
    const g = this.build();
    if (!g) return;
    const now = g.ctx.currentTime;
    g.wind.gain.setTargetAtTime(0.32 * wind * wind, now, 0.4);
    g.waves.gain.setTargetAtTime(0.18 + 0.4 * sea, now, 0.6);
    g.rain.gain.setTargetAtTime(0.12 * rain, now, 0.5);
  }

  /** Distant thunder: a low rumble, after the flash. */
  thunder(): void {
    if (!soundEnabled()) return;
    const g = this.build();
    if (!g) return;
    try {
      const now = g.ctx.currentTime;
      const src = g.ctx.createBufferSource();
      src.buffer = g.noise;
      const filter = g.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 140;
      const env = g.ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(0.5, now + 0.08);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
      const io = audioOut();
      if (!io) return;
      src.connect(filter).connect(env).connect(io.out);
      src.start(now, Math.random());
      src.stop(now + 2.7);
    } catch {
      // Sound is decoration.
    }
  }

  /** The calm after: a soft bed and a few birds, for `seconds`. */
  calm(seconds: number): void {
    if (!soundEnabled()) return;
    const g = this.build();
    if (!g) return;
    const now = g.ctx.currentTime;
    g.calm.gain.cancelScheduledValues(now);
    g.calm.gain.setTargetAtTime(0.08, now, 0.8);
    g.calm.gain.setTargetAtTime(0, now + seconds, 1.2);
    window.clearInterval(this.calmTimer);
    let chirps = Math.max(2, Math.round(seconds * 1.2));
    this.calmTimer = window.setInterval(() => {
      if (chirps-- <= 0) {
        window.clearInterval(this.calmTimer);
        return;
      }
      this.chirp();
    }, 700 + Math.random() * 400);
  }

  private chirp(): void {
    const g = this.graph;
    const io = audioOut();
    if (!g || !io || !soundEnabled()) return;
    try {
      const now = g.ctx.currentTime;
      const osc = g.ctx.createOscillator();
      osc.type = "sine";
      const base = 2400 + Math.random() * 1400;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * 1.35, now + 0.07);
      osc.frequency.exponentialRampToValueAtTime(base * 0.9, now + 0.14);
      const env = g.ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(0.04, now + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.connect(env).connect(io.out);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch {
      // Sound is decoration.
    }
  }

  /** Everything down to silence (the storm is over). */
  quiet(): void {
    const g = this.graph;
    if (!g) return;
    const now = g.ctx.currentTime;
    for (const node of [g.wind, g.waves, g.rain]) node.gain.setTargetAtTime(0, now, 1.2);
  }

  dispose(): void {
    this.disposed = true;
    window.clearInterval(this.calmTimer);
    const g = this.graph;
    if (!g) return;
    for (const src of g.sources) {
      try {
        src.stop();
      } catch {
        // Already stopped.
      }
    }
    for (const node of [g.wind, g.waves, g.rain, g.calm]) node.disconnect();
    this.graph = null;
  }
}
