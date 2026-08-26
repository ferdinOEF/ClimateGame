# Khazan — Step Prompt: Balance Tuning (Simulation-Backed Findings)

**How to use this document:** a scoped addition, not a replacement for `GAUNTLET_PROMPT.md`, `STEP_PROMPT_hazard_science.md`, or `STEP_PROMPT_pacing_telegraph_preview.md` — read those first if you haven't already, especially the pacing/telegraph one, since it's what makes the numbers below actually playable and observable (before that pass landed, a hazard resolved instantly with no spectacle; now there's a countdown and a wave-sweep to actually watch land).

**This was not guesswork.** A standalone simulation harness was built that imports the real, unmodified `GameState`, `resolveMonsoonFlood`, and `resolveCyclone` straight from this repo (only `elements.ts`'s `@data/*` import alias needed rewriting to compile standalone outside the project bundler — no game logic was touched) and mirrors `main.ts`'s actual scheduling/severity formulas exactly. A bot played the real 145-tile map across hundreds of seeded runs per configuration. Every number below reflects what the actual code does, not an estimate. A copy of the harness is included at the bottom of this document (Section 5) — port it into `tools/` rather than re-deriving it from scratch.

Five things to do here, roughly in priority order. Land them as separate commits — they're independent changes, not one feature.

---

## 1. Retune hazard pacing — starting point, not gospel

**The problem, confirmed by simulation:** at the current live numbers (`FLOOD_INTERVAL_TURNS=15`, `CYCLONE_INTERVAL_TURNS=11`, severity `1.0 + rng()*0.6 + severityBaseline`), **100% of simulated runs died at exactly turn 22**, regardless of bot strategy (a "defense-first" bot that prioritized every hazard-facing tile did no better than a "balanced" bot that split effort with economy buildings — they died in lockstep). The reason isn't severity, it's coverage: the map has 52 tiles a Storm Surge can originate from (every Coast + Estuary tile), and at an 11-turn Storm Surge clock, **fewer than 10% of those tiles can possibly be defended before the first hit** — no strategy can out-build an 11-turn clock across 52 tiles. Dying at the same beat every time, no matter what the player builds, reads as arbitrary rather than skill-responsive.

**Empirically-best zone found** (sweeping interval × severity together, 40 seeds each config):

| Configuration | Turns survived (min/median/max) | Notes |
|---|---|---|
| Current (Flood 15 / Storm 11, severity 1.0+) | 22 / 22 / 22 | Identical every run, strategy irrelevant |
| Intervals ×2 (Flood 30 / Storm 22) | 44 / 44 / 44 | Still fully deterministic |
| **Intervals ×3, severity base halved (Flood 45 / Storm 33, severity 0.5+)** | **66 / 99 / 118** | Real spread; defense-first floor (90) clearly beats balanced floor (66) — strategy starts to matter |
| Intervals ×4, severity base halved (Flood 60 / Storm 44) | 88 / 118 / 118 | Over-corrected — 97.5% of runs now end by simply running out of buildable tiles (`build_exhausted`), not dying — almost un-loseable |

**Action:** change `main.ts`'s `FLOOD_INTERVAL_TURNS` to **45**, `CYCLONE_INTERVAL_TURNS` to **33**, and the severity baseline term in `rolledSeverity()` from `1.0` to **`0.5`** (leave the `+ rng()*0.6` spread and `+ state.severityBaseline` permanent-creep term untouched). This is a **starting point for live feel-tuning, not a final answer** — the simulation captures the math (coverage, damage totals, when Resilience hits zero), not how a 90-100 turn run actually *feels* to play with the real telegraph countdown and wave-sweep animation now live. Play it. If it feels too slow to build tension, or too generous, nudge from here — but nudge from this zone, not from the original 15/11, which is simulation-confirmed broken.

Do not touch `RESILIENCE_DAMAGE_FACTOR`, `CATASTROPHIC_TRUST_PENALTY`, `WEATHERED_TRUST_BONUS`, or `severityBaseline`'s `+0.04`-per-hazard creep rate — those weren't implicated by this pass and changing them isn't covered by this simulation's findings.

---

## 2. Build the missing end-of-era score/reset screen

**The gap:** `resilience` only ever decreases (`applyHazardOutcome`) — there is no recovery mechanism short of a full reset. This means **every playthrough, at any tuning, eventually and mathematically ends with Resilience at zero** — confirmed across every configuration tested, including deliberately generous ones. That's consistent with the game's own existing framing (`GameState.isEraOver`'s comment: *"Era soft-ends when Resilience hits zero — no hard game-over, just this"*) — this is meant to read as a roguelike-style "how long can you last," not a permanently-winnable game.

The problem is that nothing in the live game currently *shows* the player this happened. `isEraOver` and `computeEraScore()` (in `scoring.ts`) both already exist and both work correctly — but there is no reference to either anywhere in `main.ts` or the UI layer outside a historical comment. When Resilience hits zero today, **nothing happens**: no banner, no score, no prompt to start again. The only reset is the "Reset Board" button, which lives inside the `?debughazards`-gated Test Hazards panel — invisible to a real player. A beta tester hitting that invisible wall will read the whole game as broken or frozen, no matter how well the numbers underneath are tuned.

**Action — this is likely the single highest-impact "fun" fix on this whole list, and it's close to free since the formula and reset logic already exist:**

- Check `isEraOver` after every hazard resolution (the same place `checkHazardSchedule()` already runs). When it flips true, stop normal play input and show an end-of-era screen.
- The screen should surface, at minimum: turns survived, the `computeEraScore()` result and its components (trust, resilience-at-end, biodiversity/carbon contributions, claimed-tile bonus — whatever `computeEraScore()`'s formula breaks down into), and a clear "Start New Era" action.
- Wire "Start New Era" to whatever the Test Hazards panel's "Reset Board" already does internally (reuse that logic — don't reimplement it) — but make it a normal, always-available player action, not something gated behind a debug flag.
- This does not need to be visually elaborate in this pass — a clean modal/overlay with the numbers above and one button is enough to close the loop. Polish can follow once it exists at all.

---

## 3. Decision point: Coast tiles are permanently undefendable

Coast is a Storm Surge source terrain (18 of the 52 exposed tiles), but the only element valid on Coast terrain is the Yacht — purely cosmetic, zero defensive effect. Every Storm Surge takes full, undefended damage from all 18 Coast tiles, forever, no matter how the player plays. This isn't something this simulation pass should silently decide — it's a design call:

- **Option A — intentional:** the open sea is simply exposed, full stop; leave it as-is, and consider whether the HUD/tutorial should say so explicitly so it doesn't read as a bug to a beta tester who notices Coast tiles never get a defense option.
- **Option B — content gap:** add a genuine Coast-valid defense (a breakwater, jetty, or pier — something plausible seaward of a beach/estuary mouth) to `elements.json` with a real damage-reduction effect, following the existing element-effect conventions (see `Khazan_Hazard_Mechanics_Reference.xlsx` in the project docs for the established per-element mechanics and grounding).

Pick one and note the decision (and reasoning) in `PROGRESS.md`. If Option B, keep it a small, single-element addition in this pass — don't use it as an excuse to rebalance the whole roster.

---

## 4. Decision point: is Coin meant to be a real constraint?

Simulation finding: starting Coin at 10,000 vs. 5,000 vs. 3,000 produced **byte-identical survival outcomes** across every seed tested — turns survived, cause of death, everything. Players finish every run sitting on a large *unspent* surplus (median ~32,500 leftover Coin at the recommended Section 1 configuration — more than they started with). The economy works mechanically (income accrues correctly via `effects.money` → `income` → `advanceTurn()`), but **Coin is never the binding constraint** in the current design — turns (build actions available) run out, or Resilience hits zero, long before money does.

- **Option A — leave it:** Coin stays a light flavor/progress system, not a strategic axis. No changes needed; just don't expect "economy tuning" requests to have any visible effect until this changes.
- **Option B — make it bind:** raise build costs and/or lower starting Coin/income meaningfully enough that a player occasionally has to choose *which* tile to defend now versus later, rather than eventually affording everything. If you go this route, re-run (or ask for a re-run of) the simulation harness below with the new cost numbers before shipping — don't guess at whether the new costs actually bind without checking.

Pick one and note the decision in `PROGRESS.md`, same as Section 3.

---

## 5. Port the simulation harness into `tools/` as a permanent balance-testing script

The harness below (`harness2.ts`) is a working reference implementation — it ran directly against this repo's real `GameState`/`resolveMonsoonFlood`/`resolveCyclone`/`ELEMENT_BY_ID`/`map.json`/`startingState.json`, unmodified, in a sandboxed environment. Port it into this repo at `tools/balance_sim.ts` (or similar) so future balance passes can re-run this kind of sweep in minutes instead of re-deriving it by hand.

**Adapting it for this repo, rather than the sandbox it was built in:**

- The sandbox copy had to rewrite `elements.ts`'s `import elementData from "@data/elements.json"` to a relative path because it was compiled standalone, outside the project's bundler/path-alias resolution. **Inside this repo, that rewrite is unnecessary** — run the script with whatever this project's own toolchain already resolves `@data/*` correctly (its existing `tsx`/`vitest`/`ts-node` setup, same as any other script or test file here). Do not carry the relative-path workaround into the real repo.
- Import `map.json`/`startingState.json` the same way the rest of the codebase does (check `main.ts`'s own import style for these two files and match it) rather than the ad-hoc relative imports shown below.
- Everything else — the bot logic, the `mulberry32` seeded RNG, the run loop, the summary stats — should port with little to no change, since it only depends on `GameState`'s public interface and the two resolver functions.
- Add an npm script (e.g. `npm run balance-sim`) so it's discoverable, and a short `tools/README.md` note (or a section in `PROGRESS.md`) on what it does and how to add new sweeps.
- Consider extending it with a coverage-over-time check and a final-coin-stats check as separate exported helpers (both are already in the reference below as `coverageAtTurn()` and `finalCoinStats()`) — they were what surfaced Findings 2 and 5 above and are worth keeping as reusable diagnostics, not just one-off sweep code.

**Reference implementation** (as it ran in the sandbox — adapt per the notes above, don't paste verbatim):

```typescript
import { GameState, type PlacedTile, type StartingElementSeed } from "./src/core/gameState";
import { ELEMENT_BY_ID } from "./src/core/elements";
import { resolveMonsoonFlood, resolveCyclone } from "./src/core/hazard";

import mapData from "./src/data/map.json";
import startingStateData from "./src/data/startingState.json";

interface MapFile { tiles: { q: number; r: number; terrainId: string }[] }
interface StartingStateFile { startingCoin: number; prebuiltHouses: { q: number; r: number }[] }
const MAP = mapData as MapFile;
const STARTING = startingStateData as StartingStateFile;
const mapTiles: PlacedTile[] = MAP.tiles.map((t) => ({ coord: { q: t.q, r: t.r }, terrainId: t.terrainId }));
const startingElements: StartingElementSeed[] = STARTING.prebuiltHouses.map((c) => ({ coord: c, elementId: "house" }));

function mulberry32(seed: number) {
  let a = seed;
  return function (): number {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STORM_SURGE_COMPOUND_WINDOW_TURNS = 2;

interface RunParams {
  startingCoin: number;
  floodIntervalTurns: number;
  cycloneIntervalTurns: number;
  cycloneTelegraphTurns: number;
  severityBase: number;
  severitySpread: number;
  turnCap: number;
  botStrategy: "balanced" | "defense_first";
  label: string;
}

const TERRAIN_PRIORITY: Record<string, string[]> = {
  beach: ["seawall", "dune", "sandy_vegetation"],
  estuary: ["mangrove", "khazan", "beachside_resort"],
  river: ["small_dam", "sand_mining"],
  land: ["house"],
  coast: ["yacht"]
};
const ESTUARY_ECONOMY_FRACTION = 0.3;
const RIVER_ECONOMY_FRACTION = 0.35;

function pickElementForTerrain(terrainId: string, rng: () => number): string | null {
  if (terrainId === "estuary") return rng() < ESTUARY_ECONOMY_FRACTION ? "beachside_resort" : (rng() < 0.5 ? "mangrove" : "khazan");
  if (terrainId === "river") return rng() < RIVER_ECONOMY_FRACTION ? "sand_mining" : "small_dam";
  if (terrainId === "coast") return "yacht";
  const options = TERRAIN_PRIORITY[terrainId];
  return options ? options[0] : null;
}

function makeBot(state: GameState, rng: () => number, strategy: RunParams["botStrategy"]) {
  const hazardFacing = { beach: true, estuary: true, river: true, land: false, coast: false } as Record<string, boolean>;
  const allTiles = [...state.placed.values()].map((t) => t.coord);
  const shuffle = (arr: { q: number; r: number }[]) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  let tileOrder: { q: number; r: number }[];
  if (strategy === "defense_first") {
    const defenseTiles = allTiles.filter((c) => { const t = state.placed.get(`${c.q},${c.r}`)!; return hazardFacing[t.terrainId]; });
    const restTiles = allTiles.filter((c) => { const t = state.placed.get(`${c.q},${c.r}`)!; return !hazardFacing[t.terrainId]; });
    tileOrder = [...shuffle(defenseTiles), ...shuffle(restTiles)];
  } else {
    tileOrder = shuffle(allTiles);
  }
  let yachtBuilt = false;
  return function chooseNextBuild(): { coord: { q: number; r: number }; elementId: string } | null {
    for (const coord of tileOrder) {
      const key = `${coord.q},${coord.r}`;
      if (state.elements.has(key)) continue;
      const tile = state.placed.get(key);
      if (!tile) continue;
      if (tile.terrainId === "coast") {
        if (yachtBuilt) continue;
        const yachtCost = ELEMENT_BY_ID.get("yacht")!.buildCost;
        if (state.coin < yachtCost * 2) continue;
        yachtBuilt = true;
        return { coord, elementId: "yacht" };
      }
      const elementId = strategy === "defense_first" && tile.terrainId === "beach" ? "seawall" : pickElementForTerrain(tile.terrainId, rng);
      if (!elementId) continue;
      const def = ELEMENT_BY_ID.get(elementId)!;
      if (state.coin < def.buildCost) {
        const options = TERRAIN_PRIORITY[tile.terrainId] ?? [];
        const cheaper = options.find((id) => ELEMENT_BY_ID.get(id)!.buildCost <= state.coin);
        if (!cheaper) continue;
        return { coord, elementId: cheaper };
      }
      return { coord, elementId };
    }
    return null;
  };
}

interface RunResult {
  seed: number; turnsSurvived: number; stopCause: string;
  finalResilience: number; finalCoin: number; eventsCount: number;
  deathBySecondHazard: boolean;
}

function runOne(params: RunParams, seed: number): RunResult {
  const rng = mulberry32(seed);
  const state = new GameState(mapTiles, startingElements, params.startingCoin);
  const chooseNextBuild = makeBot(state, rng, params.botStrategy);
  let nextFloodAtTurn = params.floodIntervalTurns;
  let nextCycloneAtTurn = params.cycloneIntervalTurns;
  let lastStormSurgeResolvedTurn = -Infinity;
  const rolledSeverity = () => params.severityBase + rng() * params.severitySpread + state.severityBaseline;
  let eventsCount = 0;
  let stopCause = "turn_cap";

  while (true) {
    if (state.turn > params.turnCap) { stopCause = "turn_cap"; break; }
    if (state.turn >= nextFloodAtTurn) {
      const severity = rolledSeverity();
      const cycloneTelegraphing = nextCycloneAtTurn - state.turn > 0 && nextCycloneAtTurn - state.turn <= params.cycloneTelegraphTurns;
      const stormSurgeActive = cycloneTelegraphing || state.turn - lastStormSurgeResolvedTurn <= STORM_SURGE_COMPOUND_WINDOW_TURNS;
      resolveMonsoonFlood(state, severity, stormSurgeActive);
      eventsCount++;
      nextFloodAtTurn = state.turn + params.floodIntervalTurns;
    }
    if (state.turn >= nextCycloneAtTurn) {
      const severity = rolledSeverity();
      resolveCyclone(state, severity);
      eventsCount++;
      lastStormSurgeResolvedTurn = state.turn;
      nextCycloneAtTurn = state.turn + params.cycloneIntervalTurns;
    }
    if (state.isEraOver) { stopCause = "resilience_zero"; break; }
    const next = chooseNextBuild();
    if (!next) { stopCause = "build_exhausted"; break; }
    state.build(next.coord, next.elementId);
  }

  return {
    seed, turnsSurvived: state.turn, stopCause,
    finalResilience: Math.round(state.resilience), finalCoin: Math.round(state.coin),
    eventsCount, deathBySecondHazard: stopCause === "resilience_zero" && eventsCount <= 3
  };
}

function summarize(label: string, results: RunResult[]): void {
  const n = results.length;
  const turns = results.map((r) => r.turnsSurvived).sort((a, b) => a - b);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const causeCounts: Record<string, number> = {};
  for (const r of results) causeCounts[r.stopCause] = (causeCounts[r.stopCause] ?? 0) + 1;
  const events = results.map((r) => r.eventsCount);
  console.log(`${label.padEnd(60)} turns[min/median/max]=${turns[0]}/${turns[Math.floor(n / 2)]}/${turns[n - 1]}  mean=${mean(turns).toFixed(0)}  events[mean]=${mean(events).toFixed(1)}  causes=${JSON.stringify(causeCounts)}`);
}

function runBatch(params: RunParams, seeds: number): RunResult[] {
  const out: RunResult[] = [];
  for (let s = 1; s <= seeds; s++) out.push(runOne(params, s));
  return out;
}

// Two reusable diagnostics that surfaced Findings 2 and 5 in
// STEP_PROMPT_balance_tuning_findings.md — worth keeping as helpers,
// not just one-off sweep code:

function coverageAtTurn(strategy: RunParams["botStrategy"], targetTurn: number, seed: number): { built: number; total: number } {
  const rng = mulberry32(seed);
  const state = new GameState(mapTiles, startingElements, STARTING.startingCoin);
  const chooseNextBuild = makeBot(state, rng, strategy);
  const exposed = [...state.placed.values()].filter((t) => t.terrainId === "coast" || t.terrainId === "estuary");
  while (state.turn < targetTurn) {
    const next = chooseNextBuild();
    if (!next) break;
    state.build(next.coord, next.elementId);
  }
  let built = 0;
  for (const t of exposed) if (state.elements.has(`${t.coord.q},${t.coord.r}`)) built++;
  return { built, total: exposed.length };
}

function finalCoinStats(params: RunParams, seeds: number): { min: number; median: number; max: number } {
  const coins: number[] = [];
  for (let s = 1; s <= seeds; s++) coins.push(runOne(params, s).finalCoin);
  coins.sort((a, b) => a - b);
  return { min: coins[0], median: coins[Math.floor(coins.length / 2)], max: coins[coins.length - 1] };
}

// Example sweep — replace with whatever the next balance question is:
const SEEDS = 40;
const base: Omit<RunParams, "label"> = {
  startingCoin: STARTING.startingCoin,
  floodIntervalTurns: 45,
  cycloneIntervalTurns: 33,
  cycloneTelegraphTurns: 1,
  severityBase: 0.5,
  severitySpread: 0.6,
  turnCap: 250,
  botStrategy: "balanced"
};
summarize("balanced, recommended zone", runBatch({ ...base, label: "x" }, SEEDS));
summarize("defense-first, recommended zone", runBatch({ ...base, botStrategy: "defense_first", label: "x" }, SEEDS));
```

---

## Guardrails

- Section 1's numbers are a starting point confirmed by simulation math, not a substitute for actually playing the retuned game — don't ship them unplayed.
- Sections 3 and 4 are decision points, not open-ended invitations to rebalance the whole roster or economy. Pick one option each, note it in `PROGRESS.md`, keep the actual change small and scoped to that decision.
- Don't touch the pacing/telegraph/wave-sweep mechanics from `STEP_PROMPT_pacing_telegraph_preview.md` in this pass — this is numbers and the missing end screen, not animation or trigger-timing logic.
- One concern per commit, per the section breakdown above.

## Verify

- `tsc --noEmit` clean; existing test suite passing at current baseline or better.
- Play a full run start-to-finish at the new Section 1 numbers; confirm it takes noticeably longer than the old ~22-turn death, and that a defense-focused approach visibly outlasts a scattershot one.
- Trigger `isEraOver` (either by playing to Resilience zero, or via the Test Hazards panel) and confirm the new end-of-era screen appears with a real score and a working "Start New Era" action — and that the old Test Hazards "Reset Board" button still works too.
- Confirm whichever Coast/Coin decisions were made are reflected in `PROGRESS.md` with a one-line rationale.
- If `tools/balance_sim.ts` (or equivalent) was added, run it once and confirm it produces output resembling the reference sweep above using this repo's own toolchain (no sandbox workaround needed).
- `PROGRESS.md` gets the usual entry.
