import { describe, expect, it } from "vitest";
import { bestPerName, denseRank, nameKey, withDenseRanks } from "../src/core/boardRank";

/** Section 37.3: one row per name, its best; dense ranks. */
describe("the board's ranking", () => {
  it("ranks are dense: a tie shares its rank and the next follows (1, 1, 2), never a gap", () => {
    const rows = [{ points: 900 }, { points: 900 }, { points: 600 }, { points: 300 }, { points: 300 }, { points: 100 }];
    expect(withDenseRanks(rows).map((r) => r.rank)).toEqual([1, 1, 2, 3, 3, 4]);
    expect(denseRank(1000, rows)).toBe(1);
    expect(denseRank(900, rows)).toBe(1);
    expect(denseRank(700, rows)).toBe(2);
    expect(denseRank(300, rows)).toBe(3);
    expect(denseRank(0, rows)).toBe(5);
    expect(denseRank(50, [])).toBe(1);
  });

  it("keeps one row per name, its best: case and spacing do not make another name", () => {
    expect(nameKey("  Ana  Maria ")).toBe(nameKey("ana maria"));
    expect(nameKey("ＡＮＡ")).toBe("ana");
    const rows = bestPerName([
      { id: "a", name: "Ana", points: 200, createdAt: 2 },
      { id: "b", name: "ana", points: 500, createdAt: 3 },
      { id: "c", name: "Rui", points: 500, createdAt: 1 },
      { id: "d", name: "RUI", points: 500, createdAt: 4 },
      { id: "e", name: "Zé", points: 100, createdAt: 1 }
    ]);
    expect(rows.map((r) => r.id)).toEqual(["c", "b", "e"]);
    expect(withDenseRanks(rows).map((r) => r.rank)).toEqual([1, 1, 2]);
  });
});
