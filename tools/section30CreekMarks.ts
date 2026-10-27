/** Section 30.1 QA: the creek corner with every grey tile marked (D = dropped, o = older scenery; then its terrain's first letter), to compare the shade. Usage: npx tsx tools/section30CreekMarks.ts */
import { chromium } from "playwright";
import { startDevServer } from "./devServer";
const server = await startDevServer(5490);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`${server.url}/?qa=1#/play/l01-first-rains`);
await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
await page.waitForTimeout(3000);
await page.evaluate(`window.__panjimForTest.maya.dismiss()`);
await page.evaluate(`window.__panjimForTest.host.focusCamera({ q: 27, r: 8 }, true, 1.5)`);
await page.mouse.move(2, 760);
await page.waitForTimeout(2500);
const marks = await page.evaluate(`(() => { const s = window.__panjimForTest.host.state; const out = []; for (const t of s.placed.values()) { if (!t.scenery) continue; const p = window.__panjimForTest.host.project(t.coord); if (!p || p.x < 0 || p.y < 0 || p.x > 1366 || p.y > 768) continue; out.push({ x: p.x, y: p.y, dry: !!t.dry, terrain: t.terrainId }); } return out; })()`) as { x: number; y: number; dry: boolean; terrain: string }[];
await page.evaluate((m) => { for (const k of m) { const d = document.createElement("div"); d.textContent = (k.dry ? "D" : "o") + k.terrain[0]; Object.assign(d.style, { position: "fixed", left: `${k.x - 8}px`, top: `${k.y - 8}px`, font: "bold 11px sans-serif", color: k.dry ? "#ff2" : "#0ff", zIndex: "999", pointerEvents: "none", textShadow: "0 0 2px #000" }); document.body.appendChild(d); } }, marks);
await page.screenshot({ path: "docs/qa/section30/creek-corner-marked-1366x768.png" });
await browser.close(); await server.stop(); process.exit(0);
