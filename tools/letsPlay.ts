import type { Page } from "playwright";

/**
 * Section 40.3: How to play is three screens, and "Let's Play!" (class `brief-cta`) is on the third. A tool that
 * starts Play Panjim presses Next until it shows, then presses it. On the Tutorial's brief, and on a build from before
 * Section 40, there is no Next and Begin is pressed at once.
 */
export async function letsPlay(page: Page, timeout = 120000): Promise<void> {
  await page.waitForSelector(".brief-cta", { state: "attached", timeout });
  for (let i = 0; i < 6; i++) {
    const next = page.locator(".howto-next:visible");
    if ((await next.count()) === 0) break;
    await next.first().click();
    await page.waitForTimeout(150);
  }
  await page.locator(".brief-cta:visible").first().click();
}
