import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { axialToWorld, axialKey, neighbors, type AxialCoord } from "@core/hex";
import { box, coneFrustum, dome, plan, move } from "./primitives3d";
import type { TownLayout } from "@levels/townLayout";

/**
 * The town's always-on life: people strolling the roads and the waterfront,
 * and a few boats drifting on the Mandovi and the sea.
 *
 * Cheap by construction: two InstancedMeshes (people, boats), a few dozen
 * matrix writes a frame, nothing allocated per frame. It follows the same
 * rules as the creature scheduler (`ElementReactions`): a hard cap on how
 * many are out at once, and at most one new walker setting off per frame,
 * so a returning tab never brings a crowd in one burst.
 *
 * In a storm the walkers go indoors (they shrink away) and the boats pull in
 * and heel over with the wind. With reduced motion there are half as many,
 * and they stand still.
 */
const MAX_WALKERS = 28;
const BOAT_COUNT = 5;
/** Saturated, mid-dark clothes: a pale shirt disappears against the pale road. */
const SHIRTS = ["#c0392b", "#d35400", "#1f6fb2", "#8e44ad", "#16a085", "#b03a6a", "#2c3e50", "#c88a12"];
const HULLS = ["#2f5f8f", "#b5452f", "#3f8f6f", "#e8e2d0", "#c98b3d"];

/**
 * A person, exaggerated about 2.2x against the buildings so they read as
 * people at the opening zoom rather than as specks.
 */
function personGeometry(): THREE.BufferGeometry {
  const body = coneFrustum(0.016, 0.026, 0.07, 6, "#ffffff", 0);
  const head = dome(0.017, 0.017, 0.017, "#7a5238", 0.068);
  const g = mergeGeometries([body, head]);
  g.scale(2.2, 2.2, 2.2);
  return g;
}

function boatGeometry(): THREE.BufferGeometry {
  const hull = plan(
    [
      [-0.2, 0],
      [-0.12, -0.07],
      [0.16, -0.06],
      [0.24, 0],
      [0.16, 0.06],
      [-0.12, 0.07]
    ],
    0.06,
    "#ffffff",
    0
  );
  const deck = move(box(0.2, 0.012, 0.09, "#d9c7a0", 0.06), 0.01, 0, 0);
  const cabin = move(box(0.07, 0.05, 0.07, "#f2ede0", 0.07), -0.05, 0, 0);
  const mast = move(coneFrustum(0.006, 0.008, 0.16, 4, "#5a4330", 0.07), 0.06, 0, 0);
  const g = mergeGeometries([hull, deck, cabin, mast]);
  g.scale(1.3, 1.3, 1.3);
  return g;
}

interface Walker {
  from: AxialCoord;
  to: AxialCoord;
  prev: string | null;
  t: number;
  speed: number;
  side: number;
  active: boolean;
  shown: number;
}

interface Boat {
  cx: number;
  cz: number;
  radius: number;
  phase: number;
  speed: number;
  y: number;
}

export class AmbientLife {
  readonly group = new THREE.Group();
  private readonly people: THREE.InstancedMesh;
  private readonly boats: THREE.InstancedMesh;
  private readonly walkers: Walker[] = [];
  private readonly boatList: Boat[] = [];
  private readonly graph = new Map<string, string[]>();
  private readonly surface = new Map<string, number>();
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly position = new THREE.Vector3();
  private readonly scaleVec = new THREE.Vector3();
  private paused = false;
  private wind = 0;
  private lastMs = 0;
  private rng: () => number;

  constructor(
    town: TownLayout,
    tiles: readonly { coord: AxialCoord; terrainId: string }[],
    heightAt: (coord: AxialCoord) => number,
    landHeight: number,
    private readonly reducedMotion: boolean,
    /** Where most of the walkers start: the old city and its waterfront. */
    centreOfTown: AxialCoord
  ) {
    let seed = 1234567;
    this.rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    // The road graph, from the plan's links; bridges are at deck height.
    for (const [a, b] of town.links) {
      if (!this.graph.has(a)) this.graph.set(a, []);
      if (!this.graph.has(b)) this.graph.set(b, []);
      this.graph.get(a)!.push(b);
      this.graph.get(b)!.push(a);
    }
    for (const key of this.graph.keys()) {
      const [q, r] = key.split(",").map(Number);
      this.surface.set(key, town.bridges.has(key) ? landHeight + 0.012 : heightAt({ q, r }) + 0.012);
    }

    const walkerCount = Math.min(MAX_WALKERS, Math.floor(this.graph.size / 4)) * (reducedMotion ? 0.5 : 1);
    this.people = new THREE.InstancedMesh(personGeometry(), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9, vertexColors: true }), MAX_WALKERS);
    this.people.name = "ambient-people";
    this.people.count = 0;
    // Most walkers start within a few streets of the old city, the rest anywhere.
    const hub = axialToWorld(centreOfTown, 1);
    const all = [...this.graph.keys()].filter((key) => (this.graph.get(key)?.length ?? 0) > 0);
    const near = all.filter((key) => dist(axialToWorld(coordOf(key), 1), hub) < 9);
    const starts = near.length >= 6 ? near : all;
    for (let i = 0; i < walkerCount && starts.length > 0; i++) {
      const pool = i % 4 === 3 ? all : starts;
      const start = pool[Math.floor(this.rng() * pool.length)];
      const next = this.graph.get(start)![Math.floor(this.rng() * this.graph.get(start)!.length)];
      this.walkers.push({ from: coordOf(start), to: coordOf(next), prev: null, t: this.rng(), speed: 0.12 + this.rng() * 0.1, side: this.rng() < 0.5 ? -1 : 1, active: false, shown: 0 });
      this.people.setColorAt(i, new THREE.Color(SHIRTS[i % SHIRTS.length]));
    }
    if (this.people.instanceColor) this.people.instanceColor.needsUpdate = true;
    this.group.add(this.people);

    // Boats: on water tiles with water all round them (so a drifting boat
    // never crosses land), spread out, nearest the city first.
    const terrain = new Map(tiles.map((t) => [axialKey(t.coord), t.terrainId]));
    const wet = (key: string): boolean => terrain.get(key) === "river" || terrain.get(key) === "coast";
    const open = tiles.filter((t) => wet(axialKey(t.coord)) && neighbors(t.coord).every((n) => wet(axialKey(n))) && !town.bridges.has(axialKey(t.coord)));
    const centre = { x: 0, z: 0 };
    const towns = [...town.buildings.keys()].map((key) => axialToWorld(coordOf(key), 1));
    for (const p of towns) {
      centre.x += p.x / Math.max(1, towns.length);
      centre.z += p.z / Math.max(1, towns.length);
    }
    open.sort((a, b) => dist(axialToWorld(a.coord, 1), centre) - dist(axialToWorld(b.coord, 1), centre));
    const chosen: AxialCoord[] = [];
    for (const tile of open) {
      if (chosen.length >= BOAT_COUNT) break;
      if (chosen.some((c) => dist(axialToWorld(c, 1), axialToWorld(tile.coord, 1)) < 5)) continue;
      chosen.push(tile.coord);
    }
    this.boats = new THREE.InstancedMesh(boatGeometry(), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8, vertexColors: true }), BOAT_COUNT);
    this.boats.name = "ambient-boats";
    chosen.forEach((coord, i) => {
      const { x, z } = axialToWorld(coord, 1);
      this.boatList.push({ cx: x, cz: z, radius: 0.5 + this.rng() * 0.4, phase: this.rng() * Math.PI * 2, speed: (0.05 + this.rng() * 0.05) * (this.rng() < 0.5 ? -1 : 1), y: heightAt(coord) + 0.01 });
      this.boats.setColorAt(i, new THREE.Color(HULLS[i % HULLS.length]));
    });
    this.boats.count = this.boatList.length;
    if (this.boats.instanceColor) this.boats.instanceColor.needsUpdate = true;
    this.group.add(this.boats);
    this.tick(0);
  }

  /** A storm hits: walkers go indoors, boats pull in. Cleared when it passes. */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  setWind(wind: number): void {
    this.wind = wind;
  }

  get activeWalkers(): number {
    return this.walkers.filter((w) => w.active && w.shown > 0.01).length;
  }

  tick(nowMs: number): void {
    const dt = this.lastMs === 0 ? 0 : Math.min(0.1, (nowMs - this.lastMs) / 1000);
    this.lastMs = nowMs;
    const moving = !this.reducedMotion;

    // At most one walker sets off per frame, until they are all out.
    if (!this.paused) {
      const idle = this.walkers.find((w) => !w.active);
      if (idle) idle.active = true;
    }
    let count = 0;
    this.walkers.forEach((w, i) => {
      // Fade in when out and about, shrink away indoors in a storm.
      const target = w.active && !this.paused ? 1 : 0;
      w.shown += (target - w.shown) * Math.min(1, dt * 3);
      if (moving && w.active && !this.paused) {
        w.t += (w.speed * dt) / 1.732;
        if (w.t >= 1) {
          const at = axialKey(w.to);
          const options = (this.graph.get(at) ?? []).filter((n) => n !== axialKey(w.from));
          const choices = options.length > 0 ? options : this.graph.get(at) ?? [];
          w.prev = axialKey(w.from);
          w.from = w.to;
          w.to = coordOf(choices[Math.floor(this.rng() * choices.length)] ?? at);
          w.t = 0;
        }
      }
      const a = axialToWorld(w.from, 1);
      const b = axialToWorld(w.to, 1);
      const ya = this.surface.get(axialKey(w.from)) ?? 0;
      const yb = this.surface.get(axialKey(w.to)) ?? ya;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      // Keep to one side of the road.
      const ox = (-dz / len) * 0.06 * w.side;
      const oz = (dx / len) * 0.06 * w.side;
      const bob = moving ? Math.abs(Math.sin(nowMs / 160 + i)) * 0.006 : 0;
      this.position.set(a.x + dx * w.t + ox, ya + (yb - ya) * w.t + bob, a.z + dz * w.t + oz);
      const s = Math.max(0.0001, w.shown);
      this.matrix.compose(this.position, this.quaternion.identity(), this.scaleVec.set(s, s, s));
      this.people.setMatrixAt(i, this.matrix);
      count = i + 1;
    });
    this.people.count = count;
    this.people.instanceMatrix.needsUpdate = true;

    // Boats circle slowly; in a storm they pull in and heel with the wind.
    const storm = this.paused ? 1 : 0;
    this.boatList.forEach((boat, i) => {
      if (moving) boat.phase += boat.speed * dt * (1 - storm * 0.7);
      const radius = boat.radius * (1 - storm * 0.6);
      const x = boat.cx + Math.cos(boat.phase) * radius;
      const z = boat.cz + Math.sin(boat.phase) * radius;
      const heading = Math.atan2(Math.cos(boat.phase) * Math.sign(boat.speed), -Math.sin(boat.phase) * Math.sign(boat.speed));
      const roll = moving ? Math.sin(nowMs / 900 + i) * 0.05 + this.wind * 0.45 : this.wind * 0.3;
      this.euler.set(roll, heading, moving ? Math.sin(nowMs / 1300 + i * 2) * 0.03 : 0);
      this.position.set(x, boat.y + (moving ? Math.sin(nowMs / 700 + i) * 0.01 : 0), z);
      this.matrix.compose(this.position, this.quaternion.setFromEuler(this.euler), this.scaleVec.set(1, 1, 1));
      this.boats.setMatrixAt(i, this.matrix);
    });
    this.boats.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [this.people, this.boats]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}

function coordOf(key: string): AxialCoord {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
