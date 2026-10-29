import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { getBoard, ipHash, LIMITS, patchBoard, postBoard, postFeedback, postRun, type Ctx } from "../server/handlers";
import { schemaStatements, seasonOf } from "../server/db";
import { PANJIM_POINTS_MODEL, newPanjimRun } from "../src/levels/panjimRun";
import { runPoints, type BuildEntry } from "../src/core/resiliencePoints";
import { playedRun } from "../tools/panjimBots/bots";
import { memoryDb } from "./helpers/memoryDb";

/**
 * Section 35.4: every handler against an in memory Postgres (pg-mem) with db/schema.sql: post, rank, rename with a bad
 * token, a second post for the same run, the rate limit, a bad name, an unfinished run, offline; and the server's
 * points equal the client's for the same run, a run with a retry included.
 */
const SLOW = 240_000;
const RUN_A = "11111111-1111-4111-8111-111111111111";
const RUN_B = "22222222-2222-4222-8222-222222222222";
const RUN_C = "33333333-3333-4333-8333-333333333333";

let n = 0;
async function context(sql: ReturnType<typeof memoryDb> | null, ip = `10.0.0.${++n}`): Promise<Ctx> {
  return { sql, env: { BOARD_SEASON: "Festival 2026", RATE_SALT: "salt" }, ip, now: new Date("2026-11-01T10:30:00Z"), model: PANJIM_POINTS_MODEL };
}

/** A finished run's build list (the guided player's), and the same run with the 2030 storm tried again. */
let guided: BuildEntry[];
let retried: { builds: BuildEntry[]; points: number };

beforeAll(() => {
  guided = playedRun("guided", "server-1").buildLog;
  // Played as the browser plays it: the 2030 storm, then "Try again from 2026" with other builds, then the rest.
  const far = playedRun("far", "server-1").buildLog;
  const live = newPanjimRun();
  const play = (list: readonly BuildEntry[]) => {
    for (const b of list) {
      const [q, r] = b.tile.split(",").map(Number);
      expect(live.build({ q, r }, b.element).ok).toBe(true);
    }
  };
  play(guided.slice(0, 5));
  live.retry("c1-cyclone");
  play(far.slice(0, 5));
  play(guided.slice(5));
  retried = { builds: live.buildLog, points: runPoints(live).total };
}, SLOW);

describe("offline", () => {
  it("answers { offline: true } everywhere when no database is configured", async () => {
    const ctx = await context(null);
    for (const reply of [await postRun(ctx, {}), await getBoard(ctx, {}), await postBoard(ctx, {}), await patchBoard(ctx, {}), await postFeedback(ctx, {})]) {
      expect(reply).toEqual({ status: 200, body: { offline: true } });
    }
  });

  it("salts the IP hash even without RATE_SALT", () => {
    const plain = createHash("sha256").update("|203.0.113.9").digest("hex");
    expect(ipHash({ DATABASE_URL: "postgres://x" }, "203.0.113.9")).not.toBe(plain);
    expect(ipHash({ RATE_SALT: "a" }, "203.0.113.9")).not.toBe(ipHash({ RATE_SALT: "b" }, "203.0.113.9"));
  });

  it("names the season Season 1 when BOARD_SEASON is unset", () => {
    expect(seasonOf({})).toBe("Season 1");
    expect(seasonOf({ BOARD_SEASON: "Festival 2026" })).toBe("Festival 2026");
  });
});

describe("the schema", () => {
  it("is idempotent: every statement creates only if missing", () => {
    for (const statement of schemaStatements(readFileSync("db/schema.sql", "utf8"))) expect(statement).toMatch(/^CREATE (TABLE|INDEX) IF NOT EXISTS /);
  });

  it("keeps no name in runs or feedback, and no run id, IP or device on the board", () => {
    const schema = readFileSync("db/schema.sql", "utf8");
    const table = (name: string): string => schema.slice(schema.indexOf(`CREATE TABLE IF NOT EXISTS ${name} (`), schema.indexOf(");", schema.indexOf(`CREATE TABLE IF NOT EXISTS ${name} (`)));
    for (const t of ["runs", "feedback"]) expect(table(t)).not.toMatch(/\bname\b|\bip\b|device/);
    expect(table("board")).not.toMatch(/run_id|\bip\b|device/);
    expect(table("rate_limits")).toMatch(/ip_hash/);
    expect(table("rate_limits")).not.toMatch(/\bip text/);
  });
});

describe("with a database", () => {
  const db = memoryDb();
  beforeAll(async () => {
    await db.apply();
  });

  it("POST /api/run: stores reach and completion from the server's own replay", async () => {
    const partial = await postRun(await context(db), { runId: RUN_C, builds: guided.slice(0, 7), minutes: 3.2, tutorialFirst: false, startedAt: "2026-11-01T10:00:00Z" });
    expect(partial.status).toBe(200);
    const [row] = await db.query<Record<string, unknown>>("SELECT * FROM runs WHERE id = $1", [RUN_C]);
    expect(row.finished).toBe(false);
    expect(row.year_reached).toBe(2033);
    expect(row.stars).toEqual([expect.any(Number)]);
    expect(row.points).toBe(partial.body.points);
    expect(row.tutorial_first).toBe(false);
    expect(row).not.toHaveProperty("name");
    // A list that is not a legal run is refused.
    const bad = await postRun(await context(db), { runId: RUN_C, builds: [{ year: 2027, tile: "0,0", element: "dune" }] });
    expect(bad.status).toBe(400);
    expect((await postRun(await context(db), { runId: "not-a-uuid", builds: [] })).status).toBe(400);
  }, SLOW);

  it("POST /api/board: the server's points, never the client's; refuses a bad name and an unfinished run", async () => {
    const cheat = await postBoard(await context(db), { runId: RUN_A, name: "Ana", builds: guided, points: 999999 });
    expect(cheat.status).toBe(200);
    const expected = runPoints((() => {
      const r = newPanjimRun();
      for (const b of guided) {
        const [q, rr] = b.tile.split(",").map(Number);
        r.build({ q, r: rr }, b.element);
      }
      return r;
    })()).total;
    expect(cheat.body.points).toBe(expected);
    expect(cheat.body.rank).toBe(1);
    expect(typeof cheat.body.editToken).toBe("string");
    const [board] = await db.query<Record<string, unknown>>("SELECT * FROM board");
    expect(board).toMatchObject({ name: "Ana", points: expected, season: "Festival 2026" });
    expect(board).not.toHaveProperty("run_id");

    expect((await postBoard(await context(db), { runId: RUN_B, name: "fuck", builds: guided })).body).toEqual({ error: "name refused" });
    expect((await postBoard(await context(db), { runId: RUN_B, name: "x", builds: guided })).body).toEqual({ error: "bad name" });
    expect((await postBoard(await context(db), { runId: RUN_B, name: "Rui", builds: guided.slice(0, 10) })).body).toEqual({ error: "unfinished" });
  }, SLOW);

  it("refuses a second post for the same run, and changes nothing with it", async () => {
    const before = await db.query("SELECT * FROM runs WHERE id = $1", [RUN_A]);
    const again = await postBoard(await context(db), { runId: RUN_A, name: "Ana again", builds: guided.slice(0, 24).concat([guided[24]]), minutes: 99 });
    expect(again.status).toBe(409);
    expect(await db.query("SELECT * FROM board")).toHaveLength(1);
    expect(await db.query("SELECT * FROM runs WHERE id = $1", [RUN_A])).toEqual(before);
  }, SLOW);

  it("dates a board row to the day only, so its time ties it to no run", async () => {
    const [row] = await db.query<{ created_at: Date }>("SELECT created_at FROM board WHERE name = 'Ana'");
    expect(new Date(row.created_at).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("the server's points equal the client's for a run with a retry", async () => {
    const reply = await postBoard(await context(db), { runId: RUN_B, name: "@rui_goa", builds: retried.builds });
    expect(reply.status).toBe(200);
    expect(reply.body.points).toBe(retried.points);
  }, SLOW);

  it("GET /api/board: the top 10 with the season, and a place for N points with the rows round it", async () => {
    // Fill the board past ten rows.
    for (let i = 0; i < 12; i++) {
      await db.query("INSERT INTO board (id, season, name, points, stars, edit_token, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
        `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        "Festival 2026",
        `Player ${i}`,
        1000 + i * 100,
        5,
        `token-${i}-abcdefghijklmnop`,
        "2026-11-01T09:00:00Z"
      ]);
    }
    const top = await getBoard(await context(db), {});
    const rows = top.body.rows as { rank: number; name: string; points: number; season: string }[];
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.points)).toEqual([...rows.map((r) => r.points)].sort((a, b) => b - a));
    expect(rows[0].rank).toBe(1);
    expect(top.body.season).toBe("Festival 2026");
    const place = await getBoard(await context(db), { points: "1550" });
    expect(place.body.rank).toBe(1 + (await db.query("SELECT * FROM board WHERE points > 1550")).length);
    const above = place.body.above as { points: number; rank: number }[];
    const below = place.body.below as { points: number }[];
    expect(above.map((r) => r.points)).toEqual([1700, 1600]);
    expect(below.map((r) => r.points)).toEqual([1500, 1400]);
    expect(above[1].rank).toBe((place.body.rank as number) - 1);
    expect(typeof place.body.tenth).toBe("number");
    expect((await getBoard(await context(db), { points: "-4" })).status).toBe(400);
  });

  it("PATCH /api/board: renames with its token only, the filter applied", async () => {
    const [{ edit_token: token }] = await db.query<{ edit_token: string }>("SELECT edit_token FROM board WHERE name = 'Ana'");
    expect((await patchBoard(await context(db), { editToken: "wrong-token-0123456789", name: "Ana B" })).status).toBe(404);
    expect((await patchBoard(await context(db), { editToken: token, name: "b1tch" })).body).toEqual({ error: "name refused" });
    const renamed = await patchBoard(await context(db), { editToken: token, name: "Ana B" });
    expect(renamed.body).toMatchObject({ renamed: true, name: "Ana B" });
    expect(await db.query("SELECT * FROM board WHERE name = 'Ana B'")).toHaveLength(1);
  });

  it("POST /api/feedback: only the answered items with allowed values, text cut, once a run", async () => {
    const reply = await postFeedback(await context(db), {
      runId: RUN_A,
      answers: { s1_before: 2, s1_now: 9, s2_feeling: "Hopeful", s2_why: "x".repeat(400), s4_enjoy: 5, s5_actions: ["Join a planting or a cleanup", "Hack"], s7_age: "18 to 30", name: "Ana" }
    });
    expect(reply.body).toEqual({ saved: true });
    const [row] = await db.query<Record<string, unknown>>("SELECT * FROM feedback WHERE run_id = $1", [RUN_A]);
    expect(row).toMatchObject({ s1_before: 2, s1_now: null, s2_feeling: "Hopeful", s4_enjoy: 5, s5_actions: ["Join a planting or a cleanup"], s7_age: "18 to 30", s3_change: null });
    expect((row.s2_why as string).length).toBe(280);
    expect(row).not.toHaveProperty("name");
    expect((await postFeedback(await context(db), { runId: RUN_A, answers: { s4_enjoy: 1 } })).status).toBe(409);
    expect((await postFeedback(await context(db), { runId: RUN_C, answers: {} })).body).toEqual({ saved: false });
    // A form for a run the server never counted is refused.
    expect((await postFeedback(await context(db), { runId: "66666666-6666-4666-8666-666666666666", answers: { s4_enjoy: 3 } })).status).toBe(404);
  });

  it("allows a shared festival IP 120 board posts, renames and forms and 400 run reports an hour", () => {
    expect(LIMITS).toEqual({ board: 120, rename: 120, feedback: 120, run: 400 });
  });

  it("limits each IP: over the limit is 429, the game carries on as offline", async () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < LIMITS.board; i++) expect((await postBoard(await context(db, ip), { runId: RUN_C, name: "!", builds: [] })).status).toBe(400);
    expect((await postBoard(await context(db, ip), { runId: RUN_C, name: "!", builds: [] })).status).toBe(429);
    // Another IP is not held back; the raw IP is never stored.
    expect((await postBoard(await context(db, "203.0.113.10"), { runId: RUN_C, name: "!", builds: [] })).status).toBe(400);
    const stored = JSON.stringify(await db.query("SELECT * FROM rate_limits"));
    expect(stored).not.toContain("203.0.113");
  });
});
