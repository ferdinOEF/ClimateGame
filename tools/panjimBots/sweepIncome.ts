/** Balance sweep over the jar's income scale. Tuning aid, not part of the build. */
import { PERSONAS, SEEDS, percentile, runBot } from "./bots";
import { BOT_LEVELS } from "./bots";

const timeline = BOT_LEVELS.strict.timeline!;
for (const value of process.argv.slice(2).map(Number)) {
  timeline.economy!.incomeScale = value;
  const line: string[] = [`income ${value}:`];
  for (const persona of PERSONAS) {
    const rows = SEEDS.map((seed) => runBot(persona, seed));
    const stars = rows.flatMap((r) => r.stars);
    const three = Math.round((stars.filter((s) => s === 3).length / stars.length) * 100);
    line.push(`${persona} 3★${three}% idx${percentile(rows.map((r) => r.index), 50)} dec${percentile(rows.map((r) => r.decisions), 50)} min${(percentile(rows.map((r) => r.estimatedMs), 50) / 60000).toFixed(1)}`);
  }
  console.log(line.join(" | "));
}
