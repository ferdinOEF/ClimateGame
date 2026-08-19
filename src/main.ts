import * as THREE from "three";
import { createScene } from "@render/scene";
import { TerrainMeshManager } from "@render/terrainMeshManager";
import { FrontierMeshManager } from "@render/frontierMeshManager";
import { BuildingMeshManager } from "@render/buildingMeshManager";
import { DefenseMeshManager } from "@render/defenseMeshManager";
import { FloodOverlayManager } from "@render/floodOverlayManager";
import { GameState } from "@core/gameState";
import { axialToWorld } from "@core/hex";
import { resolveMonsoonFlood } from "@core/hazard";
import { Hud } from "@ui/hud";
import { BuildPopover, type PopoverOption } from "@ui/buildPopover";

const container = document.getElementById("app")!;
const { scene, camera, renderer, start } = createScene(container);

const terrain = new TerrainMeshManager();
const frontier = new FrontierMeshManager();
const buildings = new BuildingMeshManager();
const defenses = new DefenseMeshManager();
const floodOverlay = new FloodOverlayManager();
scene.add(terrain.group);
scene.add(frontier.mesh);
scene.add(buildings.group);
scene.add(defenses.group);
scene.add(floodOverlay.mesh);

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
const buildPopover = new BuildPopover(container);

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
  hud.setCoin(state.coin);
  hud.renderHand(state.hand, selectedHandIndex);
}

refreshFrontierHighlight();
refreshHud();

/** Projects a world position to CSS pixel coords within the canvas, for anchoring the build popover. */
function worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
  const v = new THREE.Vector3(x, y, z).project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: ((v.x + 1) / 2) * rect.width,
    y: ((-v.y + 1) / 2) * rect.height
  };
}

// --- Hazard telegraph + resolution -----------------------------------------

const TELEGRAPH_COLOR = new THREE.Color("#0b2033");
const FLOOD_INTERVAL_TURNS = 15;
const FLOOD_TELEGRAPH_TURNS = 2;
let nextFloodAtTurn = FLOOD_INTERVAL_TURNS;

function riverCoords(): { q: number; r: number }[] {
  const coords: { q: number; r: number }[] = [];
  for (const tile of state.placed.values()) {
    if (tile.terrainId === "river") coords.push(tile.coord);
  }
  return coords;
}

function updateFloodTelegraph(): void {
  const turnsUntil = nextFloodAtTurn - state.turn;
  const telegraphing = turnsUntil > 0 && turnsUntil <= FLOOD_TELEGRAPH_TURNS;
  for (const coord of riverCoords()) {
    terrain.setTint(coord, telegraphing ? TELEGRAPH_COLOR : null);
  }
}

/** Resolves the flood: visible in-scene (rising water, defenses absorbing/failing/degrading), not just meter numbers. */
function triggerFlood(baseSeverity: number): void {
  const result = resolveMonsoonFlood(state, baseSeverity);
  const now = performance.now();

  for (const key of result.destroyedDefenses) {
    const [q, r] = key.split(",").map(Number);
    defenses.destroy({ q, r });
  }
  for (const key of result.overwhelmedDefenses) {
    const inst = state.defenses.get(key);
    if (!inst) continue;
    const [q, r] = key.split(",").map(Number);
    defenses.setDegradeVisual({ q, r }, inst.degradeAmount);
  }
  for (const [key, damage] of result.tileDamage) {
    if (damage < 0.08) continue;
    const [q, r] = key.split(",").map(Number);
    const coord = { q, r };
    floodOverlay.show(coord, terrain.heightAt(coord), damage, now);
  }

  for (const coord of riverCoords()) terrain.setTint(coord, null);
  nextFloodAtTurn = state.turn + FLOOD_INTERVAL_TURNS;
}

function tryPlace(handIndex: number, coord: { q: number; r: number }): boolean {
  const terrainId = state.hand[handIndex];
  if (!state.isLegal(coord, terrainId)) return false;

  state.placeFromHand(handIndex, coord);
  terrain.placeTile(coord, terrainId, { animate: true });

  if (selectedHandIndex >= state.hand.length) selectedHandIndex = 0;
  refreshFrontierHighlight();
  refreshHud();

  if (state.turn >= nextFloodAtTurn) triggerFlood(1.0 + Math.random() * 0.6);
  else updateFloodTelegraph();

  return true;
}

// --- Build / defend popover --------------------------------------------------

function openBuildPopover(coord: { q: number; r: number }): void {
  const buildingOptions: PopoverOption[] = state
    .buildableAt(coord)
    .map((d) => ({ id: d.id, name: d.name, buildCost: d.buildCost, kindLabel: "building" }));
  const defenseOptions: PopoverOption[] = state
    .buildableDefensesAt(coord)
    .map((d) => ({ id: d.id, name: d.name, buildCost: d.buildCost, kindLabel: d.category }));
  const options = [...buildingOptions, ...defenseOptions];

  if (options.length === 0) {
    buildPopover.hide();
    return;
  }
  const worldTop = terrain.heightAt(coord);
  const { x: wx, z: wz } = axialToWorld(coord, 1.0);
  const screen = worldToScreen(wx, worldTop + 0.3, wz);

  buildPopover.show(screen.x, screen.y, options, state.coin, (id) => {
    if (buildingOptions.some((o) => o.id === id)) {
      if (!state.build(coord, id)) return;
      buildings.place(coord, id, terrain.heightAt(coord), { animate: true });
    } else {
      if (!state.buildDefense(coord, id)) return;
      defenses.place(coord, id, terrain.heightAt(coord), { animate: true });
    }
    refreshHud();
  });
}

// --- Input -------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener("click", (event: MouseEvent) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([frontier.mesh, ...terrain.raycastTargets]);
  if (hits.length === 0 || hits[0].instanceId === undefined) return;

  const hit = hits[0];
  if (hit.object === frontier.mesh) {
    buildPopover.hide();
    const coord = frontier.coordForInstance(hit.instanceId!);
    if (coord) tryPlace(selectedHandIndex, coord);
    return;
  }

  const coord = terrain.coordForHit(hit.object, hit.instanceId!);
  if (coord) openBuildPopover(coord);
});

start((nowMs) => {
  terrain.tick(nowMs);
  buildings.tick(nowMs);
  defenses.tick(nowMs);
  floodOverlay.tick(nowMs);
});

/**
 * Dev-only scenario helpers (Section 10: a hidden, non-UI debug overlay is
 * explicitly sanctioned for testing). Not part of the real UI — no button,
 * no visible affordance. Triggered only via URL params.
 */
function devAutoplace(count: number): void {
  for (let i = 0; i < count; i++) {
    const handIdx = state.hand.findIndex((t) => state.legalFrontierFor(t).length > 0);
    if (handIdx === -1) break;
    const coord = state.legalFrontierFor(state.hand[handIdx])[0];
    tryPlace(handIdx, coord);
  }
}

/** Prefers a building type not yet built anywhere, so a dev screenshot shows variety rather than one type repeated. */
function devAutoBuild(): void {
  const builtTypes = new Set<string>();
  for (const key of state.placed.keys()) {
    const [q, r] = key.split(",").map(Number);
    const coord = { q, r };
    const options = state.buildableAt(coord);
    const affordable = options.filter((o) => o.buildCost <= state.coin);
    if (affordable.length === 0) continue;
    const pick = affordable.find((o) => !builtTypes.has(o.id)) ?? affordable[0];
    if (state.build(coord, pick.id)) {
      buildings.place(coord, pick.id, terrain.heightAt(coord), { animate: true });
      builtTypes.add(pick.id);
    }
  }
  refreshHud();
}

/** Prefers a defense type not yet built anywhere, so a dev screenshot shows all 3 categories at once. */
function devAutoDefend(): void {
  const builtTypes = new Set<string>();
  for (const key of state.placed.keys()) {
    const [q, r] = key.split(",").map(Number);
    const coord = { q, r };
    const options = state.buildableDefensesAt(coord);
    const affordable = options.filter((o) => o.buildCost <= state.coin);
    if (affordable.length === 0) continue;
    const pick = affordable.find((o) => !builtTypes.has(o.id)) ?? affordable[0];
    if (state.buildDefense(coord, pick.id)) {
      defenses.place(coord, pick.id, terrain.heightAt(coord), { animate: true });
      builtTypes.add(pick.id);
    }
  }
  refreshHud();
}

const params = new URLSearchParams(location.search);
const autoplaceParam = params.get("autoplace");
if (autoplaceParam) devAutoplace(Number(autoplaceParam));
const coinBoost = params.get("coinboost");
if (coinBoost) {
  state.coin += Number(coinBoost);
  refreshHud();
}
if (params.has("autobuild")) devAutoBuild();
if (params.has("autodefend")) devAutoDefend();
const floodParam = params.get("flood");
if (floodParam) triggerFlood(Number(floodParam));
