import { describe, expect, it } from "vitest";
import { LABEL_GAP, overlaps, placeLabels, type LabelCandidate } from "../src/ui/labelPlacement";
import { labelsForMap } from "../src/ui/mapLabels";
import { mapById } from "../src/levels/levelMap";

const VIEW = { width: 1000, height: 800 };
const label = (id: string, priority: number, x: number, y: number, w = 80, h = 16): LabelCandidate => ({ id, priority, anchorX: x, anchorY: y, w, h });

describe("label placement", () => {
  it("never returns two boxes that touch, and never one that touches an obstacle", () => {
    const many: LabelCandidate[] = [];
    for (let i = 0; i < 60; i++) many.push(label(`l${i}`, i % 3, 100 + ((i * 37) % 800), 100 + ((i * 53) % 600), 60 + (i % 5) * 20));
    const obstacles = [{ x: 0, y: 0, w: 300, h: 200 }, { x: 700, y: 600, w: 300, h: 200 }];
    const placed = placeLabels(many, obstacles, VIEW);
    expect(placed.length).toBeGreaterThan(5);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) expect(overlaps(placed[i].box, placed[j].box, LABEL_GAP)).toBe(false);
      for (const o of obstacles) expect(overlaps(placed[i].box, o, LABEL_GAP)).toBe(false);
      const b = placed[i].box;
      expect(b.x >= 0 && b.y >= 0 && b.x + b.w <= VIEW.width && b.y + b.h <= VIEW.height).toBe(true);
    }
  });

  it("drops a label with no free position rather than shrinking or overlapping it", () => {
    const placed = placeLabels([label("a", 0, 500, 400, 600, 300)], [{ x: 0, y: 0, w: 1000, h: 800 }], VIEW);
    expect(placed).toEqual([]);
  });

  it("monument cards outrank major localities, which outrank minor ones", () => {
    const placed = placeLabels([label("minor", 2, 500, 400), label("major", 1, 500, 400), label("card", 0, 500, 400)], [], VIEW);
    expect(placed[0].id).toBe("card");
    expect(placed.find((p) => p.id === "card")!.offset).toBe(0);
    expect(placed.find((p) => p.id === "major")!.offset).toBeGreaterThan(0);
  });

  it("a label already showing keeps its place against an equal newcomer", () => {
    const a = label("a", 1, 500, 400);
    const b = label("b", 1, 500, 400);
    const first = placeLabels([a, b], [], VIEW);
    const shownFirst = new Map(first.map((p) => [p.id, p.offset]));
    // Next frame b is listed first, but a was showing at home: a stays at home.
    const second = placeLabels([b, a], [], VIEW, shownFirst);
    expect(second.find((p) => p.id === "a")!.offset).toBe(first.find((p) => p.id === "a")!.offset);
  });

  it("is stable: the same input gives the same output", () => {
    const input = [label("a", 1, 300, 300), label("b", 2, 320, 310), label("c", 0, 600, 200)];
    expect(placeLabels(input, [], VIEW)).toEqual(placeLabels(input, [], VIEW));
  });

  it("moves a label whose home would leave the window to a fallback that fits", () => {
    // Anchor near the top: home (above) would cross the top edge; "below" fits.
    const placed = placeLabels([label("top", 1, 500, 10, 80, 16)], [], VIEW);
    expect(placed).toHaveLength(1);
    expect(placed[0].offset).toBe(1);
    expect(placed[0].box.y).toBeGreaterThanOrEqual(0);
  });

  it("a label showing at an edge survives a 1 px drift instead of blinking", () => {
    // Home box top sits exactly 3 px from the window's top: too close for a newcomer (4 px), fine for a shown label (2 px).
    const shown = placeLabels([label("a", 1, 500, 19, 80, 16)], [], VIEW, new Map([["a", 0]]));
    expect(shown.map((p) => p.offset)).toEqual([0]);
    const fresh = placeLabels([label("a", 1, 500, 19, 80, 16)], [], VIEW);
    expect(fresh[0]?.offset).not.toBe(0);
  });

  it("a locality yields to its twin monument card only when the card is drawn", () => {
    const card = label("card", 0, 500, 400);
    const locality = { ...label("loc", 1, 520, 450), yieldsTo: "card" };
    expect(placeLabels([card, locality], [], VIEW).map((p) => p.id)).toEqual(["card"]);
    expect(placeLabels([locality], [], VIEW).map((p) => p.id)).toEqual(["loc"]);
  });

  it("a centred label sits on its point", () => {
    const [p] = placeLabels([{ ...label("c", 1, 500, 400, 80, 20), centred: true }], [], VIEW);
    expect(p.box.y + p.box.h / 2).toBe(400);
    expect(p.box.x + p.box.w / 2).toBe(500);
  });
});

describe("Panaji's labels", () => {
  it("are its monuments and its on-board localities, no locality repeating a monument", () => {
    const map = mapById("panaji")!;
    const labels = labelsForMap(map);
    const names = labels.map((l) => l.name);
    // A name appears twice only as a monument and a locality (Dona Paula): the locality yields to the card.
    for (const name of new Set(names)) {
      const same = labels.filter((l) => l.name === name);
      if (same.length > 1) expect(same.map((l) => l.kind).sort()).toEqual(["landmark", "locality"]);
    }
    for (const name of ["Campal", "Altinho", "Fontainhas", "Miramar", "Taleigao", "St Cruz", "Merces"]) expect(names).toContain(name);
    expect(labels.filter((l) => l.kind === "landmark").length).toBe(map.monuments.length);
    const tiles = new Set(map.tiles.map((t) => `${t.coord.q},${t.coord.r}`));
    for (const l of labels) expect(tiles.has(`${l.q},${l.r}`)).toBe(true);
  });

  it("the Tutorial keeps its own landmark labels", () => {
    const map = mapById("tutorial")!;
    expect(labelsForMap(map).map((l) => l.name)).toEqual(map.landmarks.map((l) => l.name));
  });
});
