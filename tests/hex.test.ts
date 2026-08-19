import { describe, expect, it } from "vitest";
import {
  HEX_DIRECTIONS,
  axialDistance,
  axialEqual,
  axialKey,
  edgeIndexTo,
  neighbor,
  neighbors,
  oppositeEdge
} from "../src/core/hex";

describe("hex neighbor math", () => {
  it("produces 6 distinct neighbors for the origin", () => {
    const ns = neighbors({ q: 0, r: 0 });
    expect(ns).toHaveLength(6);
    const keys = new Set(ns.map(axialKey));
    expect(keys.size).toBe(6);
  });

  it("neighbor(coord, i) matches HEX_DIRECTIONS offset", () => {
    const origin = { q: 2, r: -1 };
    for (let i = 0; i < 6; i++) {
      const n = neighbor(origin, i);
      expect(n.q).toBe(origin.q + HEX_DIRECTIONS[i].q);
      expect(n.r).toBe(origin.r + HEX_DIRECTIONS[i].r);
    }
  });

  it("wraps negative/overflow direction indices", () => {
    expect(axialEqual(neighbor({ q: 0, r: 0 }, 6), neighbor({ q: 0, r: 0 }, 0))).toBe(true);
    expect(axialEqual(neighbor({ q: 0, r: 0 }, -1), neighbor({ q: 0, r: 0 }, 5))).toBe(true);
  });
});

describe("axialDistance", () => {
  it("is 0 for a hex to itself", () => {
    expect(axialDistance({ q: 3, r: -2 }, { q: 3, r: -2 })).toBe(0);
  });

  it("is 1 between adjacent hexes", () => {
    const origin = { q: 0, r: 0 };
    for (const n of neighbors(origin)) {
      expect(axialDistance(origin, n)).toBe(1);
    }
  });

  it("is symmetric", () => {
    const a = { q: 5, r: -3 };
    const b = { q: -2, r: 4 };
    expect(axialDistance(a, b)).toBe(axialDistance(b, a));
  });

  it("matches known ring distances", () => {
    expect(axialDistance({ q: 0, r: 0 }, { q: 2, r: 0 })).toBe(2);
    expect(axialDistance({ q: 0, r: 0 }, { q: 2, r: -2 })).toBe(2);
  });
});

describe("edge adjacency", () => {
  it("finds the direction index between adjacent hexes", () => {
    const origin = { q: 0, r: 0 };
    for (let i = 0; i < 6; i++) {
      const n = neighbor(origin, i);
      expect(edgeIndexTo(origin, n)).toBe(i);
    }
  });

  it("returns null for non-adjacent hexes", () => {
    expect(edgeIndexTo({ q: 0, r: 0 }, { q: 5, r: 5 })).toBeNull();
    expect(edgeIndexTo({ q: 0, r: 0 }, { q: 0, r: 0 })).toBeNull();
  });

  it("opposite edges point back at each other", () => {
    const origin = { q: 0, r: 0 };
    for (let i = 0; i < 6; i++) {
      const n = neighbor(origin, i);
      const back = edgeIndexTo(n, origin);
      expect(back).toBe(oppositeEdge(i));
    }
  });
});
