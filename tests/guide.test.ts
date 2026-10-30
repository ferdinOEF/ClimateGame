import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GuideMachine, guideLine, guideShouldRun, guideTiles } from "../src/core/guide";

/**
 * Section 39.4 (owner decision): the guided start. Two builds by hand (the 2026 objective's dune pick, then its first
 * pandanus pick), soft (it never blocks input), once per Play Panjim run.
 */
const DUNE = { key: "-4,18", elementId: "dune" };
const PANDANUS = { key: "-5,21", elementId: "sandy_vegetation" };
const fresh = (): GuideMachine => new GuideMachine(DUNE, PANDANUS);

describe("the guide's steps", () => {
  it("advances: the dune tile, its menu, the dune built, the pandanus tile, its menu, then step 3 and Got it", () => {
    const g = fresh();
    expect([g.step, g.target?.key, g.dimmed]).toEqual(["1", DUNE.key, true]);
    g.menu(DUNE.key);
    expect(g.step).toBe("1b");
    g.built(DUNE.key, "dune");
    expect([g.step, g.target?.key]).toEqual(["2", PANDANUS.key]);
    g.menu(null);
    expect(g.step).toBe("2");
    g.menu(PANDANUS.key);
    expect(g.step).toBe("2b");
    g.built(PANDANUS.key, "sandy_vegetation");
    expect([g.step, g.dimmed, g.target, g.active]).toEqual(["3", false, null, true]);
    g.gotIt();
    expect([g.step, g.active]).toEqual(["done", false]);
  });

  it("goes back a step when the menu closes (Esc) without a build", () => {
    const g = fresh();
    g.menu(DUNE.key);
    g.menu(null);
    expect(g.step).toBe("1");
    g.menu(DUNE.key);
    g.built(DUNE.key, "dune");
    g.menu(PANDANUS.key);
    g.menu(null);
    expect(g.step).toBe("2");
  });

  it("waits while the player clicks elsewhere: a menu on another tile changes nothing", () => {
    const g = fresh();
    g.menu("3,3");
    expect(g.step).toBe("1");
    g.menu(DUNE.key);
    g.menu("3,3");
    expect(g.step).toBe("1");
  });

  it("ends at step 3 on a wrong build: another tile, or another defense on the glowing tile", () => {
    for (const [key, el] of [["3,3", "dune"], [DUNE.key, "seawall"]] as const) {
      const g = fresh();
      g.menu(DUNE.key);
      g.built(key, el);
      expect(g.step).toBe("3");
    }
    const g = fresh();
    g.menu(DUNE.key);
    g.built(DUNE.key, "dune");
    g.built("3,3", "mangrove");
    expect(g.step).toBe("3");
  });

  it("ends at step 3 on Skip the help, from any step before it, and Got it then ends it", () => {
    for (const steps of [[], ["1b"], ["1b", "2"], ["1b", "2", "2b"]]) {
      const g = fresh();
      if (steps.includes("1b")) g.menu(DUNE.key);
      if (steps.includes("2")) g.built(DUNE.key, "dune");
      if (steps.includes("2b")) g.menu(PANDANUS.key);
      g.skip();
      expect(g.step).toBe("3");
      g.skip();
      expect(g.step).toBe("3");
      g.gotIt();
      expect(g.active).toBe(false);
    }
  });
});

describe("when the guide runs", () => {
  it("only on a fresh Play Panjim run: its first year, no builds; not after Restart, not on a retry, never in the Tutorial", () => {
    expect(guideShouldRun({ tutorial: false, restarted: false, turnNumber: 1, builds: 0 })).toBe(true);
    expect(guideShouldRun({ tutorial: false, restarted: true, turnNumber: 1, builds: 0 })).toBe(false);
    expect(guideShouldRun({ tutorial: true, restarted: false, turnNumber: 1, builds: 0 })).toBe(false);
    expect(guideShouldRun({ tutorial: false, restarted: false, turnNumber: 3, builds: 2 })).toBe(false);
    expect(guideShouldRun({ tutorial: false, restarted: false, turnNumber: 1, builds: 1 })).toBe(false);
  });

  it("starts only from Let's Play! (the brief closing), which a retry never reopens", () => {
    const session = readFileSync("src/app/gameSession.ts", "utf8");
    expect(session).toContain("objectivesPanel.onBriefClosed = () => {");
    expect(session).toContain("restarted: options.restarted === true");
    const shell = readFileSync("src/app/appShell.ts", "utf8");
    // ☰ Start again and the last card's Play again both start the level as a Restart.
    expect(shell.match(/this\.restarting = true;\s*this\.requestLevel\(level\.id, "replace"\);/g)?.length).toBe(2);
  });

  it("takes the objective's first dune pick, then its first pandanus pick", () => {
    const picks = [
      { key: "1,1", elementId: "mangrove" },
      { key: "-5,21", elementId: "sandy_vegetation" },
      { key: "-4,18", elementId: "dune" },
      { key: "-6,22", elementId: "sandy_vegetation" }
    ];
    expect(guideTiles(picks)).toEqual([DUNE, PANDANUS]);
    expect(guideTiles([{ key: "1,1", elementId: "dune" }])).toBeNull();
  });
});

describe("the guide's words", () => {
  it("says each step's line, the year and the builds from the game", () => {
    expect(guideLine("1", { year: 2030, builds: 5, name: "Dune" })).toEqual({
      text: "Hello! I am Maya. The cyclone reaches Miramar in 2030. A dune on the beach breaks its waves before they reach the school.",
      bold: "Click the glowing tile.",
      at: 1
    });
    expect(guideLine("1b", { year: 2030, builds: 5, name: "Dune" })).toMatchObject({ text: "These are the defenses that fit this tile. Each build is one year.", bold: "Pick Dune.", at: 1 });
    expect(guideLine("2", { year: 2030, builds: 4, name: "Pandanus" })).toMatchObject({ bold: "Click the next glowing tile.", at: 2 });
    expect(guideLine("2b", { year: 2030, builds: 4, name: "Pandanus" })).toMatchObject({ text: "Pandanus is good for nature too: watch Biodiversity go up.", bold: "Pick Pandanus.", at: 2 });
    expect(guideLine("3", { year: 2030, builds: 3, name: "" })).toEqual({
      text: "That is how it works. The cyclone comes in 3 builds.",
      bold: "Over to you: finish the card top right, or build where Panjim needs it.",
      at: null
    });
  });
});
