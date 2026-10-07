import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { ELEMENT_BY_ID } from "../src/core/elements";
import { axialKey } from "../src/core/hex";
import { LEVEL_BY_ID, levelWithPreset } from "../src/levels/levels";
import { boardSetup } from "../src/levels/balance";
import { mapById } from "../src/levels/levelMap";

const strict = levelWithPreset("l01-first-rains", "strict")!;
const easy = levelWithPreset("l01-first-rains", "easy-test")!;
const map = mapById("panaji")!;

function panajiBoard(level = easy): GameState {
  const setup = boardSetup(level, map);
  const state = new GameState(map.tiles, setup.startingElements, level.startingCoin);
  for (const m of map.monuments) state.reserved.add(`${m.q},${m.r}`);
  for (const [id, scale] of setup.effectScale) state.effectScale.set(id, scale);
  for (const id of setup.excluded) state.excludedElements.add(id);
  for (const key of setup.unbuildable) state.unbuildable.add(key);
  return state;
}

describe("balance presets", () => {
  it("makes easy-test the default for this build, with strict one value away", () => {
    expect(LEVEL_BY_ID.get("l01-first-rains")!.balancePreset).toBe("easy-test");
    expect(Object.keys(LEVEL_BY_ID.get("l01-first-rains")!.balancePresets!)).toEqual(["easy-test", "strict"]);
  });

  it("scales the three storms 0.5 / 0.6 / 1.0 on easy-test and leaves them at 1 on strict", () => {
    expect(easy.climate!.challenges.map((c) => c.severityScale)).toEqual([0.5, 0.6, 1]);
    expect(strict.climate!.challenges.map((c) => c.severityScale ?? 1)).toEqual([1, 1, 1]);
  });

  it("multiplies every Coin source by 10 and no build cost", () => {
    expect(easy.startingCoin).toBe(strict.startingCoin * 10);
    expect(easy.timeline!.economy!.incomeScale).toBeCloseTo(strict.timeline!.economy!.incomeScale * 10);
    expect(easy.timeline!.economy!.jarStart).toBe(strict.timeline!.economy!.jarStart * 10);
    easy.voices!.forEach((voice, i) => expect(voice.reward).toBe(strict.voices![i].reward * 10));
    expect(ELEMENT_BY_ID.get("dune")!.buildCost).toBe(15);
    expect(ELEMENT_BY_ID.get("seawall")!.buildCost).toBe(90);
  });

  it("puts the house-star thresholds in the preset: 90% for three stars, 60% for two", () => {
    expect(easy.houseStars).toEqual({ three: 0.9, two: 0.6 });
    expect(strict.houseStars).toEqual({ three: 0.9, two: 0.6 });
  });
});

describe("houses on every land tile", () => {
  const state = panajiBoard();
  const monuments = new Set(map.monuments.map((m) => `${m.q},${m.r}`));

  it("pre-builds a House on every land tile except the monuments", () => {
    let land = 0;
    for (const tile of map.tiles) {
      if (tile.terrainId !== "land") continue;
      const key = axialKey(tile.coord);
      if (monuments.has(key)) {
        expect(state.elements.has(key), key).toBe(false);
        continue;
      }
      land++;
      expect(state.elements.get(key)?.elementId, key).toBe("house");
    }
    expect(land).toBeGreaterThan(600);
  });

  it("never offers House: not on land, not anywhere", () => {
    const tile = map.tiles.find((t) => t.terrainId === "land" && !monuments.has(axialKey(t.coord)))!;
    state.elements.delete(axialKey(tile.coord)); // a demolished house leaves bare land
    expect(state.buildableAt(tile.coord).map((d) => d.id)).not.toContain("house");
  });

  it("keeps the houses' total economy near what ten houses gave", () => {
    const ten = 10 * ELEMENT_BY_ID.get("house")!.effects.money;
    expect(state.income).toBeGreaterThan(ten * 0.8);
    expect(state.income).toBeLessThan(ten * 1.25);
    expect(state.population).toBeLessThanOrEqual(120);
  });
});

describe("building on every other terrain", () => {
  const state = panajiBoard();

  it("offers at least two meaningful choices on beach, estuary, river and near-shore coast", () => {
    for (const terrainId of ["beach", "estuary", "river", "coast"]) {
      const tile = map.tiles.find((t) => t.terrainId === terrainId && state.buildableAt(t.coord).length > 0)!;
      const meaningful = state.buildableAt(tile.coord).filter((d) => d.kind !== "cosmetic");
      expect(meaningful.length, terrainId).toBeGreaterThanOrEqual(2);
    }
  });

  it("allows Coast building only within four tiles of shore", () => {
    const setup = boardSetup(easy, map);
    const coast = map.tiles.filter((t) => t.terrainId === "coast");
    const far = coast.filter((t) => setup.unbuildable.has(axialKey(t.coord)));
    const near = coast.filter((t) => !setup.unbuildable.has(axialKey(t.coord)));
    expect(far.length).toBeGreaterThan(0);
    expect(near.length).toBeGreaterThan(0);
    for (const t of far.slice(0, 20)) expect(state.buildableAt(t.coord)).toEqual([]);
    expect(state.buildableAt(near[0].coord).map((d) => d.id)).toContain("breakwater");
  });
});
