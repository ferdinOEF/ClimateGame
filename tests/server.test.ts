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
    for (const statement of schemaStatements(readFileSync("db/schema.sql", "utf8"))) expect(statement).toMatch(/^(CREATE (TABLE|INDEX) IF NOT EXISTS |ALTER TABLE \w+ (ADD COLUMN IF NOT EXISTS|DROP COLUMN IF EXISTS) )/);
  });

  it("a feedback table made before Section 38 gets the new columns and loses the old ones (the ALTER statements, idempotent)", async () => {
    // pg-mem cannot CREATE TABLE IF NOT EXISTS over an existing table, so the ALTERs are applied on their own, twice.
    const old = memoryDb();
    await old.query("CREATE TABLE feedback (run_id uuid PRIMARY KEY, s1_before integer, s4_enjoy integer, created_at timestamptz NOT NULL DEFAULT now())");
    const alters = schemaStatements(readFileSync("db/schema.sql", "utf8")).filter((st) => st.startsWith("ALTER TABLE feedback"));
    expect(alters.length).toBeGreaterThan(0);
    for (const statement of [...alters, ...alters]) await old.query(statement);
    await old.query("INSERT INTO feedback (run_id, q1, nudge) VALUES ($1, 4, 'none')", ["77777777-7777-4777-8777-777777777777"]);
    const [row] = await old.query<Record<string, unknown>>("SELECT * FROM feedback");
    expect(row).toMatchObject({ q1: 4, nudge: "none" });
    expect(row).not.toHaveProperty("s1_before");
    expect(row).not.toHaveProperty("s4_enjoy");
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

  it("POST /api/feedback (Section 38.4): a full post, an empty post, a bad value refused, an unknown key ignored, once a run", async () => {
    const reply = await postFeedback(await context(db), {
      runId: RUN_A,
      answers: { q1: 5, q2: 4, q3: 3, q4: 1, remember: "x".repeat(400), age: "18_30", nudge: "shown_answered", cardSeconds: 41.27, name: "Ana", s4_enjoy: 5 }
    });
    expect(reply.body).toEqual({ saved: true });
    const [row] = await db.query<Record<string, unknown>>("SELECT * FROM feedback WHERE run_id = $1", [RUN_A]);
    expect(row).toMatchObject({ q1: 5, q2: 4, q3: 3, q4: 1, age_group: "18_30", nudge: "shown_answered" });
    expect((row.remember as string).length).toBe(140);
    expect(Number(row.card_seconds)).toBeCloseTo(41.3, 1);
    expect(row).not.toHaveProperty("name");
    expect(row).not.toHaveProperty("s4_enjoy");
    expect((await postFeedback(await context(db), { runId: RUN_A, answers: { q1: 1 } })).status).toBe(409);
    // An empty form is a valid post: the count of forms opened is known.
    expect((await postFeedback(await context(db), { runId: RUN_C, answers: {} })).body).toEqual({ saved: true });
    const [empty] = await db.query<Record<string, unknown>>("SELECT * FROM feedback WHERE run_id = $1", [RUN_C]);
    expect(empty).toMatchObject({ q1: null, q2: null, q3: null, q4: null, remember: null, age_group: null, nudge: null, card_seconds: null });
    // A bad value is refused, and nothing is stored.
    for (const answers of [{ q1: 6 }, { q2: 0 }, { q3: 2.5 }, { q4: "4" }, { age: "17 and under" }, { nudge: "maybe" }, { cardSeconds: -1 }, { remember: 7 }]) {
      expect((await postFeedback(await context(db), { runId: RUN_B, answers })).status, JSON.stringify(answers)).toBe(400);
    }
    expect(await db.query("SELECT * FROM feedback WHERE run_id = $1", [RUN_B])).toHaveLength(0);
    // A form for a run the server never counted is refused.
    expect((await postFeedback(await context(db), { runId: "66666666-6666-4666-8666-666666666666", answers: { q1: 3 } })).status).toBe(404);
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

describe("Section 37.3: one row per name, dense ranks", () => {
  const db = memoryDb();
  const RUN_D = "44444444-4444-4444-8444-444444444444";
  const RUN_E = "55555555-5555-4555-8555-555555555555";
  const RUN_F = "77777777-7777-4777-8777-777777777777";
  let low: BuildEntry[];
  let lowPoints: number;
  let highPoints: number;
  beforeAll(async () => {
    await db.apply();
    low = playedRun("far", "server-1").buildLog;
    const score = (list: readonly BuildEntry[]): number => {
      const r = newPanjimRun();
      for (const b of list) {
        const [q, rr] = b.tile.split(",").map(Number);
        r.build({ q, r: rr }, b.element);
      }
      return runPoints(r).total;
    };
    lowPoints = score(low);
    highPoints = score(guided);
  }, SLOW);

  it("a known name's row takes a better run's points and keeps the row when a run does worse; runs keep every run", async () => {
    expect(lowPoints).toBeLessThan(highPoints);
    const first = await postBoard(await context(db), { runId: RUN_D, name: "Mira", builds: low });
    expect(first.status).toBe(200);
    expect(first.body.points).toBe(lowPoints);
    // The same name (another case) with more points: the row now holds the better run.
    const better = await postBoard(await context(db), { runId: RUN_E, name: "mira", builds: guided });
    expect(better.status).toBe(200);
    expect(better.body.points).toBe(highPoints);
    expect(typeof better.body.editToken).toBe("string");
    expect((better.body.editToken as string).length).toBeGreaterThan(16);
    let rows = await db.query<{ name: string; points: number }>("SELECT name, points FROM board");
    expect(rows).toEqual([{ name: "mira", points: highPoints }]);
    // A worse run under the name: the row stands, and this run gets the row's place and no token.
    const worse = await postBoard(await context(db), { runId: RUN_F, name: "MIRA", builds: low });
    expect(worse.status).toBe(200);
    expect(worse.body).toMatchObject({ kept: true, editToken: "", points: highPoints, rank: 1 });
    rows = await db.query<{ name: string; points: number }>("SELECT name, points FROM board");
    expect(rows).toEqual([{ name: "mira", points: highPoints }]);
    expect(await db.query("SELECT id FROM runs WHERE id IN ($1, $2, $3)", [RUN_D, RUN_E, RUN_F])).toHaveLength(3);
    // The run that did not beat its row is still counted once on the board's side: a second post is refused.
    expect((await postBoard(await context(db), { runId: RUN_F, name: "Mira", builds: low })).status).toBe(409);
  }, SLOW);

  it("ranks are dense and a tie shares its rank, in the top 10, a place for N points and the rows round it", async () => {
    const add = (i: number, name: string, points: number) =>
      db.query("INSERT INTO board (id, season, name, points, stars, edit_token, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
        `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        "Festival 2026",
        name,
        points,
        5,
        `token-${i}-abcdefghijklmnop`,
        "2026-11-01T09:00:00Z"
      ]);
    const top = highPoints + 1000;
    await add(1, "Ash", top);
    await add(2, "Bea", top);
    await add(3, "Cal", top - 100);
    // A name on the board twice from before the rule: shown once, its best.
    await add(4, "Dev", top - 200);
    await add(5, "dev", top - 300);
    const board = await getBoard(await context(db), {});
    const rows = board.body.rows as { rank: number; name: string; points: number }[];
    expect(rows.map((r) => [r.rank, r.name])).toEqual([
      [1, "Ash"],
      [1, "Bea"],
      [2, "Cal"],
      [3, "Dev"],
      [4, "mira"]
    ]);
    // "4th on the board, N points behind 3rd": the same ranking.
    const place = await getBoard(await context(db), { points: String(top - 250) });
    expect(place.body.rank).toBe(4);
    expect((place.body.above as { rank: number; name: string }[]).map((r) => [r.rank, r.name])).toEqual([
      [2, "Cal"],
      [3, "Dev"]
    ]);
    expect((place.body.below as { rank: number; name: string }[]).map((r) => [r.rank, r.name])).toEqual([[4, "mira"]]);
    // A tie with a row shares its rank.
    expect((await getBoard(await context(db), { points: String(top - 100) })).body.rank).toBe(2);
  });

  it("Section 37.9: a rename onto a name another run holds is refused, and nothing is deleted or replaced", async () => {
    const before = await db.query<{ id: string; name: string; points: number }>("SELECT id, name, points FROM board ORDER BY id");
    const [{ edit_token: token }] = await db.query<{ edit_token: string }>("SELECT edit_token FROM board WHERE name = 'Cal'");
    // "ASH" is Ash's name (case), and so are fullwidth letters and spaces round it.
    for (const taken of ["ASH", "  ａｓｈ ", "Mira"]) {
      const reply = await patchBoard(await context(db), { editToken: token, name: taken });
      expect(reply, taken).toEqual({ status: 409, body: { error: "name taken" } });
    }
    expect(await db.query("SELECT id, name, points FROM board ORDER BY id")).toEqual(before);
    // A free name goes through, with the row's whole place for the finale (Codex on PR #35).
    const renamed = await patchBoard(await context(db), { editToken: token, name: "Cal  Two" });
    expect(renamed.body).toMatchObject({ renamed: true, name: "Cal Two", rank: 2, points: highPoints + 900 });
    expect(Array.isArray(renamed.body.above) && Array.isArray(renamed.body.below)).toBe(true);
    // Its own name again, in another case, is not "taken".
    expect((await patchBoard(await context(db), { editToken: token, name: "CAL TWO" })).status).toBe(200);
  });

  it("Section 37.9: a second run under a normalised duplicate of a name makes no second row", async () => {
    const RUN_G = "88888888-8888-4888-8888-888888888888";
    // "mira" holds the guided run's points; the same run again under "  ＭＩＲＡ " (fullwidth, spaces) is that name.
    const reply = await postBoard(await context(db), { runId: RUN_G, name: "  ＭＩＲＡ ", builds: guided });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ kept: true, editToken: "" });
    const rows = (await db.query<{ name: string }>("SELECT name FROM board")).filter((r) => r.name.normalize("NFKC").trim().toLowerCase() === "mira");
    expect(rows).toHaveLength(1);
  }, SLOW);
});
