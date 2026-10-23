import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { KhazanPeople } from "../src/render/khazanPeople";

/** Section 30.6: people in the khazans: four instanced meshes in all, hidden in a storm, still with Calm motion. */
describe("people in the khazan (Section 30.6)", () => {
  const spots = Array.from({ length: 12 }, (_, i) => ({ x: i * 2, y: 0.3, z: 0 }));
  const meshes = (p: KhazanPeople) => p.group.children as THREE.InstancedMesh[];

  it("three transplanters (one with a head cover) and one net caster per khazan, in four draw calls whatever the count", () => {
    const p = new KhazanPeople(new THREE.Scene());
    p.setKhazans(spots);
    p.tick(1000);
    const [covered, bare, fisher] = meshes(p);
    expect(meshes(p)).toHaveLength(4);
    expect(covered.count).toBe(12);
    expect(bare.count).toBe(24);
    expect(fisher.count).toBe(12);
    expect(p.drawCalls).toBe(4);
  });

  it("the net goes out, lies on the water and comes back every few seconds", () => {
    const p = new KhazanPeople(new THREE.Scene());
    p.setKhazans([spots[0]]);
    const net = meshes(p)[3];
    let out = 0;
    let back = 0;
    let was = false;
    for (let t = 0; t < 20_000; t += 50) {
      p.tick(t);
      const on = net.count > 0;
      if (on && !was) out++;
      if (!on && was) back++;
      was = on;
    }
    expect(out).toBeGreaterThanOrEqual(3);
    expect(back).toBeGreaterThanOrEqual(3);
  });

  it("hidden during a storm; with Calm motion everyone holds still and the net stays in hand", () => {
    const p = new KhazanPeople(new THREE.Scene());
    p.setKhazans(spots);
    p.setHidden(true);
    expect(p.group.visible).toBe(false);
    p.setHidden(false);
    p.setStill(true);
    const m = new THREE.Matrix4();
    p.tick(1000);
    meshes(p)[0].getMatrixAt(0, m);
    const first = m.elements.slice();
    for (let t = 1000; t < 12_000; t += 250) {
      p.tick(t);
      expect(meshes(p)[3].count).toBe(0);
    }
    meshes(p)[0].getMatrixAt(0, m);
    expect(m.elements).toEqual(first);
  });
});
