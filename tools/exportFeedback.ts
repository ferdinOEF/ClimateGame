/**
 * Section 35.4: writes the database's runs, feedback and board as CSV files, for Excel or Google Sheets and grant
 * reporting, into exports/ (not committed):
 *
 *   runs.csv      every Play Panjim run: reach, completion, points, stars, builds (no name, IP or device);
 *   feedback.csv  every form (Section 38.4: q1 to q4, remember, age_group, nudge, card_seconds), joined to its run on
 *                 the run id (no name);
 *   board.csv     the board: season, name, points, stars, when (never the edit token).
 *
 * Section 38.4b: each file has a `tag` column (a test session's tag; empty for a real player); nothing is dropped.
 *
 *   DATABASE_URL=postgres://... npm run export:feedback
 */
import fs from "node:fs";
import path from "node:path";
import { neonSql, type ServerEnv, type Sql } from "../server/db";
import { loadEnvFiles } from "./envFiles";

/** One CSV field: quoted when it holds a comma, a quote or a line break; arrays and objects as JSON. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  // A leading =, +, - or @ would be read as a formula by a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return [columns.join(","), ...rows.map((row) => columns.map((c) => csvField(row[c])).join(","))].join("\n") + "\n";
}

export const RUN_COLUMNS = ["id", "started_at", "ended_at", "finished", "year_reached", "minutes", "points", "stars", "builds", "nature_share", "biodiversity_end", "tutorial_first", "on_board", "tag"];
export const FEEDBACK_COLUMNS = ["run_id", "created_at", "q1", "q2", "q3", "q4", "remember", "age_group", "nudge", "card_seconds", "tag", "finished", "year_reached", "minutes", "points", "stars", "nature_share", "tutorial_first"];
export const BOARD_COLUMNS = ["season", "name", "points", "stars", "created_at", "tag"];

export async function exportAll(sql: Sql): Promise<{ runs: string; feedback: string; board: string }> {
  const runs = await sql.query<Record<string, unknown>>(`SELECT ${RUN_COLUMNS.join(", ")} FROM runs ORDER BY started_at, created_at`);
  const feedback = await sql.query<Record<string, unknown>>(
    `SELECT f.run_id, f.created_at, f.q1, f.q2, f.q3, f.q4, f.remember, f.age_group, f.nudge, f.card_seconds, f.tag,
            r.finished, r.year_reached, r.minutes, r.points, r.stars, r.nature_share, r.tutorial_first
     FROM feedback f LEFT JOIN runs r ON r.id = f.run_id ORDER BY f.created_at`
  );
  const board = await sql.query<Record<string, unknown>>(`SELECT ${BOARD_COLUMNS.join(", ")} FROM board ORDER BY points DESC, created_at`);
  return { runs: toCsv(runs, RUN_COLUMNS), feedback: toCsv(feedback, FEEDBACK_COLUMNS), board: toCsv(board, BOARD_COLUMNS) };
}

if (process.argv[1]?.endsWith("exportFeedback.ts")) {
  loadEnvFiles();
  const sql = neonSql(process.env as ServerEnv);
  if (!sql) {
    console.error("No DATABASE_URL (or POSTGRES_URL) set: nothing to export.");
    process.exit(1);
  }
  const out = await exportAll(sql);
  fs.mkdirSync("exports", { recursive: true });
  for (const [name, text] of Object.entries(out)) {
    fs.writeFileSync(path.join("exports", `${name}.csv`), text);
    console.log(`exports/${name}.csv: ${text.split("\n").length - 2} rows`);
  }
}
