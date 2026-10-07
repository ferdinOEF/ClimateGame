import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_HEADROOM_CAP, ElementReactions } from "../src/render/elementReactions";
import { MAX_CONCURRENT } from "../src/render/reactionAnimator";

interface FakeElement {
  key: string;
  elementId: string;
  x: number;
  y: number;
  z: number;
}

/** Any base works — the animator takes its clock from `tick()` — but a non-zero one catches code that assumes time starts at 0. */
const T0 = 1_000_000;

function animatorOf(reactions: ElementReactions): { activeCount: number } {
  return (reactions as unknown as { animator: { activeCount: number } }).animator;
}

describe("ElementReactions ambient scheduler", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spawns reactions on its own, with no trigger() call from outside", () => {
    const elements: FakeElement[] = [
      { key: "0,0", elementId: "mangrove", x: 0, y: 0, z: 0 },
      { key: "1,0", elementId: "house", x: 2, y: 0, z: 0 }
    ];
    const reactions = new ElementReactions();
    reactions.setAmbientSource(() => elements);
    const triggerSpy = vi.spyOn(reactions, "trigger");

    expect(reactions.lastCombo).toEqual([]);
    let sawActive = false;
    for (let t = 0; t <= 15000; t += 100) {
      reactions.tick(T0 + t);
      if (animatorOf(reactions).activeCount > 0) sawActive = true;
    }

    expect(triggerSpy).toHaveBeenCalled();
    expect(sawActive).toBe(true);
    // Mangrove is the only element here that records its pick — so a non-empty lastCombo proves the ambient timer reached it.
    expect(reactions.lastCombo.length).toBeGreaterThan(0);
    // Both elements got a turn, and each repeats (4.5-11s cycle) rather than firing once.
    const calls = triggerSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContain("mangrove");
    expect(calls).toContain("house");
  });

  it("repeats an element's reaction on a timer, not just once", () => {
    const elements: FakeElement[] = [{ key: "0,0", elementId: "mangrove", x: 0, y: 0, z: 0 }];
    const reactions = new ElementReactions();
    reactions.setAmbientSource(() => elements);
    const triggerSpy = vi.spyOn(reactions, "trigger");

    for (let t = 0; t <= 40000; t += 100) reactions.tick(T0 + t);

    expect(triggerSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("starts nothing before an element's first (staggered) due time", () => {
    const elements: FakeElement[] = [{ key: "0,0", elementId: "mangrove", x: 0, y: 0, z: 0 }];
    const reactions = new ElementReactions();
    reactions.setAmbientSource(() => elements);
    const triggerSpy = vi.spyOn(reactions, "trigger");

    // Math.random is mocked to 0.5, so the first due time is 400 + 0.5*4500 = 2650ms out.
    reactions.tick(T0);
    reactions.tick(T0 + 1000);
    reactions.tick(T0 + 2000);
    expect(triggerSpy).not.toHaveBeenCalled();
    reactions.tick(T0 + 2700);
    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });

  it("spawns at most one ambient reaction per frame even when many are due at once", () => {
    const elements: FakeElement[] = Array.from({ length: 10 }, (_, i) => ({ key: `${i},0`, elementId: "house", x: i, y: 0, z: 0 }));
    const reactions = new ElementReactions();
    reactions.setAmbientSource(() => elements);
    const triggerSpy = vi.spyOn(reactions, "trigger");

    reactions.tick(T0); // registers every element's due time (all identical under the mocked RNG)
    let previous = 0;
    for (let t = 3000; t <= 3000 + 16 * 12; t += 16) {
      reactions.tick(T0 + t);
      const total = triggerSpy.mock.calls.length;
      expect(total - previous).toBeLessThanOrEqual(1);
      previous = total;
    }
    expect(previous).toBeGreaterThan(1); // they did all fire, just one frame apart
  });

  it("stops spawning for an element once it is removed", () => {
    const elements: FakeElement[] = [
      { key: "0,0", elementId: "mangrove", x: 0, y: 0, z: 0 },
      { key: "1,0", elementId: "house", x: 2, y: 0, z: 0 }
    ];
    const reactions = new ElementReactions();
    reactions.setAmbientSource(() => elements);
    const triggerSpy = vi.spyOn(reactions, "trigger");

    for (let t = 0; t <= 20000; t += 100) reactions.tick(T0 + t);
    expect(triggerSpy.mock.calls.some((c) => c[0] === "mangrove")).toBe(true);

    // Remove the mangrove (destroyed / board reset) and keep the house.
    elements.splice(0, 1);
    triggerSpy.mockClear();
    for (let t = 20000; t <= 60000; t += 100) reactions.tick(T0 + t);

    const after = triggerSpy.mock.calls.map((c) => c[0]);
    expect(after).not.toContain("mangrove");
    expect(after).toContain("house");
    // Its timer entry was cleaned up too, not left to leak.
    expect((reactions as unknown as { nextAmbient: Map<string, number> }).nextAmbient.has("0,0")).toBe(false);
  });

  it("cleans up timers even when one element is removed and another added in the same frame", () => {
    const elements: FakeElement[] = [{ key: "0,0", elementId: "house", x: 0, y: 0, z: 0 }];
    const reactions = new ElementReactions();
    reactions.setAmbientSource(() => elements);
    reactions.tick(T0);
    elements.splice(0, 1, { key: "9,9", elementId: "house", x: 9, y: 0, z: 9 }); // same count, different key
    reactions.tick(T0 + 10);
    const keys = [...(reactions as unknown as { nextAmbient: Map<string, number> }).nextAmbient.keys()];
    expect(keys).toEqual(["9,9"]);
  });

  it("never exceeds the animator's concurrent cap, even with a huge map of reacting elements", () => {
    // Real randomness here: the point is that no timing luck can push past the cap.
    vi.restoreAllMocks();
    const elements: FakeElement[] = Array.from({ length: 80 }, (_, i) => ({
      key: `${i},0`,
      elementId: i % 2 === 0 ? "mangrove" : "beachside_resort", // the two heaviest spawners (up to 3 and 4 meshes)
      x: i,
      y: 0,
      z: 0
    }));
    const reactions = new ElementReactions();
    reactions.setAmbientSource(() => elements);

    let peak = 0;
    for (let t = 0; t <= 90000; t += 16) {
      reactions.tick(T0 + t);
      peak = Math.max(peak, animatorOf(reactions).activeCount);
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT);
  });

  it("leaves room for a tap: ambient play alone stops short of the animator's cap", () => {
    vi.restoreAllMocks();
    const elements: FakeElement[] = Array.from({ length: 80 }, (_, i) => ({ key: `${i},0`, elementId: "mangrove", x: i, y: 0, z: 0 }));
    const reactions = new ElementReactions();
    reactions.setAmbientSource(() => elements);
    for (let t = 0; t <= 60000; t += 16) {
      reactions.tick(T0 + t);
      // A spawn can add up to three birds on top of the threshold it was checked against.
      expect(animatorOf(reactions).activeCount).toBeLessThan(AMBIENT_HEADROOM_CAP + 4);
    }
    const before = animatorOf(reactions).activeCount;
    reactions.trigger("house", 0, 0, 0); // three meshes
    expect(animatorOf(reactions).activeCount).toBe(before + 3);
  });

  it("treats an element with no reaction as a harmless no-op", () => {
    const elements: FakeElement[] = [{ key: "0,0", elementId: "some_future_element", x: 0, y: 0, z: 0 }];
    const reactions = new ElementReactions();
    reactions.setAmbientSource(() => elements);
    expect(() => {
      for (let t = 0; t <= 20000; t += 100) reactions.tick(T0 + t);
    }).not.toThrow();
    expect(animatorOf(reactions).activeCount).toBe(0);
  });

  it("does nothing, and does not throw, when no ambient source is set", () => {
    const reactions = new ElementReactions();
    expect(() => reactions.tick(T0 + 5000)).not.toThrow();
    expect(animatorOf(reactions).activeCount).toBe(0);
  });

  it("plays no ambient reactions under reduced motion, but still answers a tap", () => {
    const elements: FakeElement[] = [{ key: "0,0", elementId: "mangrove", x: 0, y: 0, z: 0 }];
    const reactions = new ElementReactions({ reducedMotion: true });
    reactions.setAmbientSource(() => elements);
    const triggerSpy = vi.spyOn(reactions, "trigger");
    for (let t = 0; t <= 30000; t += 100) reactions.tick(T0 + t);
    expect(triggerSpy).not.toHaveBeenCalled();
    reactions.trigger("mangrove", 0, 0, 0);
    expect(animatorOf(reactions).activeCount).toBeGreaterThan(0);
  });

  it("keeps a reaction's authored axis scale through the animation", async () => {
    const THREE = await import("three");
    const { ReactionAnimator } = await import("../src/render/reactionAnimator");
    const animator = new ReactionAnimator();
    animator.tick(T0);
    const ripple = new THREE.Object3D();
    ripple.scale.y = 0.05;
    animator.spawn(ripple, { durationMs: 1000, peakScale: 2 });
    animator.tick(T0 + 400); // in the hold phase
    expect(ripple.scale.x).toBeCloseTo(2);
    expect(ripple.scale.y).toBeCloseTo(0.1);
  });

  it("leaves tap-triggered reactions working exactly as before", () => {
    const reactions = new ElementReactions();
    reactions.trigger("mangrove", 0, 0, 0);
    expect(reactions.lastCombo.length).toBeGreaterThan(0);
    expect(animatorOf(reactions).activeCount).toBeGreaterThan(0);
  });
});

describe("ElementMeshManager.placedElements", () => {
  it("tracks place, destroy, rebuild and reset", async () => {
    const { ElementMeshManager } = await import("../src/render/elementMeshManager");
    const elements = new ElementMeshManager();
    const keys = () => [...elements.placedElements()].map((e) => e.key).sort();

    elements.place({ q: 0, r: 0 }, "mangrove", 0.2);
    elements.place({ q: 1, r: 0 }, "house", 0.4);
    expect(keys()).toEqual(["0,0:mangrove", "1,0:house"]);
    const house = [...elements.placedElements()].find((e) => e.elementId === "house")!;
    expect(house.y).toBe(0.4);

    elements.destroy({ q: 0, r: 0 }); // a storm loss or a player removal
    expect(keys()).toEqual(["1,0:house"]);

    elements.place({ q: 0, r: 0 }, "khazan", 0.2); // rebuilt as something else: a new key, so a fresh timer
    expect(keys()).toEqual(["0,0:khazan", "1,0:house"]);

    elements.reset(); // board reset
    expect(keys()).toEqual([]);
  });
});
