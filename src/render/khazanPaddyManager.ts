import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { box } from "./primitives3d";
import { farmerFigureGeometry } from "./creatureGeometry";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SCALE_FACTOR } from "./elementGeometry";
import { waveHeight, recomputeNormals, scaleWaves, IDLE_WATER_WAVES } from "./waveMath";

/**
 * STEP_PROMPT_hazard_vfx_and_fluidity.md Section 3: this manager builds its
 * own paddy-row geometry entirely separately from `khazanGeometry()`'s
 * static bund/water (see that function's own comment on why — a merged
 * per-type `InstancedMesh` can't swap sub-parts per tile), at the exact
 * local coordinates `khazanGeometry()` used to use for its own paddy rows
 * before they moved out here. Section 2's `SCALE_FACTOR` scale-up only
 * touched `elementGeometry.ts`'s own static geometry — this file never
 * got the memo, so a built Khazan's bund grew 1.35x while its paddy rows
 * silently stayed the old size/position, caught live in this pass (the
 * rows visibly no longer filled half the now-bigger interior). `KHAZAN_F`
 * reuses the exact same factor so both halves of one Khazan stay in sync.
 */
const KHAZAN_F = SCALE_FACTOR.khazan ?? 1;

/**
 * STEP_PROMPT_creature_reactions.md Section 4: Khazan's paddy-row half
 * (moved out of `elementGeometry.ts`'s static `khazanGeometry()` — see its
 * own comment) cycles through four growth stages, synced across every
 * built Khazan on the map at once, driven by the real Cyclone
 * telegraph/trigger/aftermath cycle instead of an arbitrary timer.
 *
 * GAUNTLET_PROMPT.md's Calm→Forecast→Hazard→Aftermath "Season" loop this
 * doc asks to hook into was never actually built (that document's own
 * Section 0.1 explicitly marks it a design proposal, not shipped work) —
 * the real game instead runs on a turn counter plus one independent
 * telegraph/trigger schedule per hazard. Flood is currently disabled
 * (`FLOOD_HAZARD_ENABLED = false` in `main.ts`), so Cyclone's own real,
 * currently-active cycle stands in as the "Season" substitute: telegraph
 * start -> STAGE_TALL, `triggerCyclone()` firing -> STAGE_GOLD, the
 * aftermath banner -> the farmer walks (if this Khazan's coord shows no
 * damage in that cyclone's real `tileDamage`), then STAGE_STUBBLE, then
 * back to STAGE_SHOOTS a beat later. The last two transitions have no
 * further real event to hang off (there is no discrete "next Season
 * start" in the shipped game), so they're chained on short timers after
 * the aftermath fires — confirmed harmless if a new telegraph interrupts
 * mid-sequence, since this is purely decorative (STAGE_TALL simply wins).
 */

const STAGE_SHOOTS = 0;
const STAGE_TALL = 1;
const STAGE_GOLD = 2;
const STAGE_STUBBLE = 3;
const STAGE_COUNT = 4;

const ROW_LOCAL_X = 0.24 * KHAZAN_F;
const ROW_Z_OFFSETS = [-0.2 * KHAZAN_F, 0, 0.2 * KHAZAN_F];

const STUBBLE_TO_SHOOTS_DELAY_MS = 2600;
const GOLD_TO_STUBBLE_DELAY_MS = 2600;

function buildRowsGeometry(height: number, colorA: string, colorB: string): THREE.BufferGeometry {
  const parts = ROW_Z_OFFSETS.map((z, i) => {
    const tone = i % 2 === 0 ? colorA : colorB;
    const row = box(0.28 * KHAZAN_F, height, 0.14 * KHAZAN_F, tone, 0.015 * KHAZAN_F);
    row.translate(ROW_LOCAL_X, 0, z);
    return row;
  });
  return mergeGeometries(parts);
}

/** One shared geometry+material per stage, built once — every Khazan tile's stage group references the same four, just toggling which is visible. */
function buildStageMeshes(): THREE.Mesh[] {
  const stageSpecs: [number, string, string][] = [
    [0.012 * KHAZAN_F, "#a7d36a", "#bcdc86"], // shoots: short, pale/young green
    [0.035 * KHAZAN_F, "#8fc25a", "#a0d060"], // full growth: the original static colors
    [0.035 * KHAZAN_F, "#d9b04a", "#c9a03a"], // gold/grain-bearing
    [0.01 * KHAZAN_F, "#a08a5a", "#8f7a4e"] // stubble: short, dry tan-brown
  ];
  return stageSpecs.map(([height, colorA, colorB]) => {
    const geometry = buildRowsGeometry(height, colorA, colorB);
    const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, vertexColors: true });
    return new THREE.Mesh(geometry, material);
  });
}

// STEP_PROMPT_hazard_vfx_and_fluidity.md Section 3's named addition: "a
// faint ripple on Khazan's water plane" — only built because Section 0's
// live-check found the tap reactions alone didn't cover the ambient
// "feels inert between taps" half of the original complaint. Matches
// `khazanGeometry()`'s own water box footprint (local x=-0.17, 0.62 wide x
// 0.7 deep before Khazan's own `SCALE_FACTOR`) and reuses the same shared
// `waveMath.ts` sine-sum Section 1's river/wave-front surfaces use — one
// motion language across every water surface in the game, per Section 4.
// Deliberately a smaller fraction of `IDLE_WATER_WAVES` (this patch is a
// small still pond, not an open river) and its own flat material color
// chosen to match the water box's own *actual* on-screen color once
// multiplied through `defenseKhazanBund`'s tint — measured in the icon-
// legibility pass as a muted green (~RGB 49,85,46), not the cyan it's
// authored as — so this standalone, untinted ripple mesh blends with that
// known, already-flagged, intentionally-unfixed limitation rather than
// floating a mismatched second "correct" blue patch on top of it.
const WATER_RIPPLE_COLOR = "#355e40";
const WATER_RIPPLE_WAVES = scaleWaves(IDLE_WATER_WAVES, 0.6);

function buildWaterRippleGeometry(f: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(0.6 * f, 0.68 * f, 6, 6);
  geo.rotateX(-Math.PI / 2);
  geo.translate(-0.17 * f, 0.02 * f, 0);
  return geo;
}

interface KhazanTile {
  group: THREE.Group;
  stageMeshes: THREE.Mesh[];
  water: THREE.Mesh;
  /** Deterministic per-tile phase (seeded from its own coord) so every Khazan pond on the map doesn't ripple in perfect lockstep. */
  phase: number;
}

interface FarmerWalk {
  object: THREE.Object3D;
  startTime: number;
  durationMs: number;
  fromZ: number;
  toZ: number;
}

const WALK_DURATION_MS = 2400;

export class KhazanPaddyManager {
  readonly group = new THREE.Group();
  private tiles = new Map<string, KhazanTile>();
  private stage = STAGE_SHOOTS;
  private stageTemplate = buildStageMeshes();
  private walking: FarmerWalk[] = [];
  private farmerGeometry = farmerFigureGeometry();
  private farmerMaterial = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, vertexColors: true });
  private waterMaterial = new THREE.MeshStandardMaterial({
    color: WATER_RIPPLE_COLOR,
    flatShading: true,
    roughness: 0.35,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
  });
  private startTimeMs = performance.now();

  place(coord: AxialCoord, terrainTopY: number): void {
    const key = `${coord.q},${coord.r}`;
    const { x, z } = axialToWorld(coord, 1.0);
    const group = new THREE.Group();
    group.position.set(x, terrainTopY, z);
    const stageMeshes = this.stageTemplate.map((template) => {
      const mesh = new THREE.Mesh(template.geometry, template.material);
      mesh.visible = false;
      group.add(mesh);
      return mesh;
    });
    stageMeshes[this.stage].visible = true;
    const water = new THREE.Mesh(buildWaterRippleGeometry(KHAZAN_F), this.waterMaterial);
    water.frustumCulled = false;
    group.add(water);
    this.group.add(group);
    const phase = (coord.q * 12.9898 + coord.r * 78.233) % (Math.PI * 2);
    this.tiles.set(key, { group, stageMeshes, water, phase });
  }

  destroy(coord: AxialCoord): void {
    const key = `${coord.q},${coord.r}`;
    const tile = this.tiles.get(key);
    if (!tile) return;
    this.group.remove(tile.group);
    tile.water.geometry.dispose(); // unlike stageMeshes (shared templates), each tile's water plane is its own per-vertex-displaced geometry
    this.tiles.delete(key);
  }

  reset(): void {
    for (const tile of this.tiles.values()) {
      this.group.remove(tile.group);
      tile.water.geometry.dispose();
    }
    this.tiles.clear();
    this.walking = [];
    this.stage = STAGE_SHOOTS;
  }

  /** Verify-only: current stage index (0 shoots/1 tall/2 gold/3 stubble) and which Khazan tiles are tracked. */
  get debugState(): { stage: number; tileKeys: string[] } {
    return { stage: this.stage, tileKeys: [...this.tiles.keys()] };
  }

  private setStage(stage: number): void {
    this.stage = stage;
    for (const tile of this.tiles.values()) {
      tile.stageMeshes.forEach((mesh, i) => (mesh.visible = i === stage));
    }
  }

  /** Cyclone telegraph starting (the "Forecast" analog) — paddy grows tall. */
  onTelegraphStart(): void {
    this.setStage(STAGE_TALL);
  }

  /** Cyclone actually resolving (the "Hazard" analog) — paddy turns gold. */
  onHazardTrigger(): void {
    this.setStage(STAGE_GOLD);
  }

  /**
   * The aftermath banner firing (the "Aftermath" analog). `damagedKeys` is
   * this hazard's real per-tile damage set (`HazardResult.tileDamage`'s
   * keys) — a Khazan tile not in it gets its farmer-walks-the-plot beat.
   * Every tracked Khazan (damaged or not) then advances stubble -> shoots
   * on the same short delay chain, since the growth cycle itself isn't
   * conditional on this cyclone having hit that specific tile.
   */
  onAftermath(damagedKeys: ReadonlySet<string>): void {
    for (const [key, tile] of this.tiles) {
      if (!damagedKeys.has(key)) this.spawnFarmerWalk(tile);
    }
    setTimeout(() => this.setStage(STAGE_STUBBLE), GOLD_TO_STUBBLE_DELAY_MS);
    setTimeout(() => this.setStage(STAGE_SHOOTS), GOLD_TO_STUBBLE_DELAY_MS + STUBBLE_TO_SHOOTS_DELAY_MS);
  }

  private spawnFarmerWalk(tile: KhazanTile): void {
    const object = new THREE.Mesh(this.farmerGeometry, this.farmerMaterial);
    object.position.set(ROW_LOCAL_X, 0.015, ROW_Z_OFFSETS[0]);
    tile.group.add(object);
    this.walking.push({ object, startTime: performance.now(), durationMs: WALK_DURATION_MS, fromZ: ROW_Z_OFFSETS[0], toZ: ROW_Z_OFFSETS[2] });
  }

  tick(nowMs: number): void {
    if (this.walking.length > 0) {
      const stillWalking: FarmerWalk[] = [];
      for (const w of this.walking) {
        const t = Math.min(1, (nowMs - w.startTime) / w.durationMs);
        w.object.position.z = THREE.MathUtils.lerp(w.fromZ, w.toZ, t);
        if (t < 1) {
          stillWalking.push(w);
        } else {
          w.object.parent?.remove(w.object);
        }
      }
      this.walking = stillWalking;
    }

    const tSec = (nowMs - this.startTimeMs) / 1000;
    for (const tile of this.tiles.values()) {
      const pos = tile.water.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        pos.setY(i, 0.02 * KHAZAN_F + waveHeight(x, z, tSec, WATER_RIPPLE_WAVES, tile.phase));
      }
      recomputeNormals(tile.water.geometry);
    }
  }
}
