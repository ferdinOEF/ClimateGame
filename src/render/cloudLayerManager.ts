import * as THREE from "three";

const CLOUD_COUNT = 5;
const DRIFT_SPEED = 0.35; // world units/sec — slow, ambient
const SPAN_X = 34; // how far a cloud travels before wrapping back around
const FADE_DURATION_MS = 500;

/**
 * STEP_PROMPT_hazard_science.md Section 6 item 3: a small number of flat,
 * low-poly cloud-shaped meshes (icosahedron "puffs," matching the rest of
 * the game's no-texture flat-shaded style — not photoreal cloud cards)
 * drifting slowly across the sky during a hazard's telegraph window, an
 * advance visual warning independent of the terrain-tint/sound telegraph
 * `main.ts` already drives. Ported from khazan_hazard_prototype.html's
 * `makeCloud()`/drift loop.
 */
export class CloudLayerManager {
  readonly group = new THREE.Group();
  private clouds: THREE.Group[] = [];
  private wantsVisible = false;
  private opacity = 0;
  private lastMs: number | undefined;

  constructor() {
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const cloud = this.makeCloud();
      cloud.position.set(-SPAN_X / 2 + i * (SPAN_X / CLOUD_COUNT), 7 + Math.random() * 1.5, -3 + Math.random() * 8);
      this.group.add(cloud);
      this.clouds.push(cloud);
    }
    this.applyOpacity();
  }

  private makeCloud(): THREE.Group {
    const g = new THREE.Group();
    const puffCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < puffCount; i++) {
      const puffMat = new THREE.MeshStandardMaterial({
        color: "#f3f1e8",
        flatShading: true,
        roughness: 1,
        transparent: true,
        opacity: 0
      });
      const size = 0.5 + Math.random() * 0.6;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), puffMat);
      puff.position.set(i * 0.7 - puffCount * 0.35, Math.random() * 0.2, Math.random() * 0.5 - 0.25);
      puff.scale.y = 0.55;
      g.add(puff);
    }
    return g;
  }

  private applyOpacity(): void {
    for (const cloud of this.clouds) {
      for (const puff of cloud.children) {
        ((puff as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = this.opacity;
      }
    }
  }

  /** Shows/hides the drifting cloud layer — called whenever either hazard's telegraph window opens or closes. Fades rather than snapping, so it doesn't read as a glitch. */
  setVisible(visible: boolean): void {
    this.wantsVisible = visible;
  }

  tick(nowMs: number): void {
    const dtMs = nowMs - (this.lastMs ?? nowMs);
    this.lastMs = nowMs;

    const target = this.wantsVisible ? 1 : 0;
    if (this.opacity !== target) {
      const step = (dtMs / FADE_DURATION_MS) * (target > this.opacity ? 1 : -1);
      this.opacity = THREE.MathUtils.clamp(this.opacity + step, 0, 1);
      this.applyOpacity();
    }

    if (this.opacity <= 0) return;
    for (const cloud of this.clouds) {
      cloud.position.x += DRIFT_SPEED * (dtMs / 1000);
      if (cloud.position.x > SPAN_X / 2) cloud.position.x -= SPAN_X;
    }
  }
}
