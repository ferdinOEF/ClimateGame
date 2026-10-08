/**
 * The finale's defence experiment: the same "Cyclone and flood" on the same
 * board, with no defences, with a mangrove belt only, with khazans only, and
 * with both, every defence fully grown. Reports homes hit for each and the
 * reduction against none, per preset, averaged over the bot seeds.
 *
 * The brief's target: belt + khazans together cut homes hit by about 40%
 * against none, and neither alone is enough.
 *
 * Usage: npx tsx tools/panjimBots/finaleDefences.ts [mangroves] [khazans]
 */
import { resolveChallenge } from "../../src/core/zones";
import { axialKey } from "../../src/core/hex";
import type { GameState } from "../../src/core/gameState";
import { BOT_LEVELS, SEEDS, newRun, type Preset } from "./bots";

const MANGROVES = Number(process.argv[2] ?? 6);
const KHAZANS = Number(process.argv[3] ?? 4);

/**
 * Places `count` fully grown `elementId`s on buildable tiles of the given
 * zones: "packed" fills the first zone first, "spread" takes one from each
 * zone in turn.
 */
function plant(state: GameState, zoneLists: string[][], elementId: string, count: number, layout: "packed" | "spread"): number {
  const lists = zoneLists.map((keys) =>
    keys.filter((key) => {
      const [q, r] = key.split(",").map(Number);
      return state.buildableAt({ q, r }).some((d) => d.id === elementId);
    })
  );
  const order = layout === "packed" ? lists.flat() : [];
  if (layout === "spread") for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) order.push(l[i]);
  let placed = 0;
  for (const key of order) {
    if (placed >= count) break;
    const [q, r] = key.split(",").map(Number);
    state.elements.set(axialKey({ q, r }), { elementId, builtOnTurn: state.turn - 400, degradeAmount: 0, floodBufferFilled: 0 });
    placed++;
  }
  return placed;
}

export function finaleExperiment(preset: Preset, seed: string, mangroves = MANGROVES, khazans = KHAZANS, layout: "packed" | "spread" = "spread"): Record<string, number> {
  const run = newRun(seed, BOT_LEVELS[preset]);
  const finale = run.schedule[run.schedule.length - 1];
  while (run.quartersUntil(finale) > 4 && !run.finished) run.fastForwardYear();
  const base = run.state.clone();
  base.turn = finale.quarter;
  const zones = run.zones!;
  // The belt along the waterfront and the creek, where the surge and the river meet; khazans in the wetlands upstream.
  const beltTiles = [zones.keys("z4"), zones.keys("z3"), zones.keys("z2")];
  const khazanTiles = [zones.keys("z2"), zones.keys("z3"), zones.keys("z4")];
  const result: Record<string, number> = {};
  for (const config of ["none", "belt", "khazans", "both"]) {
    const state = base.clone();
    if (config === "belt" || config === "both") plant(state, beltTiles, "mangrove", mangroves, layout);
    if (config === "khazans" || config === "both") plant(state, khazanTiles, "khazan", khazans, layout);
    const outcome = resolveChallenge(state, zones, finale.kind, run.intensityOf(finale), run.climate!.intensityPerStrength, run.combos, run.houseStars, run.houseRule);
    result[config] = outcome.housesDamaged;
  }
  return result;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  for (const [preset, layout] of [["easy-test", "spread"], ["easy-test", "packed"], ["strict", "spread"], ["strict", "packed"]] as [Preset, "packed" | "spread"][]) {
    const totals: Record<string, number> = { none: 0, belt: 0, khazans: 0, both: 0 };
    for (const seed of SEEDS) {
      const r = finaleExperiment(preset, seed, MANGROVES, KHAZANS, layout);
      for (const k of Object.keys(totals)) totals[k] += r[k];
    }
    const avg = (k: string): number => totals[k] / SEEDS.length;
    const cut = (k: string): string => (avg("none") > 0 ? `${Math.round((1 - avg(k) / avg("none")) * 100)}%` : "–");
    console.log(`${preset}, ${layout} (mangroves ${MANGROVES}, khazans ${KHAZANS}): homes hit, mean of ${SEEDS.length} seeds`);
    console.log(`  none ${avg("none").toFixed(1)} | belt ${avg("belt").toFixed(1)} (${cut("belt")}) | khazans ${avg("khazans").toFixed(1)} (${cut("khazans")}) | both ${avg("both").toFixed(1)} (${cut("both")})`);
  }
}
