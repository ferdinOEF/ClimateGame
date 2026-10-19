import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * Every string a player can see (Section 17b): the prose in the game's data
 * files and the prose in its source (string and template literals, the text
 * and the visible attributes of HTML templates), read with the TypeScript
 * parser so comments are never counted. Code strings (CSS classes, ids,
 * selectors, URLs, file names, event names) are recognised and skipped.
 */
export interface UiString {
  file: string;
  /** A JSON path, or "line N" in a source file. */
  where: string;
  text: string;
}

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** The data files with player-facing text, and the keys in them that are not (developer notes, ids, citations kept apart). */
const DATA_FILES = ["maya.json", "facts.json", "nuggets.json", "tooltips.json", "fieldGuide.json", "levels.json", "elements.json", "riskIntro.json", "terrain.json"];
const DATA_SKIP_KEYS = new Set([
  "id", "ids", "elements", "colorKey", "url", "mapId", "templateId", "zone", "zones", "icon", "kind", "category",
  "terrainId", "validTerrainIds", "targetsHazards", "_comment", "note", "notes", "failureMode", "comment", "design", "designNote",
  "source", "sources", "citation", "publisher", "doi", "href", "image", "elementId", "hazard", "type"
]);

/** Source folders whose strings can reach the screen. `render/` draws canvases (the storm card) too. */
const SOURCE_DIRS = ["src/ui", "src/app", "src/core", "src/levels", "src/render", "src/services"];

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
}

/** The map files' visible text: the board's name, region and blurb, and its place names (Sources, the labels, the cards). */
function mapStrings(): UiString[] {
  const out: UiString[] = [];
  const dir = path.join(ROOT, "src/data/maps");
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const rel = `src/data/maps/${name}`;
    const map = JSON.parse(readFileSync(path.join(dir, name), "utf8")) as Record<string, unknown>;
    for (const key of ["name", "region", "blurb"]) if (typeof map[key] === "string") out.push({ file: rel, where: `.${key}`, text: map[key] as string });
    for (const list of ["landmarks", "monuments", "localities"]) {
      const items = (map[list] as { name?: string; category?: string }[] | undefined) ?? [];
      items.forEach((item, i) => {
        if (item.name) out.push({ file: rel, where: `.${list}[${i}].name`, text: item.name });
        if (item.category) out.push({ file: rel, where: `.${list}[${i}].category`, text: item.category });
      });
    }
  }
  return out;
}

/** The page's own text (index.html: its title and the boot splash). */
function pageStrings(): UiString[] {
  const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
  return htmlProse(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")).filter((t) => isProse(t)).map((text) => ({ file: "index.html", where: "", text }));
}

function dataStrings(): UiString[] {
  const out: UiString[] = [];
  for (const file of DATA_FILES) {
    const rel = `src/data/${file}`;
    const visit = (value: unknown, where: string, key: string): void => {
      if (DATA_SKIP_KEYS.has(key)) return;
      if (typeof value === "string") out.push({ file: rel, where, text: value });
      else if (Array.isArray(value)) value.forEach((v, i) => visit(v, `${where}[${i}]`, key));
      else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) visit(v, `${where}.${k}`, k);
    };
    visit(JSON.parse(readFileSync(path.join(ROOT, rel), "utf8")), "", "");
  }
  return out;
}

/** Text a player sees inside an HTML template: the text between tags, and the values of the visible attributes. */
function htmlProse(html: string): string[] {
  const parts: string[] = [];
  for (const m of html.matchAll(/(?:aria-label|title|alt|placeholder|data-label|aria-description)="([^"]*)"/g)) parts.push(m[1]);
  const text = html.replace(/<[^>]*>/g, "\n");
  for (const line of text.split("\n")) if (line.trim()) parts.push(line);
  return parts;
}

/** Does this literal read as words for a player (rather than code)? */
export function isProse(text: string): boolean {
  const t = text.trim();
  if (!/[A-Za-z]/.test(t)) return false;
  if (!/\s/.test(t) && /^[a-z0-9_:./\-[\]="X]+$/.test(t)) return false; // an id, key or path ("mangrove-waves", "riptide-rising:panjim2050:v3:X")
  if (/^\d{3} \d+px /.test(t) || /sans-serif|system-ui/.test(t)) return false; // a canvas font
  if (/^[a-z0-9_ -]*(X[a-z0-9_ -]*)*$/.test(t.replace(/X/g, "X")) && !/ (the|a|an|of|to|is|in|and|on|at|for|by|it|or)( |$)/.test(` ${t} `)) return false; // a class list with placeholders
  if (/^(https?:|\.?\/|#|@|data:)/.test(t)) return false;
  if (/^[a-z0-9_.:#[\]=(),>*"'\-/ ]+$/.test(t) && !/ (the|a|an|of|to|is|in|and|on|at|for|by|it|or)( |$)/.test(` ${t} `)) return false; // class lists, selectors, keys
  if (/^[\w-]+$/.test(t) && !/^[A-Z][a-z]/.test(t)) return false; // a single code token ("build-card", "sand_mining")
  if (/[{};]|=>|\$\{/.test(t) && !/[.!?]$/.test(t)) return false; // CSS or code
  if (/var\(--|^--[a-z]/.test(t)) return false; // a CSS custom property
  return true;
}

function sourceStrings(): UiString[] {
  const files: string[] = [];
  for (const dir of SOURCE_DIRS) walk(path.join(ROOT, dir), files);
  const out: UiString[] = [];
  for (const full of files) {
    const rel = path.relative(ROOT, full);
    const text = readFileSync(full, "utf8");
    const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
    const push = (node: ts.Node, value: string): void => {
      // Imports, property names and type positions are code.
      const parent = node.parent;
      if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent) || ts.isExternalModuleReference(parent)) return;
      if ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) return;
      if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return;
      const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      // Markup when it opens with a tag or closes one (a shader's "a < b" is not markup).
      const pieces = /<[a-z][^>]*>/i.test(value) && (/^\s*(X\s*)?</.test(value) || /<\/[a-z]/i.test(value)) ? htmlProse(value) : [value];
      // A separator ("  ·  ", " — ") joins prose even when it is no prose itself: kept whatever it looks like.
      for (const piece of pieces) if (isProse(piece) || /[·•–—]/.test(piece)) out.push({ file: rel, where: `line ${line}`, text: piece });
    };
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) push(node, node.text);
      else if (ts.isTemplateExpression(node)) {
        // The literal text with each substitution as a placeholder word, so "a · ${b}" is still seen.
        const joined = node.head.text + node.templateSpans.map((span) => "X" + span.literal.text).join("");
        push(node, joined);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return out;
}

export function uiStrings(): UiString[] {
  return [...dataStrings(), ...mapStrings(), ...pageStrings(), ...sourceStrings()];
}

/**
 * What part B forbids in a string, if anything. A hyphen counts only in prose (an id such as "mangrove-waves" is
 * code), and never inside a file name or a URL.
 */
export function punctuationProblems(text: string): string[] {
  const problems: string[] = [];
  const words = text.replace(/\S+\.(png|jpe?g|webp|svg|json|md|ts|html)\b/g, "FILE").replace(/https?:\/\/\S+/g, "URL");
  if (text.includes("·")) problems.push("middle dot");
  for (const line of text.split("\n")) if (/\S[ \t]*•/.test(line)) problems.push("inline bullet");
  if (/\s[-–—]\s/.test(text)) problems.push("spaced dash");
  if (/[A-Za-z][–—][A-Za-z]/.test(text)) problems.push("dash between words");
  if (/\d\s*[–—]\s*\d/.test(text) || /\d{4}-\d{4}/.test(text)) problems.push("number range with a dash");
  // A hyphen joining two words (not a minus sign: "-2", not a code token checked by isProse).
  if (isProse(text) && /[A-Za-z]-[A-Za-z]/.test(words)) problems.push("hyphen joining words");
  return problems;
}
