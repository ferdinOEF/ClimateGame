import { describe, expect, it } from "vitest";
import { fadeTimeConstant, MUSIC_FADE, MUSIC_LEVEL, MusicMachine } from "../src/ui/music";

/** Section 36.2: the music's level, a state machine on an injected clock. */
function machine() {
  let t = 0;
  const m = new MusicMachine(() => t);
  return { m, at: (seconds: number) => (t = seconds) };
}

describe("Section 36.2: the music state machine", () => {
  it("has the briefed levels and fades", () => {
    expect(MUSIC_LEVEL).toEqual({ off: 0, full: 0.35, soft: 0.2 });
    expect(MUSIC_FADE).toEqual({ out: 1.5, in: 4, soft: 1.5, close: 1 });
  });

  it("open, storm begin, storm end, finale, close", () => {
    const { m } = machine();
    expect(m.state).toBe("off");
    m.send("open");
    expect(m.state).toBe("full");
    expect(m.target()).toEqual({ level: 0.35, fade: MUSIC_FADE.in });
    m.send("stormBegin");
    expect(m.state).toBe("off");
    expect(m.target()).toEqual({ level: 0, fade: MUSIC_FADE.out });
    m.send("stormEnd");
    expect(m.state).toBe("full");
    expect(m.target()).toEqual({ level: 0.35, fade: MUSIC_FADE.in });
    m.send("finale");
    expect(m.state).toBe("soft");
    expect(m.target()).toEqual({ level: 0.2, fade: MUSIC_FADE.soft });
    m.send("close");
    expect(m.state).toBe("off");
    expect(m.isOpen).toBe(false);
    expect(m.target()).toEqual({ level: 0, fade: MUSIC_FADE.close });
  });

  it("does nothing while closed (the menu and the level select stay silent)", () => {
    const { m } = machine();
    expect(m.send("stormEnd")).toBe(false);
    expect(m.send("finale")).toBe(false);
    expect(m.send("close")).toBe(false);
    expect(m.state).toBe("off");
  });

  it("a storm ending during the finale leaves it soft; a retried storm goes off and back to full", () => {
    const { m } = machine();
    m.send("open");
    m.send("finale");
    expect(m.send("stormEnd")).toBe(false);
    expect(m.state).toBe("soft");
    const retry = machine().m;
    retry.send("open");
    for (let i = 0; i < 2; i++) {
      retry.send("stormBegin");
      expect(retry.state).toBe("off");
      retry.send("stormEnd");
      expect(retry.state).toBe("full");
    }
  });

  it("each fade reaches its level (within 2%) in its time, and not much sooner", () => {
    const { m, at } = machine();
    m.send("open");
    expect(m.levelAt(0)).toBe(0);
    expect(m.levelAt(MUSIC_FADE.in)).toBeGreaterThan(0.98 * 0.35);
    expect(m.levelAt(MUSIC_FADE.in / 4)).toBeLessThan(0.7 * 0.35);
    at(10);
    m.send("stormBegin");
    expect(m.levelAt(10)).toBeCloseTo(0.35, 3);
    expect(m.levelAt(10 + MUSIC_FADE.out)).toBeLessThan(0.02 * 0.35);
    at(20);
    m.send("stormEnd");
    at(30);
    m.send("finale");
    expect(m.levelAt(30 + MUSIC_FADE.soft)).toBeLessThan(0.2 + 0.02 * 0.15);
    at(40);
    m.send("close");
    expect(m.levelAt(40 + MUSIC_FADE.close)).toBeLessThan(0.02 * 0.2);
    expect(fadeTimeConstant(4)).toBe(1);
  });

  it("a fade started midway carries on from where the level was", () => {
    const { m, at } = machine();
    m.send("open");
    at(1);
    const mid = m.levelAt();
    m.send("stormBegin");
    expect(m.levelAt(1)).toBeCloseTo(mid, 6);
  });
});
