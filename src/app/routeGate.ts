import { resolveLevel, type LevelDef } from "@levels/levels";
import type { recordRunResult } from "@services/profileStore";
import type { SubmitResult } from "@services/leaderboard";
import type { SessionResult } from "./gameSession";

/**
 * The shell's routes, how they map to URLs, and the one rule about which of
 * them a player may reach. Kept apart from `AppShell` (which needs a DOM) so
 * all of it can be tested in Node.
 */

export type Route =
  | { name: "menu" }
  | { name: "levels" }
  | { name: "playing"; level: LevelDef }
  | { name: "results"; context: ResultsState }
  | { name: "leaderboard"; levelId?: string }
  | { name: "settings" }
  | { name: "auth"; mode: "signin" | "signup" }
  /**
   * The name/age/email sheet. `then` is what the player was trying to do when
   * the gate intercepted them — carried on the route rather than held in a
   * field, so it cannot outlive the screen that owns it and cannot be left
   * set from a previous visit. `null` means they came from Settings to edit
   * details, and should go back to the menu rather than into a level.
   */
  | { name: "player-setup"; then: { levelId: string } | null };

export interface ResultsState {
  level: LevelDef;
  result: SessionResult;
  delta: ReturnType<typeof recordRunResult>;
  newAchievements: string[];
  submission: Promise<SubmitResult>;
}

/**
 * Routes as URLs.
 *
 * The hash, not the path. Two reasons: the game already uses query
 * parameters for its dev flags (`?debughazards`, `?flood=N`), and keeping
 * routing out of the query string means neither can clobber the other; and a
 * hash cannot 404 on a static host however the rewrites are configured.
 */
export function routeToHash(route: Route): string {
  switch (route.name) {
    case "menu":
      return "#/";
    case "levels":
      return "#/levels";
    case "playing":
      return `#/play/${encodeURIComponent(route.level.id)}`;
    // Addressable so the URL is never lying about what is on screen, but see
    // `hashToRoute`: it is not RESTORABLE, because the results screen is built
    // from a finished run held in memory.
    case "results":
      return "#/results";
    case "leaderboard":
      return route.levelId ? `#/leaderboard/${encodeURIComponent(route.levelId)}` : "#/leaderboard";
    case "settings":
      return "#/settings";
    case "auth":
      return route.mode === "signup" ? "#/signup" : "#/signin";
    case "player-setup":
      return route.then ? `#/start/${encodeURIComponent(route.then.levelId)}` : "#/start";
  }
}

/**
 * The inverse, for a Back press or a pasted link.
 *
 * Returns null for anything unrecognised, which the caller turns into the
 * menu. That covers a typo, a link from an older build, and `#/results` —
 * whose state died with the run that produced it, so landing on the menu is
 * the only honest thing to do.
 */
export function hashToRoute(hash: string): Route | null {
  const path = hash.replace(/^#\/?/, "");
  const [head, tail] = [path.split("/")[0] ?? "", path.split("/").slice(1).join("/")];
  const param = tail ? decodeURIComponent(tail) : undefined;

  switch (head) {
    case "":
      return { name: "menu" };
    case "levels":
      return { name: "levels" };
    case "play": {
      const level = param ? resolveLevel(param) : null;
      // A stale bookmark or an expired daily id. The menu beats a crash, and
      // beats silently starting a different level.
      return level ? { name: "playing", level } : null;
    }
    case "leaderboard":
      return { name: "leaderboard", levelId: param };
    case "settings":
      return { name: "settings" };
    case "signin":
      return { name: "auth", mode: "signin" };
    case "signup":
      return { name: "auth", mode: "signup" };
    case "start":
      return { name: "player-setup", then: param ? { levelId: param } : null };
    default:
      return null;
  }
}

/**
 * What the shell should do with a route before showing it.
 *
 *   - `allow`     show the route.
 *   - `register`  a level was asked for by a player who has not given an
 *                 email, while the email requirement is on: show the sheet,
 *                 then the level.
 *   - `menu`      an account or registration screen was asked for while the
 *                 email requirement is off. Those screens are unreachable from
 *                 the UI then, so a pasted `#/signin`, `#/signup` or `#/start`
 *                 lands on the menu rather than on a form the game says it
 *                 does not need.
 */
export type GateDecision = "allow" | "register" | "menu";

export interface GateContext {
  requireEmail: boolean;
  registered: boolean;
}

export function gateRoute(routeName: string, context: GateContext): GateDecision {
  if (!context.requireEmail) {
    return routeName === "auth" || routeName === "player-setup" ? "menu" : "allow";
  }
  if (routeName === "playing" && !context.registered) return "register";
  return "allow";
}
