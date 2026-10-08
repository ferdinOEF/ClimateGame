/**
 * Play telemetry for the Panjim 2050 run: a local event log, nothing sent
 * anywhere.
 *
 * It exists to answer questions about pacing that a test cannot: how long a
 * player waited before their first action, how long before the game first
 * rewarded them, how much of a run went to fast-forwarding. The session
 * mirrors every event to `console.info` and to `window.__telemetry`, so a
 * playtest or a headless run can read the log back without a network.
 *
 * Pure on purpose (the clock is injected), so the bots in tools/ and the
 * tests can drive it with simulated time.
 */
export type TelemetryEventName =
  | "session_start"
  | "first_action_ms"
  | "first_reward_ms"
  | "action"
  | "fast_forward"
  | "request_complete"
  | "challenge_start"
  | "challenge_end"
  | "checkpoint"
  | "run_end"
  | "quality_auto";

export interface TelemetryEvent {
  name: TelemetryEventName;
  /** Milliseconds since `session_start`. */
  t: number;
  data: Record<string, unknown>;
}

export class Telemetry {
  readonly events: TelemetryEvent[] = [];
  private readonly t0: number;
  private firstActionSeen = false;
  private firstRewardSeen = false;
  private actionCount = 0;

  constructor(
    private readonly now: () => number,
    private readonly sink: (event: TelemetryEvent) => void = () => {},
    startData: Record<string, unknown> = {}
  ) {
    this.t0 = now();
    this.emit("session_start", startData);
  }

  /** Milliseconds since the session started. */
  elapsed(): number {
    return this.now() - this.t0;
  }

  get actions(): number {
    return this.actionCount;
  }

  /** A time-costing player action. The first one also logs `first_action_ms`. */
  action(type: string, quarters: number): void {
    this.actionCount++;
    if (!this.firstActionSeen) {
      this.firstActionSeen = true;
      this.emit("first_action_ms", { ms: this.elapsed() });
    }
    this.emit("action", { type, quarters });
  }

  /** Anything that hands the player a reward: a coin pop, a combo, a request. The first one logs `first_reward_ms`. */
  reward(kind: string): void {
    if (this.firstRewardSeen) return;
    this.firstRewardSeen = true;
    this.emit("first_reward_ms", { ms: this.elapsed(), kind });
  }

  emit(name: TelemetryEventName, data: Record<string, unknown> = {}): void {
    const event: TelemetryEvent = { name, t: Math.round(this.elapsed()), data };
    this.events.push(event);
    this.sink(event);
  }
}
