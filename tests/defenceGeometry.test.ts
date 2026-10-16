import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createDefenceGeometry, defenceTriangleCounts, DEFENCE_IDS, facingAngle, PART } from "../src/render/defenceGeometry";

/** Section 14: the redrawn defences' own rules, where a unit test can reach them (the look itself: tools/defenceShots.ts). */
describe("the redrawn defences", () => {
  it("are low-poly, carry the shader's tags and a ring, and use no red", () => {
    const counts = defenceTriangleCounts();
    for (const id of DEFENCE_IDS) {
      const g = createDefenceGeometry(id)!;
      expect(g.getAttribute("aSway"), id).toBeTruthy();
      expect(g.getAttribute("aPart"), id).toBeTruthy();
      expect(counts[id], id).toBeLessThan(2500);
      const part = g.getAttribute("aPart");
      let ring = 0;
      for (let i = 0; i < part.count; i++) if (part.getX(i) === PART.ring) ring++;
      expect(ring, `${id} has a ring`).toBeGreaterThan(0);
      // No red anywhere: red is the roofs' and the heat's.
      // Judged by hue as the eye sees it (sRGB): ochre, sand and bark are fine; red is not.
      const c = g.getAttribute("color");
      const hsl = { h: 0, s: 0, l: 0 };
      for (let i = 0; i < c.count; i++) {
        new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)).getHSL(hsl);
        const red = (hsl.h < 0.03 || hsl.h > 0.95) && hsl.s > 0.4 && hsl.l > 0.15 && hsl.l < 0.85;
        expect(red, `${id} vertex ${i} is red (hue ${(hsl.h * 360).toFixed(0)}°)`).toBe(false);
      }
    }
  });

  it("face the sea in sixths of a turn, so the ring stays on the tile's outline", () => {
    for (const [dx, dz] of [[1, 0], [0.3, 1], [-1, -0.2], [0.5, -0.9]]) {
      const a = facingAngle(dx, dz);
      expect(Math.abs(a / (Math.PI / 3) - Math.round(a / (Math.PI / 3)))).toBeLessThan(1e-9);
    }
    expect(facingAngle(1, 0)).toBeCloseTo(0);
  });

  it("is only for the seven defences: houses and the rest keep their models", () => {
    expect(createDefenceGeometry("house")).toBeNull();
    expect(createDefenceGeometry("sand_mining")).toBeNull();
  });
});
