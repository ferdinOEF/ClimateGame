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
