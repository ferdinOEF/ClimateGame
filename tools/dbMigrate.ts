/**
 * Section 35.4: applies db/schema.sql to the database at DATABASE_URL (or POSTGRES_URL). Every statement creates only
 * what is missing, so it can run again at any time.
 *
 *   DATABASE_URL=postgres://... npm run db:migrate
 *
 * Or with the project's Vercel settings: `vercel env pull .env.local`, then `node --env-file=.env.local` style
 * loading: this script reads .env.local and .env itself when the variable is not set.
 */
import fs from "node:fs";
import { neonSql, schemaStatements, type ServerEnv } from "../server/db";
import { loadEnvFiles } from "./envFiles";

loadEnvFiles();
const sql = neonSql(process.env as ServerEnv);
if (!sql) {
  console.error("No DATABASE_URL (or POSTGRES_URL) set: nothing to migrate.");
  process.exit(1);
}
const statements = schemaStatements(fs.readFileSync("db/schema.sql", "utf8"));
for (const statement of statements) {
  await sql.query(statement);
  console.log(`ok  ${statement.split("\n")[0]}`);
}
console.log(`Applied ${statements.length} statements.`);
