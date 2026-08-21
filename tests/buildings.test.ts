import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { ELEMENT_BY_ID } from "../src/core/elements";

describe("Buildings & economy (v2.4: Beachside Resort widened, House added on Land)", () => {
  it("beachside resort is buildable on beach and estuary, but not river or coast", () => {
    for (const terrainId of ["beach", "estuary"]) {
      const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId }]);
      const options = state.buildableAt({ q: 0, r: 0 }).map((d) => d.id);
      expect(options, `beachside_resort should be buildable on ${terrainId}`).toContain("beachside_resort");
    }

    // STEP_PROMPT_visuals_map_river.md item 3: River's widened eligibility
    // (v2.4) is explicitly reverted — River is reserved for Small Dam and
    // Sand Mining only, so it reads as its own distinct tradeoff instead
    // of overlapping with Resort's.
    const riverState = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "river" }]);
    const riverOptions = riverState.buildableAt({ q: 0, r: 0 }).map((d) => d.id);
    expect(riverOptions).not.toContain("beachside_resort");

    const coastState = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "coast" }]);
    const coastOptions = coastState.buildableAt({ q: 0, r: 0 }).map((d) => d.id);
    expect(coastOptions).not.toContain("beachside_resort");
  });

  it("river offers exactly Small Dam and Sand Mining, nothing else", () => {
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "river" }]);
    const options = state.buildableAt({ q: 0, r: 0 }).map((d) => d.id);
    expect(options.sort()).toEqual(["sand_mining", "small_dam"]);
  });

  it("house is only buildable on land", () => {
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "land" }]);
    const options = state.buildableAt({ q: 0, r: 0 }).map((d) => d.id);
    expect(options).toContain("house");

    const state2 = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "beach" }]);
    const options2 = state2.buildableAt({ q: 0, r: 0 }).map((d) => d.id);
    expect(options2).not.toContain("house");
  });

  it("build() deducts cost and rejects when the tile is occupied or unaffordable", () => {
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "beach" }]);
    const before = state.coin;
    const def = ELEMENT_BY_ID.get("beachside_resort")!;

    expect(state.build({ q: 0, r: 0 }, "beachside_resort")).toBe(true);
    expect(state.coin).toBe(before - def.buildCost);

    // Already has an element on that tile now.
    expect(state.build({ q: 0, r: 0 }, "beachside_resort")).toBe(false);

    const state2 = new GameState([{ coord: { q: 1, r: 0 }, terrainId: "beach" }]);
    state2.coin = 0;
    expect(state2.build({ q: 1, r: 0 }, "beachside_resort")).toBe(false);
  });

  it("each claim (turn) pays out building income via the generic effects accumulator", () => {
    const map = [
      { coord: { q: 0, r: 0 }, terrainId: "beach" },
      { coord: { q: 1, r: 0 }, terrainId: "beach" }
    ];
    const state = new GameState(map, [{ q: 0, r: 0 }]); // (1,0) starts unclaimed, on purpose
    state.build({ q: 0, r: 0 }, "beachside_resort");
    const def = ELEMENT_BY_ID.get("beachside_resort")!;
    const coinAfterBuild = state.coin;

    expect(state.claim({ q: 1, r: 0 })).toBe(true);

    expect(state.turn).toBe(1);
    expect(state.coin).toBe(coinAfterBuild - 4 + def.effects.money); // CLAIM_COST is 4
  });

  it("Small Dam is money+/biodiversity-/resilience+ and Sand Mining is money+/biodiversity-/resilience-", () => {
    // STEP_PROMPT_visuals_map_river.md item 3: Small Dam's resilience sign
    // flipped from earlier revisions (now a flood-control structure, not
    // a flood-defense-trading one); Sand Mining is the new purely
    // extractive option that costs resilience where Small Dam gains it.
    const dam = ELEMENT_BY_ID.get("small_dam")!;
    expect(dam.effects.money).toBeGreaterThan(0);
    expect(dam.effects.biodiversity).toBeLessThan(0);
    expect(dam.effects.resilience).toBeGreaterThan(0);

    const sandMining = ELEMENT_BY_ID.get("sand_mining")!;
    expect(sandMining.effects.money).toBeGreaterThan(0);
    expect(sandMining.effects.biodiversity).toBeLessThan(0);
    expect(sandMining.effects.resilience).toBeLessThan(0);

    // Sand Mining should not simply be a strictly-worse Small Dam — the
    // step prompt explicitly flags this as a real balance question to
    // watch, not a settled one, so this only checks the one lever this
    // pass deliberately used to answer it (a real Money edge), not that
    // the whole balance question is resolved.
    expect(sandMining.buildCost).toBeLessThan(dam.buildCost);
    expect(sandMining.effects.money).toBeGreaterThan(dam.effects.money);
  });

  it("mangrove and khazan each grant a Food effect, tracked via state.food", () => {
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "estuary" }]);
    state.coin = 500;
    expect(state.food).toBe(0);
    expect(state.build({ q: 0, r: 0 }, "mangrove")).toBe(true);
    // Food (like every effect) scales in with maturity — backdate so it reads at full strength.
    state.elements.get("0,0")!.builtOnTurn = -1000;
    expect(state.food).toBeGreaterThan(0);
  });

  it("all four money-generating elements land on distinct, correctly-ordered values (STEP_PROMPT_economy_food_yacht.md item 1)", () => {
    // Sand Mining > Beachside Resort > Khazan > Mangrove, all strictly
    // positive and all different — the whole point is that none of the
    // four are interchangeable income sources.
    const sandMining = ELEMENT_BY_ID.get("sand_mining")!.effects.money;
    const resort = ELEMENT_BY_ID.get("beachside_resort")!.effects.money;
    const khazan = ELEMENT_BY_ID.get("khazan")!.effects.money;
    const mangrove = ELEMENT_BY_ID.get("mangrove")!.effects.money;

    for (const v of [sandMining, resort, khazan, mangrove]) expect(v).toBeGreaterThan(0);
    expect(sandMining).toBeGreaterThan(resort);
    expect(resort).toBeGreaterThan(khazan);
    expect(khazan).toBeGreaterThan(mangrove);

    const values = [sandMining, resort, khazan, mangrove];
    expect(new Set(values).size, "all four money values should be distinct").toBe(values.length);
  });

  it("Yacht is buildable only on Coast, has zero effects, and contributes nothing to any meter", () => {
    const coastState = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "coast" }]);
    const coastOptions = coastState.buildableAt({ q: 0, r: 0 }).map((d) => d.id);
    expect(coastOptions).toEqual(["yacht"]); // Coast has no other eligible elements today

    for (const terrainId of ["beach", "land", "river", "estuary"]) {
      const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId }]);
      expect(state.buildableAt({ q: 0, r: 0 }).map((d) => d.id), `yacht should not be buildable on ${terrainId}`).not.toContain("yacht");
    }

    const yacht = ELEMENT_BY_ID.get("yacht")!;
    expect(yacht.kind).toBe("cosmetic");
    expect(Object.keys(yacht.effects)).toHaveLength(0);

    // Confirm via meterTotal, not just the empty effects map on paper —
    // every tracked key should read identically with or without a placed Yacht.
    const before = new GameState(
      [
        { coord: { q: 0, r: 0 }, terrainId: "coast" },
        { coord: { q: 1, r: 0 }, terrainId: "land" }
      ],
      [{ q: 0, r: 0 }, { q: 1, r: 0 }]
    );
    before.coin = 2000;
    before.build({ q: 1, r: 0 }, "house"); // something else standing, so the meters aren't trivially zero either way
    const metersBefore = { money: before.meterTotal("money"), food: before.food, biodiversity: before.biodiversity, population: before.population };

    before.build({ q: 0, r: 0 }, "yacht");
    const metersAfter = { money: before.meterTotal("money"), food: before.food, biodiversity: before.biodiversity, population: before.population };

    expect(metersAfter).toEqual(metersBefore);
  });
});
