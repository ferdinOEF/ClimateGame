import { createHash, randomBytes, randomUUID } from "node:crypto";
import { checkName } from "@core/nameFilter";
import { checkAnswers, anyAnswer, type FeedbackAnswers } from "@core/feedbackForm";
import { NATURE_BASED } from "@core/elements";
import { replayBuilds, type BuildEntry, type PointsModel, type Replay } from "@core/resiliencePoints";
import { seasonOf, type ServerEnv, type Sql } from "./db";

/**
 * Section 35.4: the board, runs and feedback, as plain functions of a request (the Vercel adapters are in index.ts).
 *
 * The anti cheat: a client never sends a score. It sends the run's build list (year, tile, element, as played after
 * any retry); the server plays it again through the same hazard model and `pointsForRun` (src/core), and stores the
 * points it gets. A list that is not a legal run is refused.
 *
 * No database configured: every endpoint answers `{ offline: true }` and the game plays the same. A database that
 * fails answers 503 with `{ offline: true }`. Over a limit: 429, and the game carries on as offline.
 */
export interface Ctx {
  sql: Sql | null;
  env: ServerEnv;
  /** The caller's IP (the first x-forwarded-for hop), only ever stored salted and hashed. */
  ip: string;
  now: Date;
  /** The model the builds are replayed with (Play Panjim's). */
  model: PointsModel;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

const ok = (body: Record<string, unknown>): Reply => ({ status: 200, body });
const fail = (status: number, error: string): Reply => ({ status, body: { error } });
const OFFLINE: Reply = { status: 200, body: { offline: true } };

/** Writes allowed per salted IP per hour (Section 35.4.9). */
export const LIMITS = { board: 10, rename: 10, feedback: 20, run: 60 } as const;
export type LimitKind = keyof typeof LIMITS;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** At most this many actions in a build list (25 years; a list is refused past it anyway). */
const MAX_BUILDS = 25;

export function ipHash(env: ServerEnv, ip: string): string {
  return createHash("sha256").update(`${env.RATE_SALT ?? ""}|${ip}`).digest("hex");
}

/** Counts one write of `kind` for this IP in this hour; false when it is over the limit. Rows older than a day go. */
export async function underLimit(ctx: Ctx, kind: LimitKind): Promise<boolean> {
  const sql = ctx.sql!;
  const hour = new Date(Math.floor(ctx.now.getTime() / 3_600_000) * 3_600_000);
  const dayAgo = new Date(ctx.now.getTime() - 86_400_000);
  await sql.query("DELETE FROM rate_limits WHERE window_start < $1", [dayAgo.toISOString()]);
  const rows = await sql.query<{ count: number }>(
    "INSERT INTO rate_limits (ip_hash, kind, window_start, count) VALUES ($1, $2, $3, 1) ON CONFLICT (ip_hash, kind, window_start) DO UPDATE SET count = rate_limits.count + 1 RETURNING count",
    [ipHash(ctx.env, ctx.ip), kind, hour.toISOString()]
  );
  return Number(rows[0]?.count ?? 0) <= LIMITS[kind];
}

/** A build list as sent: an array of { year, tile, element } (nothing else is read). */
export function parseBuilds(raw: unknown): BuildEntry[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_BUILDS) return null;
  const out: BuildEntry[] = [];
  for (const b of raw) {
    if (!b || typeof b !== "object") return null;
    const { year, tile, element } = b as Record<string, unknown>;
    if (typeof year !== "number" || !Number.isInteger(year) || typeof tile !== "string" || tile.length > 12 || typeof element !== "string" || element.length > 40) return null;
    out.push({ year, tile, element });
  }
  return out;
}

/** What the runs table keeps of a replayed run. */
function runFacts(replay: Replay): { finished: boolean; yearReached: number; points: number; stars: number[]; natureShare: number | null; biodiversityEnd: number | null } {
  const { run, points } = replay;
  const stars = run.schedule.map((c) => run.outcomes.get(c.id)?.stars).filter((s): s is 0 | 1 | 2 | 3 => s !== undefined);
  const built = run.buildLog.filter((b) => b.element !== "repair" && b.element !== "demolish");
  const nature = built.filter((b) => (NATURE_BASED as readonly string[]).includes(b.element)).length;
  return {
    finished: run.finished,
    yearReached: run.finished ? run.config.endYear : run.year,
    points: points.total,
    stars,
    natureShare: built.length > 0 ? Math.round((nature / built.length) * 1000) / 1000 : null,
    biodiversityEnd: run.finished ? Math.round(run.state.biodiversity * 10) / 10 : null
  };
}

const isoOrNull = (v: unknown): string | null => {
  if (typeof v !== "string" || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** Inserts or updates the run's row from its replay. A run once finished stays finished; its board flag is the server's. */
async function saveRun(ctx: Ctx, runId: string, builds: BuildEntry[], facts: ReturnType<typeof runFacts>, extra: Record<string, unknown>): Promise<void> {
  const minutes = typeof extra.minutes === "number" && Number.isFinite(extra.minutes) ? Math.max(0, Math.min(600, Math.round(extra.minutes * 10) / 10)) : null;
  await ctx.sql!.query(
    `INSERT INTO runs (id, started_at, ended_at, finished, year_reached, minutes, points, stars, builds, nature_share, biodiversity_end, tutorial_first, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       started_at = COALESCE(runs.started_at, EXCLUDED.started_at),
       ended_at = EXCLUDED.ended_at,
       finished = runs.finished OR EXCLUDED.finished,
       year_reached = GREATEST(runs.year_reached, EXCLUDED.year_reached),
       minutes = EXCLUDED.minutes,
       points = EXCLUDED.points,
       stars = EXCLUDED.stars,
       builds = EXCLUDED.builds,
       nature_share = EXCLUDED.nature_share,
       biodiversity_end = EXCLUDED.biodiversity_end,
       tutorial_first = EXCLUDED.tutorial_first,
       updated_at = EXCLUDED.updated_at`,
    [
      runId,
      isoOrNull(extra.startedAt),
      isoOrNull(extra.endedAt) ?? ctx.now.toISOString(),
      facts.finished,
      facts.yearReached,
      minutes,
      facts.points,
      facts.stars,
      JSON.stringify(builds),
      facts.natureShare,
      facts.biodiversityEnd,
      typeof extra.tutorialFirst === "boolean" ? extra.tutorialFirst : null,
      ctx.now.toISOString()
    ]
  );
}

/** POST /api/run: a run's reach and completion, at the finale or when it stops early (Exit, the idle reset, closing). */
export async function postRun(ctx: Ctx, body: Record<string, unknown>): Promise<Reply> {
  if (!ctx.sql) return OFFLINE;
  const runId = typeof body.runId === "string" && UUID.test(body.runId) ? body.runId.toLowerCase() : null;
  const builds = parseBuilds(body.builds);
  if (!runId || !builds) return fail(400, "bad run");
  if (!(await underLimit(ctx, "run"))) return fail(429, "limit");
  const replay = replayBuilds(builds, ctx.model);
  if (replay.error) return fail(400, "bad builds");
  const facts = runFacts(replay);
  await saveRun(ctx, runId, builds, facts, body);
  return ok({ saved: true, finished: facts.finished, points: facts.points });
}

interface BoardRowOut {
  rank: number;
  name: string;
  points: number;
  stars: number;
  season: string;
}

/** The place `points` gets: one more than the rows with more points (a tie shares the higher place). */
async function rankOf(sql: Sql, points: number): Promise<number> {
  const rows = await sql.query<{ n: number | string }>("SELECT COUNT(*) AS n FROM board WHERE points > $1", [points]);
  return Number(rows[0]?.n ?? 0) + 1;
}

/** The place `points` gets on the board, the rows just above and below it (two each), and the 10th row's points. */
async function around(sql: Sql, points: number, own: string | null): Promise<{ rank: number; above: BoardRowOut[]; below: BoardRowOut[]; tenth: number | null }> {
  const rank = await rankOf(sql, points);
  const aboveRows = await sql.query<{ name: string; points: number; stars: number; season: string }>(
    "SELECT name, points, stars, season FROM board WHERE points > $1 ORDER BY points ASC, created_at DESC LIMIT 2",
    [points]
  );
  const belowRows = await sql.query<{ id: string; name: string; points: number; stars: number; season: string }>(
    "SELECT id, name, points, stars, season FROM board WHERE points <= $1 ORDER BY points DESC, created_at ASC LIMIT 3",
    [points]
  );
  const withRank = async (r: { name: string; points: number; stars: number; season: string }): Promise<BoardRowOut> => ({
    rank: await rankOf(sql, Number(r.points)),
    name: r.name,
    points: Number(r.points),
    stars: Number(r.stars),
    season: r.season
  });
  const above = await Promise.all([...aboveRows].reverse().map(withRank));
  // The run's own row (a named post) is the player's, not a neighbour; a row tied with it stands below it.
  const below = await Promise.all(belowRows.filter((r) => r.id !== own).slice(0, 2).map(async (r) => ({ ...(await withRank(r)), rank: Math.max(rank + 1, await rankOf(sql, Number(r.points))) })));
  const tenth = await sql.query<{ points: number }>("SELECT points FROM board ORDER BY points DESC LIMIT 1 OFFSET 9");
  return { rank, above, below, tenth: tenth.length ? Number(tenth[0].points) : null };
}

/** GET /api/board: the top 10 and the season; with `?points=N`, the place N would get and the rows round it. */
export async function getBoard(ctx: Ctx, query: Record<string, string | undefined>): Promise<Reply> {
  if (!ctx.sql) return OFFLINE;
  const season = seasonOf(ctx.env);
  if (query.points !== undefined) {
    const points = Number(query.points);
    if (!Number.isFinite(points) || points < 0 || points > 1_000_000) return fail(400, "bad points");
    return ok({ ...(await around(ctx.sql, Math.round(points), null)), points: Math.round(points), season });
  }
  const rows = await ctx.sql.query<{ name: string; points: number; stars: number; season: string }>("SELECT name, points, stars, season FROM board ORDER BY points DESC, created_at ASC LIMIT 10");
  const out: BoardRowOut[] = [];
  for (const [i, r] of rows.entries()) {
    const prev = out[i - 1];
    // A tie shares the higher place.
    out.push({ rank: prev && prev.points === Number(r.points) ? prev.rank : i + 1, name: r.name, points: Number(r.points), stars: Number(r.stars), season: r.season });
  }
  return ok({ rows: out, season });
}

/**
 * POST /api/board: `{ runId, name, builds }` for a finished run. The server replays the builds and stores the points it
 * gets, with the season; one row per run at most. Returns the place and the row's edit token (kept by the client in
 * memory for this run only, for a rename from the feedback form).
 */
export async function postBoard(ctx: Ctx, body: Record<string, unknown>): Promise<Reply> {
  if (!ctx.sql) return OFFLINE;
  const runId = typeof body.runId === "string" && UUID.test(body.runId) ? body.runId.toLowerCase() : null;
  const builds = parseBuilds(body.builds);
  if (!runId || !builds) return fail(400, "bad run");
  if (!(await underLimit(ctx, "board"))) return fail(429, "limit");
  const name = checkName(typeof body.name === "string" ? body.name : "");
  if (!name.ok) return fail(400, name.reason === "refused" ? "name refused" : "bad name");
  const replay = replayBuilds(builds, ctx.model);
  if (replay.error) return fail(400, "bad builds");
  const facts = runFacts(replay);
  if (!facts.finished) return fail(400, "unfinished");
  await saveRun(ctx, runId, builds, facts, body);
  // One row per run: the flag is set only once, so a second post finds nothing to set.
  const claimed = await ctx.sql.query("UPDATE runs SET on_board = true WHERE id = $1 AND on_board = false RETURNING id", [runId]);
  if (claimed.length === 0) return fail(409, "already on the board");
  const id = randomUUID();
  const editToken = randomBytes(24).toString("base64url");
  const season = seasonOf(ctx.env);
  const stars = facts.stars.reduce((a, b) => a + b, 0);
  await ctx.sql.query("INSERT INTO board (id, season, name, points, stars, edit_token, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    id,
    season,
    name.name,
    facts.points,
    stars,
    editToken,
    ctx.now.toISOString()
  ]);
  const place = await around(ctx.sql, facts.points, id);
  return ok({ ...place, points: facts.points, editToken, season, name: name.name });
}

/** PATCH /api/board: `{ editToken, name }` renames that row (the filter applied). */
export async function patchBoard(ctx: Ctx, body: Record<string, unknown>): Promise<Reply> {
  if (!ctx.sql) return OFFLINE;
  const token = typeof body.editToken === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(body.editToken) ? body.editToken : null;
  if (!token) return fail(400, "bad token");
  if (!(await underLimit(ctx, "rename"))) return fail(429, "limit");
  const name = checkName(typeof body.name === "string" ? body.name : "");
  if (!name.ok) return fail(400, name.reason === "refused" ? "name refused" : "bad name");
  const rows = await ctx.sql.query<{ points: number }>("UPDATE board SET name = $1 WHERE edit_token = $2 RETURNING points", [name.name, token]);
  if (rows.length === 0) return fail(404, "no such row");
  return ok({ renamed: true, name: name.name, rank: await rankOf(ctx.sql, Number(rows[0].points)) });
}

/** POST /api/feedback: `{ runId, answers }`, only the answered items with allowed values, text cut. One form a run. */
export async function postFeedback(ctx: Ctx, body: Record<string, unknown>): Promise<Reply> {
  if (!ctx.sql) return OFFLINE;
  const runId = typeof body.runId === "string" && UUID.test(body.runId) ? body.runId.toLowerCase() : null;
  if (!runId) return fail(400, "bad run");
  if (!(await underLimit(ctx, "feedback"))) return fail(429, "limit");
  const answers: FeedbackAnswers = checkAnswers(body.answers);
  if (!anyAnswer(answers)) return ok({ saved: false });
  if ((await ctx.sql.query("SELECT run_id FROM feedback WHERE run_id = $1", [runId])).length > 0) return fail(409, "already sent");
  await ctx.sql.query(
    `INSERT INTO feedback (run_id, s1_before, s1_now, s2_feeling, s2_why, s3_change, s4_enjoy, s5_actions, s6_remember, s7_age, s7_status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (run_id) DO NOTHING`,
    [
      runId,
      answers.s1_before ?? null,
      answers.s1_now ?? null,
      answers.s2_feeling ?? null,
      answers.s2_why ?? null,
      answers.s3_change ?? null,
      answers.s4_enjoy ?? null,
      answers.s5_actions ?? null,
      answers.s6_remember ?? null,
      answers.s7_age ?? null,
      answers.s7_status ?? null,
      ctx.now.toISOString()
    ]
  );
  return ok({ saved: true });
}
