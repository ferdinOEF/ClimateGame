import fs from "node:fs";
import { assess, replay } from "./bestPlan/plan";
const raw = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const acts = (raw.goal1?.actions ?? raw).map((a: any) => ({ type: a.action ?? "build", elementId: a.elementId, q: a.q, r: a.r }));
let before = (() => { const r = replay(acts.slice(0, 15)); return assess(r, r.state); })();
console.log("after 2040, nothing more:", before.storms.map((s) => `${s.stars}★ ${s.saved}/${s.total} bio ${s.bio}`).join(" | "));
for (let i = 15; i < 25; i++) {
  const r = replay(acts.slice(0, i + 1));
  const now = assess(r, r.state);
  console.log(2026 + i, acts[i].elementId, acts[i].q + "," + acts[i].r, `stars ${before.stars}->${now.stars}`, `lost ${before.lost}->${now.lost}`, `endBio ${before.endBio}->${now.endBio}`);
  before = now;
}
