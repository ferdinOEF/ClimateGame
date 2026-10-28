# Section 34b: the bots on the Campal wind rule (owner, 28 October 2026)

The rule: in the 2030 cyclone and the 2050 cyclone and flood, the wind reaches only the tiles within 2 of a beach tile
that can take pandanus (`wind.sandReachHex: 2`, `src/data/hazardModel.json`); the water is unchanged. 200 seeds a
style, `tools/panjimBots/tune21.ts seeds=200 jobs=4` (and `styles=guided`), run from a copy of the source. "Before" is
the branch just before the rule (`bots-after.md`, `bots-after-13-guided.md`); "after" is with it
(`bots-after-wind.md`, `bots-after-wind-guided.md`). Homes saved: of the homes still standing when each storm hit.

## Homes saved, mean, a storm (before -> after)

| Style | 2030 cyclone | 2040 monsoon flood | 2050 cyclone and flood | Whole run | Stars of 9 | Clears |
|---|---|---|---|---|---|---|
| nature | 99% -> 99% | 81% -> 81% | 67% -> 68% | 76% -> 76% | 7.0 -> 7.0 | 100% -> 100% |
| smart | 98% -> 99% | 82% -> 82% | 76% -> 82% | 80% -> 83% | 6.3 -> 6.4 | 96% -> 98% |
| guided | 100% -> 100% | 84% -> 84% | 79% -> 81% | 83% -> 84% | 6.5 -> 6.6 | 100% -> 100% |
| best (bot) | 100% -> 100% | 93% -> 93% | 85% -> 90% | 90% -> 92% | 6.8 -> 7.3 | 100% -> 100% |
| seawalls | | | | | 2.0 -> 2.0 | 0% -> 0% |
| random | | | | | 0.5 -> 0.5 | 0% -> 0% |
| far | | | | | 0.0 -> 0.0 | 0% -> 0% |

## The owner's checks

| Check | Result |
|---|---|
| 2050 stays the hardest storm for nature | Yes: 68% saved against 81% (2040) and 99% (2030). |
| ... for smart | Yes by stars, level on homes: 82% saved in 2050 and in 2040, but no seed takes 3 stars in 2050 (2040: 25%; 2-star 98% against 76%). |
| ... for guided | Yes: 81% against 84% and 100%. |
| ... for best | The best bot, yes: 90% against 93% and 100%. The solver, **no longer clearly**: 4 homes lost in 2050 and in 2040 (below). |
| Guided 2050 stars must not fall | They rise: 2 stars 100% -> 93%, 3 stars 1% -> 8% of seeds (mean 2.01 -> 2.08 stars). |
| The sheltered centre stays untouched | Yes: no tile farther than 2 from a pandanus beach takes any wind (`tests/wind.test.ts`, and the fuzz's "wind only near the beach" check on every storm of every run). |
| The "Plant 2 pandanus on the Campal beach" row | **Never offered.** After the phase's picks, the 2050 wind reaches six homes ((4,11), (3,12), (3,13), (2,14), (1,15), (2,15)), and each of them is lost to the water alone (3 to 10 m deep), so pandanus saves no home there and the still helps rule does not offer it. |

The rule makes the cyclones a little easier wherever homes stood away from the beach (they no longer take wind):
smart's clear rate goes back from 96% to 98%; nature, guided and best clear every seed as before.

## The best plan (the solver)

`npm run bestplan -- beam=20 jobs=4 seed=tools/bestPlan/seed34bWind.json` (3653 s; `best_plan.md`, `best_plan.json`;
the seed is the branch's earlier best plan). `tests/bestPlan.test.ts` replays it headless: same stars and homes saved.

| Storm | Before: stars, homes saved (lost) | After: stars, homes saved (lost) |
|---|---|---|
| 2030 cyclone | 3, 8 of 9 (1) | 3, 8 of 9 (1) |
| 2040 monsoon flood | 3, 53 of 57 (4) | 3, 53 of 57 (4) |
| 2050 cyclone and flood | 3, 51 of 59 (8) | 3, 55 of 59 (4) |
| Whole run | 9 of 9, 13 lost | **9 of 9, 9 lost** |

**For the solver, 2050 is no longer clearly the hardest storm:** it now loses 4 homes, as 2040 does (93.2% saved
against 93.0%); the 2030 cyclone's one home of nine is a smaller share (89%), as before the rule. The 2050 storm's four
are water alone near Campal and Santa Inez ((3,12), (4,11), (3,13), (2,14)): "Even 3 more builds before that storm save
0 of them". For the bots (above) 2050 stays the hardest. The owner decides whether that is acceptable; no storm
strength or hazard number was changed to restore it.
