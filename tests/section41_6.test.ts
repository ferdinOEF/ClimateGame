import { describe, expect, it } from "vitest";
import { newPanjimRun } from "../src/levels/panjimRun";
import { playedRun } from "../tools/panjimBots/bots";
import { phaseResult } from "../src/core/phaseResult";
import { STANDING_NATURE } from "../src/core/stormRecord";
import { replaySteps } from "../src/core/stormReplay";
import { MayaDirector, phaseLine } from "../src/app/mayaDirector";
import type { Maya, MayaLine } from "../src/ui/panjim/maya";
import { rankHtml } from "../src/ui/panjim/resultCards";
import { topTenHtml } from "../src/ui/panjim/nameCard";
import mayaData from "../src/data/maya.json";
import { readFileSync } from "node:fs";

/**
 * Section 41.6: the owner's answers to Section 41's questions (11 November 2026). Game rules, each pinned here.
 */
const STANDING = ["26,6", "16,15", "7,21"];
const coordOf = (key: string): { q: number; r: number } => {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
};
const read = (file: string): string => readFileSync(file, "utf8");

describe("41.6 answer 4: each storm's path is counted with the standing nature in place", () => {
  it("homes the standing nature alone keeps are not in the path; removing one puts its homes back", () => {
    const fresh = newPanjimRun({ objectives: false, points: false });
    const flood = fresh.schedule.find((c) => c.kind === "flood")!;
    const path = fresh.readinessFor(flood)!.outcome.housesTotal;
    // Without the standing nature counted, 2040's path was 56 homes (Section 41); with it in place, fewer.
    expect(path).toBeLessThan(56);
    for (const key of STANDING) {
      const run = newPanjimRun({ objectives: false, points: false });
      expect(run.demolish(coordOf(key)).ok, key).toBe(true);
      // The removal costs that year, and every home it kept comes back into the path.
      expect(run.year).toBe(2027);
      expect(run.readinessFor(run.schedule[1])!.outcome.housesTotal, key).toBeGreaterThan(path);
    }
  });

  it("a run that builds only away from the storms saves no home, earns no home points and is credited nothing", () => {
    const far = playedRun("far", "s1");
    for (const c of far.schedule) {
      const record = far.stormRecords.get(c.id)!;
      expect(record.outcome.housesSaved, c.id).toBe(0);
      // None of the player's own defences did any work, so the words that credit them have nothing to say.
      expect(record.savedBy, c.id).toEqual([]);
      expect(record.undefended.outcome.housesDamaged, c.id).toBe(record.outcome.housesDamaged);
      expect(replaySteps(record, record.defences).map((s) => s.maya).join(" "), c.id).not.toMatch(/You saved|Without your/);
    }
  });

  it("the standing three get their own row, \"Standing nature\", after the player's rows, with the homes they kept", () => {
    const far = playedRun("far", "s1");
    const flood = far.schedule.find((c) => c.kind === "flood")!;
    const record = far.stormRecords.get(flood.id)!;
    expect([...record.standing!.keys].sort()).toEqual([...STANDING].sort());
    expect(record.standing!.homes).toBeGreaterThan(0);
    const rows = phaseResult(flood, record, far.areas.get(flood.id) ?? [], [], far.phaseBuilds.get(flood.id) ?? []).defences;
    expect(rows[rows.length - 1]).toEqual({ elementId: STANDING_NATURE.id, name: "Standing nature", homes: record.standing!.homes, standing: true });
    expect(rows.filter((r) => r.standing)).toHaveLength(1);
    // The player's own rows never count the standing nature's homes: a khazan built by the player is weighed alone.
    expect(record.withoutEach.has("khazan")).toBe(false);
  });

  it("the player's own khazan is credited alone, and the standing khazans never with it", () => {
    const run = newPanjimRun({ objectives: false });
    expect(run.build({ q: 24, r: 6 }, "mangrove").ok).toBe(true);
    const flood = run.schedule[1];
    while (!run.landed.has(flood.id)) {
      const tile = [...run.state.placed.values()].find((t) => run.state.canBuild(t.coord, "breakwater"))!;
      expect(run.build(tile.coord, "breakwater").ok).toBe(true);
    }
    const record = run.stormRecords.get(flood.id)!;
    expect(record.withoutEach.has("khazan")).toBe(false);
    expect(record.savedBy.some((s) => s.elementId === "khazan")).toBe(false);
    expect(record.standing!.keys).toEqual(expect.arrayContaining(["26,6", "16,15"]));
  });

  it("the storm's words credit only the player's own: \"Your khazans\" needs a khazan the player built, and Maya's card line never names the standing row", () => {
    const director = read("src/app/stormDirector.ts");
    expect(director).toContain('const hasKhazans = [...defences].some(([key, id]) => id === "khazan" && !standing.has(key));');
    expect(read("src/app/panjimController.ts")).toContain("const top = result.defences.find((d) => d.homes > 0 && !d.standing);");
  });
});

describe("41.6 answer 3: the sea and the river at Campal are said once, as the 2050 phase begins", () => {
  function sayer(): { maya: Maya; said: MayaLine[] } {
    const said: MayaLine[] = [];
    const maya = { say: (l: MayaLine) => said.push(l), withdraw: () => undefined, dismiss: () => undefined, queued: said } as unknown as Maya;
    return { maya, said };
  }
  const phaseRun = (kind: string, year: number) => ({ nextChallenge: () => ({ id: `next-${kind}`, kind, turn: 25 }), year, moment: year, buildsUntil: () => 10, state: { elements: new Map() }, prep: [] });

  it("with the first line of the 2050 phase, in one bubble, and never again in the run", () => {
    const { maya, said } = sayer();
    const run = phaseRun("compound", 2041);
    const director = new MayaDirector(maya, { run, blocked: () => false, quiet: false } as never);
    said.length = 0;
    director.phaseStart(false);
    expect(said).toHaveLength(1);
    expect(said[0].text).toBe(`${phaseLine(false, 2041, 10, "compound")} ${mayaData.warning.seaAndRiver}`);
    expect(said[0].text).toContain("At Campal the sea and the river rise together. Seawalls and breakwaters along the shore can hold them back.");
    // "Try again from 2041" after the storm: the phase's line again, the Campal sentence not.
    director.phaseStart(true);
    expect(said[1].text).toBe(phaseLine(true, 2041, 10, "compound"));
  });

  it("not with the cyclone's or the flood's phase", () => {
    for (const kind of ["cyclone", "flood"]) {
      const { maya, said } = sayer();
      const director = new MayaDirector(maya, { run: phaseRun(kind, 2031), blocked: () => false } as never);
      said.length = 0;
      director.phaseStart(false);
      expect(said[0].text, kind).not.toContain("Campal");
    }
  });
});

describe("41.6 answer 10: one board, tagless", () => {
  it("the name card's Top 10 and the last card's board box show no season or festival label, in any state", () => {
    const labelled = Array.from({ length: 12 }, (_, i) => ({ rank: i + 1, name: `Player ${i + 1}`, points: 5000 - i * 100, stars: 7, season: "Festival 2026" }));
    const html = [
      topTenHtml({ status: "ready", rows: labelled }),
      topTenHtml({ status: "ready", rows: [] }),
      topTenHtml({ status: "offline" }),
      topTenHtml({ status: "loading" }),
      rankHtml({ status: "ready", rank: { rank: 4, points: 4000, tenth: 2500, top: labelled.slice(0, 3), above: labelled.slice(1, 3), below: labelled.slice(4, 6) } }, "qa"),
      rankHtml({ status: "offline" }, "qa"),
      rankHtml({ status: "loading" }, "qa")
    ].join("\n");
    expect(html).not.toMatch(/season|festival|Season 1/i);
    expect(html).toContain("Top 10");
  });

  it("nothing a player sees names a festival or a season of the board", () => {
    for (const file of ["src/ui/panjim/nameCard.ts", "src/ui/panjim/resultCards.ts", "src/services/board.ts", "src/data/maya.json", "src/data/facts.json"]) {
      // A string literal or a template line that names a festival (comments may say why the label went).
      expect(read(file).match(/Festival 2026|Season 1|["`][^"`\n]*festival[^"`\n]*["`]/gi), file).toBeNull();
    }
  });
});

describe("41.6 answer 9: the nature and smart bots weigh the objective's glowing tiles", () => {
  it("both styles read the objective card (the tiles it glows on) and pass them to their search", () => {
    const bots = read("tools/panjimBots/bots.ts");
    expect(bots).toContain('const GLOW_STYLES: ReadonlySet<Persona> = new Set<Persona>(["nature", "smart"]);');
    expect(bots).toContain("smart: smartPlayer(null, null, undefined, true),");
    expect(bots).toContain("nature: limitedPlayer(NATURE, true),");
  });
});
