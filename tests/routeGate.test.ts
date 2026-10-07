import { describe, expect, it } from "vitest";
import { gateRoute, hashToRoute } from "../src/app/routeGate";
import { REQUIRE_EMAIL, SHOW_MENU_EXTRAS, parseFlag } from "../src/services/features";
import { LEVELS, dailyChallengeLevel } from "../src/levels/levels";

// The email-requirement cases keep the menu extras on, so the leaderboard and
// settings routes test only the email rule; the extras have their own block.
const OFF = { requireEmail: false, registered: false, showMenuExtras: true };
const ON_UNREGISTERED = { requireEmail: true, registered: false, showMenuExtras: true };
const ON_REGISTERED = { requireEmail: true, registered: true, showMenuExtras: true };
const DEFAULT_BUILD = { requireEmail: false, registered: false, showMenuExtras: false };

/** What the shell does with a pasted URL: parse it, then ask the gate. */
function landing(hash: string, context: typeof OFF): string {
  const route = hashToRoute(hash) ?? { name: "menu" as const };
  const decision = gateRoute(route, context);
  if (decision === "menu") return "menu";
  if (decision === "register") return "player-setup";
  return route.name;
}

describe("REQUIRE_EMAIL flag", () => {
  it("is off by default", () => {
    expect(REQUIRE_EMAIL).toBe(false);
  });

  it("turns on only for the exact string \"true\"", () => {
    expect(parseFlag("true")).toBe(true);
    expect(parseFlag(" true ")).toBe(true);
    for (const value of [undefined, "", "false", "TRUE", "1", "yes", true]) expect(parseFlag(value)).toBe(false);
  });
});

describe("route gate with the email requirement OFF", () => {
  const levelId = LEVELS[1].id;

  it("starts a pasted #/play link directly, with no registration", () => {
    expect(landing(`#/play/${levelId}`, OFF)).toBe("playing");
    const route = hashToRoute(`#/play/${levelId}`);
    expect(route?.name === "playing" && route.level.id).toBe(levelId);
  });

  it("sends pasted sign-in, sign-up and registration links to the menu", () => {
    for (const hash of ["#/signin", "#/signup", "#/start", `#/start/${levelId}`]) {
      expect(landing(hash, OFF)).toBe("menu");
    }
  });

  it("leaves every other screen alone", () => {
    for (const [hash, name] of [["#/", "menu"], ["#/levels", "levels"], ["#/settings", "settings"], ["#/leaderboard", "leaderboard"]]) {
      expect(landing(hash, OFF)).toBe(name);
    }
  });
});

describe("route gate with the email requirement ON", () => {
  const levelId = LEVELS[1].id;

  it("intercepts a level for an unregistered player with the registration sheet", () => {
    expect(landing(`#/play/${levelId}`, ON_UNREGISTERED)).toBe("player-setup");
  });

  it("lets a registered player straight in", () => {
    expect(landing(`#/play/${levelId}`, ON_REGISTERED)).toBe("playing");
  });

  it("keeps the sign-in and registration screens reachable", () => {
    expect(landing("#/signin", ON_UNREGISTERED)).toBe("auth");
    expect(landing("#/signup", ON_UNREGISTERED)).toBe("auth");
    expect(landing(`#/start/${levelId}`, ON_UNREGISTERED)).toBe("player-setup");
  });
});

describe("SHOW_MENU_EXTRAS flag", () => {
  it("is off by default", () => {
    expect(SHOW_MENU_EXTRAS).toBe(false);
  });
});

describe("route gate with the menu extras OFF (the default build)", () => {
  it("sends pasted leaderboard, settings and daily links to the menu", () => {
    // Today's id, which resolves to a real level, so the gate (not a failed
    // lookup) is what sends it to the menu.
    const daily = `#/play/${dailyChallengeLevel().id}`;
    expect(hashToRoute(daily)?.name).toBe("playing");
    for (const hash of ["#/leaderboard", `#/leaderboard/${LEVELS[1].id}`, "#/settings", daily]) {
      expect(landing(hash, DEFAULT_BUILD)).toBe("menu");
    }
    expect(gateRoute({ name: "playing", level: { id: "daily-2026-10-07" } }, DEFAULT_BUILD)).toBe("menu");
  });

  it("still allows the menu, the level list and every campaign level", () => {
    expect(landing("#/", DEFAULT_BUILD)).toBe("menu");
    expect(landing("#/levels", DEFAULT_BUILD)).toBe("levels");
    for (const level of LEVELS) expect(landing(`#/play/${level.id}`, DEFAULT_BUILD)).toBe("playing");
  });

  it("allows the daily challenge again with the extras on", () => {
    expect(landing(`#/play/${dailyChallengeLevel().id}`, OFF)).toBe("playing");
    expect(landing("#/leaderboard", OFF)).toBe("leaderboard");
    expect(landing("#/settings", OFF)).toBe("settings");
  });
});
