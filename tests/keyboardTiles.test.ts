import { describe, expect, it } from "vitest";
import { nextPulseTile } from "../src/core/keyboardTiles";
import { axialToWorld } from "../src/core/hex";

/** Section 37.6 (C1): O cycles through exactly the pulsing tiles. */
describe("the O key's cycle", () => {
  const pulsing = ["-4,18", "-5,21", "-2,16"];
  const at = (key: string) => {
    const [q, r] = key.split(",").map(Number);
    return axialToWorld({ q, r }, 1.0);
  };

  it("starts with the pulsing tile nearest the middle of the view, then goes in order and round again", () => {
    const centre = at("-2,16");
    let cursor: string | null = null;
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      cursor = nextPulseTile(pulsing, cursor, centre);
      seen.push(cursor!);
    }
    expect(seen).toEqual(["-2,16", "-4,18", "-5,21", "-2,16", "-4,18", "-5,21"]);
    expect(nextPulseTile(pulsing, null, at("-5,21"))).toBe("-5,21");
  });

  it("never leaves the pulsing tiles: from any other tile it goes to the nearest of them", () => {
    for (const from of ["-3,19", "0,0", "-6,22", "10,-4"]) expect(pulsing).toContain(nextPulseTile(pulsing, from, at(from)));
    expect(nextPulseTile(pulsing, "-3,19", at("-4,19"))).toBe("-4,18");
  });

  it("says null when nothing pulses", () => {
    expect(nextPulseTile([], "-4,18", { x: 0, z: 0 })).toBeNull();
  });
});
