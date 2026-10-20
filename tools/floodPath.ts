/**
 * The flood's source and its forecast track from the east (Section 22.1: unchanged by a map edit?).
 * Usage: npx tsx tools/floodPath.ts   (Markdown to stdout)
 */
import { BOT_LEVEL, newRun } from "./panjimBots/bots";
import { worldToAxial } from "../src/core/hex";

const run = newRun("flood-path", BOT_LEVEL);
for (const index of [1, 2]) {
  const challenge = run.schedule[index];
  const cone = run.forecastCone(challenge)!;
  const track = cone.tracks.find((t) => t.kind === "flood")!;
  const keys = track.points.map((p) => {
    const a = worldToAxial(p.x, p.z, 1);
    return `${a.q},${a.r}`;
  });
  console.log(`**${challenge.year} ${challenge.name}**: source ${BOT_LEVEL.climate!.floodSource!.join(" ")}; the flood's track ${keys.join(" ")}`);
}
