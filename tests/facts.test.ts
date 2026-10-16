import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { ALL_FACTS, CITED_FACTS, FEATURES_OFF, SHOWN_FACTS, discoveryFacts, discoveryTotal, displayText, firstAuthor, isShown } from "../src/core/facts";
import nuggets from "../src/data/nuggets.json";
import maya from "../src/data/maya.json";

/**
 * The game says only what a source says (docs/FACTS_AUDIT.md). These hold
 * that line: every shown real-world fact is fully cited with an https link,
 * carries no number its source note does not, and every game rule says it
 * is one.
 */
const NUMBER = /\d+(?:[.,]\d+)?/g;

describe("facts.json", () => {
  it("ids are unique", () => {
    const ids = ALL_FACTS.map((fact) => fact.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every shown fact has a complete citation with an https URL", () => {
    for (const fact of SHOWN_FACTS.filter((f) => f.kind === "fact")) {
      const c = fact.citation;
      expect(c, fact.id).toBeDefined();
      for (const field of ["title", "authors", "publisher", "year", "url", "note"] as const) {
        expect(typeof c![field] === "string" && c![field].trim().length > 0, `${fact.id}.${field}`).toBe(true);
      }
      expect(c!.url.startsWith("https://"), `${fact.id} url`).toBe(true);
      if (c!.landingUrl) expect(c!.landingUrl.startsWith("https://"), `${fact.id} landingUrl`).toBe(true);
      expect(/^(\d{4}|n\.d\.)$/.test(c!.year), `${fact.id} year`).toBe(true);
    }
  });

  it("a shown fact has no number its source note does not state", () => {
    for (const fact of CITED_FACTS) {
      const note = fact.citation!.note;
      for (const n of fact.text.match(NUMBER) ?? []) expect(note.includes(n), `${fact.id}: ${n} is not in the source note`).toBe(true);
    }
  });

  it("game rules carry no citation (Maya's bubble labels them \"Game rule\"), and nothing opens with \"In this game\"", () => {
    for (const fact of ALL_FACTS.filter((f) => f.kind === "gameRule")) expect(fact.citation, fact.id).toBeUndefined();
    for (const fact of ALL_FACTS) expect(fact.text, fact.id).not.toMatch(/^In this game/);
  });

  it("every shown fact is short: 20 words at most, as she would say it", () => {
    for (const fact of SHOWN_FACTS) expect(fact.text.split(/\s+/).length, `${fact.id}: ${fact.text}`).toBeLessThanOrEqual(20);
  });

  it("an entry without a source is never shown", () => {
    for (const fact of ALL_FACTS) {
      if (fact.needsSource) expect(isShown(fact), fact.id).toBe(false);
      if (fact.kind === "fact" && !fact.citation) expect(isShown(fact), fact.id).toBe(false);
    }
  });

  it("credits one author by name and several as et al.", () => {
    const cite = (authors: string) => ({ title: "t", authors, publisher: "p", year: "2020", url: "https://x", note: "n" });
    expect(firstAuthor(cite("Lobo, A.S."))).toBe("Lobo");
    expect(firstAuthor(cite("McIvor, A.L., Möller, I., Spencer, T. and Spalding, M."))).toBe("McIvor et al.");
    expect(firstAuthor(cite("Pye, K., Saye, S. and Blott, S."))).toBe("Pye et al.");
    expect(firstAuthor(cite("Jacob, G.J."))).toBe("Jacob");
  });

  it("a reported fact names its reporter in the sentence", () => {
    for (const fact of SHOWN_FACTS.filter((f) => f.reported)) {
      expect(displayText(fact).startsWith(`As reported by ${firstAuthor(fact.citation!)} (${fact.citation!.year}): `)).toBe(true);
    }
  });

  it("no named real-world storm, flood or date in any shown text", () => {
    for (const fact of SHOWN_FACTS) {
      expect(/\b(19|20)\d{2}\b/.test(fact.text), `${fact.id} has a year`).toBe(false);
      expect(/\bCyclone [A-Z][a-z]+/.test(fact.text), `${fact.id} names a cyclone`).toBe(false);
    }
  });
});

describe("Discoveries (Maya says each one)", () => {
  it("list only known facts, shown unless they are about a feature this version has switched off", () => {
    for (const [element, ids] of Object.entries(nuggets as Record<string, string[]>)) {
      let shown = 0;
      for (const id of ids) {
        const fact = ALL_FACTS.find((f) => f.id === id);
        expect(fact, `${element}: ${id}`).toBeDefined();
        // Coins and growth are off (Section 5): their rules are kept but not said.
        const off = fact!.needs?.some((feature) => FEATURES_OFF.has(feature)) ?? false;
        expect(isShown(fact!), `${element}: ${id} is hidden`).toBe(!off);
        if (!off) shown++;
      }
      expect(discoveryFacts(element).length).toBe(shown);
    }
  });

  it("count distinct shown facts for the progress bar", () => {
    const ids = new Set(Object.values(nuggets as Record<string, string[]>).flat().filter((id) => isShown(ALL_FACTS.find((f) => f.id === id)!)));
    expect(discoveryTotal()).toBe(ids.size);
  });

  it("names no coin, price or growing time in anything shown (coins and growth are off)", () => {
    for (const fact of ALL_FACTS.filter(isShown)) expect(fact.text, fact.id).not.toMatch(/\bcoin|cheap|expensive|price|cost|take[s]? (a few|\d+) years|to grow|grows? stronger|matur/i);
  });

  it("every cited fact the game shows is reachable from a build", () => {
    const onCards = new Set(Object.values(nuggets as Record<string, string[]>).flat());
    for (const fact of CITED_FACTS) expect(onCards.has(fact.id), fact.id).toBe(true);
  });
});

describe("Sources screen", () => {
  it("lists every shown cited fact, with its link", () => {
    const source = fs.readFileSync("src/ui/sourcesScreen.ts", "utf8");
    // The screen renders CITED_FACTS in full; this pins that it does so.
    expect(source).toMatch(/for \(const fact of CITED_FACTS\)/);
    expect(source).toMatch(/link\.href = citation\.url/);
    expect(CITED_FACTS.length).toBeGreaterThanOrEqual(5);
    expect(CITED_FACTS.map((f) => f.id)).toEqual(SHOWN_FACTS.filter((f) => f.kind === "fact").map((f) => f.id));
  });
});

describe("Maya", () => {
  // Practical guidance about the screen; everything else she teaches is a game rule.
  const GUIDANCE = new Set(["heat", "get-ready"]);
  it("her tips are game rules (tagged as such in her bubble) or practical guidance", () => {
    for (const tip of maya.tips as { id: string; text: string; rule?: boolean }[]) {
      if (GUIDANCE.has(tip.id)) expect(tip.rule, tip.id).toBeUndefined();
      else expect(tip.rule, tip.id).toBe(true);
      expect(tip.text, tip.id).not.toMatch(/^In this game/);
    }
  });

  it("none of her lines runs over 25 words", () => {
    const lines: string[] = [maya.greeting.text, ...maya.tips.map((t) => t.text), ...Object.values(maya.warning), ...Object.values(maya.aftermath)];
    for (const line of lines) expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(25);
  });

  it("her khazan tip is the game rule, word for word", () => {
    const rule = ALL_FACTS.find((f) => f.id === "khazan-holds-floodwater")!;
    expect(maya.tips.find((t) => t.id === "khazans")!.text).toBe(rule.text);
  });
});
