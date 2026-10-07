/**
 * `npm run bots`: plays every persona on every seed and prints the tables
 * that go into docs/PROGRESS.md. The assertions themselves live in
 * tests/panjimBots.test.ts, so a broken balance fails `npm run test`.
 *
 * `npm run bots -- strict` or `npm run bots -- easy-test` picks the balance
 * preset (default: easy-test, the level's own).
 */
import { MONOCULTURES, PERSONAS as MAIN, SEEDS, percentile, runBot, type BotResult } from "./bots";

const preset = process.argv[2] === "strict" ? "strict" : "easy-test";
console.log(`Balance preset: ${preset}`);

const PERSONAS = [...MAIN, ...MONOCULTURES];

const results: BotResult[] = [];
for (const persona of PERSONAS) for (const seed of SEEDS) results.push(runBot(persona, seed, preset));

const minutes = (ms: number): string => (ms / 60000).toFixed(1);
console.log("| Persona | 1★ | 2★ | 3★ | 3★ share | Index p10 / median / p90 | Decisions (median) | FF quarters (median) | Voices (median) |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const persona of PERSONAS) {
  const rows = results.filter((r) => r.persona === persona);
  const stars = rows.flatMap((r) => r.stars);
  const count = (n: number) => stars.filter((s) => s === n).length;
  const index = rows.map((r) => r.index);
  console.log(
    `| ${persona} | ${count(1)} | ${count(2)} | ${count(3)} | ${Math.round((count(3) / stars.length) * 100)}% | ${percentile(index, 10)} / ${percentile(index, 50)} / ${percentile(index, 90)} | ${percentile(rows.map((r) => r.decisions), 50)} | ${percentile(rows.map((r) => r.fastForwardQuarters), 50)} | ${percentile(rows.map((r) => r.voicesAnswered), 50)} |`
  );
}
console.log("");
console.log("| Persona | Est. minutes p10 / median / p90 | 2nd challenge at (median, min) | First action (s) | First reward (s) |");
console.log("|---|---|---|---|---|");
for (const persona of PERSONAS) {
  const rows = results.filter((r) => r.persona === persona);
  const est = rows.map((r) => r.estimatedMs);
  const firstReward = rows.map((r) => r.firstRewardMs).filter((ms) => ms >= 0);
  console.log(
    `| ${persona} | ${minutes(percentile(est, 10))} / ${minutes(percentile(est, 50))} / ${minutes(percentile(est, 90))} | ${minutes(percentile(rows.map((r) => r.checkpoint2Ms), 50))} | ${(percentile(rows.map((r) => r.firstActionMs), 50) / 1000).toFixed(1)} | ${firstReward.length ? (percentile(firstReward, 50) / 1000).toFixed(1) : "never"} |`
  );
}
console.log("");
console.log("Per-challenge star share (1/2/3):");
for (const persona of PERSONAS) {
  const rows = results.filter((r) => r.persona === persona);
  const parts = [0, 1, 2].map((i) => {
    const s = rows.map((r) => r.stars[i]);
    return `${s.filter((x) => x === 1).length}/${s.filter((x) => x === 2).length}/${s.filter((x) => x === 3).length}`;
  });
  console.log(`  ${persona.padEnd(7)} cyclone ${parts[0]}  flood ${parts[1]}  compound ${parts[2]}`);
}

console.log("");
console.log("| Persona | Resilience | Biodiversity | Livelihoods | Population | Food | (medians) |");
console.log("|---|---|---|---|---|---|---|");
for (const persona of PERSONAS) {
  const rows = results.filter((r) => r.persona === persona);
  const med = (key: keyof BotResult["components"]) => percentile(rows.map((r) => r.components[key]), 50);
  console.log(`| ${persona} | ${med("resilience")} | ${med("biodiversity")} | ${med("livelihoods")} | ${med("population")} | ${med("food")} | |`);
}

console.log("");
console.log("Houses saved per storm (median saved / total in path, and the worst seed):");
for (const persona of PERSONAS) {
  const rows = results.filter((r) => r.persona === persona);
  const parts = [0, 1, 2].map((i) => {
    const saved = rows.map((r) => r.houses[i]?.saved ?? 0);
    const total = rows.map((r) => r.houses[i]?.total ?? 0);
    return `${percentile(saved, 50)}/${percentile(total, 50)} (min ${Math.min(...saved)})`;
  });
  console.log(`  ${persona.padEnd(9)} cyclone ${parts[0]}  flood ${parts[1]}  compound ${parts[2]}`);
}
