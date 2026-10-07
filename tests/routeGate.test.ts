import { describe, expect, it } from "vitest";
import { gateRoute, hashToRoute } from "../src/app/routeGate";
import { REQUIRE_EMAIL, parseFlag } from "../src/services/features";
import { LEVELS } from "../src/levels/levels";

const OFF = { requireEmail: false, registered: false };
const ON_UNREGISTERED = { requireEmail: true, registered: false };
const ON_REGISTERED = { requireEmail: true, registered: true };

/** What the shell does with a pasted URL: parse it, then ask the gate. */
function landing(hash: string, context: typeof OFF): string {
  const route = hashToRoute(hash) ?? { name: "menu" as const };
  const decision = gateRoute(route.name, context);
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
