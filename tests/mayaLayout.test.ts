import { describe, expect, it } from "vitest";
import { placeBubble, placeFigure, intersects, inside, CLEARANCE, type Rect } from "../src/ui/panjim/mayaLayout";

const VIEW = { w: 1920, h: 1080 };
const FIG = { w: 96, h: 152 };
const discovery: Rect = { x: 12, y: 820, w: 340, h: 180 }; // bottom-left card
const streetMap: Rect = { x: 12, y: 1020, w: 200, h: 48 };
const getReady: Rect = { x: 1600, y: 840, w: 300, h: 220 };
const topBar: Rect = { x: 640, y: 10, w: 640, h: 160 };

describe("Maya's figure", () => {
  it("docks bottom-left above the Discovery card, clear of everything", () => {
    const obstacles = [discovery, streetMap, getReady, topBar];
    const spot = placeFigure(FIG, obstacles, VIEW, null)!;
    expect(spot).not.toBeNull();
    for (const o of obstacles) expect(intersects(spot, o, CLEARANCE)).toBe(false);
    expect(spot.x).toBeLessThan(40);
    expect(spot.y + spot.h).toBeLessThanOrEqual(discovery.y - CLEARANCE);
    expect(inside(spot, VIEW)).toBe(true);
  });

  it("moves with the card: a taller card pushes her up", () => {
    const tall = { ...discovery, y: 600, h: 400 };
    const spot = placeFigure(FIG, [tall, streetMap], VIEW, null)!;
    expect(spot.y + spot.h).toBeLessThanOrEqual(tall.y - CLEARANCE);
  });

  it("stands beside the card when the whole left edge is taken", () => {
    const column: Rect = { x: 0, y: 0, w: 360, h: 1080 };
    const spot = placeFigure(FIG, [column], VIEW, null)!;
    expect(intersects(spot, column, CLEARANCE)).toBe(false);
    expect(inside(spot, VIEW)).toBe(true);
  });

  it("goes as near a warning tile as a free spot allows", () => {
    const target = { x: 1700, y: 900 }; // right on top of Get ready
    const spot = placeFigure(FIG, [getReady], VIEW, target)!;
    expect(intersects(spot, getReady, CLEARANCE)).toBe(false);
    const feet = { x: spot.x + spot.w / 2, y: spot.y + spot.h };
    expect(Math.hypot(feet.x - target.x, feet.y - target.y)).toBeLessThan(500);
  });
});

describe("Maya's bubble", () => {
  const measure = (width: number): number => Math.ceil(2400 / width) * 20 + 50;

  it("opens toward free space and never covers the HUD", () => {
    const obstacles = [discovery, streetMap, getReady, topBar];
    const figure = placeFigure(FIG, obstacles, VIEW, null)!;
    const bubble = placeBubble(figure, measure, obstacles, VIEW)!;
    expect(bubble).not.toBeNull();
    expect(bubble.rect.w).toBeLessThanOrEqual(320);
    for (const o of obstacles) expect(intersects(bubble.rect, o, CLEARANCE)).toBe(false);
    expect(intersects(bubble.rect, figure)).toBe(false);
    expect(inside(bubble.rect, VIEW)).toBe(true);
  });

  it("narrows, then gives up (so the line is held back) when there is no room", () => {
    const figure: Rect = { x: 12, y: 12, w: 96, h: 152 };
    const wall: Rect = { x: 120, y: 0, w: 1800, h: 1080 };
    expect(placeBubble(figure, measure, [wall], VIEW)).toBeNull();
  });
});
