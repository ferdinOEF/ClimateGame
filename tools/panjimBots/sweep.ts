/** Balance sweep: replays every persona at a few challenge intensities. Tuning aid, not part of the build. */
import { PERSONAS, SEEDS, percentile, runBot } from "./bots";
import { BOT_LEVELS } from "./bots";

const climate = BOT_LEVELS.strict.climate!;
const values = process.argv.slice(2).map(Number);
for (const value of values.length ? values : [20, 30, 40, 50]) {
  climate.intensityPerStrength = value;
  const line: string[] = [`unit ${value}:`];
  for (const persona of PERSONAS) {
    const rows = SEEDS.map((seed) => runBot(persona, seed));
    const stars = rows.flatMap((r) => r.stars);
    const three = Math.round((stars.filter((s) => s === 3).length / stars.length) * 100);
    line.push(`${persona} 3★${three}% idx${percentile(rows.map((r) => r.index), 50)} dec${percentile(rows.map((r) => r.decisions), 50)} min${(percentile(rows.map((r) => r.estimatedMs), 50) / 60000).toFixed(1)}`);
  }
  console.log(line.join(" | "));
}
