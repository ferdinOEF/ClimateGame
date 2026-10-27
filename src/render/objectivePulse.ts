import * as THREE from "three";
import { axialToWorld, type AxialCoord } from "@core/hex";

/**
 * Section 30.9 (owner decision): the tiles the objective asks for pulse on the board until each is built: a warm
 * hexagonal ring on the tile top, breathing slowly (1.8 s). With Calm motion it holds still. One instanced mesh.
 *
 * Section 34b.4: the ring was faint zoomed out and hidden under the heat's red hatching zoomed in. It is now a wider,
 * brighter gold stroke with a soft glow round it (two more instanced meshes, children of the ring), drawn after the
 * heat and over it. A row clicked in the objective flashes its tiles twice over 2 s (a gold fill).
 */
const CAPACITY = 32;
const PERIOD_MS = 1800;
const LIFT = 0.05;
/** The gold of the HUD's gold accents (the glow); nothing under src/render reads the CSS tokens, so the values are here. */
const GOLD = "#f2c35b";
/** The stroke and the flash: a light, bright gold, which reads on the beach's own orange as well as on the land. */
const LIGHT_GOLD = "#fff3c9";
/** Section 34b.4: a row's flash, two pulses in this long. */
export const FLASH_MS = 2000;
/** Drawn after the heat (renderOrder 2) and the forecast cone, and without the depth test, so the hatching never hides it. */
const ORDER = 9;

export class ObjectivePulse {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly glow: THREE.InstancedMesh;
  private readonly glowMaterial: THREE.MeshBasicMaterial;
  private readonly flashMesh: THREE.InstancedMesh;
  private readonly flashMaterial: THREE.MeshBasicMaterial;
  private readonly scratch = new THREE.Matrix4();
  private readonly keys: string[] = [];
  private flashStart = -Infinity;
  /** Calm motion: no breathing (a row's flash still shows, held at half strength). */
  still = false;

  constructor() {
    const ring = new THREE.RingGeometry(0.68, 0.92, 6, 1);
    ring.rotateX(-Math.PI / 2);
    ring.rotateY(Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({ color: LIGHT_GOLD, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(ring, this.material, CAPACITY);
    this.mesh.name = "objective-pulse";
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = ORDER + 1;
    // The soft glow: a wider, faint ring round the stroke, added to what is under it.
    const halo = new THREE.RingGeometry(0.6, 1.06, 6, 1);
    halo.rotateX(-Math.PI / 2);
    halo.rotateY(Math.PI / 2);
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.3, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.glow = new THREE.InstancedMesh(halo, this.glowMaterial, CAPACITY);
    this.glow.name = "objective-pulse-glow";
    this.glow.count = 0;
    this.glow.frustumCulled = false;
    this.glow.renderOrder = ORDER;
    this.mesh.add(this.glow);
    // A row's flash: the whole tile top, light gold.
    const fill = new THREE.CircleGeometry(0.92, 6);
    fill.rotateX(-Math.PI / 2);
    fill.rotateY(Math.PI / 2);
    this.flashMaterial = new THREE.MeshBasicMaterial({ color: LIGHT_GOLD, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    this.flashMesh = new THREE.InstancedMesh(fill, this.flashMaterial, CAPACITY);
    this.flashMesh.name = "objective-flash";
    this.flashMesh.count = 0;
    this.flashMesh.frustumCulled = false;
    this.flashMesh.renderOrder = ORDER;
    this.mesh.add(this.flashMesh);
  }

  /** The tiles to pulse (an empty list hides it). `heightAt` gives each tile's top. */
  show(tiles: AxialCoord[], heightAt: (coord: AxialCoord) => number): void {
    this.keys.length = 0;
    const count = Math.min(CAPACITY, tiles.length);
    for (let i = 0; i < count; i++) {
      const { x, z } = axialToWorld(tiles[i], 1);
      this.scratch.makeTranslation(x, heightAt(tiles[i]) + LIFT, z);
      this.mesh.setMatrixAt(i, this.scratch);
      this.glow.setMatrixAt(i, this.scratch);
      this.keys.push(`${tiles[i].q},${tiles[i].r}`);
    }
    this.mesh.count = count;
    this.glow.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
  }

  /** Section 34b.4: flashes `tiles` twice over FLASH_MS (a row clicked in the objective). */
  flash(tiles: AxialCoord[], heightAt: (coord: AxialCoord) => number, nowMs: number): void {
    const count = Math.min(CAPACITY, tiles.length);
    for (let i = 0; i < count; i++) {
      const { x, z } = axialToWorld(tiles[i], 1);
      this.flashMesh.setMatrixAt(i, this.scratch.makeTranslation(x, heightAt(tiles[i]) + LIFT, z));
    }
    this.flashMesh.count = count;
    this.flashMesh.instanceMatrix.needsUpdate = true;
    this.flashStart = nowMs;
  }

  /** The tiles pulsing now. */
  get tiles(): readonly string[] {
    return this.keys;
  }

  /** The flash's strength now (0 when none plays): two pulses, at 0 to 0.5 s and 1 to 1.5 s. */
  flashLevel(nowMs: number): number {
    const t = (nowMs - this.flashStart) / FLASH_MS;
    if (t < 0 || t >= 1) return 0;
    return this.still ? 0.5 : Math.max(0, Math.sin(t * 4 * Math.PI)) * 0.7;
  }

  tick(nowMs: number): void {
    const flash = this.flashLevel(nowMs);
    this.flashMaterial.opacity = flash;
    if (flash === 0 && nowMs - this.flashStart >= FLASH_MS) this.flashMesh.count = 0;
    if (this.mesh.count === 0) return;
    const breath = this.still ? 1 : 0.5 + 0.5 * Math.sin((nowMs / PERIOD_MS) * Math.PI * 2);
    this.material.opacity = 0.7 + 0.3 * breath;
    this.glowMaterial.opacity = 0.18 + 0.2 * breath;
  }

  dispose(): void {
    for (const m of [this.mesh, this.glow, this.flashMesh]) m.geometry.dispose();
    this.material.dispose();
    this.glowMaterial.dispose();
    this.flashMaterial.dispose();
  }
}
