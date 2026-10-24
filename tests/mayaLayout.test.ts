import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BADGE_PX,
  CLEARANCE,
  HOME_MARGIN,
  MAYA_SCALE,
  bubbleWidths,
  figureSize,
  homeRect,
  inside,
  intersects,
  placeBubble,
  screenTier,
  type Rect
} from "../src/ui/panjim/mayaLayout";
import { HUD_UNIT_PX, HUD_VIEWBOX } from "../src/ui/panjim/mayaArt";

const VIEW = { w: 1920, h: 1080 };
const streetMap: Rect = { x: 12, y: 1050, w: 200, h: 26 };
const hudCard: Rect = { x: 14, y: 12, w: 400, h: 420 };
const hint: Rect = { x: 760, y: 1028, w: 400, h: 40 };
const popover: Rect = { x: 900, y: 600, w: 320, h: 360 };

describe("Maya's home", () => {
  it("is the bottom-right corner (Section 33b), a fixed margin from both edges, on whole pixels", () => {
    const size = figureSize(HUD_VIEWBOX, HUD_UNIT_PX, screenTier(VIEW));
    const home = homeRect(size, VIEW);
    expect(VIEW.w - (home.x + home.w)).toBe(HOME_MARGIN);
    expect(VIEW.h - (home.y + home.h)).toBe(HOME_MARGIN);
    for (const v of [home.x, home.y, home.w, home.h]) expect(Number.isInteger(v)).toBe(true);
    expect(inside(home, VIEW)).toBe(true);
  });

  it("is the same wherever anything else is: nothing in the HUD changes it", () => {
    const size = figureSize(HUD_VIEWBOX, HUD_UNIT_PX, 1);
    const a = homeRect(size, VIEW);
    const b = homeRect(size, { ...VIEW });
    expect(a).toEqual(b);
    // It depends only on the screen's size.
    expect(homeRect(size, { w: 1366, h: 768 }).y).toBe(768 - size.h - HOME_MARGIN);
  });

  it("has a box in whole pixels at every screen size, from her one scale", () => {
    for (const viewport of [{ w: 1366, h: 768 }, { w: 1920, h: 1080 }, { w: 2560, h: 1440 }, { w: 1093, h: 614 }, { w: 640, h: 900 }]) {
      const size = figureSize(HUD_VIEWBOX, HUD_UNIT_PX, screenTier(viewport));
      expect(Number.isInteger(size.w) && Number.isInteger(size.h)).toBe(true);
      expect(size.w / size.h).toBeCloseTo(HUD_VIEWBOX.width / HUD_VIEWBOX.height, 1);
    }
  });

  it("has no way to be moved: there is no placement function for her figure", async () => {
    const layout = (await import("../src/ui/panjim/mayaLayout")) as Record<string, unknown>;
    expect(layout.placeFigure).toBeUndefined();
  });

  it("is 30% smaller than before: her one scale, 0.45 x 0.7", () => {
    expect(MAYA_SCALE).toBeCloseTo(0.45 * 0.7, 5);
    // Her badge never goes under a size that can be hit.
    expect(BADGE_PX).toBeGreaterThanOrEqual(30);
  });

  it("has her scale in one place: no other 0.315, 0.45 or 0.7 scale literal in her code", () => {
    for (const file of ["src/ui/panjim/maya.ts", "src/ui/panjim/mayaArt.ts", "src/ui/panjim/mayaLayout.ts"]) {
      const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      const hits = text.match(/\b0?\.315\b|\*\s*0?\.(45|7)\b/g) ?? [];
      // The one definition, in mayaLayout.ts.
      expect(hits.length, file).toBe(file.endsWith("mayaLayout.ts") ? 1 : 0);
    }
  });
});

describe("Maya's bubble", () => {
  const measure = (width: number): number => Math.ceil(2400 / width) * 16 + 40;
  const size = figureSize(HUD_VIEWBOX, HUD_UNIT_PX, 1);
  const home = homeRect(size, VIEW);

  it("opens beside her toward free space and never covers the HUD", () => {
    const obstacles = [streetMap, hudCard, hint, popover];
    const bubble = placeBubble(home, measure, obstacles, VIEW)!;
    expect(bubble).not.toBeNull();
    for (const o of obstacles) expect(intersects(bubble.rect, o, CLEARANCE)).toBe(false);
    expect(intersects(bubble.rect, home)).toBe(false);
    expect(inside(bubble.rect, VIEW)).toBe(true);
    expect(["left", "above"]).toContain(bubble.side);
  });

  it("opens to her left when there is room", () => {
    const bubble = placeBubble(home, measure, [hudCard, hint], VIEW)!;
    expect(bubble.side).toBe("left");
    expect(bubble.rect.x + bubble.rect.w).toBeLessThanOrEqual(home.x);
  });

  it("flips above her when something is to her left, and never leaves her home to do it", () => {
    const wall: Rect = { x: 0, y: 0, w: home.x, h: 1080 };
    const bubble = placeBubble(home, measure, [wall], VIEW);
    // The figure is not an argument that can change: with no room beside her the line waits.
    expect(bubble === null || bubble.side === "above").toBe(true);
  });

  it("narrows, then gives up (so the line is held back) when there is no room", () => {
    const wall: Rect = { x: 0, y: 0, w: 1920, h: 1080 - home.h - 2 * HOME_MARGIN - 6 };
    const left: Rect = { x: 0, y: home.y - 40, w: home.x, h: 1080 };
    expect(placeBubble(home, measure, [wall, left], VIEW)).toBeNull();
  });

  it("never gets narrower than her text can use, however small she is", () => {
    for (const width of bubbleWidths()) expect(width).toBeGreaterThanOrEqual(190);
  });
});
