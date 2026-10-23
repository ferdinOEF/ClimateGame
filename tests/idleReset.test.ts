import { describe, expect, it } from "vitest";
import { IdleReset, IDLE_RESET_MS } from "../src/app/idleReset";

describe("idle reset (Section 30.12)", () => {
  it("goes back to the menu after 3 minutes with no input, once", () => {
    let fired = 0;
    const idle = new IdleReset(() => fired++, () => false, IDLE_RESET_MS, 0);
    expect(IDLE_RESET_MS).toBe(180_000);
    expect(idle.check(179_000)).toBe(false);
    expect(idle.check(180_000)).toBe(true);
    expect(idle.check(400_000)).toBe(false);
    expect(fired).toBe(1);
  });

  it("input starts the clock again", () => {
    let fired = 0;
    const idle = new IdleReset(() => fired++, () => false, IDLE_RESET_MS, 0);
    idle.poke(100_000);
    expect(idle.check(250_000)).toBe(false);
    expect(idle.check(280_000)).toBe(true);
  });

  it("never during a storm; the clock starts again when it ends", () => {
    let storm = true;
    let fired = 0;
    const idle = new IdleReset(() => fired++, () => storm, IDLE_RESET_MS, 0);
    expect(idle.check(500_000)).toBe(false);
    storm = false;
    expect(idle.check(600_000)).toBe(false);
    expect(idle.check(680_000)).toBe(true);
    expect(fired).toBe(1);
  });
});
