import { describe, expect, it } from "vitest";
import { shelterOf } from "../src/core/climate";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { buildHeatView, hazardsOf } from "../src/core/exposure";
import { homesLost } from "../src/core/phaseObjectives";
import { LANDFALL_ZONE } from "../src/core/hazardModel";
import { ELEMENT_BY_ID } from "../src/core/elements";
import type { ActionRun } from "../src/core/actionRun";

/**
 * Section 21.4 (owner request): Show risk shows the next storm's risk on the board as it stands, at any year,
 * counting every defence built; the top bar's Homes at risk equals the homes shown in the heat; and the heat is
 * what would happen if the storm came now (preview equals resolution).
 */
function view(run: ActionRun) {
  const next = run.nextChallenge()!;
  const now = run.exposureFor(next)!;
  const bare = run.exposureFor(next, true);
  const terrain = (key: string) => run.state.placed.get(key)?.terrainId;
  const hazards = hazardsOf(next.kind);
  const defences = [...run.state.elements].filter(([, inst]) => {
    const def = ELEMENT_BY_ID.get(inst.elementId);
    return !!def && (def.effects.resilience ?? 0) > 0 && !!def.targetsHazards?.some((h) => hazards.includes(h as "cyclone" | "flood"));
  }).map(([key]) => key);
  return { next, now, tiles: buildHeatView(now, bare, run.yearsUntil(next), defences, terrain) };
}

describe("Show risk, live", () => {
  it("shows exactly the top bar's Homes at risk in every year, never on scenery, the storm as it would come now", () => {
    const run = newRun("live", BOT_LEVEL);
    const zoneTiles = run.zones!.keys(LANDFALL_ZONE);
    let checked = 0;
    while (!run.finished && checked < 25) {
      const next = run.nextChallenge();
      if (!next) break;
      const { now, tiles } = view(run);
      const hot = tiles.filter((t) => t.heat > 0).map((t) => t.key).sort();
      expect(hot.length, `${run.year}`).toBe(run.homesAtRisk(next));
      for (const key of hot) expect(run.state.isScenery(key), key).toBe(false);
      // The same homes the storm would take if it came on this board now.
      const lost = homesLost(run.state, { kind: next.kind, strength: next.strength, landfall: run.landfallOf(next), sheltered: shelterOf(next) }, zoneTiles.length ? zoneTiles : undefined);
      expect(hot, `${run.year}`).toEqual([...lost].sort());
      expect(new Set(now.housesAtRisk)).toEqual(lost);
      // One year on, with a build on the storm's path where one fits.
      const reach = [...(run.exposureFor(next, true)?.exposure.keys() ?? [])];
      let built = false;
      for (const key of reach) {
        const [q, r] = key.split(",").map(Number);
        for (const id of ["dune", "mangrove", "khazan"]) if (!built && run.state.canBuild({ q, r }, id)) built = run.build({ q, r }, id).ok;
        if (built) break;
      }
      if (!built) (run as unknown as { endYear(): unknown }).endYear();
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("drops a home from the heat when a defence saves it, in a year before the warning years", () => {
    const run = newRun("live-2027", BOT_LEVEL);
    (run as unknown as { endYear(): unknown }).endYear(); // 2027
    const before = view(run);
    expect(run.yearsUntil(before.next)).toBeGreaterThan(2);
    const hot = new Set(before.tiles.filter((t) => t.heat > 0).map((t) => t.key));
    expect(hot.size).toBeGreaterThan(0);
    // The objective's first build in front of Sharada Mandir School.
    expect(run.build({ q: -4, r: 18 }, "dune").ok).toBe(true);
    const after = view(run);
    const hotAfter = new Set(after.tiles.filter((t) => t.heat > 0).map((t) => t.key));
    expect(hotAfter.size).toBeLessThan(hot.size);
    for (const key of hotAfter) expect(hot.has(key), key).toBe(true);
    expect(hotAfter.size).toBe(run.homesAtRisk(after.next));
  });
});
