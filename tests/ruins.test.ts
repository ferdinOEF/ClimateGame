import { describe, expect, it } from "vitest";
import { shelterOf } from "../src/core/climate";
import * as THREE from "three";
import { ElementMeshManager, type BuildingStyle } from "../src/render/elementMeshManager";
import { MonumentMeshManager } from "../src/render/monumentMeshManager";
import { buildStormScript } from "../src/core/stormScript";
import { landmarkDamage, landmarkDamageSoFar } from "../src/core/landmarkDamage";
import { BOT_LEVEL, newRun, playedRun } from "../tools/panjimBots/bots";
import { damagedLandmarkGeometry } from "../src/render/landmarkDamageGeometry";
import { box } from "../src/render/primitives3d";
import { homesHtml } from "../src/ui/panjim/resultCards";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { passYear } from "./helpers/passYear";
import { mapById } from "../src/levels/levelMap";
import { computeWater, damageAt, floodsHouse, LANDFALL_ZONE } from "../src/core/hazardModel";
import { ELEMENT_BY_ID } from "../src/core/elements";

/**
 * Section 21.3 (owner request): after every storm each home it destroyed is drawn as a ruin, and the ruins on the
 * board equal the homes lost on the result card, storm by storm: the card reads "N of M homes saved", M the homes in
 * the storm's path still standing when it hit (Section 22.4), with "Lost in earlier storms: K" for the ones an
 * earlier storm ruined, so the ruins in its path are M minus N plus K, and the storm itself adds exactly the homes
 * it destroyed. Ruins stay for the run; a landmark the water
 * damaged shows it, worse when destroyed, and damage never mends.
 */
const MAP = mapById("panaji")!;
const style = (): BuildingStyle => ({ kind: "two_storey", wall: new THREE.Color("#f2e6c8"), roof: new THREE.Color("#b5452f"), scale: 1, turns: 0, fabric: [{ kind: "shop", dx: 0.3, dz: 0.1, rotY: 0, scale: 0.6, heightScale: 1, wall: new THREE.Color("#4f7fb8"), roof: new THREE.Color("#7d8288") }] });

function playStorms(defend: boolean) {
  const run = newRun(defend ? "ruins-defended" : "ruins", BOT_LEVEL);
  const elements = new ElementMeshManager();
  elements.setStyleResolver(() => style());
  for (const [key, inst] of run.state.elements) {
    const [q, r] = key.split(",").map(Number);
    elements.place({ q, r }, inst.elementId, 0);
  }
  const landmarks = MAP.monuments.map((m) => `${m.q},${m.r}`);
  const rows: { lostOnCard: number; lostBefore: number; saved: number; total: number; destroyed: number; ruinsInPath: number; ruinedNow: number; ruinedBefore: number; landmarkEvents: { key: string; level: number }[]; recordLevels: Map<string, number> }[] = [];
  let built = 0;
  for (const challenge of run.schedule) {
    while (!run.landed.has(challenge.id)) {
      if (defend && built < 6) {
        const key = run.zones!.keys("z1").find((k) => {
          const [q, r] = k.split(",").map(Number);
          return run.state.canBuild({ q, r }, "dune");
        });
        if (key) {
          const [q, r] = key.split(",").map(Number);
          run.build({ q, r }, "dune");
          elements.place({ q, r }, "dune", 0);
          built++;
          continue;
        }
      }
      passYear(run);
    }
    const record = run.stormRecords.get(challenge.id)!;
    const outcome = run.outcomes.get(challenge.id)!;
    const before = elements.ruinedCount;
    const script = buildStormScript(record, record.defences, (key) => run.zones!.zoneOf(key), landmarks);
    for (const event of script.events) {
      if (event.type !== "house") continue;
      const [q, r] = event.key.split(",").map(Number);
      elements.setBuildingRuinedVisual({ q, r });
    }
    // The storm's path: every home its water and wind would take on a board with no defences (as the card counts it).
    const board = run.state.clone();
    for (const [key, inst] of [...board.elements]) if ((ELEMENT_BY_ID.get(inst.elementId)?.effects.resilience ?? 0) > 0) board.elements.delete(key);
    const lz = run.zones!.keys(LANDFALL_ZONE);
    const bare = computeWater(board, { kind: challenge.kind, strength: challenge.strength, landfall: run.landfallOf(challenge), sheltered: shelterOf(challenge) }, { landfallZoneTiles: lz.length ? lz : undefined });
    const path = [...run.state.elements].filter(([key, inst]) => inst.elementId === "house" && !run.state.isScenery(key) && floodsHouse(damageAt(bare, key))).map(([key]) => key);
    rows.push({
      lostOnCard: outcome.housesTotal - outcome.housesSaved,
      lostBefore: outcome.housesLostBefore,
      saved: outcome.housesSaved,
      total: outcome.housesTotal,
      destroyed: outcome.housesDamaged,
      ruinsInPath: path.filter((key) => {
        const [q, r] = key.split(",").map(Number);
        return elements.isRuined({ q, r });
      }).length,
      ruinedNow: elements.ruinedCount,
      ruinedBefore: before,
      landmarkEvents: script.events.filter((e) => e.type === "landmark").map((e) => ({ key: (e as { key: string }).key, level: (e as { level: number }).level })),
      recordLevels: new Map(landmarks.map((key) => [key, landmarkDamage(record, key)]))
    });
  }
  return { run, elements, rows };
}

// Section 22.4 (owner decision): a storm's card counts it against the homes still standing when it hit, the ones an
// earlier storm ruined on a line of their own; it never reads "0 of N saved" because of earlier losses.
describe("the result card's homes", () => {
  it("counts each storm against the homes still standing, with a line for those lost in earlier storms", () => {
    const { rows } = playStorms(true);
    const later = rows.slice(1).filter((row) => row.lostBefore > 0);
    expect(later.length).toBeGreaterThan(0);
    for (const row of later) {
      const html = homesHtml(row.saved, row.total, row.lostBefore);
      expect(html).toContain(`<b>${row.saved}</b> of ${row.total} homes saved`);
      expect(html).toContain(`Lost in earlier storms: ${row.lostBefore}`);
    }
    // Nothing standing in the path, everything lost before: said in words, never "0 of 0".
    expect(homesHtml(0, 0, 12)).toContain("No home in its path was still standing");
    expect(homesHtml(0, 0, 12)).not.toContain("0 of 0");
    // The first storm has nothing before it: no such line.
    expect(homesHtml(rows[0].saved, rows[0].total, rows[0].lostBefore)).not.toContain("earlier storms");
  });
});

describe("ruined homes", () => {
  for (const defend of [false, true]) {
    it(`equal the homes lost on each result card, storm by storm, and stay for the run (${defend ? "some defences" : "nothing built"})`, () => {
      const { rows } = playStorms(defend);
      expect(rows).toHaveLength(3);
      let total = 0;
      for (const row of rows) {
        expect(row.ruinedNow - row.ruinedBefore).toBe(row.destroyed);
        expect(row.ruinsInPath).toBe(row.lostOnCard + row.lostBefore);
        // Section 22.4: every home this card counts as not saved is one this storm destroyed.
        expect(row.lostOnCard).toBe(row.destroyed);
        total += row.destroyed;
        expect(row.ruinedNow).toBe(total);
      }
      expect(total).toBeGreaterThan(0);
    });
  }

  it("draws a ruin in the ruin pools, hides the house and its fabric, and a repair brings them back", () => {
    const m = new ElementMeshManager();
    m.setStyleResolver(() => style());
    m.place({ q: 1, r: 1 }, "house", 0.5);
    m.setBuildingRuinedVisual({ q: 1, r: 1 });
    m.setBuildingRuinedVisual({ q: 1, r: 1 }); // a second storm: still one ruin
    expect(m.ruinedCount).toBe(1);
    const meshes = (m as unknown as { meshes: Map<string, THREE.InstancedMesh> }).meshes;
    const scale = (mesh: THREE.InstancedMesh, i = 0) => {
      const mat = new THREE.Matrix4();
      mesh.getMatrixAt(i, mat);
      const s = new THREE.Vector3();
      mat.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      return s.y;
    };
    expect(scale(meshes.get("house:two_storey")!)).toBe(0);
    expect(scale(meshes.get("fabric:shop")!)).toBe(0);
    expect(scale(meshes.get("ruin:two_storey")!)).toBeGreaterThan(0);
    expect(scale(meshes.get("ruin:shop")!)).toBeGreaterThan(0);
    // The skyline does not raise a ruin.
    m.setHeightScale({ q: 1, r: 1 }, 1.5);
    expect(scale(meshes.get("house:two_storey")!)).toBe(0);
    m.repairVisual({ q: 1, r: 1 });
    expect(m.ruinedCount).toBe(0);
    expect(scale(meshes.get("house:two_storey")!)).toBeGreaterThan(0);
    expect(scale(meshes.get("ruin:two_storey")!)).toBe(0);
  });
});

describe("damaged landmarks", () => {
  it("break when the storm's water reaches the line, in the script and on the board, and never mend", () => {
    const { run, rows } = playStorms(false);
    const monuments = new MonumentMeshManager(MAP.monuments.map((m) => ({ id: m.id, name: m.name, kind: m.kind, coord: { q: m.q, r: m.r } })), () => 0, () => ({ w: 0.4, d: 0.35, h: 0.5 }));
    let anyDamage = false;
    for (const row of rows) {
      for (const [key, level] of row.recordLevels) {
        const event = row.landmarkEvents.find((e) => e.key === key);
        expect(event?.level ?? 0, key).toBe(level);
      }
      for (const event of row.landmarkEvents) {
        const [q, r] = event.key.split(",").map(Number);
        monuments.setDamage({ q, r }, event.level as 1 | 2);
        anyDamage = true;
      }
    }
    expect(anyDamage).toBe(true);
    const records = [...run.stormRecords.values()];
    for (const m of MAP.monuments) expect(monuments.damageOf({ q: m.q, r: m.r }), m.name).toBe(landmarkDamageSoFar(records, `${m.q},${m.r}`));
    // A lesser hit later never mends it.
    const hit = MAP.monuments.find((m) => monuments.damageOf({ q: m.q, r: m.r }) > 0)!;
    const level = monuments.damageOf({ q: hit.q, r: hit.r });
    monuments.setDamage({ q: hit.q, r: hit.r }, 1);
    expect(monuments.damageOf({ q: hit.q, r: hit.r })).toBe(level);
    // A damaged landmark's model is its own, changed: the same number of triangles, some of them moved or darkened.
    const mesh = monuments.group.children.find((c) => c.name === `monument-landmark:${hit.id}`) as THREE.InstancedMesh;
    expect(mesh).toBeTruthy();
    expect(monuments.group.children.some((c) => c.name === "monument-rubble")).toBe(true);
  });
});

// Section 21 review: a home the resolver lost must ruin during the storm, even when its depth only just crosses the
// line (the hit search steps in 0.02 s and can miss it); before, such a home was a ruin only after a reload.
describe("the storm script", () => {
  it("ruins every home each storm lost, in every play style's run", () => {
    let checked = 0;
    for (const [persona, seed] of [["far", "s1"], ["smart", "s2"], ["smart", "s3"], ["nature", "s4"], ["random", "s5"], ["best", "s6"]] as const) {
      const run = playedRun(persona, seed);
      for (const challenge of run.schedule) {
        const record = run.stormRecords.get(challenge.id)!;
        const script = buildStormScript(record, record.defences, (key) => run.zones!.zoneOf(key));
        const ruined = new Set(script.events.filter((e) => e.type === "house").map((e) => (e as { key: string }).key));
        expect([...ruined].sort(), `${persona} ${challenge.id}`).toEqual([...record.outcome.damagedHouses].sort());
        checked += ruined.size;
      }
    }
    expect(checked).toBeGreaterThan(100);
  }, 600_000);
});

// Section 21 review: the cave-in moves only triangles wholly above its line, so a tall wall reaching the ground is
// never stretched into a sliver or torn from its partner triangle.
describe("a damaged landmark's model", () => {
  it("moves only whole triangles above the cave-in line, for both looks", () => {
    const base = mergeGeometries([box(1, 2, 1, "#c8b89a"), box(0.6, 0.6, 0.6, "#a0522d", 2)].map((g) => g.toNonIndexed()))!;
    const before = base.getAttribute("position");
    for (const level of [1, 2] as const) {
      const after = damagedLandmarkGeometry(base, level, 7).getAttribute("position");
      expect(after.count).toBe(before.count);
      const line = 2.6 * (level === 2 ? 0.4 : 0.55);
      let moved = 0;
      for (let t = 0; t < before.count / 3; t++) {
        const changed = [0, 1, 2].some((k) => Math.abs(after.getY(t * 3 + k) - before.getY(t * 3 + k)) > 1e-6);
        if (!changed) continue;
        moved++;
        for (let k = 0; k < 3; k++) expect(before.getY(t * 3 + k)).toBeGreaterThan(line);
      }
      expect(moved, `level ${level}`).toBeGreaterThan(0);
    }
  });
});
