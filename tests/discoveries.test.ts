import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoveryFacts, discoveryTotal, displayText, firstAuthor, factById } from "../src/core/facts";
import nuggets from "../src/data/nuggets.json";
import { NuggetPopup } from "../src/ui/nuggetPopup";
import { insertLine, type Maya, type MayaLine } from "../src/ui/panjim/maya";
import { MayaDirector } from "../src/app/mayaDirector";

/**
 * Section 1d: one guide. The Discovery card is gone; NuggetPopup still picks
 * the fact, and Maya says it, with its count and Source in her bubble.
 */
function fakeMaya(): { maya: Maya; said: MayaLine[]; calls: string[] } {
  const said: MayaLine[] = [];
  const calls: string[] = [];
  const maya = {
    say: (line: MayaLine) => said.push(line),
    dismiss: () => calls.push("dismiss"),
    next: () => (calls.push("next"), true)
  } as unknown as Maya;
  return { maya, said, calls };
}

const ELEMENTS = Object.keys(nuggets as Record<string, string[]>);
const CAUTION = new Set(["beachside_resort", "sand_mining", "yacht"]);

describe("NuggetPopup hands the fact to Maya", () => {
  it("says one line for each of the ten elements, in the right state, as a line she will say once", () => {
    expect(ELEMENTS).toHaveLength(10);
    for (const element of ELEMENTS) {
      const { maya, said } = fakeMaya();
      new NuggetPopup(maya).show(element);
      expect(said, element).toHaveLength(1);
      const line = said[0];
      const fact = discoveryFacts(element).find((f) => f.id === line.id)!;
      expect(fact, `${element}: ${line.id}`).toBeDefined();
      expect(line.text).toBe(displayText(fact));
      expect(line.state).toBe(CAUTION.has(element) ? "worried" : "tip");
      expect(line.urgent).toBe(false);
      expect(line.rule).toBe(fact.kind === "gameRule");
      // A real-world fact keeps its Source; a rule of this game has none and is labelled as a rule.
      expect(Boolean(line.fact?.credit), line.id).toBe(fact.kind === "fact");
      if (fact.citation) expect(line.fact!.credit).toContain(firstAuthor(fact.citation));
    }
  });

  it("counts a fact when it is said, not when it is queued, and never twice", () => {
    const { maya, said } = fakeMaya();
    const picker = new NuggetPopup(maya);
    picker.show("mangrove");
    expect(said[0].fact!.progress()).toBe(`0 of ${discoveryTotal()}`);
    said[0].onShow!();
    expect(said[0].fact!.progress()).toBe(`1 of ${discoveryTotal()}`);
    said[0].onShow!();
    expect(picker.progress).toBe(`1 of ${discoveryTotal()}`);
    picker.reset();
    expect(picker.progress).toBe(`0 of ${discoveryTotal()}`);
  });

  it("keeps the same pick order: every fact of an element comes once before any repeats", () => {
    const { maya, said } = fakeMaya();
    const picker = new NuggetPopup(maya);
    const count = discoveryFacts("khazan").length;
    for (let i = 0; i < count; i++) picker.show("khazan");
    expect(new Set(said.map((l) => l.id)).size).toBe(count);
  });

  it("says nothing for an element with no facts, and with no Maya (the Tutorial) does nothing at all", () => {
    const { maya, said } = fakeMaya();
    new NuggetPopup(maya).show("house");
    expect(said).toHaveLength(0);
    expect(() => new NuggetPopup(null).show("mangrove")).not.toThrow();
  });

  it("replays a fact at once from the Field Guide, and refuses an id that is not one", () => {
    const { maya, said, calls } = fakeMaya();
    const picker = new NuggetPopup(maya);
    expect(picker.replay("heat")).toBe(false);
    expect(picker.replay("mangrove-grow")).toBe(true);
    expect(said[0]).toMatchObject({ id: "mangrove-grow", force: true, urgent: true });
    expect(calls).toEqual(["dismiss", "next"]);
    expect(factById("mangrove-grow")!.kind).toBe("gameRule");
  });
});

describe("a discovery never jumps ahead of a hazard warning", () => {
  const line = (id: string, extra: Partial<MayaLine> = {}): MayaLine => ({ id, text: id, state: "tip", ...extra });
  const fact = { id: "f", progress: () => "" };

  it("queues warnings first, then discoveries, then ordinary tips", () => {
    const queue: MayaLine[] = [];
    insertLine(queue, line("tip-a"));
    insertLine(queue, line("fact-1", { fact }));
    insertLine(queue, line("warn", { urgent: true, state: "warning" }));
    insertLine(queue, line("fact-2", { fact }));
    insertLine(queue, line("tip-b"));
    expect(queue.map((l) => l.id)).toEqual(["warn", "fact-1", "fact-2", "tip-a", "tip-b"]);
  });

  it("is said in that order by the director, a quarter apart", () => {
    const queue: MayaLine[] = [];
    const order: string[] = [];
    let speaking = false;
    const maya = {
      isMuted: false,
      get speaking() {
        return speaking;
      },
      say: (l: MayaLine) => insertLine(queue, l),
      peek: () => queue[0] ?? null,
      dismiss: () => {
        speaking = false;
      },
      next: () => {
        const l = queue.shift();
        if (!l) return false;
        order.push(l.id);
        return true;
      }
    } as unknown as Maya;
    const run = { quarter: 4 };
    const director = new MayaDirector(maya, { run, blocked: () => false } as never);
    maya.say(line("fact-1", { fact }));
    maya.say(line("warn", { urgent: true, state: "warning" }));
    for (let q = 4; q < 9; q++) {
      run.quarter = q;
      director.pump();
    }
    // The greeting (an ordinary line from the director's constructor) comes last.
    expect(order).toEqual(["warn", "fact-1", "hello"]);
  });
});

describe("the card is gone", () => {
  it("the eyebrow label and the card's classes are gone from the source", () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|css|json|html)$/.test(entry.name)) {
          const text = fs.readFileSync(full, "utf8");
          if (/new\s+discovery/i.test(text) || /nugget-badge|nugget-source|nugget-credit/.test(text)) hits.push(full);
        }
      }
    };
    walk("src");
    expect(hits).toEqual([]);
    expect(fs.readFileSync("index.html", "utf8")).not.toMatch(/new\s+discovery/i);
  });
});
