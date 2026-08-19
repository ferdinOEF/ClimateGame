import * as THREE from "three";
import { createScene } from "@render/scene";
import { TerrainMeshManager } from "@render/terrainMeshManager";
import { FrontierMeshManager } from "@render/frontierMeshManager";
import { GameState } from "@core/gameState";
import { Hud } from "@ui/hud";

const container = document.getElementById("app")!;
const { scene, camera, renderer, start } = createScene(container);

const terrain = new TerrainMeshManager();
const frontier = new FrontierMeshManager();
scene.add(terrain.group);
scene.add(frontier.mesh);

/**
 * Seed at the river mouth per Section 4's geography gradient: estuary,
 * coast/estuary toward one edge, highlands toward the other as the map
 * grows from here.
 */
const SEED_COORD = { q: 0, r: 0 };
const state = new GameState({ coord: SEED_COORD, terrainId: "estuary" });
terrain.placeTile(SEED_COORD, "estuary");

let selectedHandIndex = 0;

const hud = new Hud(container, {
  onSelectHand: (index) => {
    selectedHandIndex = index;
    refreshFrontierHighlight();
    hud.renderHand(state.hand, selectedHandIndex);
  }
});

function refreshFrontierHighlight(): void {
  const frontierCoords = Array.from(state.frontier).map((key) => {
    const [q, r] = key.split(",").map(Number);
    return { q, r };
  });
  const legal = state.legalFrontierFor(state.hand[selectedHandIndex]);
  frontier.update(frontierCoords, legal);
}

function refreshHud(): void {
  hud.setTileCount(state.placed.size);
  hud.renderHand(state.hand, selectedHandIndex);
}

refreshFrontierHighlight();
refreshHud();

function tryPlace(handIndex: number, coord: { q: number; r: number }): boolean {
  const terrainId = state.hand[handIndex];
  if (!state.isLegal(coord, terrainId)) return false;

  state.placeFromHand(handIndex, coord);
  terrain.placeTile(coord, terrainId, { animate: true });

  if (selectedHandIndex >= state.hand.length) selectedHandIndex = 0;
  refreshFrontierHighlight();
  refreshHud();
  return true;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener("click", (event: MouseEvent) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(frontier.mesh);
  if (hits.length === 0 || hits[0].instanceId === undefined) return;

  const coord = frontier.coordForInstance(hits[0].instanceId);
  if (!coord) return;

  tryPlace(selectedHandIndex, coord);
});

start((nowMs) => terrain.tick(nowMs));

/**
 * Dev-only scenario helper (Section 10: "a separate, clearly-labeled
 * developer/debug overlay ... never visible in a normal playthrough" is
 * explicitly sanctioned for testing). Not part of the real UI — no button,
 * no visible affordance. Triggered only via ?autoplace=N in the URL, which
 * exercises the exact same tryPlace() path a real click does.
 */
function devAutoplace(count: number): void {
  for (let i = 0; i < count; i++) {
    const handIdx = state.hand.findIndex((t) => state.legalFrontierFor(t).length > 0);
    if (handIdx === -1) break;
    const coord = state.legalFrontierFor(state.hand[handIdx])[0];
    tryPlace(handIdx, coord);
  }
}

const autoplaceParam = new URLSearchParams(location.search).get("autoplace");
if (autoplaceParam) devAutoplace(Number(autoplaceParam));
