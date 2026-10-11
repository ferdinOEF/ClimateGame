import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ElementMeshManager, type BuildingStyle } from "../src/render/elementMeshManager";

/**
 * A town House and its city fabric (Section 3) share one life: placed
 * together, damaged, repaired, raised by the skyline, destroyed and rebuilt
 * together, and their instance slots are given back and reused, never leaked.
 */
const style = (): BuildingStyle => ({
  kind: "small_house",
  wall: new THREE.Color("#ffffff"),
  roof: new THREE.Color("#b5452f"),
  scale: 1,
  turns: 0,
  rotY: Math.PI / 3,
  fabric: [
    { kind: "shop", dx: 0.5, dz: 0, rotY: 0, scale: 0.6, heightScale: 1, wall: new THREE.Color("#4f7fb8"), roof: new THREE.Color("#7d8288") },
    { kind: "apartment", dx: -0.25, dz: 0.43, rotY: 1, scale: 0.6, heightScale: 0.75, wall: new THREE.Color("#d9a441"), roof: new THREE.Color("#7d8288") },
    { kind: "small_house", dx: -0.25, dz: -0.43, rotY: 2, scale: 0.6, heightScale: 1, wall: new THREE.Color("#e59ab0"), roof: new THREE.Color("#a8492c") }
  ]
});

function pools(m: ElementMeshManager): { next: Map<string, number>; free: Map<string, number[]>; meshes: Map<string, THREE.InstancedMesh> } {
  const raw = m as unknown as { nextIndex: Map<string, number>; freeIndices: Map<string, number[]>; meshes: Map<string, THREE.InstancedMesh> };
  return { next: raw.nextIndex, free: raw.freeIndices, meshes: raw.meshes };
}

const scaleY = (mesh: THREE.InstancedMesh, index: number): number => {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(index, m);
  const s = new THREE.Vector3();
  m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
  return s.y;
};

describe("a House and its fabric", () => {
  it("live and die together, and give their slots back", () => {
    const m = new ElementMeshManager();
    m.setStyleResolver(() => style());
    const at = { q: 3, r: 4 };
    m.place(at, "house", 0.5);
    expect(m.fabricCount).toBe(3);
    const p = pools(m);
    expect(p.next.get("fabric:shop")).toBe(1);
    expect(p.next.get("fabric:apartment")).toBe(1);
    expect(p.next.get("fabric:small_house")).toBe(1);
    const shop = p.meshes.get("fabric:shop")!;
    const apartment = p.meshes.get("fabric:apartment")!;
    expect(scaleY(apartment, 0)).toBeCloseTo(0.6 * 0.75);

    // Damage leans and slumps the whole block; repair stands it back up.
    m.setBuildingDamagedVisual(at);
    expect(scaleY(apartment, 0)).toBeLessThan(0.6 * 0.75);
    m.repairVisual(at);
    expect(scaleY(apartment, 0)).toBeCloseTo(0.6 * 0.75);

    // The skyline raises the fabric with the House.
    m.setHeightScale(at, 1.5);
    expect(scaleY(apartment, 0)).toBeCloseTo(0.6 * 0.75 * 1.5);

    // Destroyed: the fabric is gone at once and its slots are free.
    m.destroy(at);
    expect(m.fabricCount).toBe(0);
    expect(scaleY(shop, 0)).toBe(0);
    expect(p.free.get("fabric:shop")).toEqual([0]);

    // Rebuilt: the same slots are reused, nothing new is taken.
    m.place(at, "house", 0.5);
    expect(m.fabricCount).toBe(3);
    expect(p.next.get("fabric:shop")).toBe(1);
    expect(p.free.get("fabric:shop")).toEqual([]);
    expect(scaleY(shop, 0)).toBeCloseTo(0.6);

    // A new era clears every pool.
    m.reset();
    expect(m.fabricCount).toBe(0);
    expect(shop.count).toBe(0);
    expect(p.next.get("fabric:shop")).toBe(0);
  });

  it("an animated House brings its block when it lands, facing the street", () => {
    const m = new ElementMeshManager();
    m.setStyleResolver(() => style());
    const at = { q: 0, r: 0 };
    m.place(at, "house", 0.5, { animate: true });
    const shop = pools(m).meshes.get("fabric:shop")!;
    const house = pools(m).meshes.get("house:small_house")!;
    expect(scaleY(shop, 0)).toBe(0);
    // Long after the settle has finished.
    m.tick(performance.now() + 10_000);
    expect(scaleY(shop, 0)).toBeCloseTo(0.6);
    const rot = new THREE.Quaternion();
    const matrix = new THREE.Matrix4();
    house.getMatrixAt(0, matrix);
    matrix.decompose(new THREE.Vector3(), rot, new THREE.Vector3());
    expect(new THREE.Euler().setFromQuaternion(rot).y).toBeCloseTo(Math.PI / 3);
  });
});
