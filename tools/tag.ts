/**
 * Section 38.4b: the test tags in the database and their row counts (runs, board, feedback), so the owner can see
 * what test play has written. Nothing is deleted: a tagged row is kept and never shown on the board.
 *
 *   DATABASE_URL=postgres://... npm run tag -- list
 */
import { neonSql, type ServerEnv, type Sql } from "../server/db";
import { loadEnvFiles } from "./envFiles";

export interface TagCount {
  tag: string;
  runs: number;
  board: number;
  feedback: number;
}

/** Every tag seen in any of the three tables, with its rows in each, by name. */
export async function tagCounts(sql: Sql): Promise<TagCount[]> {
  const out = new Map<string, TagCount>();
  for (const table of ["runs", "board", "feedback"] as const) {
    const rows = await sql.query<{ tag: string; n: number | string }>(`SELECT tag, count(*) AS n FROM ${table} WHERE tag IS NOT NULL GROUP BY tag`);
    for (const row of rows) {
      const entry = out.get(row.tag) ?? { tag: row.tag, runs: 0, board: 0, feedback: 0 };
      entry[table] = Number(row.n);
      out.set(row.tag, entry);
    }
  }
  return [...out.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

export function tagTable(counts: TagCount[]): string {
  if (counts.length === 0) return "No tagged rows.\n";
  const lines = ["tag                            runs   board  feedback"];
  for (const c of counts) lines.push(`${c.tag.padEnd(30)} ${String(c.runs).padStart(5)} ${String(c.board).padStart(7)} ${String(c.feedback).padStart(9)}`);
  return lines.join("\n") + "\n";
}

if (process.argv[1]?.endsWith("tag.ts")) {
  const command = process.argv[2] ?? "list";
  if (command !== "list") {
    console.error("Usage: npm run tag -- list");
    process.exit(1);
  }
  loadEnvFiles();
  const sql = neonSql(process.env as ServerEnv);
  if (!sql) {
    console.error("No DATABASE_URL (or POSTGRES_URL) set: nothing to list.");
    process.exit(1);
  }
  process.stdout.write(tagTable(await tagCounts(sql)));
}
