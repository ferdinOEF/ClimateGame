import { createHash, randomBytes, randomUUID } from "node:crypto";
import { checkName } from "@core/nameFilter";
import { checkAnswers } from "@core/feedbackForm";
import { NATURE_BASED } from "@core/elements";
import { replayBuilds, type BuildEntry, type PointsModel, type Replay } from "@core/resiliencePoints";
import { bestPerName, denseRank, nameKey } from "@core/boardRank";
import { seasonOf, tagOf, type ServerEnv, type Sql } from "./db";

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

/** Writes allowed per salted IP per hour (Section 35.8: festival laptops share one IP, so the limits are generous). */
export const LIMITS = { board: 120, rename: 120, feedback: 120, run: 400 } as const;
export type LimitKind = keyof typeof LIMITS;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** At most this many actions in a build list (25 years; a list is refused past it anyway). */
const MAX_BUILDS = 25;

/**
 * The salted hash an IP is kept as. Without RATE_SALT the salt is derived from the database's own address (secret
 * too), so a hash is never a plain SHA-256 of an IP that could be reversed by trying every address.
 */
export function ipHash(env: ServerEnv, ip: string): string {
  const salt = env.RATE_SALT?.trim() || createHash("sha256").update(`riptide|${env.DATABASE_URL ?? env.POSTGRES_URL ?? ""}`).digest("hex");
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex");
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
    `INSERT INTO runs (id, started_at, ended_at, finished, year_reached, minutes, points, stars, builds, nature_share, biodiversity_end, tutorial_first, updated_at, tag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (id) DO UPDATE SET
       tag = COALESCE(runs.tag, EXCLUDED.tag),
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
      ctx.now.toISOString(),
      tagOf(extra, ctx.env)
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

interface BoardRow {
  id: string;
  name: string;
  points: number;
  stars: number;
  season: string;
  createdAt: number;
}

/**
 * Section 37.3: the board as players see it, one row per name (the name's best run), by points, most first. Read in
 * full and kept to one a name here, so a name posted twice before this rule (or by two posts at once) still shows once.
 * Section 38.4b: untagged rows only; a tagged row (a test session) is never shown or counted in a rank.
 */
async function boardRows(sql: Sql): Promise<BoardRow[]> {
  const rows = await sql.query<{ id: string; name: string; points: number; stars: number; season: string; created_at: Date | string }>(
    "SELECT id, name, points, stars, season, created_at FROM board WHERE tag IS NULL ORDER BY points DESC, created_at ASC"
  );
  return bestPerName(rows.map((r) => ({ id: r.id, name: r.name, points: Number(r.points), stars: Number(r.stars), season: r.season, createdAt: new Date(r.created_at).getTime() })));
}

const out = (rows: readonly BoardRow[], r: BoardRow): BoardRowOut => ({ rank: denseRank(r.points, rows), name: r.name, points: r.points, stars: r.stars, season: r.season });

/**
 * The place `points` gets on the board (dense: a tie shares the place), the rows just above and below it (two each),
 * and the 10th row's points. `own`: the run's own row, which is the player's, not a neighbour.
 */
async function around(sql: Sql, points: number, own: string | null): Promise<{ rank: number; above: BoardRowOut[]; below: BoardRowOut[]; tenth: number | null }> {
  const rows = await boardRows(sql);
  const rank = denseRank(points, rows);
  const above = rows.filter((r) => r.points > points).slice(-2).map((r) => out(rows, r));
  const below = rows.filter((r) => r.points <= points && r.id !== own).slice(0, 2).map((r) => out(rows, r));
  const tenth = rows.length >= 10 ? rows[9].points : null;
  return { rank, above, below, tenth };
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
  const rows = await boardRows(ctx.sql);
  return ok({ rows: rows.slice(0, 10).map((r) => out(rows, r)), season });
}

/**
 * Section 37.3: one row a name. After a write, the other rows under the same name go, the best kept (most points,
 * then the earliest). Returns the kept row.
 */
async function oneRowFor(sql: Sql, name: string): Promise<BoardRow | null> {
  const same = await rowsNamed(sql, name);
  const [best] = bestPerName(same);
  for (const r of same) if (best && r.id !== best.id) await sql.query("DELETE FROM board WHERE id = $1", [r.id]);
  return best ?? null;
}

/**
 * Section 37.9: every row under `name`'s board key (trimmed, spaces collapsed, NFKC, case ignored: `boardNameKey`).
 * Matched here rather than in SQL, whose lower() knows nothing of fullwidth letters or double spaces. Section 38.4b:
 * untagged rows only, so a tester never blocks a real player's name and a real player is never shadowed by a tester.
 */
async function rowsNamed(sql: Sql, name: string): Promise<BoardRow[]> {
  const rows = await sql.query<{ id: string; name: string; points: number; stars: number; season: string; created_at: Date | string }>("SELECT id, name, points, stars, season, created_at FROM board WHERE tag IS NULL");
  const key = nameKey(name);
  return rows.map((r) => ({ id: r.id, name: r.name, points: Number(r.points), stars: Number(r.stars), season: r.season, createdAt: new Date(r.created_at).getTime() })).filter((r) => nameKey(r.name) === key);
}

/**
 * POST /api/board: `{ runId, name, builds }` for a finished run. The server replays the builds and stores the points it
 * gets, with the season; one post per run at most. Section 37.3: one row per name, its best run: a name already on
 * the board keeps its row unless this run has more points (then the row takes this run's points, stars and date).
 * Returns the place and the row's edit token (kept by the client in memory for this run only; the rename endpoint
 * stays, unused since Section 38.2); a run that did not beat its name's row gets the row's place and no token
 * (`kept: true`). Section 38.4b: a tagged post (a test session) is stored with its tag and answers `tagged: true`,
 * no rank.
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
  // One post per run: the flag is set only once, so a second post finds nothing to set. Claimed before the run's row
  // is written, so a refused second post changes nothing.
  await ctx.sql.query("INSERT INTO runs (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [runId]);
  const claimed = await ctx.sql.query("UPDATE runs SET on_board = true WHERE id = $1 AND on_board = false RETURNING id", [runId]);
  if (claimed.length === 0) return fail(409, "already on the board");
  await saveRun(ctx, runId, builds, facts, body);
  const season = seasonOf(ctx.env);
  const stars = facts.stars.reduce((a, b) => a + b, 0);
  const tag = tagOf(body, ctx.env);
  if (tag) {
    // Section 38.4b: a test session's row is stored with its tag, outside the one row per name rule, and gets no rank.
    const day = `${ctx.now.toISOString().slice(0, 10)}T00:00:00.000Z`;
    await ctx.sql.query("INSERT INTO board (id, season, name, points, stars, edit_token, created_at, tag) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [randomUUID(), season, name.name, facts.points, stars, randomBytes(24).toString("base64url"), day, tag]);
    return ok({ tagged: true, points: facts.points, editToken: "", season, name: name.name });
  }
  const known = await oneRowFor(ctx.sql, name.name);
  if (known && known.points >= facts.points) {
    // The name's row stands: this run did not beat it.
    const place = await around(ctx.sql, known.points, known.id);
    return ok({ ...place, points: known.points, editToken: "", season, name: known.name, kept: true });
  }
  const editToken = randomBytes(24).toString("base64url");
  // The row's date only (the day, not the time), so its time can never tie it to a run's or a form's.
  const day = `${ctx.now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  let id: string;
  if (known) {
    id = known.id;
    // Only over fewer points: two posts under one name at once never leave the lower score on the row.
    const updated = await ctx.sql.query<{ points: number }>(
      "UPDATE board SET season = $1, name = $2, points = $3, stars = $4, edit_token = $5, created_at = $6 WHERE id = $7 AND points < $3 RETURNING points",
      [season, name.name, facts.points, stars, editToken, day, id]
    );
    if (updated.length === 0) {
      const kept = (await oneRowFor(ctx.sql, name.name)) ?? known;
      return ok({ ...(await around(ctx.sql, kept.points, kept.id)), points: kept.points, editToken: "", season, name: kept.name, kept: true });
    }
  } else {
    id = randomUUID();
    await ctx.sql.query("INSERT INTO board (id, season, name, points, stars, edit_token, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [id, season, name.name, facts.points, stars, editToken, day]);
  }
  const place = await around(ctx.sql, facts.points, id);
  return ok({ ...place, points: facts.points, editToken, season, name: name.name });
}

/** PATCH /api/board: `{ editToken, name }` renames that row (the filter applied); 409 "name taken" when another run holds the name. */
export async function patchBoard(ctx: Ctx, body: Record<string, unknown>): Promise<Reply> {
  if (!ctx.sql) return OFFLINE;
  const token = typeof body.editToken === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(body.editToken) ? body.editToken : null;
  if (!token) return fail(400, "bad token");
  if (!(await underLimit(ctx, "rename"))) return fail(429, "limit");
  const name = checkName(typeof body.name === "string" ? body.name : "");
  if (!name.ok) return fail(400, name.reason === "refused" ? "name refused" : "bad name");
  const own = await ctx.sql.query<{ id: string; points: number }>("SELECT id, points FROM board WHERE edit_token = $1", [token]);
  if (own.length === 0) return fail(404, "no such row");
  // Section 37.9 (owner): a rename onto a name already on the board under another run is refused; no row is deleted or
  // replaced because of a rename, and this row keeps its old name.
  if ((await rowsNamed(ctx.sql, name.name)).some((r) => r.id !== own[0].id)) return fail(409, "name taken");
  const old = await ctx.sql.query<{ name: string }>("SELECT name FROM board WHERE id = $1", [own[0].id]);
  await ctx.sql.query("UPDATE board SET name = $1 WHERE id = $2", [name.name, own[0].id]);
  // Two renames (or a rename and a post) to one free name at once: the later to look sees two rows and steps back.
  if ((await rowsNamed(ctx.sql, name.name)).some((r) => r.id !== own[0].id)) {
    await ctx.sql.query("UPDATE board SET name = $1 WHERE id = $2", [old[0]?.name ?? name.name, own[0].id]);
    return fail(409, "name taken");
  }
  const points = Number(own[0].points);
  return ok({ renamed: true, name: name.name, ...(await around(ctx.sql, points, own[0].id)), points });
}

/**
 * POST /api/feedback: `{ runId, answers }`. Section 38.4: the answers are q1 to q4 (1 to 5), remember (cut at 140),
 * age ("u17", "18_30", "31_plus"), nudge ("none", "shown_answered", "shown_left") and cardSeconds; a known key with a
 * value off its list is refused, an unknown key ignored, and an empty form is a valid post (the count of forms opened
 * is known). One form a run.
 */
export async function postFeedback(ctx: Ctx, body: Record<string, unknown>): Promise<Reply> {
  if (!ctx.sql) return OFFLINE;
  const runId = typeof body.runId === "string" && UUID.test(body.runId) ? body.runId.toLowerCase() : null;
  if (!runId) return fail(400, "bad run");
  const checked = checkAnswers(body.answers);
  if (!checked.ok) return fail(400, checked.error);
  if (!(await underLimit(ctx, "feedback"))) return fail(429, "limit");
  const { answers } = checked;
  // A form belongs to a run the server has counted (the last card reports it as it opens).
  if ((await ctx.sql.query("SELECT id FROM runs WHERE id = $1", [runId])).length === 0) return fail(404, "no such run");
  if ((await ctx.sql.query("SELECT run_id FROM feedback WHERE run_id = $1", [runId])).length > 0) return fail(409, "already sent");
  await ctx.sql.query(
    `INSERT INTO feedback (run_id, q1, q2, q3, q4, remember, age_group, nudge, card_seconds, created_at, tag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (run_id) DO NOTHING`,
    [runId, answers.q1 ?? null, answers.q2 ?? null, answers.q3 ?? null, answers.q4 ?? null, answers.remember ?? null, answers.age ?? null, answers.nudge ?? null, answers.cardSeconds ?? null, ctx.now.toISOString(), tagOf(body, ctx.env)]
  );
  return ok({ saved: true });
}
