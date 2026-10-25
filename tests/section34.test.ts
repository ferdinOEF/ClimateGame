import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { panjimHelpHtml } from "../src/ui/panjim/panjimHelp";
import { resultHeadline } from "../src/core/phaseResult";
import { CITED_FACTS } from "../src/core/facts";
import { homesHtml } from "../src/ui/panjim/resultCards";
import maya from "../src/data/maya.json";
import { factById, isShown } from "../src/core/facts";
import { tutorialRun } from "../tools/tutorial/sim";
import type { ActionRun } from "../src/core/actionRun";
import type { AxialCoord } from "../src/core/hex";

/**
 * Section 34 (the deep review): each bug the review fixed, with a test that keeps it fixed. Several live in the
 * controller and the session, which are DOM code; those are checked from their source, and in the browser by the
 * playtests (docs/REVIEW_34.md).
 */
const session = fs.readFileSync("src/app/gameSession.ts", "utf8");
const controller = fs.readFileSync("src/app/panjimController.ts", "utf8");

describe("Section 34: a run is recorded as its final card says", () => {
  it("Panjim is completed only when cleared; the Tutorial always completes", () => {
    expect(session).toContain("onRunComplete: (result, then) => finishRun(level.tutorial === true || result.cleared, result, then)");
  });

  it("a yearly run has no turn budget (no par) and counts the defences its storms broke", () => {
    expect(session).toContain("parTurns: panjimResult ? 0 : level.parTurns");
    // Broken in a storm (its records, so one rebuilt over or demolished still counts), or broken on the board now.
    expect(session).toContain("zone.failed.length");
    expect(session).toContain("defensesDestroyed: Math.max(brokenInStorms,");
  });
});

describe("Section 34: the Tutorial's How to play", () => {
  const run = tutorialRun();
  const html = panjimHelpHtml({ startYear: 2026, endYear: 2032, storms: run.schedule, heatLeadYears: 1, houseStars: run.houseStars, tutorial: true });

  it("never states Panjim's clear rule (the Tutorial has none), with its two storms", () => {
    expect(run.schedule.length).toBe(2);
    expect(html).not.toMatch(/You clear Panjim/);
  });

  it("says how its own stars are given, and that Panjim counts biodiversity too", () => {
    expect(html).toContain("In this game the stars here count the homes saved: one star for saving 30% of the homes in its path, two for 50% and three for 79%.");
    expect(html).toContain("In Play Panjim they count biodiversity too.");
  });

  it("Panjim's page keeps its clear rule", () => {
    const panjim = panjimHelpHtml({ startYear: 2026, endYear: 2050, storms: run.schedule.concat(run.schedule[0]), houseStars: { three: 0.85, two: 0.55, one: 0.3, bioTwo: 0, bioThree: 6 } });
    expect(panjim).toContain("You clear Panjim with at least one star in every storm and five of the nine stars in all.");
  });
});

describe("Section 34: the Tutorial's result rows credit homes still standing", () => {
  /** The controller's rule (tutorialRows): each build's saved homes, less any an earlier storm or this one destroyed. */
  it("never credits more homes than the storm's card says were saved", () => {
    const run: ActionRun = tutorialRun();
    const credit = new Map<string, Map<string, Set<string>>>();
    const build = (coord: AxialCoord, id: string): void => {
      for (const c of run.schedule.filter((s) => !run.landed.has(s.id))) {
        const saved = run.riskChangeBy(c, coord, id)?.saved ?? [];
        const byDefence = credit.get(c.id) ?? new Map<string, Set<string>>();
        byDefence.set(id, new Set([...(byDefence.get(id) ?? []), ...saved]));
        credit.set(c.id, byDefence);
      }
      expect(run.build(coord, id).ok).toBe(true);
    };
    // Flood defences first (they credit the flood before the cyclone ruins homes in its path), then anything.
    while (!run.finished) {
      const tiles = [...run.state.placed.values()].filter((t) => run.state.buildableAt(t.coord).length > 0);
      const flood = run.schedule.find((c) => c.kind === "flood")!;
      let best: { coord: AxialCoord; id: string; n: number } | null = null;
      for (const t of tiles) for (const def of run.state.buildableAt(t.coord)) {
        const n = run.landed.has(flood.id) ? 0 : run.riskChangeBy(flood, t.coord, def.id)?.saved.length ?? 0;
        if (!best || n > best.n) best = { coord: t.coord, id: def.id, n };
      }
      build(best!.coord, best!.id);
    }
    for (const c of run.schedule) {
      const outcome = run.outcomes.get(c.id)!;
      const lost = new Set<string>();
      for (const s of run.schedule) {
        for (const key of run.outcomes.get(s.id)?.damagedHouses ?? []) lost.add(key);
        if (s.id === c.id) break;
      }
      const credited = [...(credit.get(c.id)?.values() ?? [])].reduce((sum, keys) => sum + [...keys].filter((k) => !lost.has(k)).length, 0);
      expect(credited, c.id).toBeLessThanOrEqual(outcome.housesSaved);
    }
    expect(controller).toContain("const homes = gone || broken ? 0 : kept(step.id);");
    // Net, as before this section (a seawall's row never claims homes its own push put back at risk), capped by the homes still standing.
    expect(controller).toContain("Math.min(net.get(id) ?? 0,");
  });
});

describe("Section 34: rules about builds no level offers are not shown", () => {
  it("hides the sand mining, resort and yacht rules; the dune rule says the wear lasts until repaired", () => {
    for (const id of ["sandmining-biodiversity", "resort-no-defence", "yacht-nothing"]) expect(isShown(factById(id)!), id).toBe(false);
    expect(factById("dune-shrinks")!.text).toContain("stays weaker until repaired");
  });
});

describe("Section 34: a pulsing tile's build menu names the objective's defence", () => {
  it("marks that card with an Objective chip, from the same pulsing tiles the board shows", () => {
    expect(controller).toContain("this.markObjectiveCard(coord);");
    expect(controller).toMatch(/jobs\.filter\(\(job\) => this\.pulseKeys\(job\)\.includes\(key\)\)/);
    expect(session).toContain("controller.cardsOpened(coord);");
  });
});

const popover = fs.readFileSync("src/ui/buildPopover.ts", "utf8");

describe("Section 34: clicks that were lost or doubled", () => {
  it("a click outside a menu or a tile's card only closes it (no click through: it led to accidental builds)", () => {
    expect(popover).not.toContain("onOutsideClick");
    expect(session).not.toContain("onOutsideClick");
    expect(popover).toContain("if (e.target === this.backdrop) this.hide();");
  });

  it("a pointer click on a card in the first moment after the menu opens is ignored (a double click's second half)", () => {
    expect(popover).toContain("if (e.detail > 0 && performance.now() - this.openedAt < CARD_CLICK_GUARD_MS) return;");
    expect(popover).toContain("this.openedAt = performance.now();");
  });
});

describe("Section 34: the result card", () => {
  it("names biodiversity in the headline when it, not the homes, held the stars down", () => {
    expect(resultHeadline(1, 3)).toBe("Your homes held, but nature paid for it.");
    expect(resultHeadline(1, 2)).toBe("Most of your city held, but nature paid for it.");
    expect(resultHeadline(2, 2)).toBe("Most of your city held.");
    expect(resultHeadline(3, 3)).toBe("Your city came through.");
    expect(resultHeadline(1)).toBe("Your city took a heavy hit.");
  });

  it("says the total is the homes standing in the storm's path", () => {
    expect(homesHtml(46, 57)).toContain("57 homes stood in its path; 11 were lost");
    expect(homesHtml(9, 9)).not.toContain("stood in its path");
  });
});

describe("Section 34: honest words", () => {
  it("shows no development notes with a source (they are kept in fields the screen never shows)", () => {
    for (const fact of CITED_FACTS) expect(fact.citation?.note ?? "", fact.id).not.toMatch(/Section \d|search engine|this environment/);
  });

  it("Maya's seawall tip says the rule as it is; the flood line says why it comes down the river", () => {
    const text = JSON.stringify(maya);
    expect(text).not.toMatch(/fails all at once|holds no water/);
    expect(text).toContain("In this game, monsoon rain swells the Mandovi upstream");
  });
});

describe("Section 34: keyboard play", () => {
  it("the map takes focus and its arrow keys move a tile cursor that Enter opens", () => {
    expect(session).toContain("canvas.tabIndex = 0;");
    expect(session).toContain("ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0]");
    expect(session).toMatch(/event\.key === "Enter" \|\| event\.key === " "\) \{\s+event\.preventDefault\(\);\s+openTilePopover\(cursor\);/);
  });

  it("Help and the start popup take focus and keep Tab inside", () => {
    expect(fs.readFileSync("src/ui/helpModal.ts", "utf8")).toContain("trapFocus(this.card, () => this.isOpen);");
    expect(fs.readFileSync("src/ui/objectivesPanel.ts", "utf8")).toContain("trapFocus(card, () => this.briefOpen);");
  });
});

describe("Section 34: the HUD and the objective", () => {
  it("the biodiversity counter counts the build that brings a storm, with that storm's target", () => {
    expect(controller).toContain("this.outlook.renderBiodiversity(this.biodiversityView(landing?.challenge));");
  });

  it("a row whose picked tiles were taken still pulses tiles in its area where its defence fits", () => {
    expect(controller).toContain("if (open.length >= need || tiles.size === 0) return open;");
  });
});

describe("Section 34: Maya's rule tips keep their tag", () => {
  it("the director passes a tip's rule flag to her bubble", () => {
    const director = fs.readFileSync("src/app/mayaDirector.ts", "utf8");
    expect(director).toContain("...(note.rule ? { rule: true } : {})");
    for (const tip of (maya as { tips: { id: string; rule?: boolean }[] }).tips.filter((t) => ["mangroves", "khazans", "dunes", "seawall"].includes(t.id))) expect(tip.rule, tip.id).toBe(true);
  });
});

describe("Section 34: no memory growth run over run", () => {
  it("a session's end disposes what is shared across sessions, so no old renderer (and its whole session) stays alive", () => {
    // Found with heap snapshots (tools/leak34.ts): each shared material, geometry and texture kept the old renderer's
    // listener or GPU record, and through it the old canvas and session, about 4.5 MB a run.
    for (const call of ["releaseSharedReactionMaterials();", "releaseSharedMonumentMaterials();", "releaseRuinGeometries();", "releaseTownGeometries();", "releaseOverlayPlaceholder();"]) {
      expect(session.indexOf(call), call).toBeGreaterThan(0);
      expect(session.indexOf(call), `${call} before the scene goes`).toBeLessThan(session.indexOf("    disposeScene();"));
    }
  });
});

describe("Section 34 Round 2 fixes", () => {
  const scene = fs.readFileSync("src/render/scene.ts", "utf8");
  const director = fs.readFileSync("src/app/mayaDirector.ts", "utf8");
  const cards = fs.readFileSync("src/ui/panjim/defenceCards.ts", "utf8");
  const steps = fs.readFileSync("src/ui/panjim/tutorialSteps.ts", "utf8");

  it("the idle reset is held only while a storm plays (a result card left alone resets for the next visitor)", () => {
    expect(session).toContain("() => Boolean(stormDirector?.playing),");
  });

  it("a drag or a zoom keeps the board on screen; a resize closes an open build menu", () => {
    expect(scene.match(/clampTarget\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(session).toContain('window.addEventListener("resize", () => buildPopover.hide(), { signal: keydownAbort.signal });');
  });

  it("a tile pulses only while a build there still takes homes out of the storm's risk", () => {
    expect(controller).toContain("const open = [...new Set(picks)].filter((key) => fits(key) && helps(key));");
  });

  it("Maya's 'strengthen it now' names homes near the objective's open tiles when there are any", () => {
    expect(director).toContain("riskHotspot(nearPicks.length > 0 ? nearPicks : exposure.housesAtRisk, exposure.intensity)");
  });

  it("keyboard: O jumps the map cursor to the objective's next tile, and Help says so; Tab stays in the build menu", () => {
    expect(session).toContain('event.key === "o" || event.key === "O"');
    expect(panjimHelpHtml({ startYear: 2026, endYear: 2050, storms: [] })).toContain("O jumps to the objective's tiles");
    expect(fs.readFileSync("src/ui/buildPopover.ts", "utf8")).toContain("trapFocus(this.el, () => this.isOpen);");
  });

  it("words: the striped red (readable without colour), what a khazan is, the Tutorial's seawall tile, the source's 'can be'", () => {
    expect(JSON.stringify(maya)).toContain("The striped red tiles show where the {storm} will hit.");
    expect(cards).toContain('"Wetland walled off from the tide; farmers and fishers share it."');
    expect(steps).toContain('"Try a seawall on a glowing tile by the sea."');
    expect(factById("card-mangrove")!.text).toBe("Mangroves can be nursery grounds for young fish, prawns and crabs.");
  });
});
