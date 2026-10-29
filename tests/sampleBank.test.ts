import { describe, expect, it } from "vitest";
import { BuildSounds, DEFENCE_SAMPLE, MUSIC_SAMPLE, ONE_SHOT_CUT_FADE, ONE_SHOT_GAIN, ONE_SHOT_MAX, ONE_SHOT_PITCH, OneShots, SAMPLE_ORDER, SampleBank, sampleUrl, type SampleBankDeps } from "../src/ui/sampleBank";
import { CARD_NAME } from "../src/ui/panjim/defenceCards";

/** Section 36.1: the sample bank, on a fake audio context. */
function fakeBank(over: Partial<SampleBankDeps> = {}) {
  const fetched: string[] = [];
  const decoded: number[] = [];
  const ctx = {
    decodeAudioData: async (data: ArrayBuffer) => {
      decoded.push(data.byteLength);
      return { duration: 1 } as unknown as AudioBuffer;
    }
  } as unknown as BaseAudioContext;
  const deps: SampleBankDeps = {
    context: () => ctx,
    fetch: async (url) => {
      fetched.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    },
    canPlayOgg: () => "probably",
    base: "/sound/",
    ...over
  };
  return { bank: new SampleBank(deps), fetched, decoded };
}

describe("Section 36.1: the sample bank", () => {
  it("chooses the Ogg when the browser plays it, the MP3 when it does not", async () => {
    expect(sampleUrl("build_dam", "maybe")).toBe("/sound/build_dam.ogg");
    expect(sampleUrl("build_dam", "")).toBe("/sound/build_dam.mp3");
    const ogg = fakeBank();
    await ogg.bank.load("bird_kite");
    expect(ogg.fetched).toEqual(["/sound/bird_kite.ogg"]);
    const mp3 = fakeBank({ canPlayOgg: () => "" });
    await mp3.bank.load("bird_kite");
    expect(mp3.fetched).toEqual(["/sound/bird_kite.mp3"]);
  });

  it("fetches and decodes each sample once", async () => {
    const { bank, fetched, decoded } = fakeBank();
    const [a, b] = await Promise.all([bank.load("build_seawall"), bank.load("build_seawall")]);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(bank.get("build_seawall")).toBe(a);
    expect(fetched).toHaveLength(1);
    expect(decoded).toHaveLength(1);
  });

  it("tries the MP3 once when the Ogg fails to load or decode", async () => {
    let calls = 0;
    const { bank, fetched } = fakeBank({
      context: () => ({ decodeAudioData: async () => (calls++ === 0 ? Promise.reject(new Error("bad ogg")) : ({} as AudioBuffer)) }) as unknown as BaseAudioContext
    });
    await expect(bank.load("bird_drongo")).resolves.not.toBeNull();
    expect(fetched).toEqual(["/sound/bird_drongo.ogg", "/sound/bird_drongo.mp3"]);
  });

  it("resolves a failed fetch, a bad response or a failed decode to null without throwing", async () => {
    const thrown = fakeBank({ fetch: async () => Promise.reject(new Error("offline")) });
    await expect(thrown.bank.load("build_dam")).resolves.toBeNull();
    expect(thrown.bank.get("build_dam")).toBeNull();
    const missing = fakeBank({ fetch: async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) }) });
    await expect(missing.bank.load("build_dam")).resolves.toBeNull();
    const badDecode = fakeBank({
      context: () => ({ decodeAudioData: () => Promise.reject(new Error("bad data")) }) as unknown as BaseAudioContext
    });
    await expect(badDecode.bank.load("build_dam")).resolves.toBeNull();
  });

  it("loads nothing before the audio unlock, and tries again after it", async () => {
    let ctx: BaseAudioContext | null = null;
    const real = fakeBank();
    const { bank, fetched } = fakeBank({ context: () => ctx });
    await expect(bank.load("bird_eagle")).resolves.toBeNull();
    expect(fetched).toEqual([]);
    ctx = (real.bank as unknown as { deps: SampleBankDeps }).deps.context();
    await expect(bank.load("bird_eagle")).resolves.not.toBeNull();
    expect(fetched).toEqual(["/sound/bird_eagle.ogg"]);
  });

  it("preloads the seven short samples first and the music last", async () => {
    const { bank, fetched } = fakeBank();
    await bank.preloadAll();
    expect(SAMPLE_ORDER).toHaveLength(8);
    expect(fetched).toHaveLength(8);
    expect(fetched[7]).toBe(`/sound/${MUSIC_SAMPLE}.ogg`);
  });
});

describe("Section 36.4: the build sounds", () => {
  it("every one of the seven defences has its sound: the three built ones their own, the living coast a bird", () => {
    expect(Object.keys(CARD_NAME).sort()).toEqual(Object.keys(DEFENCE_SAMPLE).sort());
    const sounds = new BuildSounds();
    expect(sounds.sampleFor("seawall")).toBe("build_seawall");
    expect(sounds.sampleFor("breakwater")).toBe("build_breakwater");
    expect(sounds.sampleFor("small_dam")).toBe("build_dam");
    for (const id of ["mangrove", "khazan", "dune", "sandy_vegetation"]) expect(sounds.sampleFor(id)).toMatch(/^bird_/);
    expect(sounds.sampleFor("house")).toBeNull();
  });

  it("the birds take turns in the briefed order, never one twice in a row, and a new session starts again", () => {
    const sounds = new BuildSounds();
    const calls = Array.from({ length: 17 }, (_, i) => sounds.sampleFor(i % 2 ? "dune" : "mangrove"));
    expect(calls.slice(0, 8)).toEqual(["bird_kingfisher", "bird_drongo", "bird_kite", "bird_eagle", "bird_kingfisher", "bird_kite", "bird_drongo", "bird_eagle"]);
    expect(calls.slice(8, 16)).toEqual(calls.slice(0, 8));
    for (let i = 1; i < calls.length; i++) expect(calls[i]).not.toBe(calls[i - 1]);
    // A built defence between two birds does not move the cycle.
    const mixed = new BuildSounds();
    expect([mixed.sampleFor("mangrove"), mixed.sampleFor("seawall"), mixed.sampleFor("khazan")]).toEqual(["bird_kingfisher", "build_seawall", "bird_drongo"]);
    expect(new BuildSounds().sampleFor("khazan")).toBe("bird_kingfisher");
  });

  it("plays at most two at once, each at 0.8 of the master with a pitch within 4%; a third cuts the oldest with a 100 ms fade", async () => {
    type FakeSource = { playbackRate: { value: number }; onended: (() => void) | null; stoppedAt: number | null };
    type FakeGain = { gain: { value: number; ramps: [number, number][] } };
    const sources: FakeSource[] = [];
    const made: FakeGain[] = [];
    const ctx = {
      currentTime: 10,
      createBufferSource: () => {
        const src = {
          buffer: null,
          playbackRate: { value: 1 },
          onended: null as (() => void) | null,
          stoppedAt: null as number | null,
          connect: (g: unknown) => g,
          start: () => {},
          stop(at: number) {
            src.stoppedAt = at;
          }
        };
        sources.push(src);
        return src;
      },
      createGain: () => {
        const gain = {
          value: 1,
          ramps: [] as [number, number][],
          cancelScheduledValues: () => {},
          setValueAtTime: () => {},
          linearRampToValueAtTime: (v: number, t: number) => gain.ramps.push([v, t])
        };
        const g = { gain, connect: (n: unknown) => n, disconnect: () => {} };
        made.push(g);
        return g;
      }
    } as unknown as BaseAudioContext;
    let r = 0;
    const shots = new OneShots({ out: () => ({ ctx, out: {} as AudioNode }), buffer: () => ({}) as AudioBuffer, random: () => [0, 1, 0.5][r++ % 3] });
    expect(shots.play("build_dam")).toBe("played");
    expect(shots.play("bird_kite")).toBe("played");
    expect(shots.active).toBe(2);
    // The third: the oldest (the dam) fades to 0 over 100 ms and stops; the new one plays; still two at once.
    expect(shots.play("bird_eagle")).toBe("played");
    expect(shots.active).toBe(2);
    expect(made[0].gain.ramps).toEqual([[0, 10 + ONE_SHOT_CUT_FADE]]);
    expect(sources[0].stoppedAt).toBeCloseTo(10.1, 9);
    expect(sources[1].stoppedAt).toBeNull();
    // The cut one ending later does not free the place of one still playing.
    sources[0].onended!();
    expect(shots.active).toBe(2);
    sources[1].onended!();
    expect(shots.active).toBe(1);
    expect(shots.play("build_seawall")).toBe("played");
    expect(sources[2].stoppedAt).toBeNull();
    expect(shots.played).toEqual(["build_dam", "bird_kite", "bird_eagle", "build_seawall"]);
    const rates = sources.map((s) => s.playbackRate.value);
    expect(rates[0]).toBeCloseTo(1 - ONE_SHOT_PITCH, 9);
    expect(rates[1]).toBeCloseTo(1 + ONE_SHOT_PITCH, 9);
    expect(rates[2]).toBeCloseTo(1, 9);
    expect(ONE_SHOT_MAX).toBe(2);
    expect(ONE_SHOT_GAIN).toBe(0.8);
    expect(ONE_SHOT_CUT_FADE).toBe(0.1);
    expect(made.slice(1).every((g) => g.gain.value === 0.8)).toBe(true);
  });

  it("says missing when the sample has not loaded, and never throws", () => {
    expect(new OneShots({ out: () => ({ ctx: {} as BaseAudioContext, out: {} as AudioNode }), buffer: () => null, random: Math.random }).play("build_dam")).toBe("missing");
    expect(new OneShots({ out: () => null, buffer: () => ({}) as AudioBuffer, random: Math.random }).play("build_dam")).toBe("dropped");
    const broken = { createBufferSource: () => { throw new Error("no audio"); } } as unknown as BaseAudioContext;
    expect(new OneShots({ out: () => ({ ctx: broken, out: {} as AudioNode }), buffer: () => ({}) as AudioBuffer, random: Math.random }).play("build_dam")).toBe("dropped");
  });
});
