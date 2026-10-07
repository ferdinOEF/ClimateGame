import { describe, expect, it } from "vitest";
import { Telemetry } from "../src/core/telemetry";

describe("Telemetry", () => {
  it("logs session_start, then first_action_ms and first_reward_ms exactly once", () => {
    let clock = 1000;
    const seen: string[] = [];
    const telemetry = new Telemetry(() => clock, (event) => seen.push(event.name));
    clock += 4200;
    telemetry.action("build", 1);
    clock += 1000;
    telemetry.action("build", 2);
    telemetry.reward("coin");
    telemetry.reward("combo");
    expect(seen).toEqual(["session_start", "first_action_ms", "action", "action", "first_reward_ms"]);
    expect(telemetry.events[1].data).toEqual({ ms: 4200 });
    expect(telemetry.events[4].data).toMatchObject({ ms: 5200, kind: "coin" });
    expect(telemetry.actions).toBe(2);
  });
});
