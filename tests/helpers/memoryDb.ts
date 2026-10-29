import { readFileSync } from "node:fs";
import { newDb } from "pg-mem";
import { schemaStatements, type Sql } from "../../server/db";

/** Section 35.4: an in memory Postgres (pg-mem) with db/schema.sql applied, behind the handlers' `Sql`. */
export function memoryDb(): Sql & { apply(): Promise<void> } {
  const db = newDb();
  const { Client } = db.adapters.createPg();
  const client = new Client();
  const sql = {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const result = await client.query(text, params);
      return result.rows as T[];
    },
    async apply(): Promise<void> {
      for (const statement of schemaStatements(readFileSync("db/schema.sql", "utf8"))) await sql.query(statement);
    }
  };
  return sql;
}
