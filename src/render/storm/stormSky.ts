import * as THREE from "three";

/**
 * What is overhead in a storm: the cyclone's spiral of cloud, the grey band
 * of rain cloud that brings a river flood, and lightning.
 *
 * The cyclone (Section 34b.14: its puffs read as bubbles) is four soft rings of
 * cloud round a clear eye, each a flat sheet with a blurred, clumped ring
 * painted on it, the inner ones denser, all turning slowly anticlockwise (as a
 * cyclone does in the northern hemisphere), the inner ones faster. It
 * drifts in from the open sea, reaches the coast at landfall, then edges a
 * little inland and fades: it is kept over the sea and the coast, so the town
 * stays readable under it. The band is a long, lower, greyer drift of puffs
 * that comes in from inland, where the river's rain falls.
 *
 * The band is one `InstancedMesh` (one draw call), the cyclone four sheets
 * (four calls, at every quality); per frame only position, turn and opacity
 * change. On Low quality the band is instead a single flat, textured sheet:
 * the same path, turn and fade, at the cost of two triangles. Lightning is a jagged line that shows
 * for a tenth of a second; its flash on screen is the session's job (capped
 * in brightness and rate there).
 */
export type SkyQuality = "low" | "medium" | "high";

const BAND_PUFFS: Record<SkyQuality, number> = { low: 24, medium: 40, high: 60 };
const CLOUD_HEIGHT = 3.6;
/** The flat Low-quality band, in board units: its length and width. */
const FLAT_BAND_SIZE: [number, number] = [28, 9];

/**
 * Section 34b.14: the cyclone's rings, from the eye out: each ring's radius (board units), the share of its sheet's half
 * size the ring sits at, its strength (opacity cap, 0.35 to 0.5) and how fast it turns against the storm's own turn.
 */
const RINGS: { radius: number; strength: number; spin: number; seed: number }[] = [
  { radius: 1.5, strength: 0.5, spin: 1.6, seed: 3 },
  { radius: 2.9, strength: 0.46, spin: 1.15, seed: 5 },
  { radius: 4.5, strength: 0.4, spin: 0.85, seed: 9 },
  { radius: 6.3, strength: 0.35, spin: 0.6, seed: 13 }
];
/** Where on its sheet a ring is painted: this share of the sheet's half size. */
const RING_AT = 0.62;

/** One soft ring of cloud seen from above: blurred edges, thicker in clumps so its turn reads. */
function ringTexture(seed: number): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const c = size / 2;
  const radius = c * RING_AT;
  const random = rng(seed);
  // Blurred, where the browser can (every one the game supports): the ring's edges soft, no disc reads.
  g.filter = "blur(6px)";
  const clumps = 26;
  for (let k = 0; k < clumps; k++) {
    const a = (k / clumps) * Math.PI * 2 + random() * 0.2;
    const r = radius * (0.92 + random() * 0.16);
    const blob = c * (0.16 + random() * 0.12);
    const alpha = 0.35 + random() * 0.55;
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    const grad = g.createRadialGradient(x, y, 0, x, y, blob);
    grad.addColorStop(0, `rgba(238, 242, 245, ${alpha.toFixed(2)})`);
    grad.addColorStop(1, "rgba(238, 242, 245, 0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, blob, 0, Math.PI * 2);
    g.fill();
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
  /** Section 34b.14: the cyclone's rings, one sheet each, at every quality. */
  private readonly rings: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; strength: number; spin: number }[] = [];
  private readonly bandMaterial: THREE.MeshLambertMaterial;
  private bandMesh: THREE.Mesh;
  /** Low quality's flat band, made the first time Low is chosen. */
  private flat: { band: THREE.MeshBasicMaterial } | null = null;
  private readonly band = new THREE.Group();
  private readonly bolt: THREE.LineSegments;
  private readonly boltMaterial: THREE.LineBasicMaterial;
  private boltUntil = 0;

  constructor(quality: SkyQuality = "high") {
    this.bandMaterial = new THREE.MeshLambertMaterial({ color: "#c3cad0", emissive: "#5d666e", transparent: true, opacity: 0, depthWrite: false, flatShading: true });
    this.buildRings();
    this.bandMesh = quality === "low" ? this.buildFlatBand() : this.buildBand(quality);
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

  /** Section 34b.14: the cyclone's rings, each a flat sheet a little lower than the one inside it. */
  private buildRings(): void {
    RINGS.forEach((ring, i) => {
      const size = (ring.radius / RING_AT) * 2;
      const geometry = new THREE.PlaneGeometry(size, size);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({ map: ringTexture(ring.seed), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "storm-spiral";
      mesh.frustumCulled = false;
      mesh.position.y = -i * 0.18;
      mesh.renderOrder = 6 - i;
      this.spiral.add(mesh);
      this.rings.push({ mesh, material, strength: ring.strength, spin: ring.spin });
    });
  }

  private flatMaterials(): { band: THREE.MeshBasicMaterial } {
    if (!this.flat) {
      this.flat = { band: new THREE.MeshBasicMaterial({ map: bandTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }) };
    }
    return this.flat;
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
    // The cyclone's rings are the same at every quality; only the band changes.
    this.band.remove(this.bandMesh);
    this.bandMesh.geometry.dispose();
    this.bandMesh = quality === "low" ? this.buildFlatBand() : this.buildBand(quality);
    this.band.add(this.bandMesh);
  }

  /** Whether the rain band is drawn as a flat sheet (Low quality). */
  get isFlat(): boolean {
    return !(this.bandMesh instanceof THREE.InstancedMesh);
  }

  /**
   * The spiral at (x, z), turned to `angle`, at `opacity` (0 hides it) and
   * `scale`. The session moves it along its path from the storm's clock.
   */
  setSpiral(x: number, z: number, angle: number, opacity: number, scale: number): void {
    this.spiral.visible = opacity > 0.01;
    this.spiral.position.set(x, CLOUD_HEIGHT, z);
    this.spiral.scale.setScalar(scale);
    // Section 34b.14: each ring turns at its own pace (the inner ones faster), each at its own strength.
    for (const ring of this.rings) {
      ring.mesh.rotation.y = angle * ring.spin;
      ring.material.opacity = Math.min(ring.strength, opacity * ring.strength * 1.6);
    }
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
    for (const ring of this.rings) {
      ring.mesh.geometry.dispose();
      ring.material.map?.dispose();
      ring.material.dispose();
    }
    this.bandMesh.geometry.dispose();
    this.bandMaterial.dispose();
    if (this.flat) {
      this.flat.band.map?.dispose();
      this.flat.band.dispose();
    }
    this.bolt.geometry.dispose();
    this.boltMaterial.dispose();
  }
}
