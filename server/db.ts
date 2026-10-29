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
}

/** The board's season, stored on every row at post time. Nothing resets: it is a label, not a new board. */
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
