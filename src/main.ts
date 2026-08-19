import { createScene } from "@render/scene";
import { TerrainMeshManager } from "@render/terrainMeshManager";
import { neighbor, type AxialCoord } from "@core/hex";

const container = document.getElementById("app")!;
const { scene, start } = createScene(container);

const terrain = new TerrainMeshManager();
scene.add(terrain.group);

/**
 * Phase 0 proof-of-life cluster: a hand-placed chain from estuary (river
 * mouth) inland toward the highlands, matching Section 4's geography
 * gradient — coast/estuary on one side, laterite/forest on the other, a
 * continuous river path between them.
 */
const estuary: AxialCoord = { q: 0, r: 0 };
const coast = neighbor(estuary, 4);
const khazan = neighbor(estuary, 2);
const riverA = neighbor(estuary, 1);
const riverB = neighbor(riverA, 1);
const plains = neighbor(riverB, 0);
const forest = neighbor(riverB, 1);
const plateau = neighbor(forest, 1);

terrain.placeTile(estuary, "estuary");
terrain.placeTile(coast, "coast");
terrain.placeTile(khazan, "khazan_flatland");
terrain.placeTile(riverA, "river");
terrain.placeTile(riverB, "river");
terrain.placeTile(plains, "village_plains");
terrain.placeTile(forest, "forest");
terrain.placeTile(plateau, "laterite_plateau");

start();
