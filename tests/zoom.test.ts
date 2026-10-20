import { describe, expect, it } from "vitest";
import { notchesBetween, wheelNotches, zoomedDistance, zoomTowardTarget, ZOOM_STEP } from "../src/render/zoomMath";

/** Section 22.3 (owner request): zoom by ratio, about 15% a notch, the same notch whatever unit the browser reports. */
describe("zoom", () => {
  it("moves about 15% of the distance a notch, the same at every distance", () => {
    expect(ZOOM_STEP).toBe(0.15);
    expect(zoomedDistance(40, 1, 8, 90)).toBeCloseTo(46, 6);
    expect(zoomedDistance(10, -1, 8, 90) / 10).toBeCloseTo(zoomedDistance(60, -1, 8, 90) / 60, 9);
  });

  it("stops cleanly at the limits", () => {
    expect(zoomedDistance(85, 3, 8, 90)).toBe(90);
    expect(zoomedDistance(9, -3, 8, 90)).toBe(8);
  });

  it("reads one notch the same in pixels (Chrome), lines (Firefox) and pages", () => {
    expect(wheelNotches(100, 0)).toBe(1);
    expect(wheelNotches(-100, 0)).toBe(-1);
    expect(wheelNotches(3, 1)).toBe(1);
    expect(wheelNotches(1, 2)).toBe(1);
  });

  // 44 to 8 is 12.2 notches at 15%: twelve full ones and a last short one that stops at the limit.
  it("takes 13 notches from the furthest opening view (44) to nearest (8), 18 from furthest (90); 41 and 1367 before", () => {
    expect(notchesBetween(44, 8)).toBe(13);
    expect(notchesBetween(90, 8)).toBe(18);
    // Before (Section 21): a notch moved the distance by deltaY x 0.02, about 2 units in Chrome, 0.06 in Firefox.
    expect(Math.ceil((90 - 8) / (100 * 0.02))).toBe(41);
    expect(Math.ceil((90 - 8) / (3 * 0.02))).toBe(1367);
  });

  it("keeps the ground under the pointer where it was", () => {
    const target = { x: 2, z: 3 };
    const pointer = { x: 10, z: -4 };
    const next = zoomTowardTarget(target, pointer, 40, 20);
    // The pointer's offset from the target halves with the distance; the pointer itself does not move.
    expect(next.x).toBeCloseTo(6, 9);
    expect(next.z).toBeCloseTo(-0.5, 9);
    expect(zoomTowardTarget(target, target, 40, 20)).toEqual(target);
  });
});
