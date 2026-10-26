import { describe, expect, it } from "vitest";
import { IdleReset, IDLE_RESET_MS, IDLE_WARN_MS } from "../src/app/idleReset";

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

  it("warns for the last 30 s, counting down; any input cancels the warning (Section 34)", () => {
    const told: (number | null)[] = [];
    let fired = 0;
    const idle = new IdleReset(() => fired++, () => false, IDLE_RESET_MS, 0, (left) => told.push(left));
    expect(IDLE_WARN_MS).toBe(30_000);
    expect(idle.check(IDLE_RESET_MS - IDLE_WARN_MS - 1000)).toBe(false);
    expect(told).toEqual([]);
    idle.check(IDLE_RESET_MS - 30_000);
    idle.check(IDLE_RESET_MS - 12_500);
    expect(told).toEqual([30, 13]);
    expect(idle.warning).toBe(true);
    idle.poke(IDLE_RESET_MS - 10_000);
    expect(told[told.length - 1]).toBe(null);
    expect(idle.warning).toBe(false);
    expect(idle.check(IDLE_RESET_MS + 1000)).toBe(false);
    expect(fired).toBe(0);
    // Left alone again: the warning, then the reset, the warning taken down as it goes.
    expect(idle.check(IDLE_RESET_MS - 10_000 + IDLE_RESET_MS)).toBe(true);
    expect(fired).toBe(1);
    expect(told[told.length - 1]).toBe(null);
  });
});

