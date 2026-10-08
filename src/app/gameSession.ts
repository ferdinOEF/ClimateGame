import * as THREE from "three";
import { createScene } from "@render/scene";
import { TerrainMeshManager } from "@render/terrainMeshManager";
import { ElementMeshManager } from "@render/elementMeshManager";
import { ElementReactions } from "@render/elementReactions";
import { HazardOverlayManager, FLOOD_OVERLAY_COLORS, CYCLONE_OVERLAY_COLORS, type HazardKind } from "@render/floodOverlayManager";
import { CloudLayerManager } from "@render/cloudLayerManager";
import { BoardSkirtManager } from "@render/boardSkirtManager";
import { WaveFrontManager } from "@render/waveFrontManager";
import { StormManager } from "@render/stormManager";
import { StormWater } from "@render/storm/stormWater";
import { StormSky } from "@render/storm/stormSky";
import { StormDirector } from "./stormDirector";
import { combinedDepth as combinedDepthAt } from "@core/hazard";
import { MonumentMeshManager } from "@render/monumentMeshManager";
import { BuildFlourish } from "@render/buildFlourish";
import { ForecastOutline } from "@render/forecastOutline";
import { GameState, type StartingElementSeed } from "@core/gameState";
import { ELEMENT_BY_ID, type ElementDef } from "@core/elements";
import { axialToWorld, type AxialCoord } from "@core/hex";
import { resolveMonsoonFlood, resolveCyclone, type HazardResult } from "@core/hazard";
import { Hud } from "@ui/hud";
import { BuildPopover, type PopoverOption } from "@ui/buildPopover";
import { HazardTestPanel } from "@ui/hazardTestPanel";
import { NuggetPopup } from "@ui/nuggetPopup";
import { playSound } from "@ui/audioHooks";
import { ObjectivesPanel } from "@ui/objectivesPanel";
import { TutorialCoach } from "@ui/tutorialCoach";
import { MapLabelLayer } from "@ui/mapLabels";
import { MapAttribution } from "@ui/attribution";
import { MapLayerControl } from "@ui/mapLayerControl";
import { HeatOverlay } from "@render/heatOverlay";
import { TownDecor } from "@render/townDecor";
import { AmbientLife } from "@render/ambientLife";
import { townLayout, WALL_COLOURS, ROOF_COLOURS } from "@levels/townLayout";
import { Tooltips, buildWhat, tooltipText, missingTooltips } from "@ui/tooltip";
import { StormReport } from "@ui/stormReport";
// `SessionResult` is defined in @core/levelScore (it is expressed purely
// in core types) and re-exported here, so callers that think of it as
// "what a session returns" can still import it from this module.
import { computeLevelScore, type SessionResult } from "@core/levelScore";
export type { SessionResult } from "@core/levelScore";
import { allComplete, evaluateObjectives } from "@core/objectives";
import { RunTracker } from "@core/runStats";
import { hashSeed, Rng } from "@core/rng";
import { Telemetry } from "@core/telemetry";
import { PanjimController } from "./panjimController";
import type { LevelDef } from "@levels/levels";
import { mapForLevel, tilesForLevel } from "@levels/levelMap";
import { boardSetup } from "@levels/balance";
import startingStateData from "@data/startingState.json";

interface StartingStateFile {
  startingCoin: number;
  startingPopulation: number;
  prebuiltHouses: AxialCoord[];
}
const STARTING_STATE = startingStateData as StartingStateFile;

/**
 * One playable attempt at one level.
 *
 * This was the whole game as a top-level module: it built a scene on
 * import, read fixed hazard constants, and ran until the tab closed. The
 * campaign needs the opposite — a session that is configured by a
 * `LevelDef`, can be torn down cleanly, and reports how it went so the app
 * shell can score it and move the player on.
 *
 * So the body below is the original game loop, near-verbatim, with three
 * structural changes and nothing else:
 *
 *   1. It is a function, so the campaign can start a fresh one per level
 *      and `dispose()` the previous one (see the handle returned at the
 *      bottom). Everything that used to be a module-level `const`/`let` is
 *      now a local of this function, which is what makes two sequential
 *      runs genuinely independent rather than sharing stale state.
 *   2. Every hazard number that used to be a module constant now comes
 *      from `level.hazards`. That is the entire level system: pacing and
 *      severity per level, no per-level branching anywhere.
 *   3. Severity is rolled from a seeded `Rng` keyed on the level id rather
 *      than `Math.random()`, so every player faces the same storms on the
 *      same level. See src/core/rng.ts for why a shared leaderboard makes
 *      that mandatory rather than merely tidy.
 *
 * The hazard resolution, telegraph, preview, wave-front and popover logic
 * underneath are untouched.
 */
export interface GameSessionOptions {
  container: HTMLElement;
  level: LevelDef;
  /** Fired once, when the run ends either way. The shell owns what happens next (scoring screen, progression, leaderboard). */
  onFinished: (result: SessionResult) => void;
  /** The player chose to leave mid-run. No result — an abandoned run is not scored. */
  onExit: () => void;
}

export interface GameSessionHandle {
  /** Stops the render loop, clears pending timers and detaches every listener. Safe to call twice. */
  dispose: () => void;
}

/** Whether the player has asked for reduced motion. Wrapped for environments without matchMedia. */
function prefersReducedMotionNow(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function startGameSession(options: GameSessionOptions): GameSessionHandle {
  const { container, level } = options;
  const {
    scene,
    camera,
    renderer,
    sun,
    start,
    focusOn,
    fitTo,
    setShake,
    focusPoint,
    cameraDistance,
    wasDrag,
    frameStats,
    dispose: disposeScene
  } = createScene(container);

  // Severity rolls come from here, never Math.random() — seeded on the
  // level id so the sequence is identical for every player on this level.
  const rng = new Rng(hashSeed(level.id));
  const runTracker = new RunTracker();
  /**
   * Local play telemetry (see @core/telemetry): mirrored to the console and to
   * `window.__telemetry`, never sent anywhere.
   */
  const telemetry = new Telemetry(
    () => performance.now(),
    (event) => console.info(`[telemetry] ${event.name} t=${event.t}ms`, event.data),
    { levelId: level.id }
  );

  /**
   * The place this level is played on, and its tiles (see @levels/levelMap).
   * The tutorial is a 63-tile teaching diagram; every other level is a real
   * stretch of the Goan coast at 400-520 m per hex.
   *
   * Everything downstream — the game state, the terrain meshes, the Ghats
   * backdrop, hazard propagation, the camera — is built from THIS list rather
   * than from a module-level constant, which is what makes two levels on two
   * different coasts genuinely different boards.
   */
  const levelMap = mapForLevel(level);
  const levelTiles = tilesForLevel(level);

  /**
   * The pre-built houses that actually exist on THIS map.
   *
   * `startingState.json` holds one fixed set of coordinates, authored against
   * the original single coastline. Now that each level has its own map, those
   * coordinates may name tiles this map does not have — and seeding an
   * element onto a tile that is not on the board puts the game state and the
   * render state permanently out of step: `GameState` would hold an element
   * at a coord `TerrainMeshManager` has no height for. Filtering here is what
   * makes the shared starting state safe to carry across maps of different
   * shapes. (The list is empty today, so this is guarding the next edit to
   * that file rather than a live fault.)
   */
  const presentTileKeys = new Set(levelTiles.map((tile) => `${tile.coord.q},${tile.coord.r}`));
  const prebuiltHouses = STARTING_STATE.prebuiltHouses.filter((coord) =>
    presentTileKeys.has(`${coord.q},${coord.r}`)
  );
  /**
   * The level's own board setup (levels/balance.ts): on Panjim 2050 a House on
   * every land tile without a monument, their effects scaled, House off the
   * build menu, and the open sea out of bounds. Empty on other levels.
   */
  const setup = boardSetup(level, levelMap);
  const startingElements: StartingElementSeed[] = [
    ...prebuiltHouses.map((coord) => ({ coord, elementId: "house" })),
    ...setup.startingElements
  ];

  /**
   * Every timer this session starts, so `dispose()` can cancel them.
   * Hazard resolution schedules work hundreds of milliseconds out (the
   * arrival beat, each tile's staggered reveal, the aftermath summary); a
   * player who quits to the menu mid-storm would otherwise have those
   * callbacks fire into a torn-down scene.
   */
  const timers = new Set<number>();
  function later(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  }

  /** Set once the run has ended, so a late hazard callback cannot finish it a second time or reopen input. */
  let sessionFinished = false;

  // Declared this early (rather than down with the rest of Section 10's dev
  // hooks) so the Test Hazards panel's own construction, below, can gate on
  // it too — STEP_PROMPT_hazard_mechanics_fixes.md Bug 3: same "no visible
  // affordance without an explicit URL param" bar every other dev tool here
  // already holds itself to (see devAutoBuild's own comment further down).
  const params = new URLSearchParams(location.search);

  const terrain = new TerrainMeshManager();
  const elements = new ElementMeshManager();
  // STEP_PROMPT_hazard_science.md Section 6: one shared manager (not a
  // separate instance per hazard type) so it can tell whether a tile is
  // CURRENTLY showing the other hazard's overlay and blend to a genuine
  // compound color — see floodOverlayManager.ts's own comment.
  const hazardOverlay = new HazardOverlayManager(FLOOD_OVERLAY_COLORS, CYCLONE_OVERLAY_COLORS);
  const cloudLayer = new CloudLayerManager();
  // Purely cosmetic and never fed into GameState: the ground past the edge of
  // play, so the board dissolves into sea and hills instead of ending in a
  // cut. Replaces the old four-column Ghats backdrop — see the manager.
  const boardSkirt = new BoardSkirtManager(levelTiles, terrain.overlayUniforms);
  // STEP_PROMPT_ghats_wave_demo.md Section 2/3: the wave-front spectacle —
  // layered on top of hazardOverlay's own per-tile reveals, not a
  // replacement for them (see WaveFrontManager's own comment).
  const waveFront = new WaveFrontManager();
  /**
   * Rain, a darkening sky, lightning, wind and the impact tremor — see
   * StormManager. Driven by one intensity dial that the telegraph raises
   * gradually and the hazard itself pins at maximum, so the weather is a
   * readable countdown rather than a surprise.
   */
  const storm = new StormManager({ scene, sun });
  /** The ring that spreads across a tile as something lands on it — see BuildFlourish. */
  const buildFlourish = new BuildFlourish();
  /**
   * The creatures and props each element shows: a kingfisher off a mangrove,
   * a cat on a house step. They play on their own, on a staggered timer per
   * element, and a tap on a built tile plays one on top. Reads the board from
   * `elements` every frame, so builds, storm losses, removals and a board
   * reset need no extra wiring; a new level is a new session and so a fresh
   * scheduler. Monuments live in their own manager and never react.
   */
  const reactions = new ElementReactions();
  reactions.setAmbientSource(() => elements.placedElements());
  scene.add(terrain.group);
  scene.add(elements.group);
  scene.add(hazardOverlay.mesh);
  scene.add(cloudLayer.group);
  scene.add(boardSkirt.group);
  scene.add(waveFront.group);
  scene.add(storm.group);
  scene.add(buildFlourish.group);
  scene.add(reactions.group);
  /** Panjim 2050: the locked Forecast's zone edge — see ForecastOutline. Empty on every other level. */
  const forecastOutline = new ForecastOutline();
  scene.add(forecastOutline.group);
  /**
   * Panjim 2050: the warning heat, one instanced layer over the board (see
   * HeatOverlay). Empty on every other level and outside a storm's last five
   * quarters.
   */
  const heatOverlay = new HeatOverlay(levelTiles.length, prefersReducedMotionNow());
  scene.add(heatOverlay.mesh);
  /**
   * Panjim 2050's storms: the water (one instanced layer, drawn from the
   * storm's depth field) and the sky (the cyclone's spiral, the flood's rain
   * band, lightning). Both stay empty and hidden until a storm plays; see
   * StormDirector.
   */
  const stormWater = new StormWater(levelTiles.length);
  const stormSky = new StormSky();
  scene.add(stormWater.mesh);
  scene.add(stormSky.group);
  // The lightning flash on screen: never brighter than a quarter, never more than three a second (StormManager rate-limits).
  const stormFlash = document.createElement("div");
  stormFlash.className = "storm-flash";
  stormFlash.setAttribute("aria-hidden", "true");
  container.appendChild(stormFlash);

  /**
   * A spinning storm marker over the coast — Section 5's "spinning storm
   * icon approaching," in-scene, not text. STEP_PROMPT_pacing_telegraph_
   * preview.md: reactivated alongside the rest of the telegraph system
   * (see updateCycloneTelegraph() below) — this was deleted, not just
   * disconnected, when the schedule was removed, so it's rebuilt here from
   * the pre-removal version (git history), not a one-line reconnection.
   */
  const cycloneIcon = new THREE.Mesh(
    new THREE.TorusGeometry(0.6, 0.12, 6, 5),
    new THREE.MeshStandardMaterial({ color: "#3a3440", flatShading: true, roughness: 0.6 })
  );
  cycloneIcon.visible = false;
  cycloneIcon.rotation.x = Math.PI / 2;
  scene.add(cycloneIcon);

  function keysToCoords(keys: Iterable<string>): AxialCoord[] {
    const coords: AxialCoord[] = [];
    for (const key of keys) {
      const [q, r] = key.split(",").map(Number);
      coords.push({ q, r });
    }
    return coords;
  }

  /**
   * v2.1 (Section 4): the terrain map is fixed and pre-generated by
   * /tools/mapgen, not player-drawn. `placed` holds the whole map.
   * STEP_PROMPT_remove_claiming.md: every tile is buildable from turn one —
   * `claimed` is no longer a growing player footprint, it's always exactly
   * `placed`.
   */
  // Starting Coin is the level's, not startingState.json's — it is one of
  // the main difficulty dials (see src/data/levels.json). The pre-built
  // houses and the map itself stay shared across every level.
  const state = new GameState(levelTiles, startingElements, level.startingCoin);
  for (const [id, scale] of setup.effectScale) state.effectScale.set(id, scale);
  for (const id of setup.excluded) state.excludedElements.add(id);
  for (const key of setup.unbuildable) state.unbuildable.add(key);
  state.severityCreepPerHazard = level.hazards.severityCreepPerHazard;
  terrain.loadMap(levelTiles, keysToCoords(state.claimed));

  /**
   * The map's historic buildings.
   *
   * Built after `terrain.loadMap` because each one has to sit on its tile's
   * actual top surface, which only the terrain manager knows. Their tiles are
   * then marked reserved so nothing can be built on them — the one gameplay
   * consequence a heritage building has here. They are kept out of
   * `state.elements` entirely, so no meter, objective, hazard or achievement
   * can see them (see `GameState.reserved`).
   */
  const monuments = new MonumentMeshManager(
    levelMap.monuments
      // A monument whose tile was cropped away by `mapRadius` would float over
      // nothing. No level crops today; this guards the feature.
      .filter((monument) => presentTileKeys.has(`${monument.q},${monument.r}`))
      .map((monument) => ({
        id: monument.id,
        name: monument.name,
        kind: monument.kind,
        coord: { q: monument.q, r: monument.r }
      })),
    (coord) => terrain.heightAt(coord)
  );
  scene.add(monuments.group);
  for (const key of monuments.occupiedKeys()) state.reserved.add(key);

  /**
   * The town plan (levels/townLayout.ts), on a level that pre-builds its
   * town: which building kind and colours each House is drawn with, the
   * gardens, and the major roads. Purely how the town looks; the game counts
   * every building as one House.
   */
  const town = level.houses?.fillLand ? townLayout(levelMap, level.id) : null;
  let townDecor: TownDecor | null = null;
  let ambientLife: AmbientLife | null = null;
  if (town) {
    const walls = WALL_COLOURS.map((hex) => new THREE.Color(hex));
    const roofs = ROOF_COLOURS.map((hex) => new THREE.Color(hex));
    elements.setStyleResolver((coord) => {
      const plot = town.buildings.get(`${coord.q},${coord.r}`);
      return plot ? { kind: plot.kind, wall: walls[plot.wall], roof: roofs[plot.roof], scale: plot.scale, turns: plot.turns } : null;
    });
    townDecor = new TownDecor(town, (coord) => terrain.heightAt(coord));
    scene.add(townDecor.group);
    ambientLife = new AmbientLife(town, levelTiles, (coord) => terrain.heightAt(coord), terrain.height("land"), prefersReducedMotionNow(), levelMap.focus);
    scene.add(ambientLife.group);
    // The gardens join the creature scheduler: pigeons lift out of the trees
    // now and then, under its usual caps (one spawn a frame, a ceiling on how
    // many are out), and at most one garden a second.
    const gardenPoints = [...town.gardens].map((key) => {
      const [q, r] = key.split(",").map(Number);
      const { x, z } = axialToWorld({ q, r }, 1.0);
      return { key: `${key}:garden`, elementId: "garden", x, y: terrain.heightAt({ q, r }), z };
    });
    reactions.setAmbientSource(function* () {
      yield* elements.placedElements();
      yield* gardenPoints;
    });
    reactions.setAmbientRateCap("garden", 1);
  }

  // Section 4/8's new starting state: the player already owns a small
  // residential cluster of pre-built Houses on Land, inland from the coastal
  // claim — render them in place at boot, no settle animation (they were
  // never "just built," they're already there).
  for (const seed of startingElements) {
    elements.place(seed.coord, seed.elementId, terrain.heightAt(seed.coord));
  }
  // Hundreds of pre-built houses would otherwise keep a cat on screen
  // somewhere every frame; two house reactions a second is plenty.
  if (setup.startingElements.length > 0) reactions.setAmbientRateCap("house", 2);

  // Each map carries its own focus point, chosen when the map was built to
  // put sea, sand, river and town in one frame. A map's (0,0) is wherever its
  // grid happened to centre, which on a georeferenced map is a latitude and
  // longitude, not anywhere a player would want to be looking.
  /** The opening frame's extent, so a staged challenge can hand the camera back where the player started. */
  let openingFit = { width: 20, depth: 20 };
  /**
   * The opening frame: centred on the map's focus point, pulled back far
   * enough to hold the whole board.
   *
   * Measured from the tiles actually in play rather than from the map file's
   * declared grid size, so a level using `mapRadius` to crop a corner is
   * framed on the corner it is playing rather than on the map it came from.
   *
   * The half-tile padding is the tile's own radius: `axialToWorld` returns
   * hex CENTRES, so a bound taken straight from them cuts the outermost ring
   * of tiles in half.
   */
  {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const tile of levelTiles) {
      const { x, z } = axialToWorld(tile.coord, 1.0);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    // Centred on the map's own focus point, not the board's geometric centre.
    //
    // Those were the same thing while every board fit on screen, and the
    // geometric centre was the better rule then — anything else put dead space
    // on one side. Panaji is 104 world units across and cannot be framed whole
    // at any readable zoom, so the opening shot has to be a choice about what
    // matters, and the focus point is where each map records that choice.
    //
    // `fitTo` is still given the whole board: it clamps to the camera's
    // maximum when the board is too big, which is the right behaviour — pull
    // back as far as is useful, then stop.
    //
    // `immediate` on both: the opening frame is an establishing shot, not a
    // move. Letting the camera glide in from wherever it was initialised
    // would read as the game correcting a mistake.
    const focus = axialToWorld(levelMap.focus, 1.0);
    focusOn(focus.x, focus.z, true);
    openingFit = { width: maxX - minX + Math.sqrt(3), depth: maxZ - minZ + 2 };
    fitTo(openingFit.width, openingFit.depth, true);
  }

  const hud = new Hud(container, {
    onPreviewToggle: () => toggleHudPreview(),
    onBack: () => options.onExit()
  });
  const buildPopover = new BuildPopover(container);
  /**
   * Hover tooltips for every HUD control (see ui/tooltip.ts; the wording is in
   * src/data/tooltips.json). The shared HUD and the build menu are wired here;
   * Panjim 2050's own controls are wired by its controller.
   */
  const tooltips = new Tooltips(container);
  buildPopover.tooltips = tooltips;
  {
    const q = <T extends HTMLElement>(selector: string): T | null => container.querySelector<T>(selector);
    const attach = (selector: string, key: string, values?: () => Record<string, string | number>): void => {
      const el = q(selector);
      if (el) tooltips.attach(el, key, values);
    };
    attach(".instrument-cluster .coin-row", "coin", () => ({
      coin: Math.round(state.coin),
      income: Math.round(panjim ? panjim.run.incomePerQuarter : state.income)
    }));
    attach(".instrument-cluster .income-row", "income");
    attach(".instrument-cluster .resilience-gauge", "resilience");
    const chips = container.querySelectorAll<HTMLElement>(".instrument-cluster .meter-chip");
    ["biodiversity", "carbon", "food", "population"].forEach((key, i) => chips[i] && tooltips.attach(chips[i], key));
    attach(".instrument-cluster .cluster-collapse-toggle", "collapse");
    attach(".instrument-cluster .cluster-pill", "expand");
    attach(".instrument-cluster .preview-toggle", "previewToggle");
    attach(".instrument-cluster .hazard-incoming", "hazardIncoming");
    attach(".hud-chrome .back-button", "back");
    attach(".hud-chrome .help-button", "help");
  }
  /**
   * Panjim 2050's slow changes, redrawn as the clock moves: each growing
   * defence's maturity (small and pale when planted, full at maturity), and
   * the skyline, whose houses rise a little as the decades pass so 2050 does
   * not look like 2025. Cheap: one pass over the standing elements.
   */
  function syncPanjimVisuals(): void {
    if (!panjim) return;
    const age = panjim.run.quarter / panjim.run.totalQuarters;
    for (const [key, inst] of state.elements) {
      const def = ELEMENT_BY_ID.get(inst.elementId);
      if (!def) continue;
      const [q, r] = key.split(",").map(Number);
      if ((def.matureQuarters ?? 0) > 0) elements.setGrowth({ q, r }, state.maturityFraction(inst, def));
      else if (def.kind === "building") {
        // Not every house rises equally: a fixed per-tile share, so the
        // skyline grows uneven, the way a city does.
        const share = 0.35 + (((q * 92821) ^ (r * 68917)) & 255) / 255;
        elements.setHeightScale({ q, r }, 1 + age * 0.55 * share);
      }
    }
  }

  /**
   * The live objective checklist.
   *
   * Replaces `EraEndScreen` in this file. That screen answered "the era
   * ended, here is your score", which the app shell now owns (it needs to
   * record progress and submit to the leaderboard before showing anything).
   * What the *session* needs instead is the thing the sandbox never had: a
   * persistent, visible statement of what this level is asking for, ticking
   * off as the player gets there.
   *
   * That is the single biggest engagement change in this pass. A sandbox
   * with no stated goal gives a player nothing to be pulled toward; the same
   * board with three checkable objectives in the corner gives them a reason
   * to make the next move.
   */
  const objectivesPanel = new ObjectivesPanel(container, level, levelMap);
  /**
   * The Panjim 2050 run, on a level whose time model is `"actions"` (see
   * src/core/actionRun.ts). `null` on every other level, the tutorial
   * included, which keep the turn model exactly as it was. Every call site
   * below checks it, and it takes over pacing entirely when present: no
   * interval hazards, no objective-driven early finish.
   */
  const panjim =
    level.timeModel === "actions" && level.timeline
      ? new PanjimController({
          container,
          state,
          level,
          telemetry,
          placeElement: (coord, elementId) => placeElement(coord, elementId, true),
          removeElementVisual: (coord) => elements.destroy(coord),
          refresh: () => {
            syncPanjimVisuals();
            refreshHud();
            refreshPreview();
          },
          onRunComplete: (result) => finishRun(true, result),
          revealSkyline: () => {
            // Up and back over the whole city, the light clearing.
            stormImpactActive = false;
            storm.setIntensity(0);
            mapLabels.setVisible(true);
            const focus = axialToWorld(levelMap.focus, 1.0);
            focusOn(focus.x, focus.z + 4, false);
            fitTo(openingFit.width * 1.15, openingFit.depth * 1.15, false);
          },
          showBanner: (text, ms) => hud.showBanner(text, ms),
          seed: params.get("seed") ?? level.id,
          zones: levelMap.zones,
          showForecastZones: (tiles) => {
            forecastOutline.show(
              tiles.map((tile) => tile.coord),
              (coord) => terrain.heightAt(coord)
            );
            refreshPreview();
          },
          clearForecastZones: () => {
            forecastOutline.clear();
            refreshPreview();
          },
          project: (coord) => {
            const { x, z } = axialToWorld(coord, 1.0);
            return worldToScreen(x, terrain.heightAt(coord) + 0.4, z);
          },
          repairVisual: (coord) => elements.repairVisual(coord),
          focus: levelMap.focus,
          mountVoices: (el) => objectivesPanel.mountBody(el),
          showHeat: (tiles) => {
            heatOverlay.show(
              tiles.map((tile) => {
                const [q, r] = tile.key.split(",").map(Number);
                return { coord: { q, r }, heat: tile.heat, hatch: tile.hatch, pulse: tile.pulse, shield: tile.shield };
              }),
              (coord) => terrain.heightAt(coord)
            );
            // The heat takes over from the Forecast's zone outline: one
            // statement about where the storm goes, not two on top of each other.
            forecastOutline.group.visible = !tiles.some((tile) => tile.heat > 0);
          },
          landmarks: levelMap.landmarks,
          uiBlocked: () => buildPopover.isOpen || objectivesPanel.briefOpen,
          tooltips,
          focusCamera: (coord, close, zoom = 1) => {
            const world = axialToWorld(coord, 1.0);
            focusOn(world.x, world.z, false);
            if (close) fitTo(26 * zoom, 16 * zoom, false);
          },
          celebrateCombo: (tiles) => {
            const gold = new THREE.Color("#f2c35b");
            tiles.forEach((coord, i) => {
              later(() => {
                const world = axialToWorld(coord, 1.0);
                buildFlourish.play(world.x, terrain.heightAt(coord), world.z, performance.now());
                terrain.setTint(coord, gold, 0.55);
                const inst = state.elements.get(`${coord.q},${coord.r}`);
                if (inst) reactions.trigger(inst.elementId, world.x, terrain.heightAt(coord), world.z);
              }, 120 * i);
              later(() => terrain.setTint(coord, null), 1600 + 120 * i);
            });
          },
          challengeFx: {
            play: (record, defences, hooks) => stormDirectorFor().play(record, defences, hooks),
            freeze: (seconds) => stormDirectorFor().freezeAt(seconds),
            isPlaying: () => stormDirector?.playing ?? false,
            begin: (challenge) => panjimFxBegin(challenge.kind),
            zone: (zone, outcome, slow, durationMs, onHouseLost) => panjimFxZone(zone, outcome, slow, durationMs, onHouseLost),
            end: () => panjimFxEnd()
          },
          redrawBoard: () => redrawPanjimBoard(),
          offerResume: (label, onResume) => objectivesPanel.addBriefAction(label, onResume)
        })
      : null;
  if (panjim) hud.useQuarterClock();
  /**
   * The step-by-step coach, on the tutorial level only.
   *
   * Constructed as `null` everywhere else, so a normal level builds no extra
   * DOM at all — the same "no visible affordance unless it applies" bar the
   * dev panels hold themselves to. Every call site below uses `?.`.
   *
   * It reads state and renders text; it never drives the board. See
   * TutorialCoach's own comment for why that separation matters: the
   * tutorial's actual win conditions are ordinary objectives in levels.json,
   * so a fault in the coach cannot make the level unwinnable.
   */
  const tutorialCoach = level.tutorial ? new TutorialCoach(container) : null;
  /**
   * Place names over the board — "Miramar Beach", "Fort Aguada" — read from
   * the map's own landmark list.
   *
   * This is what makes a real-world map legible as one. Without it the player
   * is looking at a well-arranged set of coloured hexes with no reason to
   * connect them to anywhere; with it, the campaign's actual subject becomes
   * visible rather than merely asserted in the brief.
   */
  /**
   * The after-storm explanation — what absorbed what, and why the damage
   * landed where it did. This is the piece that makes the game teach rather
   * than merely simulate; see StormReport.
   */
  const stormReport = new StormReport(container);
  const mapLabels = new MapLabelLayer(
    container,
    // Filtered to tiles this level actually plays on. A `mapRadius` level
    // crops its map, and `terrain.heightAt` returns 0 for a tile that was
    // cropped away — so an unfiltered label would be pinned to sea level over
    // empty space, naming a place that is not on the board. No level crops
    // today; this is guarding the feature, not a live fault.
    levelMap.landmarks.filter((landmark) => presentTileKeys.has(`${landmark.q},${landmark.r}`))
  );
  /**
   * The OpenStreetMap credit, on any board whose geography was derived from
   * OpenStreetMap data.
   *
   * The map imagery itself is gone — the tiles are flat palette colours again —
   * but the coastline, the river, the estuary and the sixteen landmark
   * positions are all still read out of OpenStreetMap, and the ODbL asks for
   * the credit on a derived database just as it does on a rendered one. Driven
   * off the map's own `source` block, so a board cannot acquire real geography
   * without the credit that pays for it.
   */
  // The street-map switch and the credit share one corner element — see
  // `.map-corner` in hud.css. On a phone it sits under the instrument
  // cluster, whose height changes as it collapses, so its bottom is tracked.
  const mapCorner = levelMap.source ? document.createElement("div") : null;
  let mapCornerObserver: ResizeObserver | null = null;
  if (mapCorner) {
    mapCorner.className = "map-corner";
    container.appendChild(mapCorner);
    const cluster = container.querySelector<HTMLElement>(".instrument-cluster");
    if (cluster && typeof ResizeObserver === "function") {
      const place = (): void => {
        const top = cluster.getBoundingClientRect().bottom - container.getBoundingClientRect().top + 8;
        mapCorner.style.setProperty("--map-corner-top", `${Math.round(top)}px`);
      };
      mapCornerObserver = new ResizeObserver(place);
      mapCornerObserver.observe(cluster);
      mapCornerObserver.observe(container);
      place();
    }
  }
  const mapAttribution = levelMap.source && mapCorner ? new MapAttribution(mapCorner, levelMap.source.attribution) : null;

  /*
   * The OpenStreetMap layer, on maps that ship one.
   *
   * The image is only requested here, after the level has started, and only
   * for a map that has it — the tutorial never downloads a byte of it. Until it
   * arrives the board simply shows its tiles. If it fails to load (offline, a
   * bad deploy) the switch goes away with it rather than toggling nothing.
   */
  const overlay = levelMap.overlay;
  let mapLayerControl: MapLayerControl | null = null;
  let overlayTexture: THREE.Texture | null = null;
  if (overlay) {
    const applyLayer = (settings: { visible: boolean; opacity: number }): void =>
      terrain.setOverlayOpacity(settings.visible ? settings.opacity : 0);
    // Prepended so the switch stacks above the credit.
    mapLayerControl = new MapLayerControl(mapCorner ?? container, applyLayer, true);
    applyLayer(mapLayerControl.current);
    const layerToggle = container.querySelector<HTMLElement>(".map-layer-control input[type=checkbox]");
    const layerSlider = container.querySelector<HTMLElement>(".map-layer-control input[type=range]");
    if (layerToggle) tooltips.attach(layerToggle, "streetMap");
    if (layerSlider) tooltips.attach(layerSlider, "streetMapOpacity", () => ({ pct: Math.round((mapLayerControl?.current.opacity ?? 0) * 100) }));
    new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}${overlay.image}`,
      (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        overlayTexture = texture;
        terrain.setOverlayTexture(texture, overlay.world);
      },
      undefined,
      () => {
        console.warn(`[map] could not load the map layer ${overlay.image}`);
        mapLayerControl?.dispose();
        mapLayerControl = null;
      }
    );
  }
  /** Set the first time a tile menu opens — the coach's second step waits on it. */
  let hasOpenedTileMenu = false;
  /**
   * STEP_PROMPT_knowledge_nuggets.md Part C: the "Discovery Badge" —
   * appears from `openTilePopover()`'s build callback below, on any
   * successful build of a nugget-eligible element. A player-facing
   * moment, not something a scripted bulk-build should spam — the
   * `devAutoBuild`/`__buildForTest` dev-only paths deliberately don't
   * call `nuggetPopup.show()`. The visibility callback suppresses
   * `.empty-prompt` (bottom-center) for exactly as long as the badge
   * itself is showing — see `Hud.setEmptyPromptSuppressed()`'s own
   * comment for the real overlap this fixes.
   */
  const nuggetPopup = new NuggetPopup(container, (visible) => hud.setEmptyPromptSuppressed(visible));
  /**
   * STEP_PROMPT_hazard_mechanics_fixes.md Bug 3: the same category of tool
   * as `devAutoBuild`/`?coinboost`/`?resilienceboost` — testing-only, not
   * meant for players — so it gets the same "no visible affordance without
   * the URL param" treatment those already have, instead of shipping as an
   * always-present button. `null` when the param is absent; every call site
   * below uses `?.`, so a normal visit constructs nothing extra at all.
   *
   * Calls straight into triggerCyclone/triggerFlood below (function
   * declarations — hoisted, safe to reference here) so a manual trigger
   * behaves exactly like clicking "Trigger now" in every way. STEP_PROMPT_
   * manual_only_mode.md: neither function has an era-end consequence to
   * skip anymore — nothing auto-resets the board now, ever — so there's no
   * `skipEraCheck` option left to pass here.
   *
   * STEP_PROMPT_pacing_telegraph_preview.md: stays exactly as it is,
   * permanently, alongside the now-live scheduled/telegraphed loop — a
   * separate testing tool, not a placeholder for it. A manual trigger mid-
   * telegraph can't produce a confusing double-telegraph: triggerFlood()/
   * triggerCyclone() themselves clear all telegraph state (tint, cloud
   * layer, the storm icon, `pendingFloodSeverity`/`pendingCycloneSeverity`)
   * and reset `nextFloodAtTurn`/`nextCycloneAtTurn` regardless of which path
   * called them, so the schedule can never end up telegraphing toward an
   * event that already happened.
   */
  const hazardTestPanel = params.has("debughazards")
    ? new HazardTestPanel(container, {
        onTriggerStorm: (severity) => triggerCyclone(severity),
        onTriggerFlood: (severity) => triggerFlood(severity),
        onResetBoard: () => resetBoard(),
        // STEP_PROMPT_pacing_telegraph_preview.md Section 3: the panel's own
        // per-row checkboxes preview at whatever severity the slider is
        // currently set to, independent of the real schedule — a separate
        // registry key ("panel-*") from the HUD's own toggle ("hud-*"), so
        // both can preview at once without one clobbering the other.
        onPreviewChange: (kind, active, severity) => {
          setPreviewSource(`panel-${kind}`, active ? { kind, severity } : null);
          refreshPreview();
        }
      })
    : null;

  // STEP_PROMPT_welcome_dialog.md's title moment has moved out of the
  // session and into the app shell's menu screen, which is now the actual
  // "first thing you see". What belongs *here* is per-level framing, which
  // ObjectivesPanel shows as the level brief when it mounts.

  /**
   * STEP_PROMPT_pacing_telegraph_preview.md Section 1: re-wired back
   * into `refreshHud()` below — the scheduled/telegraphed loop is the real
   * game's pacing now (confirmed directly with the project owner; STEP_
   * PROMPT_remove_schedule_confirm_shadowing.md's removal was a testing-
   * phase choice, not the shipped design). This genuinely was close to a
   * one-line reconnection, exactly as that pass's own comment predicted —
   * the function itself needed no changes, only its call site.
   */
  function hazardIncomingInfo(): { kind: "Storm Surge" | "Flood"; turnsUntil: number; imminent: boolean }[] {
    // Panjim 2050 has its own outlook; the interval readout does not apply.
    if (panjim) return [];
    const stormTurnsUntil = nextCycloneAtTurn - state.turn;
    const stormImminent = stormTurnsUntil > 0 && stormTurnsUntil <= CYCLONE_TELEGRAPH_TURNS;

    // STEP_PROMPT_ghats_wave_demo.md Section 1: with the Flood schedule
    // disabled, nextFloodAtTurn never advances — without this guard, once
    // state.turn passed it, this would show a stale/frozen "Flood in 0
    // turns" forever (turnsUntil clamps to 0 for display) instead of just
    // not mentioning a hazard that was never going to fire.
    if (!FLOOD_HAZARD_ENABLED) {
      return [{ kind: "Storm Surge", turnsUntil: stormTurnsUntil, imminent: stormImminent }];
    }

    const floodTurnsUntil = nextFloodAtTurn - state.turn;
    const floodImminent = floodTurnsUntil > 0 && floodTurnsUntil <= FLOOD_TELEGRAPH_TURNS;

    // Once at least one hazard is genuinely imminent (same condition the
    // terrain-tint/cloud telegraph already use), show every imminent
    // hazard's own line, urgent — never collapsed to one, since a compound
    // event (both imminent at once) is exactly the case worth surfacing
    // clearly, not hiding.
    if (stormImminent || floodImminent) {
      const lines: { kind: "Storm Surge" | "Flood"; turnsUntil: number; imminent: boolean }[] = [];
      if (stormImminent) lines.push({ kind: "Storm Surge", turnsUntil: stormTurnsUntil, imminent: true });
      if (floodImminent) lines.push({ kind: "Flood", turnsUntil: floodTurnsUntil, imminent: true });
      return lines;
    }

    // Neither imminent yet — a single neutral line for whichever is closer.
    return stormTurnsUntil <= floodTurnsUntil
      ? [{ kind: "Storm Surge", turnsUntil: stormTurnsUntil, imminent: false }]
      : [{ kind: "Flood", turnsUntil: floodTurnsUntil, imminent: false }];
  }

  function refreshHud(): void {
    hud.setTileCount(state.claimed.size);
    // Panjim 2050's income is per quarter, into the jar, at the level's scale.
    hud.setCoin(state.coin, panjim ? panjim.run.incomePerQuarter : state.income);
    hud.setTurnEra(state.turn, state.erasCompleted + 1); // 1-based ("Era 1" from turn one)
    hud.setMeters({
      resilience: state.resilience,
      biodiversity: state.biodiversity,
      carbon: state.carbon,
      food: state.food,
      population: state.population
    });
    const incoming = hazardIncomingInfo();
    hud.setHazardIncoming(incoming);
    syncHudPreviewAvailability(incoming);
    hud.setEmptyTiles(state.emptyTileCount);

    // Sampling here (rather than only on discrete events) is what lets a
    // peak-tracked objective notice a meter that rose and fell again between
    // two hazards — see RunTracker.sampleMeters.
    runTracker.sampleMeters({ resilience: state.resilience, biodiversity: state.biodiversity, carbon: state.carbon });
    refreshObjectives();

    // Driven from here rather than from the build handler, so the coach also
    // keeps pace with things the player did not click: a storm resolving, a
    // defence being lost, a meter crossing a line.
    if (tutorialCoach && !tutorialCoach.isFinished) {
      tutorialCoach.update({
        standingByElement: standingCounts().byElement,
        turn: state.turn,
        hazardsSurvived: runTracker.snapshot().hazardsSurvived,
        hasOpenedTileMenu
      });
    }
  }

  /**
   * Re-evaluates the level's objectives and repaints the checklist. Cheap —
   * a handful of map walks over a ~200-tile board — so it runs on every HUD
   * refresh rather than trying to guess which actions could have changed an
   * objective.
   */
  function refreshObjectives(): boolean {
    const progress = evaluateObjectives(level.objectives, state, runTracker.snapshot());
    objectivesPanel.render(progress);
    return allComplete(progress);
  }

  /**
   * Opens the after-storm explanation.
   *
   * The shares are normalised against the energy that actually ARRIVED, not
   * against the severity the storm was rolled at. Those differ: a wave loses
   * energy to distance whether or not anything is defending, and crediting
   * the player's mangroves with the decay of open water would be the kind of
   * flattering arithmetic that makes the whole lesson untrustworthy.
   */
  function showStormReport(kind: "Flood" | "Storm Surge", result: HazardResult): void {
    const arrived = result.arrivedSeverity;
    if (arrived <= 0) return; // nothing reached a damageable tile; there is nothing to explain

    const absorbedByCategory = new Map<string, number>();
    for (const [category, amount] of result.absorbedByCategory) {
      absorbedByCategory.set(category, amount / arrived);
    }

    const standing = standingCounts().byCategory;
    stormReport.show({
      kind,
      absorbedByCategory,
      unprotectedShare: result.unprotectedSeverity / arrived,
      // Buildings are only damaged by Storm Surge (see `triggerCyclone`), so
      // a Flood report correctly reports none rather than reusing a stale
      // count from the last surge.
      buildingsDamaged: kind === "Storm Surge" ? lastBuildingsDamaged : 0,
      defencesLost: result.destroyedDefenses.length,
      defencesOverwhelmed: result.overwhelmedDefenses.length,
      hasNoNatureDefences: (standing.get("nbs") ?? 0) === 0
    });
    lastBuildingsDamaged = 0;
  }

  /** Standing element and category counts on the current board — the shape achievements want. */
  function standingCounts(): { byElement: Map<string, number>; byCategory: Map<string, number> } {
    const byElement = new Map<string, number>();
    const byCategory = new Map<string, number>();
    for (const inst of state.elements.values()) {
      byElement.set(inst.elementId, (byElement.get(inst.elementId) ?? 0) + 1);
      const category = ELEMENT_BY_ID.get(inst.elementId)?.category;
      if (category) byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    }
    return { byElement, byCategory };
  }

  /**
   * Ends the run exactly once and hands the result to the shell.
   *
   * Guarded because both endings can race: a hazard's aftermath callback
   * fires on a timer, and the objective check runs synchronously on the
   * build that triggered that same hazard. Without the guard, a build that
   * both completes the level and starts the storm that kills the player
   * could report the run twice.
   */
  function finishRun(completed: boolean, panjimResult?: import("@core/panjimIndex").PanjimIndex): void {
    if (sessionFinished) return;
    sessionFinished = true;

    buildPopover.hide();
    clearAllPreviews();
    // The run is over and the shell is about to draw its results screen; a
    // coach still telling the player to plant a mangrove would be instructing
    // them to act on a board that is now read-only.
    tutorialCoach?.dismiss();

    const stats = runTracker.snapshot();
    const counts = standingCounts();
    const baseScore = computeLevelScore({
      state,
      stats,
      parTurns: level.parTurns,
      starThresholds: level.starThresholds,
      completed
    });
    // Panjim 2050 is scored by its index plus the stars from its three
    // storms; real playtime is never part of it (see core/panjimIndex.ts).
    const score = panjimResult
      ? {
          ...baseScore,
          total: panjimResult.score,
          stars: panjimResult.levelStars,
          rows: [
            { label: "Panjim 2050 index", value: panjimResult.index * 10 },
            ...panjimResult.challengeStars.map((stars, i) => ({ label: `Storm ${i + 1} stars`, value: stars * 100 }))
          ]
        }
      : baseScore;

    playSound(completed ? "build" : "era_end");
    telemetry.emit("run_end", {
      total_ms: Math.round(panjim ? panjim.playMs() : telemetry.elapsed()),
      actions: telemetry.actions,
      completed,
      score: score.total,
      index: panjimResult?.index ?? null
    });
    options.onFinished({
      levelId: level.id,
      completed,
      score,
      stats,
      turns: state.turn,
      standingByElement: counts.byElement,
      standingByCategory: counts.byCategory
    });
  }

  /** Projects a world position to CSS pixel coords within the canvas, for anchoring the build popover. */
  function worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: ((v.x + 1) / 2) * rect.width,
      y: ((-v.y + 1) / 2) * rect.height
    };
  }

  /**
   * STEP_PROMPT_pacing_telegraph_preview.md: reactivated alongside the
   * telegraph system below (deleted, not just disconnected, by the schedule
   * removal — see cycloneIcon's own comment above for why this is a rebuild
   * from git history, not a reconnection).
   */
  function tilesOfType(...terrainIds: string[]): AxialCoord[] {
    const coords: AxialCoord[] = [];
    for (const tile of state.placed.values()) {
      if (terrainIds.includes(tile.terrainId)) coords.push(tile.coord);
    }
    return coords;
  }

  // STEP_PROMPT_hazard_science.md Section 6: how long one BFS round gets on
  // screen before the next round's tiles light up — ported from khazan_
  // hazard_prototype.html's HOP_DURATION. PLACEHOLDER, same "flag it, let
  // balance/feel tuning refine it" convention as every other number here.
  const ROUND_DURATION_MS = 550;

  /**
   * Below this, a tile's damage is not worth drawing an overlay for — and,
   * by the same token, not worth counting as "the coast was breached here".
   * Previously duplicated as a bare 0.08 at each of the two reveal sites;
   * named once now that the run tracker keys "perfect defence" off the same
   * number and the three must not drift apart.
   */
  const DAMAGE_VISIBLE_THRESHOLD = 0.08;

  /**
   * Applies a resolved hazard's game-state side effects immediately (defense
   * destruction/degrade visuals), then reveals each damaged tile's overlay
   * staggered by `result.arrivalRound` — so the sweep visually matches the
   * real hop-by-hop BFS resolution (Section 6 item 1/2) instead of every
   * damaged tile popping in at once regardless of how far it was from the
   * source.
   *
   * STEP_PROMPT_pacing_telegraph_preview.md Section 2: each tile's
   * reveal also plays a sound scoped to what actually happened there — a
   * catastrophic breach doesn't sound the same as a defense quietly holding.
   * Deliberately NOT one sound per damaged tile (a severe event can damage
   * dozens at once; a sound per tile would be noise, literally) — only the
   * two dramatic, comparatively rare outcomes get their own cue.
   */
  // STEP_PROMPT_remove_schedule_confirm_shadowing.md Part B: the most recent
  // resolved hazard's raw per-tile damage, exposed read-only via
  // __lastHazardResultForTest below — the verification harness needs the
  // actual numbers (not just an overlay's visibility) to confirm a tile
  // behind a defended line took zero/near-zero damage.
  let lastHazardResult: HazardResult | null = null;
  /** Buildings damaged by the most recent Storm Surge, for the after-storm report. Only Storm Surge damages buildings. */
  let lastBuildingsDamaged = 0;

  function applyHazardResult(kind: HazardKind, result: HazardResult, now: number): void {
    lastHazardResult = result;
    // Full force, and held there until the sweep finishes — see
    // `showAftermathAndCheckEraEnd`, which is what lets it clear again.
    stormImpactActive = true;
    storm.setIntensity(1);
    // Place names come off the board for the duration of the sweep. The whole
    // point of the staggered reveal is to show the player exactly where the
    // water got through, and five labels sitting over the tiles that are
    // lighting up is the one moment they actively get in the way.
    mapLabels.setVisible(false);
    // Log the event before any of the visual staging below — objectives and
    // achievements read this, and a player who quits mid-sweep should still
    // have the hazard counted as weathered.
    //
    // DAMAGE_VISIBLE_THRESHOLD is the same 0.08 the reveal loop below uses to
    // decide a tile is worth drawing an overlay for, so "damaged tiles" here
    // means exactly the tiles the player will watch light up.
    let totalDamage = 0;
    let damagedTiles = 0;
    for (const damage of result.tileDamage.values()) {
      totalDamage += damage;
      if (damage >= DAMAGE_VISIBLE_THRESHOLD) damagedTiles++;
    }
    runTracker.recordHazard({
      totalDamage,
      damagedTiles,
      destroyed: result.destroyedDefenses.length,
      overwhelmed: result.overwhelmedDefenses.length
    });
    for (const key of result.destroyedDefenses) {
      const [q, r] = key.split(",").map(Number);
      elements.destroy({ q, r });
    }
    for (const key of result.overwhelmedDefenses) {
      const inst = state.elements.get(key);
      if (!inst) continue;
      const [q, r] = key.split(",").map(Number);
      elements.setDegradeVisual({ q, r }, inst.degradeAmount);
    }
    for (const [key, damage] of result.tileDamage) {
      if (damage < DAMAGE_VISIBLE_THRESHOLD) continue;
      const [q, r] = key.split(",").map(Number);
      const coord = { q, r };
      const delayMs = (result.arrivalRound.get(key) ?? 0) * ROUND_DURATION_MS;
      const reveal = (revealNow: number) => {
        hazardOverlay.show(kind, coord, terrain.heightAt(coord), damage, revealNow);
        if (result.destroyedDefenses.includes(key)) playSound("hazard_breach");
        else if (result.overwhelmedDefenses.includes(key)) playSound("hazard_overwhelmed");
      };
      if (delayMs <= 0) reveal(now);
      else later(() => reveal(performance.now()), delayMs);
    }
  }

  /** STEP_PROMPT_pacing_telegraph_preview.md Section 2: how long the wave-sweep takes to visually finish (the last tile's staggered reveal, plus a buffer for its own reveal/settle animation) — used to time the aftermath summary so it appears right as the sweep actually ends, not mid-sweep or with an awkward gap after. */
  function sweepDurationMs(result: HazardResult): number {
    let maxRound = 0;
    for (const round of result.arrivalRound.values()) maxRound = Math.max(maxRound, round);
    return maxRound * ROUND_DURATION_MS + 500;
  }

  /**
   * A short narrated aftermath beat (Section 2's third polish item) once the
   * sweep visually finishes, rather than the sweep ending and meters just
   * silently updating in the corner — Resilience delta, Trust delta (only
   * shown if it actually moved — Flood alone never touches Trust), and how
   * many defenses breached/overwhelmed.
   */
  function describeAftermath(kind: "Flood" | "Storm Surge", result: HazardResult, resilienceBefore: number, trustBefore: number): string {
    const resilienceDelta = Math.round(state.resilience - resilienceBefore);
    const trustDelta = Math.round(state.trust - trustBefore);
    const parts = [`${kind} resolved`, `Resilience ${resilienceDelta <= 0 ? resilienceDelta : `+${resilienceDelta}`}`];
    if (trustDelta !== 0) parts.push(`Trust ${trustDelta <= 0 ? trustDelta : `+${trustDelta}`}`);
    if (result.destroyedDefenses.length > 0) {
      parts.push(`${result.destroyedDefenses.length} defense${result.destroyedDefenses.length === 1 ? "" : "s"} breached`);
    }
    if (result.overwhelmedDefenses.length > 0) {
      parts.push(`${result.overwhelmedDefenses.length} overwhelmed`);
    }
    return parts.join(" · ");
  }

  /**
   * Fires once the wave-sweep visually finishes: the aftermath banner, then
   * — STEP_PROMPT_balance_tuning_findings.md Section 2 — the end-of-era
   * screen if this hazard was the one that took Resilience to zero. Reads
   * `state.isEraOver` fresh at fire time (not a value captured earlier),
   * since this callback runs after a real delay and resilience is exactly
   * what could have changed during it.
   */
  function showAftermathAndCheckEraEnd(kind: "Flood" | "Storm Surge", result: HazardResult, resilienceBefore: number, trustBefore: number): void {
    hud.showBanner(describeAftermath(kind, result, resilienceBefore, trustBefore), 4000);
    // The sweep is over, so the names come back and the weather starts
    // clearing. It eases down over several seconds rather than snapping, so
    // the aftermath has the same weight as the build-up did.
    mapLabels.setVisible(true);
    stormImpactActive = false;
    storm.setIntensity(floodTelegraphing || cycloneTelegraphing ? TELEGRAPH_STORM_INTENSITY : 0);

    // Order matters. A hazard can be simultaneously the thing that completes
    // the level (it was the last one needed) and the thing that empties
    // Resilience. Checking objectives FIRST means a player who met every goal
    // on the storm that finished them off is credited with the clear rather
    // than being handed a loss — the friendlier reading, and the one that
    // matches what they actually achieved.
    const cleared = refreshObjectives();
    const lost = !cleared && state.isEraOver;

    // The after-storm explanation is skipped when this storm also ended the
    // run. The results screen is about to take over as the summing-up moment,
    // and stacking two panels would mean the player dismisses one without
    // reading it — in practice the storm report, because the results screen
    // is what has the buttons they want. The lesson is worth more on the
    // storms they play THROUGH, where they can still act on it.
    if (!cleared && !lost) showStormReport(kind, result);

    if (cleared) {
      finishRun(true);
      return;
    }
    if (lost) finishRun(false);
  }

  // --- Monsoon Flood + Cyclone resolution -----------------------------------------
  //
  // STEP_PROMPT_pacing_telegraph_preview.md: the scheduled/telegraphed
  // loop is the real game's actual pacing loop — confirmed directly with the
  // project owner. STEP_PROMPT_remove_schedule_confirm_shadowing.md's
  // removal was a testing-phase choice, not the shipped design; this section
  // is rebuilt from that pass's pre-removal git history (the functions were
  // genuinely deleted, not just disconnected — see cycloneIcon's/
  // tilesOfType()'s own comments above). The Test Hazards panel
  // (`?debughazards`) stays exactly as it was: a separate, permanent manual
  // trigger, not a placeholder for this.

  const FLOOD_TELEGRAPH_COLOR = new THREE.Color("#0b2033");
  /**
   * STEP_PROMPT_ghats_wave_demo.md Section 1: Storm Surge only, for now —
   * both the open-water wave and the inland channel-push the demo in
   * Section 2/3 shows already come out of one `resolveCyclone()` call (see
   * that pass's own Section 0), so Flood isn't needed to demo them. Disabled
   * here, not deleted — same "commented as intentionally inert, brought back
   * later" convention this project used for the whole telegraph system once
   * already (`STEP_PROMPT_pacing_telegraph_preview.md`). Gates only the
   * scheduled path in `checkHazardSchedule()` below and the HUD's incoming-
   * hazard readout (`hazardIncomingInfo()`) — the Test Hazards panel's manual
   * Flood trigger and the `?flood=` dev param are deliberately untouched,
   * per that same step prompt's own rule that the manual tool stays
   * independent of the schedule.
   */
  const FLOOD_HAZARD_ENABLED = level.hazards.floodEnabled;
  /**
   * STEP_PROMPT_balance_tuning_findings.md Section 1: the original 15/11
   * pair was simulation-confirmed broken — with 52 Storm-Surge-exposed
   * tiles and an 11-turn Cyclone clock, fewer than 10% of them can
   * possibly be defended before the first hit, so 100% of simulated runs
   * (any bot strategy) died at exactly turn 22, regardless of how well the
   * player built. Tripling both intervals and halving the severity
   * baseline (see `rolledSeverity()` below) was the empirically-best zone
   * found by sweeping interval × severity together: real spread (66-118
   * turns survived) where a defense-first strategy's floor clearly beats a
   * scattershot one's, instead of an identical death every time. This is a
   * feel-tuning starting point, not a final answer — nudge from this zone
   * if it plays too slow or too generous, not back toward the original.
   */
  const FLOOD_INTERVAL_TURNS = level.hazards.floodIntervalTurns;
  const FLOOD_TELEGRAPH_TURNS = level.hazards.floodTelegraphTurns;
  let nextFloodAtTurn = FLOOD_INTERVAL_TURNS;

  let floodTelegraphing = false;
  /**
   * STEP_PROMPT_pacing_telegraph_preview.md Section 1: rolled once, the
   * moment the telegraph window opens, not re-rolled again when the
   * countdown actually reaches zero — what gets telegraphed is what
   * happens; `checkHazardSchedule()` below uses this exact value (falling
   * back to a fresh roll only if it's somehow unset) rather than calling
   * `rolledSeverity()` a second time.
   */
  let pendingFloodSeverity: number | null = null;

  /**
   * Section 6 item 3: the cloud layer telegraphs either hazard, independent
   * of the HUD/terrain-tint telegraph — and now so does the weather.
   *
   * The storm sits at a low simmer through the telegraph window rather than
   * arriving all at once. That is the whole point of a telegraph: a player
   * who looks up and sees the light going should reach the same conclusion
   * the HUD countdown gives them in numbers, and should still have turns left
   * to plant something.
   */
  const TELEGRAPH_STORM_INTENSITY = 0.4;

  function updateCloudVisibility(): void {
    const telegraphing = floodTelegraphing || cycloneTelegraphing;
    cloudLayer.setVisible(telegraphing);
    // Never lowers the dial during an actual impact: `applyHazardResult` has
    // pinned it to 1 and clears the telegraph flags in the same breath, and
    // this runs in between.
    if (!stormImpactActive) storm.setIntensity(telegraphing ? TELEGRAPH_STORM_INTENSITY : 0);
  }

  /** True from the moment a hazard lands until its sweep finishes, so the telegraph cannot pull the weather back down mid-storm. */
  let stormImpactActive = false;

  function updateFloodTelegraph(): void {
    const turnsUntil = nextFloodAtTurn - state.turn;
    const telegraphing = turnsUntil > 0 && turnsUntil <= FLOOD_TELEGRAPH_TURNS;
    if (telegraphing && !floodTelegraphing) {
      playSound("hazard_telegraph");
      pendingFloodSeverity = rolledSeverity();
    }
    floodTelegraphing = telegraphing;
    for (const coord of tilesOfType("river")) terrain.setTint(coord, telegraphing ? FLOOD_TELEGRAPH_COLOR : null);
    updateCloudVisibility();
    updateHazardTestSchedule();
  }

  /**
   * STEP_PROMPT_hazard_science.md Section 5: the compound mechanic isn't just
   * calendar overlap (both hazards already trigger on independent schedules
   * and can coincidentally land close together, unchanged) — it's the Flood
   * resolver actually checking whether a Storm Surge Wave is concurrently
   * active before adding its downstream/tidal-push source (Section 3).
   * "Concurrently active" is generous on purpose: currently telegraphing (a
   * surge visibly imminent) OR resolved within the last couple of turns
   * (its surge is still realistically working through the system) both
   * count — not just "resolving on the exact same turn."
   */
  const STORM_SURGE_COMPOUND_WINDOW_TURNS = 2;

  /**
   * Resolves the flood: visible in-scene (rising water, defenses absorbing/
   * failing/degrading), not just meter numbers. Called either by the real
   * schedule (`checkHazardSchedule()`, via `scheduleHazardArrival()`'s
   * delayed callback) or by the Test Hazards panel / dev URL params, which
   * behave identically in every way except where the severity number came
   * from — STEP_PROMPT_manual_only_mode.md already removed the only thing
   * that used to differ (an era-end consequence to skip).
   */
  function triggerFlood(baseSeverity: number): void {
    const resilienceBefore = state.resilience;
    const trustBefore = state.trust;
    const stormSurgeActive = cycloneTelegraphing || state.turn - lastStormSurgeResolvedTurn <= STORM_SURGE_COMPOUND_WINDOW_TURNS;
    const result = resolveMonsoonFlood(state, baseSeverity, stormSurgeActive);
    applyHazardResult("flood", result, performance.now());
    for (const coord of tilesOfType("river")) terrain.setTint(coord, null);
    floodTelegraphing = false;
    pendingFloodSeverity = null;
    updateCloudVisibility();
    nextFloodAtTurn = state.turn + FLOOD_INTERVAL_TURNS;
    updateHazardTestSchedule();
    playSound("hazard_resolve");
    refreshHud();
    later(() => showAftermathAndCheckEraEnd("Flood", result, resilienceBefore, trustBefore), sweepDurationMs(result));
  }

  // --- Cyclone telegraph + resolution -------------------------------------------

  const CYCLONE_TELEGRAPH_COLOR = new THREE.Color("#3a3348");
  /** STEP_PROMPT_balance_tuning_findings.md Section 1: same retune as `FLOOD_INTERVAL_TURNS` above, same reasoning — see that constant's comment. */
  const CYCLONE_INTERVAL_TURNS = level.hazards.cycloneIntervalTurns;
  const CYCLONE_TELEGRAPH_TURNS = level.hazards.cycloneTelegraphTurns;
  let nextCycloneAtTurn = CYCLONE_INTERVAL_TURNS;

  function coastalCentroid(): { x: number; z: number } | null {
    const coords = tilesOfType("coast", "estuary");
    if (coords.length === 0) return null;
    let x = 0;
    let z = 0;
    for (const c of coords) {
      const w = axialToWorld(c, 1.0);
      x += w.x;
      z += w.z;
    }
    return { x: x / coords.length, z: z / coords.length };
  }

  let cycloneTelegraphing = false;
  /** Same pinning reasoning as pendingFloodSeverity above. */
  let pendingCycloneSeverity: number | null = null;
  /** Section 5's compound-mechanic window (see STORM_SURGE_COMPOUND_WINDOW_TURNS above) — the turn a Storm Surge Wave last actually resolved, so a Flood shortly after still counts as concurrent. */
  let lastStormSurgeResolvedTurn = -Infinity;

  function updateCycloneTelegraph(): void {
    const turnsUntil = nextCycloneAtTurn - state.turn;
    const telegraphing = turnsUntil > 0 && turnsUntil <= CYCLONE_TELEGRAPH_TURNS;
    if (telegraphing && !cycloneTelegraphing) {
      playSound("hazard_telegraph");
      pendingCycloneSeverity = rolledSeverity();
    }
    cycloneTelegraphing = telegraphing;
    for (const coord of tilesOfType("coast", "estuary")) {
      terrain.setTint(coord, telegraphing ? CYCLONE_TELEGRAPH_COLOR : null, 0.45);
    }
    const centroid = coastalCentroid();
    cycloneIcon.visible = telegraphing && centroid !== null;
    if (telegraphing && centroid) cycloneIcon.position.set(centroid.x, 2.2, centroid.z);
    updateCloudVisibility();
    updateHazardTestSchedule();
  }

  /** Resolves the cyclone: wind+surge combined, Cyclone Shelter protecting Trust rather than land. See triggerFlood's own comment for who calls this and why they behave identically. */
  function triggerCyclone(baseSeverity: number): void {
    const resilienceBefore = state.resilience;
    const trustBefore = state.trust;
    const result = resolveCyclone(state, baseSeverity);
    applyHazardResult("storm", result, performance.now());
    // STEP_PROMPT_test_slider_resort_damage.md Section 3: Storm Surge only,
    // building-kind elements only — `damagedBuildings` is already exactly
    // "a House/Resort that just crossed the same damage threshold the Trust
    // deduction above uses," reused directly rather than a second check.
    for (const coord of keysToCoords(result.damagedBuildings)) {
      elements.setBuildingDamagedVisual(coord);
    }
    lastBuildingsDamaged = result.damagedBuildings.length;
    const sweepMs = sweepDurationMs(result);
    // STEP_PROMPT_ghats_wave_demo.md Section 2/3: the wave-front spectacle,
    // layered on top of applyHazardResult()'s own per-tile reveals above —
    // an expanding open-water ring plus a river-channel push, both synced to
    // this same result's real arrivalRound data (see WaveFrontManager's own
    // comment). coastalCentroid() is the same origin point the telegraph
    // icon already uses; skipped entirely (rather than falling back to some
    // arbitrary point) on the same map-has-no-coast/estuary edge case that
    // already makes the icon itself not appear.
    const origin = coastalCentroid();
    if (origin) {
      waveFront.trigger({
        result,
        originWorld: origin,
        terrainIdAt: (coord) => terrain.terrainIdAt(coord),
        heightAt: (coord) => terrain.heightAt(coord),
        hexSize: 1.0,
        roundDurationMs: ROUND_DURATION_MS,
        nowMs: performance.now(),
        durationMs: sweepMs
      });
    }
    for (const coord of tilesOfType("coast", "estuary")) terrain.setTint(coord, null);
    cycloneIcon.visible = false;
    cycloneTelegraphing = false;
    pendingCycloneSeverity = null;
    updateCloudVisibility();
    lastStormSurgeResolvedTurn = state.turn;
    nextCycloneAtTurn = state.turn + CYCLONE_INTERVAL_TURNS;
    updateHazardTestSchedule();
    playSound("hazard_resolve");
    refreshHud();
    later(() => showAftermathAndCheckEraEnd("Storm Surge", result, resilienceBefore, trustBefore), sweepMs);
  }

  /**
   * STEP_PROMPT_hazard_test_sliders.md's nice-to-have: orients whoever's
   * testing without them needing to wait out the schedule. Kept as its own
   * function (not folded into `refreshHud()`, unlike `hazardIncomingInfo()`
   * above) purely because the Test Hazards panel is optional (`null` unless
   * `?debughazards` is set) — folding an always-needed `?.`-guarded call
   * into every `refreshHud()` invocation is fine either way, but keeping it
   * separate here means `refreshHud()` itself never needs to know the panel
   * might not exist. STEP_PROMPT_pacing_telegraph_preview.md: now that
   * the schedule is genuinely live again, this readout is a real countdown
   * once more, not an informational "would've been" note.
   */
  function updateHazardTestSchedule(): void {
    hazardTestPanel?.setScheduleInfo(nextCycloneAtTurn - state.turn, nextFloodAtTurn - state.turn);
  }
  updateHazardTestSchedule();

  // --- Hazard preview --------------------------------------------------------------
  //
  // STEP_PROMPT_pacing_telegraph_preview.md Section 3: read-only —
  // resolveMonsoonFlood()/resolveCyclone() are NOT pure (they call
  // destroyDefense()/degradeDefense()/drawDownFloodBuffer()/
  // applyHazardOutcome() directly on whatever GameState they're given), so
  // every preview here runs against a throwaway `state.clone()`, never the
  // real `state` — see GameState.clone()'s own comment for why this matters.
  //
  // Two independent source registries, unioned into one set of ghost tiles
  // by refreshPreview(): "hud-*" (the main HUD's single toggle, tracking
  // whichever hazard(s) are currently imminent) and "panel-*" (the Test
  // Hazards panel's own per-row checkboxes, independent of the schedule).
  // Both can be active at once without conflict.

  const activePreviewSources = new Map<string, { kind: "flood" | "storm"; severity: number }>();

  /**
   * Re-clones state and re-resolves for every currently active preview
   * source, replacing every ghost tile with a fresh set. Cheap enough (the
   * same resolver a real trigger uses, against a throwaway clone, over a
   * ~150-tile map) to call on every build/remove while a preview is active —
   * which is exactly what makes "what if I add one more Dune here" genuinely
   * live instead of a static one-shot snapshot.
   */
  function refreshPreview(): void {
    hazardOverlay.clearPreview();
    // Panjim 2050's locked Forecast used to ghost its zones here. The warning
    // heat (HeatOverlay) replaced that: it says the same thing per tile, and
    // truthfully. The Forecast keeps its outline and label until the heat starts.
    if (activePreviewSources.size === 0) return;
    const stormSurgeActive = cycloneTelegraphing || state.turn - lastStormSurgeResolvedTurn <= STORM_SURGE_COMPOUND_WINDOW_TURNS;
    for (const source of activePreviewSources.values()) {
      const previewState = state.clone();
      const result =
        source.kind === "flood"
          ? resolveMonsoonFlood(previewState, source.severity, stormSurgeActive)
          : resolveCyclone(previewState, source.severity);
      for (const [key, damage] of result.tileDamage) {
        if (damage < DAMAGE_VISIBLE_THRESHOLD) continue;
        const [q, r] = key.split(",").map(Number);
        const coord = { q, r };
        hazardOverlay.showPreview(coord, terrain.heightAt(coord), damage);
      }
    }
  }

  /** Sets or clears one named preview source. Callers batch multiple changes then call `refreshPreview()` once, rather than each `set` re-resolving independently. */
  function setPreviewSource(key: string, source: { kind: "flood" | "storm"; severity: number } | null): void {
    if (source) activePreviewSources.set(key, source);
    else activePreviewSources.delete(key);
  }

  /** Clears every preview source and tile — used by resetBoard() and whenever the HUD toggle turns off. */
  function clearAllPreviews(): void {
    activePreviewSources.clear();
    hazardOverlay.clearPreview();
    hudPreviewOn = false;
    hud.setPreviewActive(false);
  }

  let hudPreviewOn = false;

  /** The main HUD's own toggle button — see `Hud`'s constructor callback above. */
  function toggleHudPreview(): void {
    hudPreviewOn = !hudPreviewOn;
    hud.setPreviewActive(hudPreviewOn);
    syncHudPreviewSources();
  }

  /**
   * Keeps the "hud-flood"/"hud-storm" preview sources matched to whatever's
   * currently imminent, at the exact severity the real resolution will use
   * (`pendingFloodSeverity`/`pendingCycloneSeverity` — see those variables'
   * own comment for why a pre-rolled, pinned value is what makes this a true
   * preview rather than an approximation). Called whenever telegraph state
   * might have changed (every build) so an active preview keeps pace with
   * the schedule — including clearing itself if the window closes.
   */
  function syncHudPreviewSources(): void {
    if (!hudPreviewOn) {
      setPreviewSource("hud-flood", null);
      setPreviewSource("hud-storm", null);
    } else {
      setPreviewSource("hud-flood", floodTelegraphing && pendingFloodSeverity !== null ? { kind: "flood", severity: pendingFloodSeverity } : null);
      setPreviewSource("hud-storm", cycloneTelegraphing && pendingCycloneSeverity !== null ? { kind: "storm", severity: pendingCycloneSeverity } : null);
    }
    refreshPreview();
  }

  /** Called from `refreshHud()`: hides the HUD toggle (and force-clears it, not just its label) once nothing is imminent to preview anymore. */
  function syncHudPreviewAvailability(incoming: { imminent: boolean }[]): void {
    const available = incoming.some((h) => h.imminent);
    hud.setPreviewAvailable(available);
    if (!available && hudPreviewOn) {
      hudPreviewOn = false;
      setPreviewSource("hud-flood", null);
      setPreviewSource("hud-storm", null);
      refreshPreview();
    } else if (available && hudPreviewOn) {
      syncHudPreviewSources();
    }
  }

  // refreshHud() calls hazardIncomingInfo() (see above), which reads
  // nextCycloneAtTurn/nextFloodAtTurn — both `let` bindings declared earlier
  // in this section, so this is safe. Its first call stays here, right after
  // updateHazardTestSchedule()'s own first call, matching that function's
  // identical constraint — no benefit to moving it, and this spot is already
  // proven safe (a real TDZ bug here was caught and fixed once already, in
  // STEP_PROMPT_hud_instrument_cluster.md).
  refreshHud();

  // --- Board reset -----------------------------------------------------------------

  /**
   * STEP_PROMPT_manual_only_mode.md: formerly `checkEraEnd()` — fired
   * automatically the instant Resilience hit zero (Section 2's original
   * soft-era-loop). Repurposed into a manual-only action: no `isEraOver`
   * guard, so it always runs when called, regardless of what Resilience
   * currently reads. Callers now: the Test Hazards panel's "Reset Board"
   * button, and — STEP_PROMPT_balance_tuning_findings.md Section 2 —
   * `EraEndScreen`'s "Start New Era" button, the real player-facing path
   * now that one exists. The reset sequence itself is unchanged — already
   * correct and tested — just no longer self-triggering.
   */
  function resetBoard(): void {
    playSound("era_end");
    hud.showBanner("Board reset.");

    elements.reset();
    hazardOverlay.reset();
    hazardTestPanel?.reset(); // STEP_PROMPT_hazard_test_sliders.md's Verify: panel state doesn't need to persist across a reset
    nuggetPopup.reset(); // STEP_PROMPT_knowledge_nuggets.md Part C: same "doesn't need to persist across a reset" convention
    clearAllPreviews(); // STEP_PROMPT_pacing_telegraph_preview.md Section 3: a stale preview from before the reset shouldn't survive it

    state.startNewEra(); // clears built elements (re-seeding the pre-built Houses) — state.claimed stays every tile, same as always now
    terrain.resetClaims(keysToCoords(state.claimed));
    for (const seed of startingElements) {
      elements.place(seed.coord, seed.elementId, terrain.heightAt(seed.coord));
    }
    nextFloodAtTurn = FLOOD_INTERVAL_TURNS;
    nextCycloneAtTurn = CYCLONE_INTERVAL_TURNS;
    updateHazardTestSchedule();

    refreshHud();
  }

  // --- Hazard schedule --------------------------------------------------------------

  /**
   * Section 2: "a slowly rising monsoon intensity / cyclone season
   * modifier" biases future severity upward within an era. STEP_PROMPT_
   * balance_tuning_findings.md Section 1: the base term dropped 1.0 → 0.5
   * (the spread and the permanent `severityBaseline` creep are untouched —
   * only the floor moved) as part of the same interval retune above; see
   * `FLOOD_INTERVAL_TURNS`'s comment for the simulation finding behind it.
   */
  function rolledSeverity(): number {
    // Same shape as before — a floor plus a random band plus the era's
    // standing creep — but every term is now the level's own, and the roll
    // comes from this session's seeded generator rather than Math.random().
    // Two players on the same level therefore get the same storm sequence,
    // which is the precondition for comparing their scores at all.
    return level.hazards.severityBase + rng.next() * level.hazards.severitySpread + state.severityBaseline;
  }

  // STEP_PROMPT_pacing_telegraph_preview.md Section 1: how long the
  // arrival beat (flash + sound) plays before the actual resolution/wave-
  // sweep starts — long enough to read as its own discrete moment, short
  // enough not to feel like a loading delay. PLACEHOLDER pacing number, same
  // "flag it, let feel-tuning refine it" convention as ROUND_DURATION_MS.
  const HAZARD_ARRIVAL_BEAT_MS = 450;

  /**
   * The countdown-hits-zero moment, distinct from the wave-sweep that
   * follows it: a screen-edge flash + sound immediately, then the real
   * resolution (and its own wave-sweep spectacle) after a short beat. Only
   * used by the scheduled path (`checkHazardSchedule()` below) — the Test
   * Hazards panel's "Trigger now" stays instant-resolve-on-click, exactly as
   * it already was, since there's no telegraphed anticipation to pay off
   * there.
   */
  function scheduleHazardArrival(kind: "flood" | "storm", fire: () => void): void {
    playSound("hazard_arrival");
    hud.flashArrival(kind === "flood" ? `#${FLOOD_TELEGRAPH_COLOR.getHexString()}` : `#${CYCLONE_TELEGRAPH_COLOR.getHexString()}`);
    later(fire, HAZARD_ARRIVAL_BEAT_MS);
  }

  /**
   * STEP_PROMPT_remove_claiming.md: Build is now the sole action that
   * advances a turn (Claim used to own this job, including this check) —
   * called once after any successful `state.build()`, so a hazard fires (or
   * its telegraph updates) the moment the schedule's turn is actually
   * reached, regardless of which tile/element triggered it. The player
   * controls their own pace entirely (turns only advance via their own
   * build actions) but not the exact moment a telegraphed hazard lands,
   * once its countdown reaches zero — that's the actual source of the
   * tension, preserved here deliberately: resolution happens inside this
   * same call, not on a separate hidden tick.
   */
  function checkHazardSchedule(): void {
    // Panjim 2050 schedules its own challenges (see PanjimController).
    if (panjim) return;
    if (FLOOD_HAZARD_ENABLED) {
      if (state.turn >= nextFloodAtTurn) {
        const severity = pendingFloodSeverity ?? rolledSeverity();
        scheduleHazardArrival("flood", () => triggerFlood(severity));
      } else {
        updateFloodTelegraph();
      }
    }

    if (state.turn >= nextCycloneAtTurn) {
      const severity = pendingCycloneSeverity ?? rolledSeverity();
      scheduleHazardArrival("storm", () => triggerCyclone(severity));
    } else {
      updateCycloneTelegraph();
    }
  }

  // --- Panjim 2050 challenges -----------------------------------------------------

  /**
   * Panjim 2050's challenge staging, driven by PanjimController.stageChallenge:
   * the weather comes in, then each zone gets its own moment in turn, then it
   * clears. The outcome was decided when the challenge landed; this shows it.
   */
  let stormDirector: StormDirector | null = null;
  /** The words over defences answering a storm ("Absorbed"); they follow their tile as the camera moves. */
  const stormWords: { el: HTMLElement; coord: AxialCoord }[] = [];
  function placeStormWord(word: { el: HTMLElement; coord: AxialCoord }): void {
    const world = axialToWorld(word.coord, 1.0);
    const screen = worldToScreen(world.x, terrain.heightAt(word.coord) + 0.6, world.z);
    word.el.style.left = `${Math.round(screen.x)}px`;
    word.el.style.top = `${Math.round(screen.y)}px`;
  }
  /** The storm player, made on first use (Panjim 2050 only: it needs the run's zones). */
  function stormDirectorFor(): StormDirector {
    if (stormDirector) return stormDirector;
    stormDirector = new StormDirector({
      tiles: levelTiles,
      heightAt: (coord) => terrain.heightAt(coord),
      zones: panjim!.run.zones!,
      water: stormWater,
      sky: stormSky,
      weather: storm,
      elementAt: (key) => state.elements.get(key)?.elementId,
      degradeAt: (key) => state.elements.get(key)?.degradeAmount ?? 0,
      focusOn: (x, z) => focusOn(x, z, false),
      fitTo: (w, d) => fitTo(w, d, false),
      setTint: (coord, tint, blend) => terrain.setTint(coord, tint, blend),
      houseLost: (coord) => elements.setBuildingDamagedVisual(coord),
      defenceFailed: (coord) => {
        elements.destroy(coord);
        playSound("hazard_breach");
      },
      defenceWorn: (coord, degrade) => elements.setDegradeVisual(coord, degrade),
      defenceAnswers: (coord, elementId) => {
        const world = axialToWorld(coord, 1.0);
        buildFlourish.play(world.x, terrain.heightAt(coord), world.z, performance.now());
        reactions.trigger(elementId, world.x, terrain.heightAt(coord), world.z);
      },
      label: (coord, text, tone) => {
        const el = document.createElement("div");
        el.className = `storm-word ${tone}`;
        el.textContent = text;
        container.appendChild(el);
        const word = { el, coord };
        stormWords.push(word);
        placeStormWord(word);
        window.setTimeout(() => {
          el.remove();
          stormWords.splice(stormWords.indexOf(word), 1);
        }, 3300);
      },
      screenFlash: () => {
        stormFlash.classList.remove("on");
        void stormFlash.offsetWidth;
        stormFlash.classList.add("on");
      },
      reducedMotion: () => storm.isReducedMotion
    });
    return stormDirector;
  }

  function panjimFxBegin(kind: string): void {
    void kind;
    stormImpactActive = true;
    storm.setIntensity(1);
    mapLabels.setVisible(false);
    buildPopover.hide();
    // Everyone goes indoors: walkers, boats and the background creatures.
    ambientLife?.setPaused(true);
    reactions.setAmbientPaused(true);
  }

  function panjimFxZone(
    zone: import("@core/zones").ZoneOutcome,
    outcome: import("@core/zones").ChallengeOutcome,
    slow: boolean,
    durationMs: number,
    onHouseLost: () => void = () => {}
  ): void {
    const zones = panjim?.run.zones;
    if (!zones) return;
    const keys = zones.keys(zone.zoneId);
    const coords = keys.map((key) => {
      const [q, r] = key.split(",").map(Number);
      return { q, r };
    });
    // The camera goes to the zone. Closer, and slower, for the biggest save.
    let cx = 0;
    let cz = 0;
    for (const coord of coords) {
      const world = axialToWorld(coord, 1.0);
      cx += world.x;
      cz += world.z;
    }
    if (coords.length > 0) focusOn(cx / coords.length, cz / coords.length, false);
    if (slow) fitTo(18, 12, false);
    // The hazard's reach over the zone: how much got past its defence.
    const share = zone.incoming > 0 ? zone.leak / zone.incoming : 0;
    const kind: HazardKind = zone.hazard === "flood" ? "flood" : "storm";
    if (share > 0.05) {
      for (const coord of coords) hazardOverlay.show(kind, coord, terrain.heightAt(coord), 0.3 + share * 1.2, performance.now());
    }
    // The defences answer one at a time: a ring and their creatures, in turn.
    const defenders = keys.filter((key) => {
      const inst = state.elements.get(key);
      return inst && (ELEMENT_BY_ID.get(inst.elementId)?.targetsHazards ?? []).includes(zone.hazard);
    });
    const gap = Math.min(220, (durationMs * 0.8) / Math.max(1, defenders.length));
    defenders.forEach((key, i) => {
      later(() => {
        const [q, r] = key.split(",").map(Number);
        const world = axialToWorld({ q, r }, 1.0);
        buildFlourish.play(world.x, terrain.heightAt({ q, r }), world.z, performance.now());
        const inst = state.elements.get(key);
        if (inst && i < 6) reactions.trigger(inst.elementId, world.x, terrain.heightAt({ q, r }), world.z);
        if (inst) elements.setDegradeVisual({ q, r }, inst.degradeAmount);
      }, i * gap);
    });
    for (const key of zone.failed) {
      const [q, r] = key.split(",").map(Number);
      elements.destroy({ q, r });
      playSound("hazard_breach");
    }
    // The houses lost here go one at a time, most exposed first (the order
    // the resolver lost them in), each ticking the Houses saved counter down.
    const lostHere = outcome.damagedHouses.filter((key) => zones.zoneOf(key) === zone.zoneId);
    const houseGap = lostHere.length > 0 ? (durationMs * 0.85) / lostHere.length : 0;
    lostHere.forEach((key, i) => {
      later(() => {
        const [q, r] = key.split(",").map(Number);
        elements.setBuildingDamagedVisual({ q, r });
        onHouseLost();
      }, i * houseGap);
    });
    playSound(zone.held ? "build" : "hazard_overwhelmed");
    runTracker.recordHazard({
      totalDamage: zone.leak,
      damagedTiles: zone.housesDamaged,
      destroyed: zone.failed.length,
      overwhelmed: zone.overwhelmed.length
    });
  }

  function panjimFxEnd(): void {
    ambientLife?.setPaused(false);
    reactions.setAmbientPaused(false);
    stormImpactActive = false;
    storm.setIntensity(0);
    mapLabels.setVisible(true);
    const focus = axialToWorld(levelMap.focus, 1.0);
    focusOn(focus.x, focus.z, false);
    fitTo(openingFit.width, openingFit.depth, false);
    refreshHud();
  }

  /** After a rewind or a resume: every element mesh rebuilt from the game state, with its growth, wear and damage. */
  function redrawPanjimBoard(): void {
    elements.reset();
    hazardOverlay.reset();
    forecastOutline.clear();
    for (const [key, inst] of state.elements) {
      const [q, r] = key.split(",").map(Number);
      const coord = { q, r };
      const def = ELEMENT_BY_ID.get(inst.elementId);
      if (!def) continue;
      const growth = (def.matureQuarters ?? 0) > 0 ? state.maturityFraction(inst, def) : undefined;
      elements.place(coord, inst.elementId, terrain.heightAt(coord), { animate: false, growth });
      if (def.kind === "building" && inst.degradeAmount >= 1) elements.setBuildingDamagedVisual(coord);
      else if (inst.degradeAmount > 0) elements.setDegradeVisual(coord, inst.degradeAmount);
    }
    syncPanjimVisuals();
    refreshPreview();
  }

  // --- Build / defend popover --------------------------------------------------

  /**
   * Small tag shown beside an element's name in its popover row. `category`
   * only exists on defense-kind elements — falling through to it for
   * anything else (as an earlier version of this ternary did) silently
   * printed "undefined" for Yacht's cosmetic kind once that was added
   * (STEP_PROMPT_economy_food_yacht.md item 4), since it has no category.
   */
  function kindLabel(def: ElementDef): string | undefined {
    if (def.kind === "building" || def.kind === "cosmetic") return def.kind;
    return def.category;
  }

  /**
   * STEP_PROMPT_manual_only_mode.md Part C: the tile-info popover's own
   * "Remove" button, and — consolidated, not duplicated — the same logic
   * `__destroyForTest` below now calls into instead of repeating. Does
   * exactly what a catastrophic engineered-defense failure's own destroy
   * path does render-side (`elements.destroy()`) and state-side
   * (`state.elements.delete()`), plus the UI cleanup a manual removal also
   * needs: refresh the HUD (the tile's gone from `emptyTileCount`, any
   * meter it contributed to shifts) and close the popover so it doesn't
   * linger showing info for a tile that's now empty. No coin refund —
   * matches the current sandbox/testing framing; flagged in PROGRESS.md as
   * a placeholder policy for `STEP_PROMPT_balance_tuning.md` to revisit.
   */
  function removeElement(coord: AxialCoord): void {
    const key = `${coord.q},${coord.r}`;
    const removed = state.elements.get(key);
    elements.destroy(coord);
    state.elements.delete(key);
    // Give back the per-element tally (but not the Coin — see this
    // function's no-refund note below), so a "build 3 Mangroves" objective
    // can't be satisfied by cycling one tile three times.
    if (removed) runTracker.recordRemoval(removed.elementId);
    refreshHud();
    refreshPreview(); // STEP_PROMPT_pacing_telegraph_preview.md Section 3: removing a defense can change what an active preview would show, same as building one does
    buildPopover.hide();
  }

  /**
   * Section 3's "one tile, one element": a tile that already has something
   * built on it shows that element's info (name, category, effects) instead
   * of ever offering a second build menu — the UI should never let a player
   * attempt (or appear to attempt) building a second thing on an occupied tile.
   */
  function openTilePopover(coord: AxialCoord): void {
    // The coach's "click any tile" step waits on this. Set before the early
    // returns below so it also counts for a tile whose menu turns out to be
    // empty — the player did the thing they were asked to do, and telling
    // them otherwise because they happened to pick open sea would be wrong.
    //
    // The coach is normally driven from `refreshHud`, which a click does NOT
    // reach — opening a popover changes no game state. Without this nudge the
    // step would sit there telling the player to click a tile they had just
    // clicked, until they happened to build something.
    if (!hasOpenedTileMenu) {
      hasOpenedTileMenu = true;
      if (tutorialCoach && !tutorialCoach.isFinished) {
        tutorialCoach.update({
          standingByElement: standingCounts().byElement,
          turn: state.turn,
          hazardsSurvived: runTracker.snapshot().hazardsSurvived,
          hasOpenedTileMenu
        });
      }
    }

    const key = `${coord.q},${coord.r}`;
    const worldTop = terrain.heightAt(coord);
    const { x: wx, z: wz } = axialToWorld(coord, 1.0);
    const screen = worldToScreen(wx, worldTop + 0.3, wz);

    // A monument's tile offers no build menu — it says what the building is.
    // That is the whole interaction those sixteen tiles have, and it is also
    // the only place in the game that teaches a player the board has real
    // places on it that they did not put there.
    const monument = monuments.at(coord);
    if (monument) {
      buildPopover.showInfo(screen.x, screen.y, {
        name: monument.name,
        kindLabel: "landmark",
        effects: {},
        note: "A real Panjim landmark. It stands here permanently and cannot be built on or removed."
      });
      return;
    }

    const built = state.elements.get(key);
    if (built) {
      const def = ELEMENT_BY_ID.get(built.elementId);
      if (!def) return;
      const spawned = reactions.trigger(built.elementId, wx, worldTop, wz);
      // Panjim 2050: whatever came to see is spotted for the Field Guide. Free.
      panjim?.spotted(spawned);
      buildPopover.showInfo(screen.x, screen.y, {
        name: def.name,
        kindLabel: kindLabel(def),
        effects: def.effects,
        removeLabel: panjim ? "Demolish · 1 qtr" : undefined,
        extraActions:
          panjim && panjim.run.needsRepair(coord)
            ? [
                {
                  label: `Repair · 1 qtr · ${panjim.run.repairCoin(coord)}c`,
                  disabled: state.coin < panjim.run.repairCoin(coord),
                  onClick: () => {
                    panjim.repair(coord);
                    buildPopover.hide();
                  }
                }
              ]
            : undefined,
        onRemove: () => {
          if (!panjim) {
            removeElement(coord);
            return;
          }
          const removed = state.elements.get(key);
          if (panjim.demolish(coord) && removed) runTracker.recordRemoval(removed.elementId);
          buildPopover.hide();
        }
      });
      return;
    }

    const popoverOptions: PopoverOption[] = state
      .buildableAt(coord)
      .map((d) => {
        const quarters = panjim?.buildQuarters(d.id);
        const time = quarters ? ` and ${quarters} season${quarters === 1 ? "" : "s"}` : "";
        const values = { name: d.name, what: buildWhat(d.id), cost: d.buildCost, time, coin: Math.round(state.coin) };
        const tip = tooltipText(state.coin >= d.buildCost ? "build" : "buildUnaffordable", values);
        return { id: d.id, name: d.name, buildCost: d.buildCost, kindLabel: kindLabel(d), quarters, tip };
      });
    if (popoverOptions.length === 0) return;

    buildPopover.show(screen.x, screen.y, popoverOptions, state.coin, (id) => {
      if (panjim) {
        // The controller spends the quarters, draws the element and ticks the
        // clock. The run ends at 2050, never on an objective.
        if (!panjim.build(coord, id)) return;
        nuggetPopup.show(id);
        playSound("build");
        return;
      }
      if (!state.build(coord, id)) return;
      telemetry.action("build", 1);
      placeElement(coord, id, true);
      nuggetPopup.show(id);
      playSound("build");
      // STEP_PROMPT_pacing_telegraph_preview.md: checkHazardSchedule() now
      // runs BEFORE refreshHud() (was the other way around) — it's what
      // updates the telegraph state (tint, cloud layer, pending severity)
      // for this turn, so the HUD should reflect that immediately, not one
      // build-cycle stale.
      checkHazardSchedule();
      refreshHud();
      refreshPreview(); // STEP_PROMPT_pacing_telegraph_preview.md Section 3: covers a "panel-*" preview source too — refreshHud() above only re-syncs the HUD's own "hud-*" sources
      // Most objectives (build N of a thing, reach a meter, bank Coin) are
      // satisfied by a build, not by surviving a hazard — so completion has
      // to be checked here too, not only in the post-hazard aftermath.
      // refreshHud() above already re-evaluated them; this just reads the
      // verdict. Skipped while a hazard is mid-flight (checkHazardSchedule
      // may have queued an arrival beat): letting a build win the level a
      // few hundred ms before the storm that was already inbound lands
      // would look like the game ignored it.
      if (timers.size === 0 && refreshObjectives()) finishRun(true);
      // STEP_PROMPT_manual_only_mode.md: no automatic era-end check anymore
      // — nothing resets the board on its own, ever. The board only ever
      // resets via the manual "Reset Board" control.
    });
  }

  // --- Input ---------------------------------------------------------------------
  //
  // STEP_PROMPT_remove_claiming.md: every tile is already active — a click on
  // any tile opens its popover directly (a build menu if empty, an info card
  // if something's already standing there; see openTilePopover), no
  // intermediate claim step. Dismissal (NEXT_STEPS.md's A1): BuildPopover's
  // own full-viewport backdrop does the heavy lifting — while a popover is
  // open, it physically sits above the canvas (and the HUD) and intercepts
  // every click, so this canvas listener can no longer even fire for a
  // "click elsewhere while a popover is open" case; the `isOpen` check below
  // is a harmless leftover safety net, not the real mechanism anymore.

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  renderer.domElement.addEventListener("click", (event: MouseEvent) => {
    if (wasDrag()) return; // a pan, not a click — don't also open a popover at the drag's end point
    if (buildPopover.isOpen) return; // shouldn't be reachable — the backdrop intercepts this click first
    if (panjim?.isBusy) return; // a time-lapse is playing; the click skips it instead
    if (sessionFinished) return; // the run is over and the shell is showing its results screen — the board is read-only now

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    // Panjim 2050: a tap on a creature itself spots it for the Field Guide
    // and opens nothing else.
    if (panjim) {
      const species = reactions.speciesAt(raycaster);
      if (species) {
        panjim.spotted([species]);
        return;
      }
    }
    const hits = raycaster.intersectObjects(terrain.raycastTargets);
    if (hits.length === 0 || hits[0].instanceId === undefined) return;

    const coord = terrain.coordForHit(hits[0].object, hits[0].instanceId);
    if (!coord) return;

    openTilePopover(coord);
  });

  const keydownAbort = new AbortController();
  document.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape closes the popover if one is open; otherwise it is the
      // "get me out of here" key, which the shell turns into a quit prompt.
      if (buildPopover.isOpen) buildPopover.hide();
      else if (!sessionFinished) options.onExit();
    },
    { signal: keydownAbort.signal }
  );

  start((nowMs) => {
    // Before the element tick, so the sway this frame uses this frame's wind
    // rather than the previous one's.
    storm.tick(nowMs, focusPoint());
    setShake(storm.shakeX, storm.shakeZ);
    elements.setWind(storm.windStrength);

    terrain.tick(nowMs);
    elements.tick(nowMs);
    reactions.tick(nowMs);
    hazardOverlay.tick(nowMs);
    cloudLayer.tick(nowMs);
    waveFront.tick(nowMs);
    buildFlourish.tick(nowMs);
    panjim?.frame();
    stormDirector?.tick(nowMs);
    for (const word of stormWords) placeStormWord(word);
    forecastOutline.tick(nowMs);
    heatOverlay.tick(nowMs);
    if (ambientLife) {
      ambientLife.setWind(storm.windStrength);
      ambientLife.tick(nowMs);
    }
    if (cycloneIcon.visible) cycloneIcon.rotation.z = nowMs * 0.003;

    // Place names have to be re-projected every frame, because the camera now
    // glides rather than snapping (see scene.ts) — updating them only on
    // pointer events would leave them trailing behind the board mid-glide.
    const rect = renderer.domElement.getBoundingClientRect();
    mapLabels.update(
      (coord) => {
        // Anchored to the tile's top surface, so a label sits on the land
        // rather than floating at sea level over a raised tile.
        const { x, z } = axialToWorld(coord, 1.0);
        const screen = worldToScreen(x, terrain.heightAt(coord) + 0.25, z);
        return { x: screen.x, y: screen.y, depth: 0 };
      },
      rect.width,
      rect.height,
      cameraDistance()
    );
  });

  /**
   * Dev-only scenario helpers (Section 10: a hidden, non-UI debug overlay is
   * explicitly sanctioned for testing). Not part of the real UI — no button,
   * no visible affordance. Triggered only via URL params.
   *
   * Unchanged in behaviour, but now scoped to the live session rather than
   * the module, so they always address the level currently being played
   * instead of whichever one happened to load first. `dispose()` clears
   * them, so a stale handle can never drive a torn-down board.
   */

  /**
   * Everything that happens when an element lands on a tile, in one place.
   *
   * Three callers used to do this themselves — the build popover, the dev
   * auto-build and the `__buildForTest` hook — and they had drifted: only the
   * popover animated, so a browser test could place a hundred things and never
   * exercise the animation it was supposed to be checking. Sharing one
   * function means the hook drives the real code path, which is the only way a
   * test of it is worth anything.
   *
   * Does NOT advance the turn or check the schedule. Those are consequences of
   * a PLAYER's build, and the dev paths deliberately skip them (see
   * `__checkHazardScheduleForTest`).
   */
  function placeElement(coord: AxialCoord, elementId: string, animate: boolean): void {
    runTracker.recordBuild(elementId, ELEMENT_BY_ID.get(elementId)?.buildCost ?? 0);
    const topY = terrain.heightAt(coord);
    // Panjim 2050: a growing defence is planted young and grows on the clock.
    const inst = state.elements.get(`${coord.q},${coord.r}`);
    const def = ELEMENT_BY_ID.get(elementId);
    const growth = panjim && inst && def && (def.matureQuarters ?? 0) > 0 ? state.maturityFraction(inst, def) : undefined;
    elements.place(coord, elementId, topY, { animate, growth });
    if (animate) {
      // The ground half of the placement animation — see BuildFlourish. Every
      // element gets it, so a click always visibly registers wherever on the
      // board it landed.
      const world = axialToWorld(coord, 1.0);
      buildFlourish.play(world.x, topY, world.z, performance.now());
    }
  }

  /** Prefers an element type not yet built anywhere, so a dev screenshot shows variety rather than one type repeated. */
  function devAutoBuild(kind: "building" | "defense"): void {
    const builtTypes = new Set<string>();
    for (const key of state.claimed) {
      const [q, r] = key.split(",").map(Number);
      const coord = { q, r };
      const buildable = state.buildableAt(coord).filter((o) => o.kind === kind);
      const affordable = buildable.filter((o) => o.buildCost <= state.coin);
      if (affordable.length === 0) continue;
      const pick = affordable.find((o) => !builtTypes.has(o.id)) ?? affordable[0];
      if (state.build(coord, pick.id)) {
        placeElement(coord, pick.id, true);
        builtTypes.add(pick.id);
      }
    }
    refreshHud();
  }

  const testHooks: Record<string, unknown> = {
    // The local telemetry log (see @core/telemetry). Read-only by convention.
    __telemetry: telemetry.events,
    // Frame cost counters for tools/phaseShots.ts (see scene.ts `frameStats`).
    __frameStatsForTest: frameStats,
    // Panjim 2050 only: the live controller and its screenshot scenarios.
    __panjimForTest: panjim,
    __stormForTest: {
      time: () => stormDirector?.time ?? null,
      playing: () => stormDirector?.playing ?? false,
      /** The depth the water layer drew on a tile, and the core's depth there at the same storm time. */
      compare: (key: string) => {
        const drawn = stormWater.depthDrawn(key);
        const field = stormDirector?.currentField;
        if (!drawn || !field) return null;
        return { drawn: drawn.depth, core: combinedDepthAt(field, key, drawn.t), t: drawn.t };
      },
      wetKeys: () => {
        const field = stormDirector?.currentField;
        return field ? [...field.tiles.values()].filter((tile) => tile.surgePeak > 0 || tile.floodPeak > 0 || tile.backwaterPeak > 0).map((tile) => tile.key) : [];
      },
      script: () => stormDirector?.currentScript ?? null
    },
    __panjimScenarioForTest: async (name: string): Promise<boolean> => {
      if (!panjim) return false;
      // "build-<terrain>": builds one thing on that terrain near the city,
      // then opens the build menu on the next free tile of the same terrain,
      // so a screenshot shows the build and what else the tile offers.
      // "tip-<key>": opens the tooltip of the HUD control carrying that key.
      if (name.startsWith("tip-")) {
        const el = container.querySelector<HTMLElement>(`[data-tip="${name.slice(4)}"]`);
        if (!el) return false;
        tooltips.show(el);
        return true;
      }
      // "menu-<terrain>": opens the build menu on a free tile of that terrain
      // near the city and shows the first option's tooltip.
      const menu = /^menu-(beach|estuary|river|coast)$/.exec(name);
      if (menu) {
        const element = { beach: "dune", estuary: "mangrove", river: "small_dam", coast: "breakwater" }[menu[1]]!;
        const tile = panjim.firstBuildable(element, levelMap.focus);
        if (!tile) return false;
        const world = axialToWorld(tile, 1.0);
        focusOn(world.x, world.z, true);
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        openTilePopover(tile);
        const option = container.querySelector<HTMLElement>(".build-popover .build-option");
        if (option) tooltips.show(option);
        return true;
      }
      const build = /^build-(beach|estuary|river|coast)$/.exec(name);
      if (!build) return panjim.scenario(name);
      const element = { beach: "dune", estuary: "mangrove", river: "small_dam", coast: "breakwater" }[build[1]]!;
      const first = panjim.firstBuildable(element, levelMap.focus);
      if (!first) return false;
      const world = axialToWorld(first, 1.0);
      focusOn(world.x, world.z, true);
      panjim.build(first, element);
      await panjim.idle();
      const next = panjim.firstBuildable(element, first);
      if (next) {
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        openTilePopover(next);
      }
      return true;
    },
    // Lets tools/verify_readability.ts (and any future script needing exact
    // camera framing) pan straight to a world coordinate via the scene's own
    // `focusOn`, instead of reverse-engineering the pan-drag pixel math.
    __focusOnForTest: focusOn,
    // Exposes the real THREE.Camera so a verification script can read back
    // its actual position after a simulated pinch/pan/wheel gesture.
    __cameraForTest: camera,
    // Forces the cloud layer visible without waiting for a real telegraph
    // window (turns only advance via build()).
    __cloudLayerForTest: cloudLayer,
    // Reads back how many preview ghost tiles are currently showing (via
    // `.["previewByKey"].size`) without reverse-engineering the render mesh.
    __hazardOverlayForTest: hazardOverlay,
    // Reads back the wave-front's live in-scene state without needing
    // precisely-timed screenshots to catch it mid-sweep.
    __waveFrontForTest: waveFront,
    __elementsForTest: elements,
    __heatForTest: heatOverlay,
    __ambientLifeForTest: () => ambientLife,
    // The town plan as drawn: how many road tiles, and whether any holds a building.
    __townForTest: () =>
      town
        ? {
            roads: town.roads.size,
            bridges: town.bridges.size,
            links: town.links.length,
            buildings: town.buildings.size,
            gardens: town.gardens.size,
            buildingsOnRoads: [...town.roads].filter((key) => state.elements.has(key)).length,
            decorMeshes: townDecor?.group.children.map((child) => child.name) ?? []
          }
        : null,
    __tooltipsForTest: tooltips,
    // Every HUD control that should carry a tooltip but does not (ui/tooltip.ts HUD_SELECTORS).
    __missingTooltipsForTest: (): string[] => missingTooltips(container),
    __reactionsForTest: reactions,
    __nuggetPopupForTest: nuggetPopup,
    // Builds a specific element at a specific coord (rather than
    // reverse-engineering screen-pixel clicks through the popover).
    __buildForTest: (q: number, r: number, elementId: string, animate = true): boolean => {
      const coord = { q, r };
      if (!state.build(coord, elementId)) return false;
      // Animated by default, so a browser test drives the same path a click
      // does. Callers that are setting up a board rather than testing the
      // placement can pass false.
      placeElement(coord, elementId, animate);
      refreshHud();
      return true;
    },
    // Deliberately separate from __buildForTest: several existing tests rely
    // on a scripted build sequence NOT touching the schedule, so it cannot
    // accidentally trigger a random-severity hazard mid-setup.
    __checkHazardScheduleForTest: checkHazardSchedule,
    __triggerHazardForTest: {
      cyclone: (severity: number) => triggerCyclone(severity),
      flood: (severity: number) => triggerFlood(severity)
    },
    __lastHazardResultForTest: () => (lastHazardResult ? Object.fromEntries(lastHazardResult.tileDamage) : null),
    __destroyForTest: (q: number, r: number): void => removeElement({ q, r }),
    __resetBoardForTest: (): void => resetBoard(),
    // Reads a tile's raw ElementInstance (floodBufferFilled in particular) so
    // a script can confirm a reservoir is drawing down before any
    // percentage-absorption math runs.
    __elementStateForTest: (q: number, r: number) => state.elements.get(`${q},${r}`) ?? null,
    // New with the campaign: lets a script read objective progress and force
    // an ending without playing a level by hand.
    __objectivesForTest: () => evaluateObjectives(level.objectives, state, runTracker.snapshot()),
    __finishRunForTest: (completed: boolean) => finishRun(completed),
    __levelForTest: () => level,
    // Monuments are instanced inside the WebGL scene, so a browser test has no
    // DOM to count. This reports how many of each kind were actually built.
    __monumentsForTest: (): Record<string, number> => {
      const counts: Record<string, number> = {};
      for (const child of monuments.group.children) {
        const mesh = child as THREE.InstancedMesh;
        counts[mesh.name.replace(/^monument-/, "")] = mesh.count;
      }
      return counts;
    }
  };
  for (const [name, hook] of Object.entries(testHooks)) {
    (window as unknown as Record<string, unknown>)[name] = hook;
  }

  // Dev-only URL params, unchanged in spirit: still no visible affordance
  // without an explicit param. coinboost first, since autobuild/autodefend
  // below spend Coin and a boost given after them would arrive too late.
  const coinBoost = params.get("coinboost");
  if (coinBoost) {
    state.coin += Number(coinBoost);
    refreshHud();
  }
  const resilienceBoost = params.get("resilienceboost");
  if (resilienceBoost) {
    // Every other resilience-modifying path clamps at 0; this dev-only one
    // matches that invariant so a negative boost cannot show a negative gauge.
    state.resilience = Math.max(0, state.resilience + Number(resilienceBoost));
    refreshHud();
  }
  if (params.has("autobuild")) devAutoBuild("building");
  if (params.has("autodefend")) devAutoBuild("defense");
  const floodParam = params.get("flood");
  if (floodParam) triggerFlood(Number(floodParam));
  const cycloneParam = params.get("cyclone");
  if (cycloneParam) triggerCyclone(Number(cycloneParam));

  /**
   * Tears the session down. Called by the app shell before starting the
   * next level, and on quit.
   *
   * Idempotent, because the shell can legitimately reach it twice — a
   * player who quits while the results screen is already up, for one. The
   * ordering matters more than it looks: pending timers are cleared BEFORE
   * the scene is disposed, so a hazard reveal scheduled 400ms ago cannot
   * fire into a released WebGL context.
   */
  let disposed = false;
  function dispose(): void {
    if (disposed) return;
    disposed = true;

    for (const id of timers) window.clearTimeout(id);
    timers.clear();

    keydownAbort.abort();
    panjim?.dispose();
    stormReport.dispose();
    mapLabels.dispose();
    mapAttribution?.dispose();
    mapLayerControl?.dispose();
    overlayTexture?.dispose();
    mapCornerObserver?.disconnect();
    mapCorner?.remove();
    // Puts the sky and sun back before the scene goes. Without it a
    // session disposed mid-storm would be the last thing to touch those
    // values, and `createScene`'s own disposal does not restore them.
    storm.dispose();
    buildFlourish.dispose();
    forecastOutline.dispose();
    heatOverlay.dispose();
    townDecor?.dispose();
    ambientLife?.dispose();
    tooltips.dispose();
    disposeScene();

    // The session owns every DOM node it appended to `container` (HUD,
    // popovers, panels). The shell empties that container itself; clearing
    // the test hooks here is what stops a disposed session from being
    // reachable, and stops it pinning the whole scene graph through a
    // global reference.
    for (const name of Object.keys(testHooks)) {
      delete (window as unknown as Record<string, unknown>)[name];
    }
  }

  return { dispose };
}
