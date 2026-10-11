import { describe, expect, it } from "vitest";
import { RISK_INTRO, RiskIntroGate, componentsFor, frameAt, riskIntroMode, timeline } from "../src/core/riskIntro";

describe("first-warning risk sequence", () => {
  it("plays on the first warning only: never on the second or third", () => {
    const gate = new RiskIntroGate();
    expect(gate.offer("c1-cyclone")).toBe(true);
    expect(gate.offer("c1-cyclone")).toBe(false); // the same warning again (another quarter)
    expect(gate.offer("c2-flood")).toBe(false);
    expect(gate.offer("c3-compound")).toBe(false);
  });

  it("a first warning seen while a menu was open still plays once the player is free", () => {
    const gate = new RiskIntroGate();
    gate.see("c1-cyclone"); // showing, but blocked: not offered
    expect(gate.spent).toBe(false);
    expect(gate.offer("c1-cyclone")).toBe(true);
    expect(gate.spent).toBe(true);
  });

  it("if the first warning passes without playing, a later one never plays", () => {
    const gate = new RiskIntroGate();
    gate.see("c1-cyclone");
    gate.see("c2-flood");
    expect(gate.spent).toBe(true);
    expect(gate.offer("c2-flood")).toBe(false);
  });

  it("a restored run that already saw it does not play it again", () => {
    const gate = new RiskIntroGate();
    gate.markSpent();
    expect(gate.offer("c1-cyclone")).toBe(false);
  });

  it("reduced motion and Low quality create neither the particles nor the shader", () => {
    expect(componentsFor(riskIntroMode(true, "high"))).toEqual({ particles: false, shader: false });
    expect(componentsFor(riskIntroMode(false, "low"))).toEqual({ particles: false, shader: false });
    expect(componentsFor(riskIntroMode(true, "low"))).toEqual({ particles: false, shader: false });
    expect(componentsFor(riskIntroMode(false, "medium"))).toEqual({ particles: true, shader: true });
    expect(componentsFor(riskIntroMode(false, "high"))).toEqual({ particles: true, shader: true });
  });

  it("full: fill to 50%, wave across in 3 s, rest at 20%, fold at 10 s, fly, land", () => {
    const c = RISK_INTRO;
    expect(frameAt(c.fillInSeconds, "full").aheadOpacity).toBeCloseTo(c.fillOpacity);
    const mid = frameAt(1.5, "full");
    expect(mid.crest).toBeGreaterThan(0.3);
    expect(mid.crest).toBeLessThan(0.7);
    expect(mid.behindOpacity).toBeLessThan(mid.aheadOpacity);
    expect(frameAt(c.waveSeconds + 0.2, "full").droplets).toBeCloseTo(0.2);
    const rest = frameAt(6, "full");
    expect(rest.aheadOpacity).toBe(c.restOpacity);
    expect(rest.behindOpacity).toBe(c.restOpacity);
    expect(rest.crest).toBeNull();
    expect(frameAt(c.holdSeconds + c.foldSeconds / 2, "full").fold).toBeCloseTo(0.5, 1);
    const tl = timeline("full");
    expect(frameAt(tl.foldEnd + c.flightSeconds / 2, "full").flight).toBeCloseTo(0.5, 1);
    expect(frameAt(tl.flightEnd + 0.1, "full").landing).toBe(true);
    expect(frameAt(tl.end, "full").done).toBe(true);
  });

  it("the motion is eased, not linear: the crest starts and ends slowly", () => {
    const early = frameAt(0.3, "full").crest!;
    const middle = frameAt(1.5, "full").crest! - frameAt(1.2, "full").crest!;
    expect(early).toBeLessThan(middle);
  });

  it("reduced motion: no wave, fold or flight; eases to rest over 1 s, fades out, then the button pulses", () => {
    const c = RISK_INTRO;
    const tl = timeline("reduced");
    for (let t = 0; t < tl.end; t += 0.1) {
      const f = frameAt(t, "reduced");
      expect(f.crest).toBeNull();
      expect(f.fold).toBeNull();
      expect(f.flight).toBeNull();
      expect(f.droplets).toBeNull();
    }
    expect(frameAt(c.fillInSeconds + c.reducedEaseSeconds, "reduced").aheadOpacity).toBeCloseTo(c.restOpacity);
    expect(frameAt(tl.rest + c.reducedFadeSeconds / 2, "reduced").aheadOpacity).toBeLessThan(c.restOpacity);
    expect(frameAt(tl.fadeEnd + 0.01, "reduced").aheadOpacity).toBeCloseTo(0, 2);
    expect(frameAt(tl.fadeEnd + 0.1, "reduced").landing).toBe(true);
  });

  it("Low quality: no wave, no fold; the sheet rests at 20% then a disc flies", () => {
    const c = RISK_INTRO;
    expect(frameAt(1.5, "flat").crest).toBeNull();
    expect(frameAt(6, "flat").aheadOpacity).toBeCloseTo(c.restOpacity);
    expect(frameAt(c.holdSeconds + 0.1, "flat").fold).toBeNull();
    expect(frameAt(c.holdSeconds + c.flightSeconds / 2, "flat").flight).toBeCloseTo(0.5, 1);
    // The flat sheet fades out over the start of the flight instead of vanishing in one frame.
    expect(frameAt(c.holdSeconds + 0.01, "flat").aheadOpacity).toBeGreaterThan(0.15);
    expect(frameAt(c.holdSeconds + c.flatSheetFadeSeconds + 0.01, "flat").aheadOpacity).toBe(0);
  });

  it("reduced motion's glow is not cut short", () => {
    const tl = timeline("reduced");
    expect(tl.end - tl.fadeEnd).toBeGreaterThanOrEqual(0.9 - 1e-9);
  });

  it("every timing lives in the data file", () => {
    for (const key of ["fillColor", "fillOpacity", "restOpacity", "waveSeconds", "holdSeconds", "flightSeconds"] as const) expect(RISK_INTRO[key]).toBeDefined();
    expect(RISK_INTRO.restOpacity).toBe(0.2);
    expect(RISK_INTRO.waveSeconds).toBe(3);
    expect(RISK_INTRO.holdSeconds).toBe(10);
  });
});
