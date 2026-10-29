import fs from "node:fs";

/** Reads KEY=value lines from .env.local and .env (as `vercel env pull` writes them) into process.env, never overwriting. */
export function loadEnvFiles(files = [".env.local", ".env"]): void {
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || process.env[m[1]] !== undefined) continue;
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    }
  }
}
