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

describe("Section 37.9: a board name's key", () => {
  it("trims, collapses spaces, folds fullwidth letters (NFKC) and ignores case; the name shows as typed", async () => {
    const { boardNameKey, checkName } = await import("../src/core/nameFilter");
    expect(boardNameKey("ＡＮＡ")).toBe("ana");
    expect(boardNameKey("Ana  Maria")).toBe("ana maria");
    expect(boardNameKey("ANA")).toBe(boardNameKey("ana"));
    expect(boardNameKey("Ana ")).toBe("ana");
    expect(boardNameKey("  ａｎａ　 ｍａｒｉａ ")).toBe("ana maria");
    // Shown as typed, after the trim and the collapse.
    expect(checkName("  Ana   Maria ")).toEqual({ ok: true, name: "Ana Maria" });
    expect(checkName("ＡＮＡ")).toEqual({ ok: true, name: "ＡＮＡ" });
    // The filter still reads fullwidth letters as the plain ones.
    expect(checkName("ｆｕｃｋ").ok).toBe(false);
    // Review: the typed form is checked too: stacked accents and a name past 30 letters stay refused.
    expect(checkName("Abe\u0301\u0301\u0301\u0301 Cd").ok).toBe(false);
    expect(checkName("e\u0301".repeat(30)).ok).toBe(true);
    expect(checkName("e\u0301".repeat(31)).ok).toBe(false);
  });
});
