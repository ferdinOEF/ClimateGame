import { describe, expect, it } from "vitest";
import { GameState } from "../src/core/gameState";
import { resolveMonsoonFlood, resolveCyclone } from "../src/core/hazard";
import { neighbor, axialKey } from "../src/core/hex";

const RIVER = { q: 0, r: 0 };

function freshState(): GameState {
  const state = new GameState([{ coord: RIVER, terrainId: "river" }]);
  state.coin = 500;
  return state;
}

/** Backdates a just-built defense's construction turn so it reads as fully matured. */
function forceMature(state: GameState, coord: { q: number; r: number }): void {
  const inst = state.elements.get(axialKey(coord));
  if (inst) inst.builtOnTurn = -1000;
}

describe("resolveMonsoonFlood — no defense", () => {
  it("deals full decayed severity to an undefended downstream tile", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "beach");

    const result = resolveMonsoonFlood(state, 1.0);
    expect(result.tileDamage.get(axialKey(target))).toBeCloseTo(0.72, 5);
    expect(result.destroyedDefenses).toHaveLength(0);
    expect(result.overwhelmedDefenses).toHaveLength(0);
  });

  it("decays with distance from the river (v2.2: no elevation gating, just adjacency-based spread)", () => {
    const state = freshState();
    const near = neighbor(RIVER, 0);
    const far = neighbor(near, 0);
    state.debugForcePlace(near, "beach");
    state.debugForcePlace(far, "beach");

    const result = resolveMonsoonFlood(state, 1.0);
    const nearDamage = result.tileDamage.get(axialKey(near))!;
    const farDamage = result.tileDamage.get(axialKey(far))!;
    expect(farDamage).toBeLessThan(nearDamage);
  });
});

describe("resolveMonsoonFlood — NBS (mangrove)", () => {
  it("reduces damage below the undefended amount when not overwhelmed", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "estuary");
    expect(state.build(target, "mangrove")).toBe(true);
    forceMature(state, target);

    const result = resolveMonsoonFlood(state, 1.0); // arrives at 0.72, well under overwhelmSeverity 1.4
    const dealt = result.tileDamage.get(axialKey(target))!;

    expect(dealt).toBeLessThan(0.72);
    expect(dealt).toBeCloseTo(0.72 * (1 - 0.55), 5);
    expect(state.elements.has(axialKey(target))).toBe(true); // never destroyed
    expect(result.overwhelmedDefenses).toHaveLength(0);
  });

  it("gets overwhelmed above its threshold but survives (no catastrophic failure)", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "estuary");
    state.build(target, "mangrove");
    forceMature(state, target);

    const result = resolveMonsoonFlood(state, 3.0); // arrives at 2.16, over overwhelmSeverity 1.4
    const key = axialKey(target);

    expect(result.overwhelmedDefenses).toContain(key);
    expect(result.destroyedDefenses).toHaveLength(0);
    expect(state.elements.has(key)).toBe(true); // still standing
    // NBS overwhelm is temporary only — no permanent degrade recorded.
    expect(state.elements.get(key)!.degradeAmount).toBe(0);
  });
});

describe("resolveMonsoonFlood — engineered (small dam)", () => {
  it("draws down its reservoir first, then absorbs the overflow and survives below its failure threshold (STEP_PROMPT_small_dam_reservoir.md)", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "river");
    state.build(target, "small_dam");

    // A Small Dam sits directly on its own river tile (Section 4), which
    // makes that tile a flood source in its own right (every river tile
    // is), not a downstream tile reached via propagation — so it engages
    // at the full, undecayed baseSeverity, not baseSeverity*FLOOD_DECAY.
    //
    // STEP_PROMPT_small_dam_reservoir.md: the buffer draws down BEFORE the
    // absorption/breach math now, same reservoir-first order as Khazan.
    // volume = 1.0*10000*0.15 = 1500 m3; the 800 m3 buffer (empty) absorbs
    // 800 of it, leaving overflowVolume=700 -> overflowSeverity =
    // 1.0*(700/1500) = 0.4667, still well under failureThreshold (1.15),
    // so it falls to the plain absorption branch against THAT figure, not
    // the raw incoming 1.0.
    const result = resolveMonsoonFlood(state, 1.0); // 1.0, and 0.4667 post-buffer overflow, both under failureThreshold 1.15
    const key = axialKey(target);

    const expectedOverflowSeverity = 1.0 * ((1500 - 800) / 1500);
    expect(result.tileDamage.get(key)).toBeCloseTo(expectedOverflowSeverity * (1 - 0.75), 5);
    expect(result.destroyedDefenses).toHaveLength(0);
    expect(state.elements.has(key)).toBe(true);
  });

  it("reduces downstream flood damage relative to an undefended river source — helps, not hurts (STEP_PROMPT_visuals_map_river.md item 3: resilience sign flip)", () => {
    const withDam = freshState();
    const damTarget = neighbor(RIVER, 0);
    withDam.debugForcePlace(damTarget, "beach");
    withDam.build(RIVER, "small_dam");

    const withoutDam = freshState();
    const bareTarget = neighbor(RIVER, 0);
    withoutDam.debugForcePlace(bareTarget, "beach");
    // (no build — matches "resolveMonsoonFlood — no defense"'s baseline above)

    const resultWithDam = resolveMonsoonFlood(withDam, 1.0);
    const resultWithoutDam = resolveMonsoonFlood(withoutDam, 1.0);

    const downstreamWithDam = resultWithDam.tileDamage.get(axialKey(damTarget))!;
    const downstreamWithoutDam = resultWithoutDam.tileDamage.get(axialKey(bareTarget))!;
    expect(downstreamWithDam).toBeLessThan(downstreamWithoutDam);
  });

  it("catastrophically fails above threshold (tested against post-buffer overflow, not raw severity) and redirects an amplified overflow onward (STEP_PROMPT_small_dam_reservoir.md)", () => {
    // With the dam: destroyed, and the tile behind it takes MORE damage
    // than an equivalent undefended run — the "safe until, spectacularly,
    // it isn't" behavior the brief calls for.
    const withDefense = freshState();
    const damTile = neighbor(RIVER, 0);
    const downstreamTile = neighbor(damTile, 0);
    withDefense.debugForcePlace(damTile, "river");
    withDefense.debugForcePlace(downstreamTile, "beach");
    withDefense.build(damTile, "small_dam");

    // volume = 2.0*10000*0.15 = 3000 m3; the empty 800 m3 buffer absorbs
    // 800, leaving overflowVolume=2200 -> overflowSeverity =
    // 2.0*(2200/3000) = 1.4667 — over failureThreshold (1.15), so THIS is
    // what the breach test (and the redirected passthrough) is now
    // computed from, not the raw incoming 2.0.
    const resultWithDefense = resolveMonsoonFlood(withDefense, 2.0);
    const damKey = axialKey(damTile);
    const downKey = axialKey(downstreamTile);
    const expectedOverflowSeverity = 2.0 * ((3000 - 800) / 3000);

    expect(resultWithDefense.destroyedDefenses).toContain(damKey);
    expect(withDefense.elements.has(damKey)).toBe(false);
    expect(resultWithDefense.tileDamage.get(damKey)).toBeCloseTo(expectedOverflowSeverity, 5); // post-buffer overflow severity, not the raw incoming severity — the reservoir still drew down first even though the dam went on to breach

    const control = freshState();
    control.debugForcePlace(damTile, "river");
    control.debugForcePlace(downstreamTile, "beach");
    // No defense built at all in the control run.
    const resultControl = resolveMonsoonFlood(control, 2.0);

    expect(resultWithDefense.tileDamage.get(downKey)!).toBeGreaterThan(resultControl.tileDamage.get(downKey)!);
  });
});

describe("resolveMonsoonFlood — hybrid (khazan): flood-buffer reservoir (STEP_PROMPT_hazard_science.md Section 4)", () => {
  function setupKhazan(state: GameState, target: { q: number; r: number }): void {
    state.debugForcePlace(target, "estuary");
    state.build(target, "khazan");
    forceMature(state, target);
  }

  it("fully absorbs a small event within its buffer capacity — no damage, nothing propagates onward", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    setupKhazan(state, target);
    const key = axialKey(target);

    // Arrives at 1.0*0.72=0.72 (river->estuary, general decay) -> volume =
    // 0.72*10000*0.15=1080 m3, comfortably within the empty 1500 m3 buffer.
    const result = resolveMonsoonFlood(state, 1.0);
    expect(result.tileDamage.has(key)).toBe(false);
    expect(result.overwhelmedDefenses).toHaveLength(0);
  });

  it("passes the overflow through the normal absorption/overwhelm math once the buffer is exhausted", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    setupKhazan(state, target);
    const key = axialKey(target);

    // Arrives at 5.0*0.72=3.6 -> volume=5400 m3, well past the 1500 m3 buffer.
    const result = resolveMonsoonFlood(state, 5.0);
    expect(result.tileDamage.get(key)).toBeGreaterThan(0);
    expect(result.destroyedDefenses).toHaveLength(0); // Khazan never catastrophically fails, only degrades
    expect(state.elements.has(key)).toBe(true);
  });

  it("the buffer no longer recovers on its own between turns — back-to-back and turn-spaced repeats of the same event now land identically (STEP_PROMPT_manual_only_mode.md removed the automatic per-turn recovery)", () => {
    const backToBack = freshState();
    const target1 = neighbor(RIVER, 0);
    setupKhazan(backToBack, target1);
    const key1 = axialKey(target1);
    resolveMonsoonFlood(backToBack, 5.0); // first event fills the buffer
    const secondImmediate = resolveMonsoonFlood(backToBack, 5.0); // no turns passed

    const spaced = freshState();
    const target2 = neighbor(RIVER, 0);
    setupKhazan(spaced, target2);
    const key2 = axialKey(target2);
    resolveMonsoonFlood(spaced, 5.0); // the same first event
    for (let i = 0; i < 5; i++) spaced.advanceTurn(); // several turns pass, but nothing recovers the buffer anymore
    const secondSpaced = resolveMonsoonFlood(spaced, 5.0);

    // Only a real triggered Flood (drawDownFloodBuffer()) changes
    // floodBufferFilled now — advanceTurn() no longer does, so turns
    // passing between events makes no difference to the outcome.
    expect(secondImmediate.tileDamage.get(key1)!).toBeCloseTo(secondSpaced.tileDamage.get(key2)!, 5);
  });
});

describe("River-channel funneling (STEP_PROMPT_hazard_science.md Section 2)", () => {
  it("a Storm Surge Wave reaches meaningfully stronger up a River channel than over the same hop count of Beach/Land", () => {
    const state = new GameState([{ coord: { q: 0, r: 0 }, terrainId: "estuary" }]);
    state.coin = 500;
    const origin = { q: 0, r: 0 };

    // Direction 0 chains straight along one axis; direction 1 chains along
    // a different one, so the two 3-hop paths never overlap.
    const river1 = neighbor(origin, 0);
    const river2 = neighbor(river1, 0);
    const river3 = neighbor(river2, 0);
    state.debugForcePlace(river1, "river");
    state.debugForcePlace(river2, "river");
    state.debugForcePlace(river3, "river");

    const beach1 = neighbor(origin, 1);
    const beach2 = neighbor(beach1, 1);
    const beach3 = neighbor(beach2, 1);
    state.debugForcePlace(beach1, "beach");
    state.debugForcePlace(beach2, "beach");
    state.debugForcePlace(beach3, "beach");

    const result = resolveCyclone(state, 1.0);
    const riverDamage = result.tileDamage.get(axialKey(river3));
    const beachDamage = result.tileDamage.get(axialKey(beach3));

    expect(riverDamage, "the far river tile should still be reachable at all").toBeDefined();
    expect(beachDamage, "the far beach tile should still be reachable at all").toBeDefined();
    expect(riverDamage!).toBeGreaterThan(beachDamage!);
  });
});

describe("Flood — two-sided compound mechanic (STEP_PROMPT_hazard_science.md Section 3)", () => {
  interface Channel {
    state: GameState;
    /** A Beach tile just off the river tile nearest the Estuary — the actual measurement point, since an untouched River tile is itself exempt from damage (it's the channel/source, not a victim; see "resolveMonsoonFlood — no defense" above) and so never appears in tileDamage no matter how severe the wave passing through it is. */
    nearEstuaryShore: { q: number; r: number };
    /** Likewise, a Beach tile just off the river's midpoint — where the two fronts' effects should overlap. */
    midpointShore: { q: number; r: number };
  }

  /** Estuary at the origin, then a 4-tile River chain running inland: nearEstuary (the downstream/tidal source when active) - midpoint - farther - upstream (the always-active upstream source), each with its own Beach offshoot to actually measure damage at. */
  function buildChannel(): Channel {
    const estuary = { q: 0, r: 0 };
    const state = new GameState([{ coord: estuary, terrainId: "estuary" }]);
    state.coin = 500;
    const nearEstuary = neighbor(estuary, 0);
    const midpoint = neighbor(nearEstuary, 0);
    const farther = neighbor(midpoint, 0);
    const upstream = neighbor(farther, 0);
    state.debugForcePlace(nearEstuary, "river");
    state.debugForcePlace(midpoint, "river");
    state.debugForcePlace(farther, "river");
    state.debugForcePlace(upstream, "river");

    // Direction 1 branches off the river chain without re-joining it.
    const nearEstuaryShore = neighbor(nearEstuary, 1);
    const midpointShore = neighbor(midpoint, 1);
    state.debugForcePlace(nearEstuaryShore, "beach");
    state.debugForcePlace(midpointShore, "beach");

    return { state, nearEstuaryShore, midpointShore };
  }

  it("triggered alone (no concurrent surge), only carries the upstream-to-sea direction — the shore near the Estuary is reached via multiply-decayed propagation, not a fresh nearby source", () => {
    const { state, nearEstuaryShore } = buildChannel();
    const result = resolveMonsoonFlood(state, 1.0, false);
    const dealt = result.tileDamage.get(axialKey(nearEstuaryShore));
    expect(dealt).toBeDefined();
    // Reached via 3 river-channel hops (0.82 each) plus one general-decay
    // hop off the channel (0.72) from the upstream source — meaningfully
    // less than even a single fresh-source-to-adjacent-shore hop (0.72)
    // would read on its own.
    expect(dealt!).toBeLessThan(0.72);
  });

  it("a compound event (Flood + concurrent Storm Surge Wave) hits the near-Estuary shore harder than Flood alone at the same severity", () => {
    const solo = buildChannel();
    const soloResult = resolveMonsoonFlood(solo.state, 1.0, false);

    const compound = buildChannel();
    const compoundResult = resolveMonsoonFlood(compound.state, 1.0, true);

    const soloDealt = soloResult.tileDamage.get(axialKey(solo.nearEstuaryShore))!;
    const compoundDealt = compoundResult.tileDamage.get(axialKey(compound.nearEstuaryShore))!;
    expect(compoundDealt).toBeGreaterThan(soloDealt);
  });

  it("the compound overlap zone fares worse than the same spot would under the upstream front alone", () => {
    const compound = buildChannel();
    const compoundResult = resolveMonsoonFlood(compound.state, 1.0, true);
    const compoundMidpoint = compoundResult.tileDamage.get(axialKey(compound.midpointShore))!;

    const solo = buildChannel();
    const soloResult = resolveMonsoonFlood(solo.state, 1.0, false);
    const soloMidpoint = soloResult.tileDamage.get(axialKey(solo.midpointShore))!;

    expect(compoundMidpoint).toBeGreaterThan(soloMidpoint);
  });
});

describe("Maintenance neglect (Section 5's khazan/engineered upkeep tradeoff) — automatic degrade removed by STEP_PROMPT_manual_only_mode.md", () => {
  it("no longer weakens a defense from unpaid upkeep on its own — degradeAmount only changes via an actual triggered hazard's graceful-degrade path", () => {
    const state = freshState();
    const target = neighbor(RIVER, 0);
    state.debugForcePlace(target, "estuary");
    state.build(target, "khazan");
    const key = axialKey(target);
    expect(state.elements.get(key)!.degradeAmount).toBe(0);

    state.coin = 0; // can't afford upkeep, if advanceTurn() still charged it — it no longer does
    state.advanceTurn();

    expect(state.elements.get(key)!.degradeAmount).toBe(0);
  });
});
