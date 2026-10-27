import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Section 32 (owner decision): a build off the objective's tiles just goes down, with no note beside it. The same
 * `build()` serves Panjim and the Tutorial, so its body is checked once for both; the browser half (a real build off
 * the pulsing tiles in each, and no note on screen) is `tools/section32Shots.ts`.
 */
const NOTE = /outside the area|count for the objective|outsideNote/i;
const controller = fs.readFileSync("src/app/panjimController.ts", "utf8");

/** The body of the controller's `build()`, up to the next method. */
function buildBody(): string {
  const start = controller.indexOf("\n  build(coord: AxialCoord, elementId: string): boolean {");
  expect(start).toBeGreaterThan(0);
  const next = controller.slice(start + 1).search(/\n  (?:private |public |get |async )?[a-zA-Z]+\([^)]*\)[^{\n]*\{\n/);
  return controller.slice(start, start + 1 + next);
}

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

describe("Section 32: no note after a build off the objective's tiles", () => {
  it("build() shows no note beside the tile, in Panjim or the Tutorial", () => {
    const body = buildBody();
    expect(body).toContain("this.run.build(coord, elementId)");
    // Section 34b.4 (owner request): the one note a build may give is for a build of a row's defence in the place the
    // row names that took no home out of the storm's risk; a build off the objective's place still says nothing.
    const notes = body.match(/noteAt\([^;]*;/g) ?? [];
    expect(notes).toEqual(["noteAt(coord, rowMissNote(outcome.rowMiss), 4200);"]);
    expect(body).not.toMatch(/showBanner|NOTE|outside/);
    expect(controller).not.toMatch(NOTE);
  });

  it("no player text anywhere says it (Help, Maya, tooltips, the Tutorial)", () => {
    for (const file of files("src").filter((f) => /\.(ts|json|css|html)$/.test(f))) {
      expect(fs.readFileSync(file, "utf8"), file).not.toMatch(NOTE);
    }
  });

  it("the objective's other signs stay: the pulsing tiles, the checklist and the build menu's line", () => {
    expect(controller).toContain("showObjectiveTiles");
    // Section 34b.4: the line moved to core/prep.ts (buildHoverLine), where it is tested on its own.
    expect(controller).toContain("return buildHoverLine(change);");
    expect(fs.readFileSync("src/core/prep.ts", "utf8")).toContain(`"This doesn't change the next storm"`);
    // The note beside a tile stays for a defence broken or cracked with age (Section 30.11).
    expect(controller).toMatch(/noteAt\(\{ q, r \}, "Broken with age/);
  });
});
