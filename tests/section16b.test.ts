import { describe, expect, it } from "vitest";
import { passYear } from "./helpers/passYear";
import { mapById } from "../src/levels/levelMap";
import { LEVEL_BY_ID } from "../src/levels/levels";
import { MAX_PREVIEW_LABELS, previewLabelBox, previewLabels } from "../src/ui/panjim/conePreview";
import { forecastPlaceCandidates } from "../src/ui/panjim/forecastPlaces";
import { cardPlaces, MAX_PLACES } from "../src/ui/panjim/resultCards";
import { countdownText } from "../src/ui/panjim/clockHud";
import { leaveText, ModalStack, STORM_WAITS_FOR } from "../src/ui/panjim/modalStack";
import { readFileSync } from "node:fs";
import { ActionRun } from "../src/core/actionRun";
import { GameState } from "../src/core/gameState";
import { boardSetup } from "../src/levels/balance";

/**
 * Section 16 part B: the HUD and the flow. What can be read without a browser
 * (the rest is in tools/section16bChecks.ts).
 */
const overlaps = (a: ReturnType<typeof previewLabelBox>, b: ReturnType<typeof previewLabelBox>): boolean => !(a.x1 <= b.x0 || b.x1 <= a.x0 || a.z1 <= b.z0 || b.z1 <= a.z0);

/** A session-like run (objectives and own areas on) for a level. */
function sessionRun(levelId: string): { run: ActionRun; landmarks: { name: string; q: number; r: number }[]; localities: { name: string; q: number; r: number }[] } {
  const level = LEVEL_BY_ID.get(levelId)!;
  const map = mapById(level.mapId)!;
  const setup = boardSetup(level, map);
  const state = new GameState(map.tiles, setup.startingElements, level.startingCoin);
  for (const [id, scale] of setup.effectScale) state.effectScale.set(id, scale);
  for (const id of setup.excluded) state.excludedElements.add(id);
  for (const key of setup.unbuildable) state.unbuildable.add(key);
  for (const m of map.monuments) state.reserved.add(`${m.q},${m.r}`);
  const run = new ActionRun(state, level.timeline!, { climate: level.climate, zones: map.zones, houseStars: level.houseStars, houseRule: level.houses?.rule, prep: level.prep, economy: level.economy, growth: level.growth, landmarks: map.landmarks, localities: map.localities, generateObjectives: false });
  return { run, landmarks: map.landmarks, localities: map.localities };
}

describe("the forecast maps' labels (Section 16 B4)", () => {
  it("name at most three places, and never one on another, for every Panjim storm", () => {
    const { run, landmarks, localities } = sessionRun("l01-first-rains");
    for (const challenge of [...run.schedule]) {
      while (run.turnNumber < run.phaseStart(challenge)) passYear(run);
      const labels = previewLabels(forecastPlaceCandidates(run, challenge, landmarks, localities));
      expect(labels.length, challenge.id).toBeGreaterThan(0);
      expect(labels.length, challenge.id).toBeLessThanOrEqual(MAX_PREVIEW_LABELS);
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) expect(overlaps(previewLabelBox(labels[i]), previewLabelBox(labels[j])), `${challenge.id}: ${labels[i].name} / ${labels[j].name}`).toBe(false);
    }
  });

  it("keep the first cyclone's and the flood's own names", () => {
    const { run, landmarks, localities } = sessionRun("l01-first-rains");
    const [cyclone, flood] = run.schedule;
    expect(previewLabels(forecastPlaceCandidates(run, cyclone, landmarks, localities)).map((l) => l.name)).toEqual(["Sharada Mandir School", "Miramar Beach"]);
    while (run.turnNumber < run.phaseStart(flood)) passYear(run);
    expect(previewLabels(forecastPlaceCandidates(run, flood, landmarks, localities)).map((l) => l.name).sort()).toEqual(["Merces", "St Cruz", "Taleigao"]);
  });

  it("leave the Tutorial's preview as it was (its first three names near the area)", () => {
    const { run, landmarks, localities } = sessionRun("l00-tutorial");
    const candidates = forecastPlaceCandidates(run, run.schedule[0], landmarks, localities);
    expect(previewLabels(candidates)).toEqual(candidates.slice(0, 3));
  });

  it("drop a name that would sit on another", () => {
    const a = { name: "Sharada Mandir School", q: 0, r: 0 };
    const b = { name: "Miramar", q: 1, r: 0 };
    const c = { name: "Far away", q: 0, r: 6 };
    expect(previewLabels([a, b, c]).map((l) => l.name)).toEqual(["Sharada Mandir School", "Far away"]);
  });
});

describe("result card 1's places (Section 16 B4)", () => {
  it("shows at most four, damaged first, then '+N more stood'", () => {
    const places = [
      { name: "A", stood: false },
      { name: "B", stood: true },
      { name: "C", stood: true },
      { name: "D", stood: true },
      { name: "E", stood: true },
      { name: "F", stood: true }
    ];
    const { shown, more } = cardPlaces(places);
    expect(shown.length).toBe(MAX_PLACES);
    expect(more).toBe("+2 more stood");
    expect(cardPlaces(places.slice(0, 3)).more).toBeNull();
  });
});

describe("the top bar's countdown (Section 16 B2)", () => {
  it("is on the next storm's marker: 'Cyclone in 5 builds', then 'Cyclone in 1 build'", () => {
    // Section 17b (owner decision): no dots or hyphens between words in player-facing text.
    expect(countdownText({ builds: 5, storm: "Cyclone" })).toBe("Cyclone in 5 builds");
    expect(countdownText({ builds: 1, storm: "Cyclone" })).toBe("Cyclone in 1 build");
  });
});


describe("the modal manager (Section 16 B5)", () => {
  /** A layer that records its closes; `own` leaves out `close` (it answers Esc itself, or holds it). */
  const layer = (name: string, open: boolean, own = false) => {
    const l = { name, open, closed: 0, isOpen: () => l.open, close: own ? undefined : () => { l.closed++; l.open = false; } };
    return l;
  };

  it("closes the topmost layer only on Esc", () => {
    const help = layer("help", true);
    const build = layer("build", true);
    const stack = new ModalStack([help, build]);
    expect(stack.escape()).toBe("closed");
    expect(help.closed).toBe(1);
    expect(build.closed).toBe(0);
    expect(stack.escape()).toBe("closed");
    expect(build.closed).toBe(1);
    expect(stack.escape()).toBe("none");
  });

  it("lets a layer that answers its own Esc, or holds it (the start popup), keep the key", () => {
    const brief = layer("brief", true, true);
    const build = layer("build", false);
    const stack = new ModalStack([build, brief]);
    expect(stack.escape()).toBe("held");
    expect(stack.anyOpen()).toBe(true);
  });

  it("knows which layer is on top, for the menu's own Esc and outside press", () => {
    const help = layer("help", true);
    const menu = layer("menu", true, true);
    const stack = new ModalStack([help, menu]);
    expect(stack.isTopmost("menu")).toBe(false);
    help.open = false;
    expect(stack.isTopmost("menu")).toBe(true);
  });

  it("makes a storm wait for Help, ☰, the Field Guide and the leave prompt", () => {
    expect([...STORM_WAITS_FOR]).toEqual(["help", "menu", "field-guide", "leave", "sources"]);
    const stack = new ModalStack([layer("help", true), layer("build", false)]);
    expect(stack.someOpen(["help", "leave"])).toBe(true);
    expect(new ModalStack([layer("help", false)]).someOpen(["help"])).toBe(false);
  });

  it("is wired in the session: Leave only with nothing open, Esc through the manager, the storm waits", () => {
    const session = readFileSync("src/app/gameSession.ts", "utf8");
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    expect(session).toContain("if (modals.escape() !== \"none\") return;");
    expect(session).toContain('(fromMenu ? !(modals.topmost() === null || modals.isTopmost("brief")) : modals.anyOpen())');
    expect(session).toContain('panjim.panels.isTopmost = () => modals.isTopmost("menu")');
    // Help is a layer the manager closes on Esc (it had no Esc of its own).
    expect(session).toMatch(/name: "help",[\s\S]*?close: \(\) => \{\s*hud\.hideHelp\(\)/);
    // The storm, and its cards, wait for exactly those layers, through the manager.
    expect(session).toContain("stormLayersOpen = (): boolean => modals.someOpen(STORM_WAITS_FOR);");
    expect(controller).toContain("return this.host.stormLayersOpen();");
    for (const name of STORM_WAITS_FOR) expect(session, name).toContain(`name: "${name}"`);
    expect(controller).toMatch(/await this\.untilLayersShut\(\);\s*if \(this\.disposed\) return;\s*await this\.stageChallenge/);
    expect(controller).toMatch(/showResults\([^)]*\): Promise<void> \{[^}]*await this\.untilLayersShut\(\);/);
  });
});

describe("the leave prompt's line (Section 16 B5)", () => {
  it("says nothing is saved (Section 28.2): leaving ends the run", () => {
    expect(leaveText({ tutorial: false, finished: false, builds: 5 })).toBe("Nothing is saved: leaving ends this run.");
    expect(leaveText({ tutorial: false, finished: false, builds: 5 })).not.toMatch(/continue/i);
  });

  it("never says nothing was built after a build", () => {
    for (const builds of [1, 10, 25]) {
      for (const finished of [false, true]) expect(leaveText({ tutorial: false, finished, builds })).not.toMatch(/haven't built/);
    }
    expect(leaveText({ tutorial: false, finished: false, builds: 0 })).toBe("You haven't built anything yet.");
    expect(leaveText({ tutorial: false, finished: true, builds: 25 })).toBe("This run is over.");
    expect(leaveText({ tutorial: true, finished: false, builds: 2 })).toMatch(/Tutorial is not saved/);
  });
});

// Section 17.1 (owner decision) replaced Section 16 B6's order by "Protects N" and its "Best here" with a fixed
// order and no number: tests/section17.test.ts.

describe("a session's state classes (Section 16 review)", () => {
  it("are cleared when a Panjim session starts and when it ends: the game layer is shared by every run", () => {
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    expect(controller).toContain('const SESSION_CLASSES = ["has-built", "storm-hold", "storm-playing", "slowmo", "has-result-cards"];');
    expect(controller).toContain("host.container.classList.remove(...SESSION_CLASSES);");
    expect(controller).toContain('this.host.container.classList.remove("has-panjim-clock", ...SESSION_CLASSES);');
  });
});
