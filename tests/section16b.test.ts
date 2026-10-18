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
  it("is on the next storm's marker: 'Cyclone · 5 builds', then 'Cyclone · next build'", () => {
    expect(countdownText({ builds: 5, storm: "Cyclone" })).toBe("Cyclone · 5 builds");
    expect(countdownText({ builds: 1, storm: "Cyclone" })).toBe("Cyclone · next build");
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
    expect([...STORM_WAITS_FOR]).toEqual(["help", "menu", "field-guide", "leave"]);
    const stack = new ModalStack([layer("help", true), layer("build", false)]);
    expect(stack.someOpen(["help", "leave"])).toBe(true);
    expect(new ModalStack([layer("help", false)]).someOpen(["help"])).toBe(false);
  });

  it("is wired in the session: Leave only with nothing open, Esc through the manager, the storm waits", () => {
    const session = readFileSync("src/app/gameSession.ts", "utf8");
    const controller = readFileSync("src/app/panjimController.ts", "utf8");
    expect(session).toContain("if (modals.escape() !== \"none\") return;");
    expect(session).toContain("if (modals.anyOpen() || panjim.isBusy) return;");
    expect(session).toContain('panjim.panels.isTopmost = () => modals.isTopmost("menu")');
    // Help is a layer the manager closes on Esc (it had no Esc of its own).
    expect(session).toMatch(/name: "help",[\s\S]*?close: \(\) => \{\s*hud\.hideHelp\(\)/);
    // The storm, and its cards, wait for Help and ☰.
    expect(controller).toMatch(/await this\.untilLayersShut\(\);\s*await this\.stageChallenge/);
    expect(controller).toMatch(/showResults\([^)]*\): Promise<void> \{[^}]*await this\.untilLayersShut\(\);/);
  });
});

describe("the leave prompt's line (Section 16 B5)", () => {
  it("says the run is saved, and from which year, when it is", () => {
    expect(leaveText({ tutorial: false, savedYear: 2051, finished: false, builds: 25 })).toBe("Your run is saved. You can continue from 2051.");
    expect(leaveText({ tutorial: false, savedYear: 2031, finished: false, builds: 5 })).toBe("Your run is saved. You can continue from 2031.");
  });

  it("never says nothing was built after a build", () => {
    for (const builds of [1, 10, 25]) {
      for (const finished of [false, true]) expect(leaveText({ tutorial: false, savedYear: null, finished, builds })).not.toMatch(/haven't built/);
    }
    expect(leaveText({ tutorial: false, savedYear: null, finished: false, builds: 0 })).toBe("You haven't built anything yet.");
    expect(leaveText({ tutorial: false, savedYear: null, finished: true, builds: 25 })).toBe("This run is over, and its result is recorded.");
    expect(leaveText({ tutorial: true, savedYear: null, finished: false, builds: 2 })).toMatch(/Tutorial is not saved/);
  });
});

describe("the build menu's order (Section 16 B6)", () => {
  it("puts the most homes protected first, marks it Best here, and keeps ties in the defence order", async () => {
    const { sortCards } = await import("../src/ui/panjim/defenceCards");
    const sorted = sortCards([
      { id: "dune", protects: 2 },
      { id: "seawall", protects: 5 },
      { id: "veg", protects: 2 },
      { id: "sand", protects: -1 }
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["seawall", "dune", "veg", "sand"]);
    expect(sorted.map((c) => c.best)).toEqual([true, false, false, false]);
  });

  it("marks nothing Best here on a tie, when nothing protects a home, or with no storm left", async () => {
    const { sortCards } = await import("../src/ui/panjim/defenceCards");
    expect(sortCards([{ id: "dune", protects: 3 }, { id: "seawall", protects: 3 }]).some((c) => c.best)).toBe(false);
    expect(sortCards([{ id: "a", protects: 0 }, { id: "b", protects: 0 }]).some((c) => c.best)).toBe(false);
    const none = sortCards([{ id: "a", protects: null }, { id: "b", protects: null }]);
    expect(none.map((c) => c.id)).toEqual(["a", "b"]);
    expect(none.some((c) => c.best)).toBe(false);
  });
});
