import { describe, expect, it } from "vitest";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { areaProtection, computeWater, defenceMetres, HAZARD_MODEL, ownMetres, windField, waterBoard } from "../src/core/hazardModel";
import { computeCombos } from "../src/core/combos";
import { ELEMENT_BY_ID } from "../src/core/elements";
import { axialKey, neighbors } from "../src/core/hex";
import { starsForHouses } from "../src/core/zones";
import { clearsLevel } from "../src/core/panjimIndex";
import { natureReason } from "../src/core/phaseResult";
import { natureHtml } from "../src/ui/panjim/resultCards";
import { panjimHelpHtml, starRule } from "../src/ui/panjim/panjimHelp";
import { BROKEN_RULE, defenceRules } from "../src/ui/panjim/defenceCards";

/**
 * Section 25.1 (owner decisions, game rules): each defence's pro and con.
 * Measured on the real Panaji board with the level's own storms.
 */
import { run, cyclone, flood, compound, landfallTiles, depths, place, pairRatios } from "./section25.helpers";

describe("two of a kind side by side", () => {
  it("two dunes protect the tiles behind them within 10% of one seawall (the 2030 cyclone and the 2050 storm)", () => {
    for (const storm of [cyclone, compound]) {
      const ratios = pairRatios(storm, "beach", "dune", "seawall", 20);
      expect(ratios.length, storm.id).toBeGreaterThanOrEqual(5);
      for (const r of ratios) expect(Math.abs(r - 1), `${storm.id}: ${r.toFixed(3)}`).toBeLessThanOrEqual(0.1);
    }
  });

  it("two khazans protect the tiles behind them within 10% of one small dam (the 2040 flood and the 2050 storm)", () => {
    for (const storm of [flood, compound]) {
      const ratios = pairRatios(storm, "estuary", "khazan", "small_dam", 20);
      expect(ratios.length, storm.id).toBeGreaterThanOrEqual(5);
      for (const r of ratios) expect(Math.abs(r - 1), `${storm.id}: ${r.toFixed(3)}`).toBeLessThanOrEqual(0.1);
    }
  });

  it("pairs only side by side: two dunes three tiles apart add nothing over the stronger one", () => {
    const bare = depths(run.state, cyclone);
    const beaches = [...run.state.placed.values()].filter((t) => t.terrainId === "beach" && bare.has(axialKey(t.coord)) && !run.state.elements.has(axialKey(t.coord))).map((t) => axialKey(t.coord));
    const dist = (a: string, b: string) => {
      const [aq, ar] = a.split(",").map(Number);
      const [bq, br] = b.split(",").map(Number);
      return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
    };
    const a = beaches[0];
    const b = beaches.find((k) => dist(a, k) === 3)!;
    expect(b).toBeDefined();
    const both = run.state.clone();
    place(both, a, "dune");
    place(both, b, "dune");
    // On a tile between them, within reach of both: the stronger dune's protection, not the two added.
    const own = ownMetres(both, "cyclone", new Set(), new Map(), undefined, HAZARD_MODEL);
    const board = waterBoard(both);
    const p = areaProtection(board, own, HAZARD_MODEL, (key) => both.elements.get(key)?.elementId ?? key);
    const onlyA = run.state.clone();
    place(onlyA, a, "dune");
    const pa = areaProtection(board, ownMetres(onlyA, "cyclone", new Set(), new Map(), undefined, HAZARD_MODEL), HAZARD_MODEL, (key) => onlyA.elements.get(key)?.elementId ?? key);
    const onlyB = run.state.clone();
    place(onlyB, b, "dune");
    const pb = areaProtection(board, ownMetres(onlyB, "cyclone", new Set(), new Map(), undefined, HAZARD_MODEL), HAZARD_MODEL, (key) => onlyB.elements.get(key)?.elementId ?? key);
    for (const [key, v] of p) expect(v, key).toBeCloseTo(Math.max(pa.get(key) ?? 0, pb.get(key) ?? 0), 9);
  });

  it("keeps the seawall's strength as it was", () => {
    expect(ELEMENT_BY_ID.get("seawall")!.effects.resilience).toBe(16);
  });
});

describe("seawalls and dams break on their second storm", () => {
  /** A beach tile the 2030 cyclone reaches, and a river tile a dam can go on. */
  const beach = [...run.state.placed.values()].find((t) => t.terrainId === "beach" && run.state.canBuild(t.coord, "seawall") && depths(run.state, cyclone).has(axialKey(t.coord)))!.coord;
  const river = [...waterBoard(run.state).riverIndex.keys()].map((k) => ({ q: Number(k.split(",")[0]), r: Number(k.split(",")[1]) })).find((c) => run.state.canBuild(c, "small_dam"))!;

  it("a seawall comes through the 2030 cyclone and breaks in the 2050 storm, drawn broken and its tile free", () => {
    const r = newRun("wall", BOT_LEVEL);
    expect(r.build(beach, "seawall").ok).toBe(true);
    const key = axialKey(beach);
    while (!r.landed.has(cyclone.id)) spend(r);
    expect(r.state.elements.get(key)!.broken ?? false).toBe(false);
    expect(r.state.elements.get(key)!.stormsSurvived).toBe(1);
    // The 2040 flood brings no cyclone: still standing.
    while (!r.landed.has(flood.id)) spend(r);
    expect(r.state.elements.get(key)!.broken ?? false).toBe(false);
    while (!r.finished) spend(r);
    expect(r.state.elements.get(key)!.broken).toBe(true);
    expect(r.outcomes.get(compound.id)!.zones.flatMap((z) => z.failed)).toContain(key);
    expect(defenceMetres(r.state, key, "cyclone")).toBe(0);
    expect(r.state.buildableAt(beach).map((d) => d.id)).toContain("seawall");
  });

  it("a small dam comes through the 2040 flood and breaks in the 2050 storm", () => {
    const r = newRun("dam", BOT_LEVEL);
    while (r.turnNumber < 6) spend(r);
    expect(r.build(river, "small_dam").ok).toBe(true);
    const key = axialKey(river);
    while (!r.landed.has(flood.id)) spend(r);
    expect(r.state.elements.get(key)!.stormsSurvived).toBe(1);
    expect(r.state.elements.get(key)!.broken ?? false).toBe(false);
    while (!r.finished) spend(r);
    expect(r.state.elements.get(key)!.broken).toBe(true);
  });

  it("a breakwater keeps its depth rule (no storm count)", () => {
    expect(ELEMENT_BY_ID.get("breakwater")!.survivesStorms).toBeUndefined();
    expect(ELEMENT_BY_ID.get("seawall")!.survivesStorms).toBe(1);
    expect(ELEMENT_BY_ID.get("small_dam")!.survivesStorms).toBe(1);
  });

  it("a seawall pushes extra water onto the low land at the ends of the wall", () => {
    const push = ELEMENT_BY_ID.get("seawall")!.endPushM!;
    expect(push).toBeGreaterThan(0);
    // Single walls (both ends the one tile) on every beach tile the 2030 surge reaches: with the push and without.
    const bare = depths(run.state, cyclone);
    let pushed = 0;
    let higher = 0;
    for (const t of run.state.placed.values()) {
      const key = axialKey(t.coord);
      if (t.terrainId !== "beach" || !run.state.canBuild(t.coord, "seawall") || !bare.has(key)) continue;
      const walled = run.state.clone();
      place(walled, key, "seawall");
      ELEMENT_BY_ID.get("seawall")!.endPushM = 0;
      const noPush = depths(walled, cyclone);
      ELEMENT_BY_ID.get("seawall")!.endPushM = push;
      const withPush = depths(walled, cyclone);
      for (const n of neighbors(t.coord).map(axialKey)) {
        const before = noPush.get(n) ?? 0;
        const after = withPush.get(n) ?? 0;
        if (after > before + 1e-9) {
          pushed++;
          expect(run.state.placed.get(n)!.terrainId).toBe("land");
          expect(after).toBeCloseTo(Math.max(before, push), 9);
        }
        if (after < before - 1e-9) higher++;
      }
    }
    expect(pushed).toBeGreaterThan(0);
    // The push only ever adds water.
    expect(higher).toBe(0);
  });
});

/** The year's build far from every storm's water (more than three hexes): it changes nothing a storm does. */
function spend(r: ReturnType<typeof newRun>): void {
  for (const tile of r.state.placed.values()) {
    const options = nearStorm.has(axialKey(tile.coord)) ? [] : r.state.buildableAt(tile.coord);
    if (options.length > 0 && r.build(tile.coord, options[0].id).ok) return;
  }
  throw new Error("nowhere to build");
}
const nearStorm = new Set<string>([...run.schedule].flatMap((c) => [...(run.exposureFor(c, true)?.exposure.keys() ?? [])]).flatMap((k) => {
  const [q, r] = k.split(",").map(Number);
  return [k, ...neighbors({ q, r }).flatMap((n) => [axialKey(n), ...neighbors(n).map(axialKey), ...neighbors(n).flatMap((m) => neighbors(m).map(axialKey))])];
}));

describe("growing, wear and repair", () => {
  it("mangrove and pandanus have no grow time: full strength from the year they are built", () => {
    for (const id of ["mangrove", "sandy_vegetation"]) {
      const def = ELEMENT_BY_ID.get(id)!;
      expect(def.matureTurns, id).toBe(0);
      expect(def.matureQuarters ?? 0, id).toBe(0);
    }
    const s = run.state.clone();
    s.growthEnabled = true;
    const estuary = [...s.placed.values()].find((t) => s.canBuild(t.coord, "mangrove"))!.coord;
    s.build(estuary, "mangrove", false);
    expect(defenceMetres(s, axialKey(estuary), "flood")).toBeCloseTo(ELEMENT_BY_ID.get("mangrove")!.effects.resilience * 0.9);
  });

  it("a khazan is never worn, so it never needs a repair", () => {
    expect(ELEMENT_BY_ID.get("khazan")!.neverWears).toBe(true);
    // A storm far beyond the game's over a khazan: other nature defences would be worn, the khazan is not.
    const r = newRun("khazan", BOT_LEVEL);
    const sites = [...r.state.placed.values()].filter((t) => r.state.canBuild(t.coord, "khazan")).map((t) => t.coord);
    for (const c of sites) place(r.state, axialKey(c), "khazan");
    const water = computeWater(r.state, { kind: "flood", strength: 6, landfall: null }, { landfallZoneTiles: landfallTiles });
    expect(water.depth.size).toBeGreaterThan(0);
    expect(water.overwhelmed.filter((k) => r.state.elements.get(k)?.elementId === "khazan")).toEqual([]);
    for (const c of sites) expect(r.needsRepair(c)).toBe(false);
  });

  it("a mangrove goes on an estuary or at a river's edge, never mid river", () => {
    const def = ELEMENT_BY_ID.get("mangrove")!;
    expect(def.validTerrainIds.sort()).toEqual(["estuary", "river"]);
    const rivers = [...run.state.placed.values()].filter((t) => t.terrainId === "river" && !run.state.isScenery(axialKey(t.coord)) && !run.state.elements.has(axialKey(t.coord)));
    const edge = rivers.filter((t) => run.state.atRiverEdge(t.coord));
    const mid = rivers.filter((t) => !run.state.atRiverEdge(t.coord));
    expect(edge.length).toBeGreaterThan(0);
    expect(mid.length).toBeGreaterThan(0);
    for (const t of mid) expect(run.state.canBuild(t.coord, "mangrove")).toBe(false);
    expect(edge.some((t) => run.state.canBuild(t.coord, "mangrove"))).toBe(true);
  });
});

describe("wind and biodiversity", () => {
  it("only pandanus lowers the cyclone's wind", () => {
    const board = waterBoard(run.state);
    const storm = { kind: cyclone.kind, strength: cyclone.strength, landfall: run.landfallOf(cyclone) };
    const bare = windField(run.state, board, storm);
    for (const id of ["dune", "seawall", "breakwater", "mangrove", "khazan", "small_dam", "sandy_vegetation"]) {
      const s = run.state.clone();
      let placed = 0;
      for (const t of s.placed.values()) {
        if (placed < 6 && s.canBuild(t.coord, id) && bare.has(axialKey(t.coord))) {
          s.build(t.coord, id, false);
          placed++;
        }
      }
      const after = windField(s, board, storm);
      const lower = [...bare].some(([k, v]) => (after.get(k) ?? 0) < v - 1e-9);
      if (placed > 0) expect(lower, id).toBe(id === "sandy_vegetation");
    }
  });

  it("each defence's biodiversity is the owner's number", () => {
    const want: Record<string, number> = { seawall: -5, dune: 2, khazan: 2, mangrove: 3, sandy_vegetation: 3, breakwater: -2 };
    for (const [id, v] of Object.entries(want)) expect(ELEMENT_BY_ID.get(id)!.effects.biodiversity, id).toBe(v);
  });

  it("pandanus gives the dune no bonus", () => {
    const s = run.state.clone();
    const beaches = [...s.placed.values()].filter((t) => s.canBuild(t.coord, "dune"));
    const pairTile = beaches.find((t) => neighbors(t.coord).some((n) => s.canBuild(n, "sandy_vegetation")))!;
    const n = neighbors(pairTile.coord).find((c) => s.canBuild(c, "sandy_vegetation"))!;
    s.build(pairTile.coord, "dune", false);
    s.build(n, "sandy_vegetation", false);
    expect(computeCombos(s).bonus.size).toBe(0);
  });
});

describe("stars from homes saved and biodiversity (Section 25.2)", () => {
  const stars = BOT_LEVEL.houseStars!;

  it("1 star from 30% saved; 2 from 55% with biodiversity at or above the start; 3 from 85% with it raised by the target", () => {
    expect(stars).toMatchObject({ one: 0.3, two: 0.55, three: 0.85, bioTwo: 0 });
    const t = stars.bioThree!;
    expect(t).toBeGreaterThan(0);
    expect(starsForHouses(2, 10, stars, 99)).toBe(0);
    expect(starsForHouses(3, 10, stars, -50)).toBe(1);
    expect(starsForHouses(6, 10, stars, -1)).toBe(1);
    expect(starsForHouses(6, 10, stars, 0)).toBe(2);
    expect(starsForHouses(9, 10, stars, t - 1)).toBe(2);
    expect(starsForHouses(9, 10, stars, t)).toBe(3);
    expect(starsForHouses(9, 10, stars, -1)).toBe(1);
  });

  it("measures the board's biodiversity at each storm against the start of the run, and the stars follow it", () => {
    const r = newRun("bio", BOT_LEVEL);
    expect(r.houseStars!.bioStart).toBe(r.state.biodiversity);
    // Seawalls on the beach the cyclone comes to: homes saved, nature down.
    const beaches = [...r.state.placed.values()].filter((t) => r.state.canBuild(t.coord, "seawall") && t.terrainId === "beach" && depths(r.state, cyclone).has(axialKey(t.coord)));
    for (let i = 0; i < 5; i++) expect(r.build(beaches[i].coord, "seawall").ok).toBe(true);
    const o = r.outcomes.get(cyclone.id)!;
    expect(o.biodiversityChange).toBe(5 * ELEMENT_BY_ID.get("seawall")!.effects.biodiversity);
    expect(o.stars).toBeLessThanOrEqual(1);
    expect(o.stars).toBe(starsForHouses(o.housesSaved, o.housesTotal, r.houseStars!, o.biodiversityChange));
  });

  it("keeps the clear rule: at least one star in every storm and five of nine", () => {
    expect(clearsLevel([1, 1, 3])).toBe(true);
    expect(clearsLevel([0, 3, 3])).toBe(false);
    expect(clearsLevel([1, 1, 2])).toBe(false);
  });

  it("says why on the card: seawalls cost nature, short of the target, or what brought it back", () => {
    expect(natureReason(-10, 6, new Map([["seawall", -10]]))).toBe("Seawalls cost nature");
    expect(natureReason(-3, 6, new Map([["seawall", -5], ["mangrove", 3], ["breakwater", -2]]))).toBe("Seawalls cost nature");
    expect(natureReason(3, 6, new Map([["mangrove", 3]]))).toBe("Short of the +6 three stars need");
    expect(natureReason(0, 6, new Map())).toBe("No nature based defences yet");
    expect(natureReason(9, 6, new Map([["mangrove", 6], ["dune", 2], ["seawall", -5], ["sandy_vegetation", 6]]))).toBe("Mangroves bring nature back");
  });

  it("puts both lines on the result card: homes saved, and biodiversity with its reason", () => {
    const html = natureHtml({ change: -10, target: 6, reason: "Seawalls cost nature", since: 2026 });
    expect(html).toContain("biodiversity since 2026");
    expect(html).toContain("Seawalls cost nature");
    expect(html).toContain("−10");
    expect(natureHtml({ change: 8, target: 6, reason: "Mangroves bring nature back", since: 2026 })).toContain("+8");
  });

  it("says the star lines in How to play as a game rule, from the level's numbers; the Tutorial says Panjim counts nature", () => {
    const html = panjimHelpHtml({ startYear: 2026, endYear: 2050, storms: run.schedule, houseStars: stars });
    expect(html).toContain(`In this game ${starRule(stars, run.schedule).replace(/^A/, "a")}`);
    expect(starRule(stars)).toContain("55%");
    expect(starRule(stars)).toContain(`biodiversity up ${stars.bioThree}.`);
    expect(html).toMatch(/In this game each has a pro and a con/);
    expect(html).toContain("the Field Guide gives them.");
    const tutorial = panjimHelpHtml({ startYear: 2026, endYear: 2028, storms: run.schedule.slice(0, 1), houseStars: { three: 0.79, two: 0.5 } });
    expect(tutorial).toContain("In Play Panjim they count biodiversity too.");
  });

  it("gives every defence its pro and con in the Field Guide, each a game rule", () => {
    const rules = defenceRules();
    expect(rules.map((r) => r.id).sort()).toEqual(["breakwater", "dune", "khazan", "mangrove", "sandy_vegetation", "seawall", "small_dam"]);
    for (const r of rules) expect(r.text, r.id).toMatch(/^In this game /);
    expect(rules.find((r) => r.id === "sandy_vegetation")!.text).toContain("50% less wind damage");
    expect(BROKEN_RULE).toMatch(/^In this game /);
  });
});
