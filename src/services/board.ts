/**
 * Section 35: the one running board, through the game's own Vercel functions (api/). Every call is best effort: no
 * network, no database, a refusal or a slow answer reads as offline (null), and the game plays the same.
 */
/**
 * How long a read waits. Generous: the board is asked as the game builds its 3D scene, which can hold the page's
 * thread for seconds on a slow machine, and a cold function makes its tables first. A shorter wait read an answer
 * that had already come as offline.
 */
const TIMEOUT_MS = 20000;
/** A post the server replays (the run's builds through the hazard model, about 5 s) waits longer before it gives up. */
const REPLAY_TIMEOUT_MS = 30000;

async function call<T>(path: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<T | null> {
  return (await callWithStatus<T>(path, init, timeoutMs)).body;
}

/** The answer and its status (0 when the board could not be reached at all). */
async function callWithStatus<T>(path: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<{ status: number; body: T | null }> {
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetch(path, { ...init, signal: abort.signal, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    if (!response.ok) return { status: response.status, body: null };
    const body = (await response.json()) as T & { offline?: boolean };
    return { status: body && !body.offline ? response.status : 0, body: body && !body.offline ? body : null };
  } catch {
    return { status: 0, body: null };
  } finally {
    window.clearTimeout(timer);
  }
}

/** One row of the board as the finale shows it. */
export interface BoardRowView {
  rank: number;
  name: string;
  points: number;
  season: string;
}

/**
 * Section 35.2: where a run stands on the board. `rank` is the place its points get (a tie shares the higher place);
 * `above` and `below` the rows just above and below it (at most two each); `tenth` the 10th row's points (null with
 * fewer than ten rows).
 */
export interface RankView {
  rank: number;
  points: number;
  tenth: number | null;
  above: BoardRowView[];
  below: BoardRowView[];
  /** Section 37.3: the name's better run stays on the board; `points` and `rank` are that row's. */
  kept?: boolean;
}

/** One row of the top 10, as the server sends it. */
export interface BoardRow extends BoardRowView {
  stars: number;
}

/** GET /api/board: the top 10 and the season. Null when the board can't be reached. */
export function fetchTop(): Promise<{ rows: BoardRow[]; season: string } | null> {
  return call<{ rows: BoardRow[]; season: string }>("/api/board");
}

/** GET /api/board?points=N: the place N points would get, and the rows round it. */
export function fetchRank(points: number): Promise<(RankView & { season: string }) | null> {
  return call<RankView & { season: string }>(`/api/board?points=${Math.max(0, Math.round(points))}`);
}

/** Section 35.4: what the server is told about a run (no name, IP or device): its build list and its timing. */
export interface RunReport {
  runId: string;
  builds: readonly { year: number; tile: string; element: string }[];
  minutes: number;
  startedAt: string;
  endedAt: string;
  tutorialFirst: boolean;
}

/** POST /api/run at the finale. */
export function postRun(report: RunReport): Promise<{ saved: boolean } | null> {
  return call<{ saved: boolean }>("/api/run", { method: "POST", body: JSON.stringify(report), keepalive: true }, REPLAY_TIMEOUT_MS);
}

/** POST /api/run with `navigator.sendBeacon`, when a run stops early (Exit, the idle reset, the page closed). */
export function beaconRun(report: RunReport): void {
  try {
    // text/plain: a beacon of another type is refused by some browsers; the server reads the body as JSON either way.
    navigator.sendBeacon?.("/api/run", new Blob([JSON.stringify(report)], { type: "text/plain;charset=UTF-8" }));
  } catch {
    // Best effort: a run that cannot be reported is simply not counted.
  }
}

/** What the server answers a board post: the run's place, the rows round it, and the row's edit token. */
export type BoardPost = RankView & { editToken: string; season: string; name: string };

/**
 * POST /api/board for a finished run with a name. The server replays the builds and counts the points itself, and
 * saves the run (no separate run post is needed). `already`: the server has this run on the board (a post that timed
 * out here but landed there).
 */
export async function postBoard(report: RunReport, name: string): Promise<{ posted: BoardPost | null; already: boolean }> {
  const { status, body } = await callWithStatus<BoardPost>("/api/board", { method: "POST", body: JSON.stringify({ ...report, name }) }, REPLAY_TIMEOUT_MS);
  return { posted: body, already: status === 409 };
}

/** PATCH /api/board: renames the run's row (from the feedback form). */
export function renameOnBoard(editToken: string, name: string): Promise<({ renamed: boolean; name: string } & RankView) | null> {
  return call<{ renamed: boolean; name: string } & RankView>("/api/board", { method: "PATCH", body: JSON.stringify({ editToken, name }) }, REPLAY_TIMEOUT_MS);
}

/** POST /api/feedback: the answered items only, by run id; never a name. */
export function postFeedback(runId: string, answers: object): Promise<{ saved: boolean } | null> {
  return call<{ saved: boolean }>("/api/feedback", { method: "POST", body: JSON.stringify({ runId, answers }) });
}

/** A run's id: random, made by the client when the run starts. */
export function newRunId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
