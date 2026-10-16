import { describe, expect, it } from "vitest";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { housesLostWithout } from "../src/core/stormRecord";
import { floodsHouse } from "../src/core/hazardModel";
import { nextLabel, phaseResult, placesInArea, resultHeadline } from "../src/core/phaseResult";
import { mapById } from "../src/levels/levelMap";
import { passYear } from "./helpers/passYear";
import type { ActionRun } from "../src/core/actionRun";

/**
 * Section 9's result cards read the storm's own record. The comparisons are
 * exact re-runs: with nothing removed they reproduce the storm's result, for
 * fixed seeds, on boards with and without defences.
 */
const MAP = mapById("panaji")!;
const PLACES = [...MAP.landmarks, ...MAP.monuments.map((m) => ({ name: m.name, q: m.q, r: m.r }))];

/** One build a year on the next storm's area (dunes, mangroves, khazans by eye), else nothing. */
function play(run: ActionRun, defend: boolean): void {
  const next = run.nextChallenge()!;
  while (!run.landed.has(next.id)) {
    let built = false;
    if (defend) {
      for (const key of run.exposureFor(next, true)!.exposure.keys()) {
        const [q, r] = key.split(",").map(Number);
        const id = ["dune", "mangrove", "khazan", "breakwater"].find((e) => run.state.canBuild({ q, r }, e));
        if (id && run.build({ q, r }, id).ok) {
          built = true;
          break;
        }
      }
    }
    if (!built) passYear(run);
  }
}

describe("the result cards' numbers", () => {
  it("re-running with nothing removed reproduces the real result, house for house", () => {
    for (const [seed, defend] of [["panjim", false], ["s1", true], ["s7", true], ["panjim", true]] as const) {
      const run = newRun(seed, BOT_LEVEL);
      for (const challenge of [...run.schedule]) {
        // Defended: a build a year on the storm's path until its own year (so combos and mixed kinds are in play).
        while (run.yearsUntil(challenge) > 1) {
          let built = false;
          if (defend) {
            for (const key of run.exposureFor(challenge, true)!.exposure.keys()) {
              const [q, r] = key.split(",").map(Number);
              const id = ["dune", "sandy_vegetation", "mangrove", "khazan", "breakwater"].find((e) => run.state.canBuild({ q, r }, e));
              if (id && run.build({ q, r }, id).ok) {
                built = true;
                break;
              }
            }
          }
          if (!built) passYear(run);
        }
        const before = run.state.clone();
        const args = { zones: run.zones!, kind: challenge.kind, intensity: run.intensityOf(challenge), strengthUnit: run.climate!.intensityPerStrength, combos: run.combos, houseStars: run.houseStars, houseRule: run.houseRule, landfall: run.landfallOf(challenge) };
        passYear(run);
        const real = run.outcomes.get(challenge.id)!;
        const again = housesLostWithout(before, args, null);
        expect(again.housesDamaged, `${seed} ${challenge.id}`).toBe(real.housesDamaged);
        expect([...again.damagedHouses].sort(), `${seed} ${challenge.id}`).toEqual([...real.damagedHouses].sort());
        expect(again.stars).toBe(real.stars);
        // Card 2's numbers: for every kind standing before the storm, a fresh re-run without it, exactly.
        const record = run.stormRecords.get(challenge.id)!;
        for (const [kind, homes] of record.withoutEach) {
          expect(homes, `${seed} ${challenge.id} ${kind}`).toBe(Math.max(0, housesLostWithout(before, args, kind).housesDamaged - real.housesDamaged));
        }
        if (defend) expect(record.withoutEach.size, `${seed} ${challenge.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("decides a place's Damaged by the same depth line the houses fall at", () => {
    const run = newRun("panjim", BOT_LEVEL);
    const challenge = run.schedule[0];
    play(run, false);
    const record = run.stormRecords.get(challenge.id)!;
    for (const key of record.outcome.damagedHouses) expect(floodsHouse(record.depth.get(key) ?? 0), key).toBe(true);
  });

  it("lists the places in or next to the phase's area to protect, and only the kinds built that phase", () => {
    const run = newRun("panjim", BOT_LEVEL);
    const challenge = run.schedule[0];
    const area = run.areas.get(challenge.id)!;
    expect(area.length).toBe(8);
    play(run, true);
    const result = phaseResult(challenge, run.stormRecords.get(challenge.id)!, area, PLACES, run.phaseBuilds.get(challenge.id) ?? []);
    expect(result.eyebrow).toBe("2030 · Cyclone");
    expect(result.places.map((p) => p.name)).toEqual(placesInArea(PLACES, area).map((p) => p.name));
    for (const row of result.defences) expect(run.phaseBuilds.get(challenge.id)).toContain(row.elementId);
    // The next phase's area is recorded at its start, 2031.
    expect(run.areas.has("c2-flood")).toBe(true);
  });

  it("words the headline by stars and the button by what comes next", () => {
    expect(resultHeadline(3)).toBe("Your city came through.");
    expect(resultHeadline(2)).toBe("Most of your city held.");
    expect(resultHeadline(1)).toBe("Your city took a heavy hit.");
    expect(resultHeadline(0)).toBe("Your city took a heavy hit.");
    const run = newRun("panjim", BOT_LEVEL);
    expect(nextLabel(run.schedule[1])).toBe("Next: the flood in 2040");
    expect(nextLabel(run.schedule[2])).toBe("Next: cyclone and flood in 2050");
    expect(nextLabel(null)).toBe("Panjim in 2050");
  });
});

describe("the result cards' words", () => {
  it("say wave or water, never wind; Maya's card lines are short, and each is a game rule or practical guidance", async () => {
    const maya = (await import("../src/data/maya.json")).default as unknown as { results: { byDefence: Record<string, { text: string; rule: boolean }>; comingUp: Record<string, { text: string; rule: boolean }> } };
    const lines = [...Object.values(maya.results.byDefence), ...Object.values(maya.results.comingUp)];
    for (const line of lines) {
      expect(line.text, line.text).not.toMatch(/\bwind/i);
      expect(line.text.split(/\s+/).length, line.text).toBeLessThanOrEqual(25);
      expect(typeof line.rule).toBe("boolean");
      expect(line.text).not.toMatch(/\d/);
    }
    for (const id of ["dune", "sandy_vegetation", "seawall", "breakwater", "mangrove", "khazan", "small_dam"]) expect(maya.results.byDefence[id], id).toBeDefined();
    const source = (await import("node:fs")).readFileSync("src/ui/panjim/resultCards.ts", "utf8");
    expect(source).not.toMatch(/\bwind\b|Iconic places|overlap/i);
  });

  it("puts both game rules on the Sources screen", async () => {
    const { ALL_FACTS } = await import("../src/core/facts");
    for (const id of ["place-damaged", "defence-homes"]) expect(ALL_FACTS.find((f) => f.id === id)?.kind, id).toBe("gameRule");
  });
});
