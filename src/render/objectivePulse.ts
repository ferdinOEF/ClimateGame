import * as THREE from "three";
import { axialToWorld, type AxialCoord } from "@core/hex";

/**
 * Section 30.9 (owner decision): the tiles the objective asks for pulse on the board until each is built: a warm
 * hexagonal ring on the tile top, breathing slowly (1.8 s). With Calm motion it holds still. One instanced mesh.
 */
const CAPACITY = 32;
const PERIOD_MS = 1800;
const LIFT = 0.05;

export class ObjectivePulse {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly scratch = new THREE.Matrix4();
  private readonly keys: string[] = [];
  /** Calm motion: no breathing. */
  still = false;

  constructor() {
    const geometry = new THREE.RingGeometry(0.72, 0.9, 6, 1);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({ color: "#ffe9a8", transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geometry, this.material, CAPACITY);
    this.mesh.name = "objective-pulse";
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  /** The tiles to pulse (an empty list hides it). `heightAt` gives each tile's top. */
  show(tiles: AxialCoord[], heightAt: (coord: AxialCoord) => number): void {
    this.keys.length = 0;
    const count = Math.min(CAPACITY, tiles.length);
    for (let i = 0; i < count; i++) {
      const { x, z } = axialToWorld(tiles[i], 1);
      this.mesh.setMatrixAt(i, this.scratch.makeTranslation(x, heightAt(tiles[i]) + LIFT, z));
      this.keys.push(`${tiles[i].q},${tiles[i].r}`);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** The tiles pulsing now. */
  get tiles(): readonly string[] {
    return this.keys;
  }

  tick(nowMs: number): void {
    if (this.mesh.count === 0) return;
    this.material.opacity = this.still ? 0.75 : 0.5 + 0.4 * (0.5 + 0.5 * Math.sin((nowMs / PERIOD_MS) * Math.PI * 2));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
