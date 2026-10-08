import * as THREE from "three";

/**
 * What is overhead in a storm: the cyclone's spiral of cloud, the grey band
 * of rain cloud that brings a river flood, and lightning.
 *
 * The spiral is five arms of cloud puffs and a ring of them round the eye,
 * turning anticlockwise (as a cyclone does in the northern hemisphere). It
 * drifts in from the open sea, reaches the coast at landfall, then edges a
 * little inland and fades: it is kept over the sea and the coast, so the town
 * stays readable under it. The band is a long, lower, greyer drift of puffs
 * that comes in from inland, where the river's rain falls.
 *
 * Each is one `InstancedMesh` (one draw call); per frame only the group's
 * position, turn and opacity change. On Low quality each is instead a
 * single flat, textured sheet (a painted spiral, a soft grey band): the
 * same path, turn and fade, at the cost of two triangles. Lightning is a jagged line that shows
 * for a tenth of a second; its flash on screen is the session's job (capped
 * in brightness and rate there).
 */
export type SkyQuality = "low" | "medium" | "high";

const ARM_PUFFS: Record<SkyQuality, number> = { low: 7, medium: 11, high: 14 };
const BAND_PUFFS: Record<SkyQuality, number> = { low: 24, medium: 40, high: 60 };
const CLOUD_HEIGHT = 3.6;
/** The flat Low-quality sheets, in board units: the spiral's reach and the band's length and width. */
const FLAT_SPIRAL_SIZE = 15;
const FLAT_BAND_SIZE: [number, number] = [28, 9];

/** A painted cyclone seen from above: a bright eye wall and five arms winding out, soft-edged. */
function spiralTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const c = size / 2;
  const scale = size / FLAT_SPIRAL_SIZE;
  const puff = (x: number, y: number, r: number, light: number): void => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${light}, ${light + 4}, ${light + 8}, 0.9)`);
    grad.addColorStop(1, `rgba(${light}, ${light + 4}, ${light + 8}, 0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  // The same shape as the 3D spiral (buildSpiral), painted puff by puff.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    puff(c + Math.cos(a) * 1.15 * scale, c + Math.sin(a) * 1.15 * scale, 0.6 * scale, 236);
  }
  for (let arm = 0; arm < 5; arm++) {
    for (let p = 0; p < 18; p++) {
      const f = p / 18;
      const a = (arm / 5) * Math.PI * 2 - f * 2.6;
      const r = 1.7 + f * 5.2;
      puff(c + Math.cos(a) * r * scale, c + Math.sin(a) * r * scale, (0.45 + f * 0.5) * scale, 226 - Math.round(f * 20));
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A long, soft grey band of rain cloud seen from above. */
function bandTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const g = canvas.getContext("2d")!;
  const random = rng(11);
  for (let i = 0; i < 40; i++) {
    const x = 24 + random() * 208;
    const y = 48 + (random() - 0.5) * 40 * (1 - Math.abs(x - 128) / 150);
    const r = 14 + random() * 16;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(176, 184, 192, 0.75)");
    grad.addColorStop(1, "rgba(176, 184, 192, 0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function puffGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  geometry.scale(1, 0.42, 1);
  return geometry;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class StormSky {
  readonly group = new THREE.Group();
  private readonly spiral = new THREE.Group();
  private readonly spiralMaterial: THREE.MeshLambertMaterial;
  private readonly bandMaterial: THREE.MeshLambertMaterial;
  private spiralMesh: THREE.Mesh;
  private bandMesh: THREE.Mesh;
  /** Low quality's flat sheets, made the first time Low is chosen. */
  private flat: { spiral: THREE.MeshBasicMaterial; band: THREE.MeshBasicMaterial } | null = null;
  private readonly band = new THREE.Group();
  private readonly bolt: THREE.LineSegments;
  private readonly boltMaterial: THREE.LineBasicMaterial;
  private boltUntil = 0;

  constructor(quality: SkyQuality = "high") {
    this.spiralMaterial = new THREE.MeshLambertMaterial({ color: "#eef2f4", emissive: "#a9b2b8", transparent: true, opacity: 0, depthWrite: false, flatShading: true });
    this.bandMaterial = new THREE.MeshLambertMaterial({ color: "#c3cad0", emissive: "#5d666e", transparent: true, opacity: 0, depthWrite: false, flatShading: true });
    this.spiralMesh = quality === "low" ? this.buildFlatSpiral() : this.buildSpiral(quality);
    this.bandMesh = quality === "low" ? this.buildFlatBand() : this.buildBand(quality);
    this.spiral.add(this.spiralMesh);
    this.band.add(this.bandMesh);
    this.spiral.visible = false;
    this.band.visible = false;
    this.group.add(this.spiral, this.band);

    this.boltMaterial = new THREE.LineBasicMaterial({ color: "#f4f7ff", transparent: true, opacity: 0.9 });
    const boltGeometry = new THREE.BufferGeometry();
    boltGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(16 * 2 * 3), 3));
    this.bolt = new THREE.LineSegments(boltGeometry, this.boltMaterial);
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.bolt.name = "storm-lightning";
    this.group.add(this.bolt);
  }

  private buildSpiral(quality: SkyQuality): THREE.InstancedMesh {
    const perArm = ARM_PUFFS[quality];
    const eye = 12;
    const mesh = new THREE.InstancedMesh(puffGeometry(), this.spiralMaterial, 5 * perArm + eye);
    mesh.name = "storm-spiral";
    mesh.frustumCulled = false;
    const random = rng(7);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const color = new THREE.Color();
    let i = 0;
    // The eye wall: a tight ring, the thickest cloud.
    for (let k = 0; k < eye; k++) {
      const a = (k / eye) * Math.PI * 2;
      const r = 1.1 + random() * 0.15;
      const s = 0.42 + random() * 0.15;
      m.compose(new THREE.Vector3(Math.cos(a) * r, random() * 0.3, Math.sin(a) * r), q, new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i++, color.setHSL(0.58, 0.08, 0.86 + random() * 0.08));
    }
    // Five arms winding out (a log spiral), the puffs growing and thinning.
    for (let arm = 0; arm < 5; arm++) {
      for (let p = 0; p < perArm; p++) {
        const f = p / perArm;
        const a = (arm / 5) * Math.PI * 2 - f * 2.6;
        const r = 1.7 + f * 5.2 + random() * 0.25;
        const s = 0.32 + f * 0.38 + random() * 0.12;
        m.compose(new THREE.Vector3(Math.cos(a) * r, -f * 0.6 + random() * 0.3, Math.sin(a) * r), q, new THREE.Vector3(s, s * (1 - f * 0.3), s));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i++, color.setHSL(0.58, 0.06, 0.8 + random() * 0.12 - f * 0.08));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  private flatMaterials(): { spiral: THREE.MeshBasicMaterial; band: THREE.MeshBasicMaterial } {
    if (!this.flat) {
      const sheet = (map: THREE.Texture): THREE.MeshBasicMaterial =>
        new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      this.flat = { spiral: sheet(spiralTexture()), band: sheet(bandTexture()) };
    }
    return this.flat;
  }

  /** Low quality: the spiral as one flat painted sheet. */
  private buildFlatSpiral(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(FLAT_SPIRAL_SIZE, FLAT_SPIRAL_SIZE);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, this.flatMaterials().spiral);
    mesh.name = "storm-spiral";
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Low quality: the rain band as one flat sheet. */
  private buildFlatBand(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(FLAT_BAND_SIZE[0], FLAT_BAND_SIZE[1]);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, this.flatMaterials().band);
    mesh.name = "storm-cloud-band";
    mesh.frustumCulled = false;
    return mesh;
  }

  private buildBand(quality: SkyQuality): THREE.InstancedMesh {
    const count = BAND_PUFFS[quality];
    const mesh = new THREE.InstancedMesh(puffGeometry(), this.bandMaterial, count);
    mesh.name = "storm-cloud-band";
    mesh.frustumCulled = false;
    const random = rng(11);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // A long band about 26 units by 7, lumpy.
      const along = (random() - 0.5) * 26;
      const across = (random() - 0.5) * 7 * (1 - Math.abs(along) / 30);
      const s = 0.9 + random() * 1.1;
      m.compose(new THREE.Vector3(along, random() * 0.5, across), q, new THREE.Vector3(s * 1.3, s * 0.8, s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color.setHSL(0.58, 0.05, 0.56 + random() * 0.12));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  setQuality(quality: SkyQuality): void {
    this.spiral.remove(this.spiralMesh);
    this.band.remove(this.bandMesh);
    this.spiralMesh.geometry.dispose();
    this.bandMesh.geometry.dispose();
    this.spiralMesh = quality === "low" ? this.buildFlatSpiral() : this.buildSpiral(quality);
    this.bandMesh = quality === "low" ? this.buildFlatBand() : this.buildBand(quality);
    this.spiral.add(this.spiralMesh);
    this.band.add(this.bandMesh);
  }

  /** Whether the sky is drawn as flat sheets (Low quality). */
  get isFlat(): boolean {
    return !(this.spiralMesh instanceof THREE.InstancedMesh);
  }

  /**
   * The spiral at (x, z), turned to `angle`, at `opacity` (0 hides it) and
   * `scale`. The session moves it along its path from the storm's clock.
   */
  setSpiral(x: number, z: number, angle: number, opacity: number, scale: number): void {
    this.spiral.visible = opacity > 0.01;
    this.spiral.position.set(x, CLOUD_HEIGHT, z);
    this.spiral.rotation.y = angle;
    this.spiral.scale.setScalar(scale);
    this.spiralMaterial.opacity = Math.min(0.62, opacity);
    if (this.flat) this.flat.spiral.opacity = Math.min(0.7, opacity);
  }

  /** The rain-cloud band at (x, z), lying along `heading` (radians), at `opacity`. */
  setBand(x: number, z: number, heading: number, opacity: number): void {
    this.band.visible = opacity > 0.01;
    this.band.position.set(x, CLOUD_HEIGHT + 0.8, z);
    this.band.rotation.y = heading;
    this.bandMaterial.opacity = Math.min(0.45, opacity);
    if (this.flat) this.flat.band.opacity = Math.min(0.5, opacity);
  }

  /** A lightning bolt from the cloud base down to (x, z) on the board, shown until `untilMs`. */
  strike(x: number, z: number, ground: number, nowMs: number, random: () => number = Math.random): void {
    const positions = this.bolt.geometry.attributes.position.array as Float32Array;
    let px = x + (random() - 0.5) * 1.2;
    let py = CLOUD_HEIGHT - 0.3;
    let pz = z + (random() - 0.5) * 1.2;
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const f = (i + 1) / steps;
      const nx = i === steps - 1 ? x : px + (random() - 0.5) * 0.7 + (x - px) * f * 0.5;
      const ny = CLOUD_HEIGHT - 0.3 - (CLOUD_HEIGHT - 0.3 - ground) * f;
      const nz = i === steps - 1 ? z : pz + (random() - 0.5) * 0.7 + (z - pz) * f * 0.5;
      positions.set([px, py, pz, nx, ny, nz], i * 6);
      px = nx;
      py = ny;
      pz = nz;
    }
    this.bolt.geometry.attributes.position.needsUpdate = true;
    this.bolt.visible = true;
    this.boltUntil = nowMs + 110;
  }

  tick(nowMs: number): void {
    if (this.bolt.visible && nowMs > this.boltUntil) this.bolt.visible = false;
  }

  hide(): void {
    this.spiral.visible = false;
    this.band.visible = false;
    this.bolt.visible = false;
  }

  dispose(): void {
    this.spiralMesh.geometry.dispose();
    this.bandMesh.geometry.dispose();
    this.spiralMaterial.dispose();
    this.bandMaterial.dispose();
    if (this.flat) {
      for (const material of [this.flat.spiral, this.flat.band]) {
        material.map?.dispose();
        material.dispose();
      }
    }
    this.bolt.geometry.dispose();
    this.boltMaterial.dispose();
  }
}
