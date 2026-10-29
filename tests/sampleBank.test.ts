import { describe, expect, it } from "vitest";
import { MUSIC_SAMPLE, SAMPLE_ORDER, SampleBank, sampleUrl, type SampleBankDeps } from "../src/ui/sampleBank";

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
