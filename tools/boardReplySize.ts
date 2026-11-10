/**
 * Section 40.5: how big the board's answer is for the last card, now that it carries `top` (every row above the
 * run, from 1st place down). The worst case: the run is last, so `top` holds the whole board. Measured on the real
 * handler against the in memory database the tests use, with names shaped like the board's (8 to 22 characters).
 *
 * Usage: npx tsx tools/boardReplySize.ts [rows=150,1000]
 */
import zlib from "node:zlib";
import { getBoard, type Ctx } from "../server/handlers";
import { PANJIM_POINTS_MODEL } from "../src/levels/panjimRun";
import { memoryDb } from "../tests/helpers/memoryDb";

const arg = process.argv.slice(2).find((a) => a.startsWith("rows="));
const sizes = (arg ? arg.slice(5) : "150,1000").split(",").map(Number);
const parts = ["mandovi", "khazan", "miramar", "altinho", "campal", "fontainhas", "ribandar", "taleigao", "dona_paula", "panjim"];

for (const n of sizes) {
  const db = memoryDb();
  await db.apply();
  for (let i = 0; i < n; i++) {
    const name = `${i % 3 === 0 ? "@" : ""}${parts[i % parts.length]}${i % 2 ? "_" : " "}${parts[(i * 7 + 3) % parts.length]}${i}`.slice(0, 22 + (i % 9));
    await db.query("INSERT INTO board (id, season, name, points, stars, edit_token, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      "Festival 2026",
      name,
      1000 + i * 5,
      5 + (i % 5),
      `token-${i}-abcdefghijklmnop`,
      "2026-11-01T09:00:00Z"
    ]);
  }
  const ctx: Ctx = { sql: db, env: { BOARD_SEASON: "Festival 2026", RATE_SALT: "salt" }, ip: "10.0.0.1", now: new Date("2026-11-01T10:30:00Z"), model: PANJIM_POINTS_MODEL };
  const started = performance.now();
  const reply = await getBoard(ctx, { points: "900" });
  const ms = performance.now() - started;
  const body = JSON.stringify(reply.body);
  const top = (reply.body.top as unknown[]).length;
  const without = JSON.stringify({ ...reply.body, top: undefined });
  console.log(
    `${n} rows, the run last (rank ${String(reply.body.rank)}): top holds ${top} rows; the answer is ${Buffer.byteLength(body)} bytes (${(Buffer.byteLength(body) / 1024).toFixed(1)} KB), ` +
      `${zlib.gzipSync(body).length} bytes gzipped, ${zlib.brotliCompressSync(body).length} bytes with Brotli; without top it is ${Buffer.byteLength(without)} bytes; the handler took ${ms.toFixed(0)} ms here (pg-mem)`
  );
}
