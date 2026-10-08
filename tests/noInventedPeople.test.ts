import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The game once put words in the mouths of invented residents. They are
 * gone, and this keeps them gone: none of their names, the panel that showed
 * them, or its switch may appear anywhere in the game's source or data.
 */
const BANNED: RegExp[] = [
  /\bAnthony\b/i,
  /\bFernandes\b/i,
  /\bSitaram\b/i,
  /\bNeha\b/i,
  /\bPrakash\b/i,
  /\bRosy\b/i,
  /\bFr\. Rodrigues\b/i,
  /\bLeon\b/,
  /Voices of Panjim/i,
  /showVoicesPanel/
];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(full));
    else if (/\.(ts|tsx|js|json|css|html|md)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("no invented people", () => {
  const roots = ["src", "public"].filter((dir) => fs.existsSync(dir));
  const all = roots.flatMap(files).concat(["index.html", "README.md"].filter((f) => fs.existsSync(f)));

  it("scans the game's source and data", () => {
    expect(all.some((file) => file.endsWith("levels.json"))).toBe(true);
    expect(all.some((file) => file.endsWith("maya.json"))).toBe(true);
  });

  it("no banned name or the old panel appears in src/ or data", () => {
    const hits: string[] = [];
    for (const file of all) {
      const text = fs.readFileSync(file, "utf8");
      for (const pattern of BANNED) if (pattern.test(text)) hits.push(`${file}: ${pattern}`);
    }
    expect(hits).toEqual([]);
  });

  it("no character speaks in the third person (\"X says ...\") in the game's text", () => {
    const data = ["src/data/maya.json", "src/data/levels.json", "src/data/nuggets.json", "src/data/tooltips.json", "src/data/fieldGuide.json"].filter((f) => fs.existsSync(f));
    const hits: string[] = [];
    for (const file of data) {
      const text = fs.readFileSync(file, "utf8");
      const match = text.match(/\b[A-Z][a-z]+ (says|said|asks|told)\b/g);
      if (match) hits.push(`${file}: ${match.join(", ")}`);
    }
    expect(hits).toEqual([]);
  });
});
