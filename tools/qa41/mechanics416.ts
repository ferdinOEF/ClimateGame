/**
 * Section 41.6.3: the mechanics, checked against the game's own model (`ActionRun`, `buildableAt`, `computeWater`,
 * `resolveChallenge`, the server's handler in process on an in memory database). Prints one PASS or FAIL line a
 * check, with the numbers, and writes the same to docs/qa/section41-6/mechanics.txt.
 *
 *   npx tsx tools/qa41/mechanics416.ts [plan=docs/qa/section41-6/best_plan.json]
 *
 * Throwaway QA tooling: it changes nothing in the game.
 */
import fs from "node:fs";
import path from "node:path";
import { newPanjimRun, PANJIM_POINTS_MODEL } from "../../src/levels/panjimRun";
import { computeWater, HAZARD_MODEL, LANDFALL_ZONE, isCracked, ageBroken, type WaterField } from "../../src/core/hazardModel";
import { computeCombos } from "../../src/core/combos";
import { shelterOf, type ScheduledChallenge } from "../../src/core/climate";
import { axialDistance, axialKey, neighbor } from "../../src/core/hex";
import { ELEMENT_BY_ID } from "../../src/core/elements";
import type { GameState } from "../../src/core/gameState";
import type { ActionRun } from "../../src/core/actionRun";
import { replayBuilds, runPoints, standingDefences } from "../../src/core/resiliencePoints";
import { playedRun } from "../panjimBots/bots";
import { postBoard, type Ctx } from "../../server/handlers";
import { memoryDb } from "../../tests/helpers/memoryDb";
import { mapById } from "../../src/levels/levelMap";

const args = new Map(process.argv.slice(2).filter((a) => a.includes("=")).map((a) => a.split("=") as [string, string]));
const planFile = path.resolve(args.get("plan") ?? "docs/qa/section41-6/best_plan.json");
const outFile = path.resolve(args.get("out") ?? "docs/qa/section41-6/mechanics.txt");
const lines: string[] = [];
let failures = 0;
const say = (text: string): void => {
  lines.push(text);
  console.log(text);
};
const check = (name: string, ok: boolean, numbers: string): void => {
  if (!ok) failures++;
  say(`${ok ? "PASS" : "FAIL"}  ${name}: ${numbers}`);
};
const coordOf = (key: string): { q: number; r: number } => {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
};
// Objectives on, as the session and the server have them (an objective done is 300 points).
const fresh = (): ActionRun => newPanjimRun();
const MAP = mapById("panaji")!;
const CAMPAL = MAP.localities.find((l) => l.name === "Campal")!;
const nearCampal = (key: string, radius: number): boolean => axialDistance(coordOf(key), CAMPAL) <= radius;

/** The water `challenge` brings on `board`, as the storm itself would work it out (the bots' and the tests' call). */
function water(run: ActionRun, board: GameState, challenge: ScheduledChallenge): WaterField {
  return computeWater(
    board,
    { kind: challenge.kind, strength: challenge.strength, landfall: run.landfallOf(challenge), sheltered: shelterOf(challenge), wind: challenge.wind, turn: challenge.turn - 1 },
    { combos: computeCombos(board).bonus, landfallZoneTiles: run.zones!.keys(LANDFALL_ZONE) }
  );
}
/** `board` with `elementId` built at `key` one year before `challenge` (young: not cracked, no storm survived). */
function withBuild(run: ActionRun, board: GameState, challenge: ScheduledChallenge, builds: [string, string][]): GameState {
  const copy = board.clone();
  copy.turn = challenge.turn - 2;
  for (const [key, elementId] of builds) copy.elements.set(key, { elementId, builtOnTurn: copy.turn, degradeAmount: 0, floodBufferFilled: 0 });
  copy.turn = challenge.turn - 1;
  return copy;
}
const housesLost = (run: ActionRun, board: GameState, field: WaterField): string[] =>
  [...board.elements].filter(([key, inst]) => inst.elementId === "house" && inst.degradeAmount < 1 && !board.isScenery(key) && (field.depth.get(key) ?? 0) + (field.wind.get(key) ?? 0) >= HAZARD_MODEL.houseLossDepthM).map(([key]) => key);

interface PlanRow { action: string; elementId: string; q: number; r: number }
function planActions(): PlanRow[] {
  const file = fs.existsSync(planFile) ? planFile : path.resolve("docs/qa/section41/best_plan.json");
  say(`(plan: ${path.relative(process.cwd(), file)})`);
  return (JSON.parse(fs.readFileSync(file, "utf8")) as { goal1: { actions: PlanRow[] } }).goal1.actions;
}
function playPlan(rows: PlanRow[]): ActionRun {
  const run = fresh();
  for (const row of rows) {
    const coord = { q: row.q, r: row.r };
    const outcome = row.action === "repair" ? run.repair(coord) : run.build(coord, row.elementId);
    if (!outcome.ok) throw new Error(`plan action refused: ${JSON.stringify(row)} ${outcome.reason}`);
  }
  return run;
}

// ---- 1. Placement ------------------------------------------------------------------------------------------------
{
  const run = fresh();
  const s = run.state;
  const tiles = [...s.placed.values()];
  const firstSea = tiles.filter((t) => s.isFirstSea(t.coord)).map((t) => axialKey(t.coord));
  const fits = (id: string): string[] => tiles.filter((t) => s.buildableAt(t.coord).some((d) => d.id === id)).map((t) => axialKey(t.coord));
  const breakwater = fits("breakwater");
  const seawall = fits("seawall");
  const terrain = (key: string): string => s.placed.get(key)!.terrainId;
  const shoreTile = (key: string): boolean => ["beach", "land", "estuary"].includes(terrain(key)) && [0, 1, 2, 3, 4, 5].some((d) => s.placed.get(axialKey(neighbor(coordOf(key), d)))?.terrainId === "coast");
  const deepSea = tiles.filter((t) => t.terrainId === "coast" && !s.isFirstSea(t.coord)).map((t) => axialKey(t.coord));
  const river = tiles.filter((t) => t.terrainId === "river").map((t) => axialKey(t.coord));
  check("1a first sea tiles on Panjim", firstSea.length === 83, `${firstSea.length} (expected 83)`);
  check("1b a breakwater fits only first sea tiles", breakwater.every((k) => s.isFirstSea(coordOf(k))), `${breakwater.length} tiles take one, ${breakwater.filter((k) => !s.isFirstSea(coordOf(k))).length} of them not a first sea tile; ${firstSea.filter((k) => !breakwater.includes(k)).length} first sea tiles take none (occupied or out of play)`);
  const seaSeawall = seawall.filter((k) => terrain(k) === "coast");
  check("1c a seawall fits its shore tiles and the first sea tiles, nowhere else", seawall.every((k) => (terrain(k) === "coast" ? s.isFirstSea(coordOf(k)) : shoreTile(k))), `${seawall.length} tiles: ${seawall.length - seaSeawall.length} shore tiles (${["beach", "land", "estuary"].map((t) => `${t} ${seawall.filter((k) => terrain(k) === t).length}`).join(", ")}) and ${seaSeawall.length} first sea tiles`);
  const deepAny = deepSea.filter((k) => s.buildableAt(coordOf(k)).length > 0);
  check("1d nothing on a sea tile beyond the first", deepAny.length === 0, `${deepSea.length} deeper sea tiles, ${deepAny.length} take any build`);
  const riverWalls = river.filter((k) => s.buildableAt(coordOf(k)).some((d) => d.id === "seawall" || d.id === "breakwater"));
  check("1e no seawall or breakwater on a river tile", riverWalls.length === 0, `${river.length} river tiles, ${riverWalls.length} take a seawall or breakwater`);
  const sand = seawall.find((k) => terrain(k) === "beach" && s.buildableAt(coordOf(k)).some((d) => d.id === "dune"))!;
  const before = s.buildableAt(coordOf(sand)).map((d) => d.id).sort();
  const built = run.build(coordOf(sand), "seawall").ok;
  const after = ["seawall", "dune", "sandy_vegetation"].filter((id) => run.state.canBuild(coordOf(sand), id));
  check("1f one defense per tile (a sand tile)", built && before.includes("dune") && before.includes("sandy_vegetation") && after.length === 0, `${sand} offers ${before.join(", ")}; with a seawall built it offers ${after.length ? after.join(", ") : "nothing"}`);
}

// ---- 2. The 2050 river rule ---------------------------------------------------------------------------------------
{
  const run = fresh();
  const compound = run.schedule.find((c) => c.kind === "compound")!;
  const flood = run.schedule.find((c) => c.kind === "flood")!;
  const tiles = [...run.state.placed.values()].map((t) => axialKey(t.coord)).filter((k) => nearCampal(k, 8) && run.state.canBuild(coordOf(k), "seawall"));
  const baseC = water(run, withBuild(run, run.state, compound, []), compound);
  const baseF = water(run, withBuild(run, run.state, flood, []), flood);
  const effects: { key: string; drop: number; there: number }[] = [];
  let floodChanged = 0;
  for (const key of tiles) {
    const c = water(run, withBuild(run, run.state, compound, [[key, "seawall"]]), compound);
    // Beside it: the tiles within 2 of it. The river's water there, without and with it (metres, summed).
    const ring = [...run.state.placed.keys()].filter((k) => axialDistance(coordOf(k), coordOf(key)) <= 2 && k !== key);
    const sum = (f: WaterField): number => ring.reduce((t, k) => t + (f.flood.get(k) ?? 0), 0);
    effects.push({ key, drop: sum(baseC) - sum(c), there: sum(baseC) });
    const f = water(run, withBuild(run, run.state, flood, [[key, "seawall"]]), flood);
    const same = [...new Set([...f.depth.keys(), ...baseF.depth.keys()])].every((k) => Math.abs((f.depth.get(k) ?? 0) - (baseF.depth.get(k) ?? 0)) < 1e-9);
    if (!same) floodChanged++;
  }
  const lowers = effects.filter((e) => e.drop > 1e-9);
  // Where no river water reaches within 2 tiles there is nothing to lower: reported apart, not a failure of the rule.
  const dry = effects.filter((e) => e.there <= 1e-9);
  const sorted = [...lowers].sort((a, b) => b.drop - a.drop);
  check("2a in the 2050 storm every seawall within 8 of Campal lowers the river's water beside it, where the river reaches", lowers.length + dry.length === effects.length, `${lowers.length} of ${effects.length} tiles (the river's water on the tiles within 2, summed, in metres); largest drop ${sorted[0]?.drop.toFixed(3)} m (${sorted[0]?.key}), smallest drop ${sorted[sorted.length - 1]?.drop.toFixed(3)} m (${sorted[sorted.length - 1]?.key})${dry.length ? `; ${dry.length} stand where no river water reaches within 2 tiles (nothing to lower): ${dry.map((e) => e.key).join(" ")}` : ""}${lowers.length + dry.length < effects.length ? `; NO EFFECT where the river reaches: ${effects.filter((e) => e.drop <= 1e-9 && e.there > 1e-9).map((e) => e.key).join(" ")}` : ""}`);
  check("2b in the 2040 flood a seawall changes nothing", floodChanged === 0, `${floodChanged} of ${tiles.length} tiles change any tile's water`);
}

// ---- 3. Campal -------------------------------------------------------------------------------------------------------
const rows = planActions();
{
  const run = fresh();
  const open = ["6,9", "8,7", "4,11", "3,12"];
  const bad = open.filter((k) => run.state.elements.has(k) || run.state.placed.get(k)?.terrainId !== "land");
  check("3a Campal's four water edge tiles are land and hold no home", bad.length === 0, bad.length ? `wrong: ${bad.join(" ")}` : open.map((k) => `${k} ${run.state.placed.get(k)!.terrainId}, empty`).join("; "));
  const plan = playPlan(rows);
  const compound = plan.schedule.find((c) => c.kind === "compound")!;
  const lostCampal = plan.outcomes.get(compound.id)!.damagedHouses.filter((k) => nearCampal(k, 6));
  check("3b the perfect plan loses no Campal home in 2050 (within 6 of Campal)", lostCampal.length === 0, `${lostCampal.length} lost`);
  const sandWalls: [string, string][] = ["2,13", "1,13", "0,14", "-1,15", "-2,16"].map((k) => [k, "seawall"]);
  const c = run.schedule.find((x) => x.kind === "compound")!;
  const none = housesLost(run, withBuild(run, run.state, c, []), water(run, withBuild(run, run.state, c, []), c)).filter((k) => nearCampal(k, 6)).sort();
  const walled = withBuild(run, run.state, c, sandWalls);
  const five = housesLost(run, walled, water(run, walled, c)).filter((k) => nearCampal(k, 6)).sort();
  check("3c with only the five sand seawalls, Campal's homes are lost as with nothing built", JSON.stringify(none) === JSON.stringify(five), `nothing built: ${none.length} lost; five sand seawalls: ${five.length} lost`);
}

// ---- 4. Wind ---------------------------------------------------------------------------------------------------------
{
  const run = fresh();
  const keep = Math.max(HAZARD_MODEL.wind!.minKeep, 1 - HAZARD_MODEL.wind!.shelter.sandy_vegetation);
  let worst = { key: "", wind: 0, storm: "" };
  for (const c of run.schedule.filter((x) => x.kind !== "flood")) {
    const f = water(run, withBuild(run, run.state, c, []), c);
    for (const [key, inst] of run.state.elements) if (inst.elementId === "house" && !run.state.isScenery(key) && (f.wind.get(key) ?? 0) > worst.wind) worst = { key, wind: f.wind.get(key)!, storm: c.id };
  }
  check("4 no home takes more wind than one pandanus brings under the loss line", worst.wind * keep < HAZARD_MODEL.houseLossDepthM, `worst ${worst.key} in ${worst.storm}: ${worst.wind.toFixed(3)} m, with pandanus x${keep} = ${(worst.wind * keep).toFixed(3)}, loss line ${HAZARD_MODEL.houseLossDepthM}`);
}

// ---- 5. The standing defenses ----------------------------------------------------------------------------------------
{
  const STANDING = ["26,6", "16,15", "7,21"];
  const run = fresh();
  const mature = STANDING.every((k) => run.state.elements.get(k)?.fromStart && run.state.maturityFraction(run.state.elements.get(k)!, ELEMENT_BY_ID.get(run.state.elements.get(k)!.elementId)!) === 1);
  check("5a the three stand, mature, on the first turn", mature, STANDING.map((k) => `${k} ${run.state.elements.get(k)?.elementId} maturity ${run.state.maturityFraction(run.state.elements.get(k)!, ELEMENT_BY_ID.get(run.state.elements.get(k)!.elementId)!)}`).join("; "));
  const parts: string[] = [];
  let back = true;
  for (const c of run.schedule) {
    const path = run.readinessFor(c)!.outcome.housesTotal;
    const without = fresh();
    for (const k of STANDING) without.state.elements.delete(k);
    const pathWithout = without.readinessFor(without.schedule.find((x) => x.id === c.id)!)!.outcome.housesTotal;
    parts.push(`${c.id} path ${path} (${pathWithout} with none standing)`);
    // Where the standing nature answers the storm (the flood and the 2050 storm), its homes are outside the path.
    if (c.kind !== "cyclone" && pathWithout <= path) back = false;
  }
  for (const key of STANDING) {
    const r = fresh();
    const flood = r.schedule[1];
    const path = r.readinessFor(flood)!.outcome.housesTotal;
    const ok = r.demolish(coordOf(key)).ok && r.year === 2027 && r.buildLog.length === 1;
    const after = r.readinessFor(flood)!.outcome.housesTotal;
    parts.push(`remove ${key}: year ${r.year}, 2040 path ${path} -> ${after}`);
    if (!ok || after <= path) back = false;
  }
  check("5b their homes are outside the path; removing one costs a year and puts its homes back", back, parts.join("; "));
  const far = playedRun("far", "qa41");
  const saved = far.schedule.map((c) => far.outcomes.get(c.id)!.housesSaved);
  check("5c homes they alone keep earn nothing (a run that builds away from the storms)", saved.every((n) => n === 0), `homes saved per storm ${saved.join(", ")}; Standing nature rows ${far.schedule.map((c) => far.stormRecords.get(c.id)!.standing?.homes ?? 0).join(", ")}`);
  const plan = playPlan(rows);
  const pts = runPoints(plan);
  const coast = pts.storms.map((s) => s.livingCoast.standing);
  const vet = standingDefences(plan.state).filter((id) => STANDING.some((k) => id.startsWith(`${k}|`) && id.endsWith("|0")));
  const inLog = plan.buildLog.filter((b) => STANDING.includes(b.tile) && b.element !== "demolish").length;
  check("5d no living coast or veteran points; not among the 25 builds", vet.length === 0 && plan.buildLog.length === 25 && inLog === 0 && pts.storms.every((s) => s.standing.every((id) => !STANDING.some((k) => id === `${k}|${plan.state.elements.get(k)?.elementId}|0`))), `living coast counted per storm ${coast.join(", ")} (the player's own); veterans ${pts.end?.veterans.count}; standing among them ${vet.length}; build log ${plan.buildLog.length}`);
}

// ---- 6. Failure rules on the new tiles ---------------------------------------------------------------------------------
{
  const run = fresh();
  const s = run.state;
  const cyclone = run.schedule[0];
  const flood = run.schedule[1];
  const firstSea = [...s.placed.values()].map((t) => axialKey(t.coord)).filter((k) => s.isFirstSea(coordOf(k)) && s.canBuild(coordOf(k), "seawall")).sort((a, b) => axialDistance(coordOf(a), CAMPAL) - axialDistance(coordOf(b), CAMPAL));
  const wallTile = firstSea[0];
  const damTile = [...s.placed.values()].map((t) => axialKey(t.coord)).find((k) => s.canBuild(coordOf(k), "small_dam"))!;
  const khazanTile = [...s.placed.values()].map((t) => axialKey(t.coord)).find((k) => s.canBuild(coordOf(k), "khazan") && nearCampal(k, 12))!;
  const at = (c: ScheduledChallenge, key: string, elementId: string, age: number, storms: number): WaterField => {
    const copy = s.clone();
    copy.turn = c.turn - 1;
    copy.elements.set(key, { elementId, builtOnTurn: copy.turn - age, degradeAmount: 0, floodBufferFilled: 0, stormsSurvived: storms });
    return water(run, copy, c);
  };
  const wall = ELEMENT_BY_ID.get("seawall")!;
  const s1 = at(cyclone, wallTile, "seawall", 2, 0);
  const s2 = at(cyclone, wallTile, "seawall", 2, 1);
  const s3 = at(cyclone, wallTile, "seawall", 10, 0);
  const sf = at(flood, wallTile, "seawall", 2, 1);
  check(`6a seawall (${wallTile}, a first sea tile): comes through its first cyclone, breaks in its second, cracks at 10`, (s1.survived ?? []).includes(wallTile) && s2.failed.includes(wallTile) && s3.failed.includes(wallTile) && !sf.failed.includes(wallTile) && isCracked(wall, { builtOnTurn: 0 }, 10) && !isCracked(wall, { builtOnTurn: 0 }, 9), `first cyclone: ${(s1.survived ?? []).includes(wallTile) ? "came through" : "broke"}; second: ${s2.failed.includes(wallTile) ? "broke" : "stood"}; 10 years old: ${s3.failed.includes(wallTile) ? "broke (cracked)" : "stood"}; a flood after one cyclone: ${sf.failed.includes(wallTile) ? "broke" : "stood (a flood is not its storm)"}`);
  const bw = ELEMENT_BY_ID.get("breakwater")!;
  const b9 = at(cyclone, wallTile, "breakwater", 9, 0);
  const b10 = at(cyclone, wallTile, "breakwater", 10, 0);
  check(`6b breakwater (${wallTile}): breaks at 10 years old`, !(b9.aged ?? []).includes(wallTile) && (b10.aged ?? []).includes(wallTile) && ageBroken(bw, { builtOnTurn: 0 }, 10) && !ageBroken(bw, { builtOnTurn: 0 }, 9), `9 years: ${(b9.aged ?? []).includes(wallTile) ? "broken" : "stands"}; 10 years: ${(b10.aged ?? []).includes(wallTile) ? "broken" : "stands"}`);
  const d1 = at(flood, damTile, "small_dam", 2, 0);
  const d2 = at(flood, damTile, "small_dam", 2, 1);
  const d3 = at(flood, damTile, "small_dam", 10, 0);
  check(`6c small dam (${damTile}): comes through its first flood, breaks in its second, cracks at 10`, (d1.survived ?? []).includes(damTile) && d2.failed.includes(damTile) && d3.failed.includes(damTile), `first flood: ${(d1.survived ?? []).includes(damTile) ? "came through" : "broke"}; second: ${d2.failed.includes(damTile) ? "broke" : "stood"}; 10 years old: ${d3.failed.includes(damTile) ? "broke (cracked)" : "stood"}`);
  const khazans = [...s.elements].filter(([, inst]) => inst.elementId === "khazan").map(([k]) => k).concat(khazanTile);
  const kf = at(flood, khazanTile, "khazan", 20, 3);
  const kc = water(run, (() => { const c = s.clone(); c.turn = run.schedule[2].turn - 1; c.elements.set(khazanTile, { elementId: "khazan", builtOnTurn: 0, degradeAmount: 0, floodBufferFilled: 0 }); return c; })(), run.schedule[2]);
  const worn = khazans.filter((k) => kf.overwhelmed.includes(k) || kf.failed.includes(k) || kc.overwhelmed.includes(k) || kc.failed.includes(k));
  check(`6d khazan never wears (the standing two and one at ${khazanTile}, 20 years old, in the flood and the 2050 storm)`, worn.length === 0, `${worn.length} worn or broken`);
}

// ---- 7. Server and client agree ------------------------------------------------------------------------------------------
{
  const db = memoryDb();
  await db.apply();
  const ctx = (): Ctx => ({ sql: db, env: { BOARD_SEASON: "QA", RATE_SALT: "salt" }, ip: "10.41.6.3", now: new Date("2026-11-11T10:00:00Z"), model: PANJIM_POINTS_MODEL });
  const runs: [string, ActionRun][] = [["perfect plan", playPlan(rows)]];
  const random = playedRun("random", "qa41");
  // The bots' run has no points config; the same build list through the game's own Play Panjim run has.
  const replayOf = (log: ActionRun["buildLog"]): ActionRun => replayBuilds(log, { ...PANJIM_POINTS_MODEL }).run;
  runs.push(["a random run", replayOf(random.buildLog)]);
  const remover = fresh();
  remover.demolish({ q: 26, r: 6 });
  const guided = playedRun("guided", "qa41").buildLog;
  for (const entry of guided.slice(1)) {
    if (remover.finished) break;
    const coord = coordOf(entry.tile);
    const outcome = entry.element === "repair" ? remover.repair(coord) : entry.element === "demolish" ? remover.demolish(coord) : remover.build(coord, entry.element);
    if (outcome.ok) continue;
    const free = [...remover.state.placed.values()].find((t) => remover.state.canBuild(t.coord, "mangrove"))!;
    remover.build(free.coord, "mangrove");
  }
  runs.push(["a run that removes the standing khazan at 26,6", remover]);
  for (const [i, [name, client]] of runs.entries()) {
    const server = replayBuilds(client.buildLog, PANJIM_POINTS_MODEL);
    const reply = await postBoard(ctx(), { runId: `41641641-6416-4164-8164-${String(i).padStart(12, "0")}`, name: `qa41_${i}`, builds: client.buildLog, tag: "FestTesters" });
    const cStars = client.schedule.map((c) => client.outcomes.get(c.id)?.stars);
    const sStars = server.run.schedule.map((c) => server.run.outcomes.get(c.id)?.stars);
    const cHomes = client.schedule.map((c) => `${client.outcomes.get(c.id)?.housesSaved}/${client.outcomes.get(c.id)?.housesTotal}`);
    const sHomes = server.run.schedule.map((c) => `${server.run.outcomes.get(c.id)?.housesSaved}/${server.run.outcomes.get(c.id)?.housesTotal}`);
    const total = runPoints(client).total;
    check(`7 server and client agree: ${name}`, server.error === null && reply.status === 200 && reply.body.points === total && JSON.stringify(cStars) === JSON.stringify(sStars) && JSON.stringify(cHomes) === JSON.stringify(sHomes), `client ${total} points, stars ${cStars.join(",")}, homes ${cHomes.join(" ")}; server ${reply.body.points} points (status ${reply.status}, tagged ${reply.body.tagged === true}), stars ${sStars.join(",")}, homes ${sHomes.join(" ")}`);
  }
  // A build list with a breakwater out at sea: the client refuses the build, the server the list.
  const deep = [...fresh().state.placed.values()].find((t) => t.terrainId === "coast" && !fresh().state.isFirstSea(t.coord))!;
  const client = fresh();
  const refused = client.build(deep.coord, "breakwater");
  const list = [{ year: 2026, tile: axialKey(deep.coord), element: "breakwater" }, ...playPlan(rows).buildLog.slice(1)];
  const reply = await postBoard(ctx(), { runId: "41641641-6416-4164-8164-999999999999", name: "qa41_sea", builds: list, tag: "FestTesters" });
  check("7d a build list with a breakwater out at sea is refused", !refused.ok && reply.status === 400, `client: build refused (${refused.reason ?? "no reason"}); server: ${reply.status} ${JSON.stringify(reply.body)}; replay: ${replayBuilds(list, PANJIM_POINTS_MODEL).error}`);
}

say(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${lines.join("\n")}\n`);
process.exit(failures === 0 ? 0 : 1);
