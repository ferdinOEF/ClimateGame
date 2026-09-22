import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { box } from "./primitives3d";
import { farmerFigureGeometry } from "./creatureGeometry";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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

const ROW_LOCAL_X = 0.24;
const ROW_Z_OFFSETS = [-0.2, 0, 0.2];

const STUBBLE_TO_SHOOTS_DELAY_MS = 2600;
const GOLD_TO_STUBBLE_DELAY_MS = 2600;

function buildRowsGeometry(height: number, colorA: string, colorB: string): THREE.BufferGeometry {
  const parts = ROW_Z_OFFSETS.map((z, i) => {
    const tone = i % 2 === 0 ? colorA : colorB;
    const row = box(0.28, height, 0.14, tone, 0.015);
    row.translate(ROW_LOCAL_X, 0, z);
    return row;
  });
  return mergeGeometries(parts);
}

/** One shared geometry+material per stage, built once — every Khazan tile's stage group references the same four, just toggling which is visible. */
function buildStageMeshes(): THREE.Mesh[] {
  const stageSpecs: [number, string, string][] = [
    [0.012, "#a7d36a", "#bcdc86"], // shoots: short, pale/young green
    [0.035, "#8fc25a", "#a0d060"], // full growth: the original static colors
    [0.035, "#d9b04a", "#c9a03a"], // gold/grain-bearing
    [0.01, "#a08a5a", "#8f7a4e"] // stubble: short, dry tan-brown
  ];
  return stageSpecs.map(([height, colorA, colorB]) => {
    const geometry = buildRowsGeometry(height, colorA, colorB);
    const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, vertexColors: true });
    return new THREE.Mesh(geometry, material);
  });
}

interface KhazanTile {
  group: THREE.Group;
  stageMeshes: THREE.Mesh[];
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
    this.group.add(group);
    this.tiles.set(key, { group, stageMeshes });
  }

  destroy(coord: AxialCoord): void {
    const key = `${coord.q},${coord.r}`;
    const tile = this.tiles.get(key);
    if (!tile) return;
    this.group.remove(tile.group);
    this.tiles.delete(key);
  }

  reset(): void {
    for (const tile of this.tiles.values()) this.group.remove(tile.group);
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
    if (this.walking.length === 0) return;
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
}
