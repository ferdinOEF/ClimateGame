import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOT_LEVEL, newRun } from "../tools/panjimBots/bots";
import { axialKey } from "../src/core/hex";
import type { ActionRun } from "../src/core/actionRun";

/**
 * Section 28.1 (owner decision): "Try this storm again" takes the run back to the start of that storm's build years
 * (2026, 2031, 2041), exactly as it was then, as many times as the player likes. Played through the game's own run.
 */

/** The year's build: the first that fits on a tile in the next storm's path (so storms leave ruins and records). */
function playYear(run: ActionRun, skip = 0): void {
  const next = run.nextChallenge();
  const path = new Set(next ? run.exposureFor(next, true)?.exposure.keys() ?? [] : []);
  const tiles = [...run.state.placed.values()].filter((t) => run.state.buildableAt(t.coord).length > 0);
  const near = tiles.filter((t) => path.has(axialKey(t.coord)));
  const pool = near.length > skip ? near : tiles;
  const tile = pool[skip % pool.length];
  const def = run.state.buildableAt(tile.coord)[0];
  if (!run.build(tile.coord, def.id).ok) throw new Error(`refused ${def.id}`);
}
function untilLanded(run: ActionRun, id: string, skip = 0): void {
  while (!run.landed.has(id)) playYear(run, skip);
}

describe("try this storm again (Section 28.1)", () => {
  const starts = [2026, 2031, 2041];
  const probe = newRun("s28-probe", BOT_LEVEL);

  it("keeps a snapshot at the start of each storm's phase: 2026, 2031 and 2041", () => {
    const run = newRun("s28-starts", BOT_LEVEL);
    while (!run.finished) playYear(run);
    expect(run.schedule.map((c) => run.config.startYear + run.phaseSnapshots.get(c.id)!.snapshot.turn)).toEqual(starts);
  });

  for (const [i, storm] of probe.schedule.entries()) {
    it(`retries the ${storm.year} storm: back to ${starts[i]}, the state equal to its phase start snapshot`, () => {
      const run = newRun(`s28-retry-${i}`, BOT_LEVEL);
      untilLanded(run, storm.id);
      const before = run.schedule.slice(0, i).map((c) => run.outcomes.get(c.id));
      const saved = run.phaseSnapshots.get(storm.id)!.snapshot;
      expect(run.retry(storm.id)).toBe(true);
      expect(run.snapshot()).toEqual(saved);
      expect(run.year).toBe(starts[i]);
      expect(run.landed.has(storm.id)).toBe(false);
      expect(run.outcomes.has(storm.id)).toBe(false);
      expect(run.stormRecords.has(storm.id)).toBe(false);
      expect(run.finished).toBe(false);
      // The earlier storms' results stay as they went.
      expect(run.schedule.slice(0, i).map((c) => run.outcomes.get(c.id))).toEqual(before);
      // Nothing of this phase's builds is left: every element is the snapshot's.
      expect([...run.state.elements]).toEqual(saved.elements);
    });
  }

  it("retries twice in a row, and a storm played the same way again goes the same way", () => {
    const run = newRun("s28-twice", BOT_LEVEL);
    const flood = run.schedule[1];
    untilLanded(run, flood.id);
    const first = run.outcomes.get(flood.id);
    const saved = run.phaseSnapshots.get(flood.id)!.snapshot;
    run.retry(flood.id);
    expect(run.retry(flood.id)).toBe(true);
    expect(run.snapshot()).toEqual(saved);
    untilLanded(run, flood.id);
    expect(run.outcomes.get(flood.id)).toEqual(first);
    // A different plan, then back again: still the same start.
    run.retry(flood.id);
    untilLanded(run, flood.id, 3);
    run.retry(flood.id);
    expect(run.snapshot()).toEqual(saved);
  });

  it("retrying the 2050 storm keeps the 2030 and 2040 results, ruins and broken defences", () => {
    const run = newRun("s28-2050", BOT_LEVEL);
    let bio2041: number | null = null;
    while (!run.finished) {
      if (run.year === 2041 && bio2041 === null) bio2041 = run.state.biodiversity;
      playYear(run);
    }
    const [c1, c2, c3] = run.schedule;
    const kept = [run.outcomes.get(c1.id), run.outcomes.get(c2.id)];
    const saved = run.phaseSnapshots.get(c3.id)!.snapshot;
    expect(run.retry(c3.id)).toBe(true);
    expect([run.outcomes.get(c1.id), run.outcomes.get(c2.id)]).toEqual(kept);
    expect(run.year).toBe(2041);
    expect(run.snapshot()).toEqual(saved);
    // The ruins from 2030 and 2040 are still ruins.
    const ruins = saved.elements.filter(([, inst]) => inst.elementId === "house" && inst.degradeAmount >= 1).length;
    expect(ruins).toBeGreaterThan(0);
    expect([...run.state.elements.values()].filter((inst) => inst.elementId === "house" && inst.degradeAmount >= 1).length).toBe(ruins);
    expect(run.state.biodiversity).toBe(bio2041);
    // And the run can be played on to 2050 again.
    while (!run.finished) playYear(run);
    expect(run.outcomes.has(c3.id)).toBe(true);
  });

  it("wires the buttons: card 1 of every storm, the Tutorial's Try again, and no new year or finale after a retry", async () => {
    const fs = await import("node:fs");
    const controller = fs.readFileSync("src/app/panjimController.ts", "utf8");
    // Section 34b.12: the button says where it goes ("Try again from 2026").
    // Section 38.1: card 1's main button is the outlook's old label; card 2 is behind its link.
    expect(controller).toContain(`{ body: resultCard(result, points), button: plan.resultButton, alt: retryLabel(this.run.phaseStartYear(challenge)), detail: { link: plan.detailLink, body: defences } }`);
    expect(controller).toMatch(/\(await this\.resultCards\.show\(cards\)\) === "alt"\) this\.retryRequested = challenge\.id/);
    expect(controller).toMatch(/button: "Play Panjim", alt: "Try again", link: "Back to the menu"/);
    expect(controller).toMatch(/this\.tutorialChoice === "alt" \? "again"/);
    // The retry branch returns before the year's events, the clock tick and the finale.
    const endTurn = controller.slice(controller.indexOf("private async endTurn("));
    const retryAt = endTurn.indexOf("if (this.retryRequested) {");
    expect(retryAt).toBeGreaterThan(0);
    expect(endTurn.slice(retryAt, retryAt + 400)).toMatch(/this\.applyRetry\(id\);\s*return;/);
    expect(retryAt).toBeLessThan(endTurn.indexOf("await this.finale()"));
    expect(retryAt).toBeLessThan(endTurn.indexOf("for (const event of later) if (event.type !== \"challenge\")"));
    // Section 38.2: the last card offers Restart (Play again) and Exit, never a retry.
    expect(controller).toContain('if (action === "restart") return "again";');
    expect(readFileSync("src/core/lastCard.ts", "utf8")).toContain('export const FOOTER = { map: "View map", restart: "Restart", exit: "Exit" } as const;');
  });

  it("has nothing to retry for a storm not reached yet", () => {
    const run = newRun("s28-none", BOT_LEVEL);
    expect(run.retry(run.schedule[1].id)).toBe(false);
  });
});

describe("no saved progress (Section 28.2)", () => {
  it("clears every old progress key on load, and keeps the preferences", async () => {
    const { clearOldProgress } = await import("../src/services/storagePolicy");
    const store = new Map<string, string>([
      ["riptide-rising:panjim2050:v3:l01-first-rains", "{}"],
      ["riptide-rising:panjim2050:v2:l01-first-rains", "{}"],
      ["riptide-rising:panjim2050:v1:l01-first-rains:seed", "{}"],
      ["root-and-ruin:progress:v1", "{}"],
      ["riptide-rising:field-guide:v1", "[]"],
      ["riptide-rising:maya-notes:v1", "[]"],
      ["riptide-rising:sound", "0"],
      ["riptide-rising:map-layer:v4", "{}"],
      ["someone-else:key", "x"]
    ]);
    const storage = { get length() { return store.size; }, key: (i: number) => [...store.keys()][i] ?? null, removeItem: (k: string) => void store.delete(k) };
    const removed = clearOldProgress(storage);
    expect(removed).toHaveLength(6);
    expect([...store.keys()].sort()).toEqual(["riptide-rising:map-layer:v4", "riptide-rising:sound", "someone-else:key"]);
    expect(clearOldProgress(null)).toEqual([]);
  });

  it("keeps progress in memory only: after a reload the profile is fresh and nothing was written", async () => {
    const { vi } = await import("vitest");
    const store = new Map<string, string>();
    const local = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; }, clear: () => store.clear() };
    vi.stubGlobal("localStorage", local);
    try {
      vi.resetModules();
      const first = await import("../src/services/profileStore");
      first.recordRunResult({ levelId: "l00-tutorial", score: 300, stars: 3, turns: 3, completed: true }, ["first-steps"]);
      expect(first.getProgress().levels["l00-tutorial"]?.completed).toBe(true);
      // Nothing about progress is on the machine.
      expect([...store.keys()].filter((k) => !k.startsWith("riptide-rising:sound"))).toEqual([]);
      // A reload: the modules load again.
      vi.resetModules();
      const second = await import("../src/services/profileStore");
      const { menuModel } = await import("../src/ui/screens/menuModel");
      const progress = second.getProgress();
      expect(progress.levels).toEqual({});
      expect(progress.achievements).toEqual([]);
      expect(menuModel(progress, false).buttons.map((b) => b.label)).toEqual(["Tutorial", "Play Panjim"]);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it("writes no key the storage policy does not list, and none about a run", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { KEYS_STILL_USED, OLD_PROGRESS_KEYS } = await import("../src/services/storagePolicy");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (full.endsWith(".ts")) files.push(full);
      }
    };
    walk("src");
    const keys = new Set<string>();
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      if (/sessionStorage\.(setItem|getItem)/.test(text)) throw new Error(`${file} uses sessionStorage`);
      for (const m of text.matchAll(/"((?:riptide-rising|root-and-ruin):[a-z0-9:-]+)"/g)) keys.add(m[1]);
    }
    for (const key of keys) {
      const listed = key in KEYS_STILL_USED || OLD_PROGRESS_KEYS.includes(key) || key.startsWith("riptide-rising:panjim2050:") || /map-layer:v[23]$/.test(key) || key === "riptide-rising:show-risk:v1";
      expect(listed, key).toBe(true);
    }
    // No run is saved: the save module and the controller's saving are gone.
    expect(fs.existsSync("src/levels/savedRun.ts")).toBe(false);
    const controller = fs.readFileSync("src/app/panjimController.ts", "utf8");
    expect(controller).not.toMatch(/saveRun|offerSavedRun|Continue from|localStorage\.setItem\(this/);
    expect(fs.readFileSync("src/ui/panjim/fieldGuide.ts", "utf8")).not.toMatch(/localStorage/);
    expect(fs.readFileSync("src/services/profileStore.ts", "utf8")).not.toMatch(/localStorage\.(setItem|getItem)/);
  });
});
