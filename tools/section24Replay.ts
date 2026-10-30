/**
 * Section 24.3: the best plan (docs/qa/section24/best_plan.json) played in the
 * browser game, through the player's own build path (`window.__panjimForTest`,
 * the Panjim controller's `build`), storms, time-lapses and cards included.
 * Reads each storm's result card (stars, "N of M homes saved") and the final
 * card, checks them against the plan file, and screenshots the three result
 * cards and the final card. Console errors must be 0.
 *
 * Usage: npx tsx tools/section24Replay.ts [width=1366] [height=768] [goal=goal1] [outDir=docs/qa/section24]
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { startDevServer } from "./devServer";

const ROOT = path.resolve(import.meta.dirname, "..");
const [w = "1366", h = "768", goal = "goal1", outDir = "docs/qa/section24"] = process.argv.slice(2);
const W = Number(w);
const H = Number(h);
const OUT = path.resolve(ROOT, outDir);
fs.mkdirSync(OUT, { recursive: true });
interface PlanFile {
  [goal: string]: {
    stars: number;
    storms: { id: string; name: string; year: number; stars: number; saved: number; total: number }[];
    actions: { year: number; action: string; elementId: string; q: number; r: number }[];
  };
}
const plan = (JSON.parse(fs.readFileSync(path.join(OUT, "best_plan.json"), "utf8")) as PlanFile)[goal];

const server = await startDevServer(Number(process.env.PORT ?? 5475));
const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors: string[] = [];
let failed = 0;
const check = (ok: boolean, label: string): void => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} [${W}x${H}] ${label}`);
};

const page: Page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  try {
    localStorage.clear();
  } catch {
    /* blocked */
  }
});
await page.goto(`${server.url}/?qa=1&noname=1&noguide=1#/play/l01-first-rains`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".brief-card, .howto-card", { timeout: 120000 });
await page.waitForFunction(`!!window.__panjimForTest`, undefined, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.locator(".brief-cta", { hasText: "Begin" }).first().click();
await page.waitForTimeout(3000);

const cardsOpen = (): Promise<boolean> => page.locator(".result-cards:not([hidden])").isVisible().catch(() => false);
const ready = (): Promise<boolean> => page.evaluate(`!window.__panjimForTest.busy`) as Promise<boolean>;
/** What the open card says: its title, stars (of 3, or in all) and homes saved. */
const readCard = (): Promise<{ title: string; stars: number | null; total: number | null; saved: number | null; of: number | null; text: string }> =>
  page.evaluate(`(() => {
    const card = document.querySelector(".result-cards:not([hidden]) .result-card");
    const title = card.querySelector(".result-title")?.textContent ?? "";
    const starsEl = card.querySelector(".result-stars");
    const stars = starsEl ? Number((starsEl.getAttribute("aria-label") ?? "").split(" ")[0]) : null;
    const totalEl = card.querySelector(".result-stars-total b");
    const m = /(\\d+)\\s*of\\s*(\\d+)\\s*homes saved/.exec(card.textContent ?? "");
    return { title, stars, total: totalEl ? Number(totalEl.textContent) : null, saved: m ? Number(m[1]) : null, of: m ? Number(m[2]) : null, text: (card.textContent ?? "").replace(/\\s+/g, " ").trim().slice(0, 300) };
  })()`) as Promise<{ title: string; stars: number | null; total: number | null; saved: number | null; of: number | null; text: string }>;

const seen: { title: string; stars: number | null; saved: number | null; of: number | null }[] = [];
let finalRead: Awaited<ReturnType<typeof readCard>> | null = null;
let storm = 0;
/** Waits for the year to settle; works through any storm's cards on the way (screenshotting the result card and the final card). */
async function settle(): Promise<void> {
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    if (await cardsOpen()) {
      const card = await readCard();
      if (card.total !== null) {
        finalRead = card;
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, `final-card-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
        return;
      }
      if (card.stars !== null) {
        seen.push({ title: card.title, stars: card.stars, saved: card.saved, of: card.of });
        storm++;
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, `result-card-${storm}-${W}x${H}.jpg`), type: "jpeg", quality: 85 });
      }
      await page.locator(".result-cards:not([hidden]) .result-next").click();
      await page.waitForTimeout(700);
      continue;
    }
    if (await ready()) return;
    await page.waitForTimeout(400);
  }
  throw new Error("the year never settled");
}

for (const [i, a] of plan.actions.entries()) {
  await settle();
  if (finalRead) break;
  const ok = (await page.evaluate(
    ([act]) => {
      const p = (window as unknown as { __panjimForTest: { build: (c: { q: number; r: number }, id: string) => boolean; repair: (c: { q: number; r: number }) => boolean } }).__panjimForTest;
      const step = act as { action: string; elementId: string; q: number; r: number };
      return step.action === "repair" ? p.repair({ q: step.q, r: step.r }) : p.build({ q: step.q, r: step.r }, step.elementId);
    },
    [a] as const
  )) as boolean;
  if (!ok) {
    check(false, `action ${i + 1} (${a.year} ${a.elementId} at ${a.q},${a.r}) refused`);
    break;
  }
  await page.waitForTimeout(300);
}
await settle();

plan.storms.forEach((s, i) => {
  const got = seen[i];
  check(!!got && got.stars === s.stars && got.saved === s.saved && got.of === s.total, `${s.name} ${s.year}: card shows ${got ? `${got.stars} stars, ${got.saved} of ${got.of} homes saved` : "nothing"}; plan ${s.stars} stars, ${s.saved} of ${s.total}`);
});
const fr = finalRead as Awaited<ReturnType<typeof readCard>> | null;
check(!!fr && fr.total === plan.stars, `final card: ${fr ? `${fr.total} of 9 stars ("${fr.text.slice(0, 160)}")` : "never shown"}; plan ${plan.stars} of 9`);
check(errors.length === 0, `console errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
await browser.close();
await server.stop();
process.exit(failed > 0 ? 1 : 0);
