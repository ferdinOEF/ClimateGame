/**
 * Section 7's tuning sweep: every archetype over the bot seeds with some of
 * the game's numbers changed in this process only (never the data on disk),
 * reporting win rates (the level ends on three stars; also every storm at two
 * stars or more), houses saved per storm, and the finale met by a plain plan.
 * A tuning aid, not part of the build.
 *
 * Usage:  npx tsx tools/panjimBots/sweep7.ts defence.metresPerResilience=0.55 houseStars.two=0.55 ...
 *   a key starting "houseStars." or "timeline." sets the level's own numbers;
 *   any other is a path into hazardModel.json. BOT_SEEDS=n uses the first n seeds.
 */
import { computeWater, HAZARD_MODEL, LANDFALL_ZONE, siteAt, waterBoard } from "../../src/core/hazardModel";
import { GameState } from "../../src/core/gameState";
import { resolveChallenge, ZoneIndex } from "../../src/core/zones";
import { mapById } from "../../src/levels/levelMap";
import { boardSetup } from "../../src/levels/balance";
import { BOT_LEVEL, PERSONAS, SEEDS, runBot, savedShare, survived, won } from "./bots";

const overrides = process.argv.slice(2).filter((a) => a.includes("="));
for (const pair of overrides) {
  const [path, raw] = pair.split("=");
  const value = Number(raw);
  const parts = path.split(".");
  const onLevel = parts[0] === "houseStars" || parts[0] === "timeline";
  let target: Record<string, unknown> = onLevel ? (BOT_LEVEL as unknown as Record<string, unknown>) : (HAZARD_MODEL as unknown as Record<string, unknown>);
  for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
  target[parts[parts.length - 1]] = value;
}

/** The finale met by a plain plan of `builds` defences (no simulation): houses lost against none, at three landfalls. */
export function plainFinale(builds: number): { fraction: number; undefended: number; defended: number }[] {
  const map = mapById("panaji")!;
  const fresh = () => {
    const state = new GameState(map.tiles, boardSetup(BOT_LEVEL, map).startingElements, 100000);
    state.growthEnabled = false;
    for (const m of map.monuments) state.reserved.add(`${m.q},${m.r}`);
    return { state, zones: new ZoneIndex(map.zones) };
  };
  const unit = BOT_LEVEL.climate!.intensityPerStrength;
  return [0.3, 0.5, 0.7].map((fraction) => {
    const probe = fresh();
    const site = siteAt(waterBoard(probe.state, probe.zones.keys(LANDFALL_ZONE)), fraction);
    const bare = fresh();
    const undefended = resolveChallenge(bare.state, bare.zones, "compound", 2.6 * unit, unit, undefined, undefined, undefined, undefined, site);
    const plan = fresh();
    const water = computeWater(plan.state, { kind: "compound", strength: 2.6, landfall: site }, { landfallZoneTiles: plan.zones.keys(LANDFALL_ZONE) });
    const homes = undefended.damagedHouses.map((k) => k.split(",").map(Number));
    const distance = (key: string): number => {
      const [q, r] = key.split(",").map(Number);
      return Math.min(...homes.map(([a, b]) => (Math.abs(q - a) + Math.abs(r - b) + Math.abs(q + r - a - b)) / 2));
    };
    let n = 0;
    for (const key of [...water.depth.keys()].sort((a, b) => distance(a) - distance(b) || (a < b ? -1 : 1))) {
      const [q, r] = key.split(",").map(Number);
      for (const id of ["dune", "mangrove", "small_dam", "khazan"]) {
        if (n < builds && plan.state.canBuild({ q, r }, id)) {
          plan.state.build({ q, r }, id, false);
          n++;
          break;
        }
      }
    }
    const defended = resolveChallenge(plan.state, plan.zones, "compound", 2.6 * unit, unit, undefined, undefined, undefined, undefined, site);
    return { fraction, undefended: undefended.housesDamaged, defended: defended.housesDamaged };
  });
}

const seeds = SEEDS.slice(0, Number(process.env.BOT_SEEDS ?? SEEDS.length));
const out: string[] = [overrides.join(" ") || "(as shipped)"];
for (const persona of PERSONAS) {
  const rows = seeds.map((seed) => runBot(persona, seed));
  const wins = rows.filter(won).length;
  const storms = [0, 1, 2].map((i) => Math.round((rows.reduce((s, r) => s + r.houses[i].saved / Math.max(1, r.houses[i].total), 0) / rows.length) * 100));
  const shares = rows.map(savedShare).sort((a, b) => a - b);
  out.push(`  ${persona.padEnd(7)} won ${String(wins).padStart(2)}/${rows.length}  2★ all ${String(rows.filter(survived).length).padStart(2)}  storms ${storms.join("/")}%  all ${Math.round(shares[0] * 100)}-${Math.round(shares[shares.length - 1] * 100)}%`);
}
for (const builds of [10, 20]) {
  const rows = plainFinale(builds);
  out.push(`  plain finale, ${builds} builds: ${rows.map((r) => `${Math.round((1 - r.defended / r.undefended) * 100)}%`).join(" ")} fewer houses lost`);
}
console.log(out.join("\n"));
