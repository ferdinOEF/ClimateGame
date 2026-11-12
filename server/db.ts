import { neon } from "@neondatabase/serverless";

/**
 * Section 35.4: the one thing the handlers ask of a database: run a query with $1, $2... parameters and get its rows.
 * Production is Neon over HTTP (@neondatabase/serverless); the tests use an in memory Postgres (pg-mem).
 */
export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

/** The server's settings, from the environment (Vercel's Project Settings, Environment Variables). */
export interface ServerEnv {
  DATABASE_URL?: string;
  POSTGRES_URL?: string;
  BOARD_SEASON?: string;
  RATE_SALT?: string;
  /** Section 38.4b: the tag every post gets when it sends none ("Preview" on Vercel Preview); a post's own tag wins. */
  DEFAULT_TAG?: string;
}

/** Section 38.4b: a test tag's shape (shared with src/services/testTag.ts): 2 to 30 letters, digits or underscores. */
export const TAG_PATTERN = /^[A-Za-z0-9_]{2,30}$/;

/** The tag a post is stored with: its own when it fits the shape, else the deployment's default, else null (a real player). */
export function tagOf(body: Record<string, unknown>, env: ServerEnv): string | null {
  if (typeof body.tag === "string" && TAG_PATTERN.test(body.tag)) return body.tag;
  const fallback = env.DEFAULT_TAG?.trim() ?? "";
  return TAG_PATTERN.test(fallback) ? fallback : null;
}

/**
 * The label stored in a board row's `season` column at post time (the column is NOT NULL with no default). Section 41.6
 * (owner decision 10): one board, tagless: the label is never shown or sent to a player; the owner may remove
 * `BOARD_SEASON` on Vercel, and new rows then store "Season 1". Nothing resets and no row is changed.
 */
export function seasonOf(env: ServerEnv): string {
  return env.BOARD_SEASON?.trim() || "Season 1";
}

export function databaseUrl(env: ServerEnv): string | null {
  return env.DATABASE_URL?.trim() || env.POSTGRES_URL?.trim() || null;
}

/** Neon over HTTP, or null when no database is configured (every endpoint then answers `{ offline: true }`). */
export function neonSql(env: ServerEnv): Sql | null {
  const url = databaseUrl(env);
  if (!url) return null;
  const run = neon(url);
  return { query: async <T>(text: string, params: unknown[] = []) => (await run.query(text, params)) as T[] };
}

/** db/schema.sql as statements (split on the semicolons that end a line), for `npm run db:migrate` and the tests. */
export function schemaStatements(schema: string): string[] {
  return schema
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*\n/)
    .map((s) => s.trim().replace(/;$/, ""))
    .filter(Boolean);
}
