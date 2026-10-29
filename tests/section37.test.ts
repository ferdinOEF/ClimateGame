import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Section 37: the playtest fixes, where a source check is the test (the browser checks are in tools/section37Shots.ts). */
const read = (path: string): string => readFileSync(path, "utf8");

describe("Section 37.2: the build menu clear of the bottom banner", () => {
  it("the cards avoid the banner, and the banner hides while a menu is open", () => {
    expect(read("src/app/gameSession.ts")).toMatch(/avoid: \[".panjim-clock".*"\.empty-prompt"/);
    const popover = read("src/ui/buildPopover.ts");
    expect(popover).toContain('this.backdrop.parentElement?.classList.add("build-menu-open");');
    expect(popover).toContain('this.backdrop.parentElement?.classList.remove("build-menu-open");');
    expect(read("src/ui/panjim/panjim.css")).toMatch(/\.has-panjim-clock\.build-menu-open \.empty-prompt \{\s*opacity: 0;\s*visibility: hidden;/);
  });
});

describe("Section 37.5: the camera holds while the player is choosing", () => {
  it("a set move waits while the pointer moved on the board in the last 1.5 s; the player's own moves do not", () => {
    const session = read("src/app/gameSession.ts");
    expect(session).toContain("const POINTER_HOLD_MS = 1500;");
    expect(session).toContain("const pointerChoosing = (now = performance.now()): boolean => pointerOnBoard && now - pointerMovedAt < POINTER_HOLD_MS;");
    expect(session).toContain("if (buildPopover.isOpen || (!asked && pointerChoosing())) pendingCameraMove = move;");
    expect(session).toContain("if (pendingCameraMove && !buildPopover.isOpen && !pointerChoosing(nowMs)) {");
    // O (the keyboard) and a row of the objective are the player's own: never held.
    expect(session).toContain("moveCameraClear([cursor], undefined, true);");
    expect(read("src/app/panjimController.ts")).toContain("this.host.moveCamera((keys.length ? keys : [key]).map(coordOf), coordOf(key), true);");
    // The storm director's camera and the result cards' are not set moves: unchanged.
    expect(session).toContain("focusOn: (x, z) => focusOn(x, z, false),");
  });
});

describe("Section 37.6: O and the card menu by keyboard", () => {
  it("O goes through the pulsing tiles only; the menu opens on the objective's card; Down and Up move; the ring is drawn over the pulse", () => {
    const session = read("src/app/gameSession.ts");
    expect(session).toContain("const nextKey = nextPulseTile(objectivePulse.tiles, here === oCursor ? here : null, focusPoint());");
    const popover = read("src/ui/buildPopover.ts");
    expect(popover).toContain('if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;');
    expect(read("src/app/panjimController.ts")).toContain('.build-popover .build-card:not(.disabled) .objective-chip")?.closest<HTMLElement>(".build-card");');
    const hover = read("src/render/tileHover.ts");
    expect(hover).toContain("this.mesh.renderOrder = on ? 12 : 5;");
    expect(hover).toContain("material.depthTest = !on;");
  });
});
