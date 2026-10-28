/**
 * Section 35: the one running board, through the game's own Vercel functions (api/). Every call is best effort: no
 * network, no database, a refusal or a slow answer reads as offline (null), and the game plays the same.
 */
const TIMEOUT_MS = 6000;

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(path, { ...init, signal: abort.signal, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    if (!response.ok) return null;
    const body = (await response.json()) as T & { offline?: boolean };
    return body && !body.offline ? body : null;
  } catch {
    return null;
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
  return call<{ saved: boolean }>("/api/run", { method: "POST", body: JSON.stringify(report), keepalive: true });
}

/** POST /api/run with `navigator.sendBeacon`, when a run stops early (Exit, the idle reset, the page closed). */
export function beaconRun(report: RunReport): void {
  try {
    navigator.sendBeacon?.("/api/run", new Blob([JSON.stringify(report)], { type: "application/json" }));
  } catch {
    // Best effort: a run that cannot be reported is simply not counted.
  }
}

/** What the server answers a board post: the run's place, the rows round it, and the row's edit token. */
export type BoardPost = RankView & { editToken: string; season: string; name: string };

/** POST /api/board for a finished run with a name. The server replays the builds and counts the points itself. */
export function postBoard(runId: string, name: string, builds: RunReport["builds"]): Promise<BoardPost | null> {
  return call<BoardPost>("/api/board", { method: "POST", body: JSON.stringify({ runId, name, builds }) });
}

/** PATCH /api/board: renames the run's row (from the feedback form). */
export function renameOnBoard(editToken: string, name: string): Promise<{ renamed: boolean; name: string; rank: number } | null> {
  return call<{ renamed: boolean; name: string; rank: number }>("/api/board", { method: "PATCH", body: JSON.stringify({ editToken, name }) });
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
