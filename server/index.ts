import type { IncomingMessage, ServerResponse } from "node:http";
import { PANJIM_POINTS_MODEL } from "@levels/panjimRun";
import { neonSql, schemaStatements, type ServerEnv, type Sql } from "./db";
import { getBoard, patchBoard, postBoard, postFeedback, postRun, type Ctx, type Reply } from "./handlers";

/**
 * Section 35.4: the Vercel Node functions (api/run.js, api/board.js, api/feedback.js), as request adapters around the
 * handlers. Bundled with the game's core into api/_lib/server.mjs by `npm run build:api` (tools/buildApi.ts), because
 * the core's imports use the project's path aliases, which Vercel's own TypeScript step does not read.
 */
type Req = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };

/** At most this much of a request body is read. */
const MAX_BODY = 64 * 1024;

async function readBody(req: Req): Promise<Record<string, unknown>> {
  let raw: unknown = req.body;
  if (raw === undefined) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY) return {};
      chunks.push(chunk as Buffer);
    }
    raw = Buffer.concat(chunks).toString("utf8");
  }
  if (typeof raw === "string") {
    if (raw.length > MAX_BODY) return {};
    try {
      raw = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function clientIp(req: Req): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || (req.headers["x-real-ip"] as string | undefined) || req.socket?.remoteAddress || "unknown";
}

function queryOf(req: Req): Record<string, string | undefined> {
  const url = new URL(req.url ?? "/", "http://localhost");
  return Object.fromEntries(url.searchParams.entries());
}

function send(res: ServerResponse, reply: Reply): void {
  res.statusCode = reply.status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(reply.body));
}

/** The context a request runs in: the database (or none), the settings, the caller's IP, the time. */
export function contextFor(req: Req, env: ServerEnv = process.env as ServerEnv, sql: Sql | null = neonSql(env)): Ctx {
  return { sql, env, ip: clientIp(req), now: new Date(), model: PANJIM_POINTS_MODEL };
}

/** db/schema.sql, put in the bundle as text by tools/buildApi.ts. */
declare const __SCHEMA_SQL__: string;

let schemaReady: Promise<void> | null = null;

/**
 * The tables, made once per function instance before its first query when they are missing (every statement is
 * CREATE ... IF NOT EXISTS), so a new database works before anyone runs `npm run db:migrate`. A failure is tried
 * again on the next request.
 */
function ensureSchema(sql: Sql): Promise<void> {
  schemaReady ??= (async () => {
    for (const statement of schemaStatements(__SCHEMA_SQL__)) await sql.query(statement);
  })().catch((error: unknown) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

type Route = (ctx: Ctx, req: Req) => Promise<Reply>;

function handler(routes: Partial<Record<string, Route>>) {
  return async (req: Req, res: ServerResponse): Promise<void> => {
    const route = routes[req.method ?? "GET"];
    if (!route) return send(res, { status: 405, body: { error: "method" } });
    try {
      const ctx = contextFor(req);
      if (ctx.sql) await ensureSchema(ctx.sql);
      send(res, await route(ctx, req));
    } catch (error) {
      // The database could not be reached or refused the query: the game carries on as offline.
      console.error("api error", error instanceof Error ? error.message : error);
      send(res, { status: 503, body: { offline: true } });
    }
  };
}

export const runHandler = handler({ POST: async (ctx, req) => postRun(ctx, await readBody(req)) });

export const boardHandler = handler({
  GET: async (ctx, req) => getBoard(ctx, queryOf(req)),
  POST: async (ctx, req) => postBoard(ctx, await readBody(req)),
  PATCH: async (ctx, req) => patchBoard(ctx, await readBody(req))
});

export const feedbackHandler = handler({ POST: async (ctx, req) => postFeedback(ctx, await readBody(req)) });
