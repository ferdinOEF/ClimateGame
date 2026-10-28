import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundleText, BUNDLE } from "../tools/buildApi";
import { csvField, exportAll, toCsv } from "../tools/exportFeedback";
import { memoryDb } from "./helpers/memoryDb";

/** Section 35.4: the functions' bundle is current, the functions are thin, and the export writes clean CSV. */
describe("the api bundle", () => {
  it("api/_lib/server.mjs is what `npm run build:api` makes from the source now", async () => {
    expect(readFileSync(BUNDLE, "utf8")).toBe(await bundleText());
  }, 60_000);

  it("each function only hands its request to the bundle's handler", () => {
    for (const [file, handler] of [["api/board.js", "boardHandler"], ["api/run.js", "runHandler"], ["api/feedback.js", "feedbackHandler"]]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain(`import { ${handler} } from "./_lib/server.mjs";`);
      expect(source).toContain(`export default ${handler};`);
    }
  });
});

describe("export:feedback", () => {
  it("quotes what needs it and defuses spreadsheet formulas", () => {
    expect(csvField('a "b", c')).toBe('"a ""b"", c"');
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField(["x", "y"])).toBe('"[""x"",""y""]"');
    expect(toCsv([{ a: 1, b: null }], ["a", "b"])).toBe("a,b\n1,\n");
  });

  it("joins feedback to its run by run id, with no name in runs or feedback, and no edit token on the board", async () => {
    const db = memoryDb();
    await db.apply();
    const id = "44444444-4444-4444-8444-444444444444";
    await db.query("INSERT INTO runs (id, finished, points, stars) VALUES ($1, true, 1200, $2)", [id, [3, 2, 1]]);
    await db.query("INSERT INTO feedback (run_id, s4_enjoy) VALUES ($1, 5)", [id]);
    await db.query("INSERT INTO board (id, season, name, points, stars, edit_token) VALUES ($1, 'Festival 2026', 'Ana', 1200, 6, 'secret-token-123456')", ["55555555-5555-4555-8555-555555555555"]);
    const out = await exportAll(db);
    expect(out.feedback.split("\n")[1]).toMatch(new RegExp(`^${id},.*,5,.*,true,.*1200`));
    expect(out.runs.split("\n")[0]).not.toMatch(/name/);
    expect(out.feedback.split("\n")[0]).not.toMatch(/name/);
    expect(out.board).toContain("Festival 2026,Ana,1200,6,");
    expect(out.board).not.toContain("secret-token");
  });
});
