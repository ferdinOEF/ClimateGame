import { describe, expect, it } from "vitest";
import { FrameSampler, SAMPLE_SECONDS, autoStep, nextChoice } from "../src/core/quality";

describe("graphics quality", () => {
  it("steps down one level at a time when slow, never up", () => {
    expect(autoStep("high", 60)).toBe("high");
    expect(autoStep("high", 30)).toBe("medium");
    expect(autoStep("medium", 30)).toBe("medium");
    expect(autoStep("medium", 12)).toBe("low");
    expect(autoStep("low", 5)).toBe("low");
    expect(autoStep("low", 120)).toBe("low");
  });

  it("cycles Auto, Low, Medium, High", () => {
    expect(nextChoice("auto")).toBe("low");
    expect(nextChoice("low")).toBe("medium");
    expect(nextChoice("medium")).toBe("high");
    expect(nextChoice("high")).toBe("auto");
  });

  it("averages frames over a sample and restarts after a hidden tab", () => {
    const sampler = new FrameSampler();
    let last: number | null = null;
    let result: number | null = null;
    for (let t = 0; t <= SAMPLE_SECONDS * 1000 + 20; t += 20) {
      result = sampler.frame(t, last) ?? result;
      last = t;
    }
    expect(result).toBeCloseTo(50, 0);
    // A two-second gap restarts the sample rather than reading as 0.5 fps.
    expect(sampler.frame(last! + 2000, last)).toBeNull();
  });
});
