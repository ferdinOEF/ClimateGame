
> riptide-rising@1.0.0 bots
> tsx tools/panjimBots/index.ts

## Archetypes

20 seeds: bot-seed-1, bot-seed-2, bot-seed-3, bot-seed-4, bot-seed-5, bot-seed-6, bot-seed-7, bot-seed-8, bot-seed-9, bot-seed-10, bot-seed-11, bot-seed-12, bot-seed-13, bot-seed-14, bot-seed-15, bot-seed-16, bot-seed-17, bot-seed-18, bot-seed-19, bot-seed-20

A run is **won** when the level ends on three stars (the storms' stars averaged and rounded: at most one storm short of three stars, none below two). **2★ every storm** is the softer reading: every storm at two stars or more.

| Archetype | Won | 2★ every storm | Houses saved (all storms) | min | median | max | Stars per storm (mean) | Index (mean) |
|---|---|---|---|---|---|---|---|---|
| casual | 0/20 (0%) | 0/20 | 70% | 64% | 70% | 81% | 1.0 / 3.0 / 2.0 | 55 |
| greedy | 0/20 (0%) | 0/20 | 25% | 11% | 26% | 57% | 1.1 / 1.1 / 1.1 | 43 |
| smart | 16/20 (80%) | 16/20 | 91% | 69% | 92% | 97% | 2.6 / 3.0 / 3.0 | 55 |
| far | 0/20 (0%) | 0/20 | 0% | 0% | 0% | 0% | 1.0 / 1.0 / 1.0 | 24 |

Greedy beats Casual on 0 of 20 seeds.

## How often the wind decides a home (Section 12)

Homes lost whose water alone stayed under the house-loss line: the wind tipped them. Mean per run, and as a share of the homes lost in that storm.

| Archetype | 2030 cyclone | 2040 flood | 2050 compound |
|---|---|---|---|
| casual | 0.0 (0%) | 0.0 (0%) | 0.6 (2%) |
| greedy | 0.0 (0%) | 0.0 (0%) | 1.0 (1%) |
| smart | 0.0 (0%) | 0.0 (0%) | 0.0 (0%) |
| far | 0.0 (0%) | 0.0 (0%) | 1.0 (1%) |

## Every run

| Archetype | Seed | Storm 1 saved | Storm 2 saved | Storm 3 saved | All | Stars | Won | Builds | Resilience | Biodiversity | Population | Food |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casual | bot-seed-1 | 3/8 | 54/62 | 75/106 | 75% | 132 | no | 25 | 68 | 13 | 46 | 36 |
| casual | bot-seed-2 | 3/8 | 57/62 | 72/106 | 75% | 132 | no | 25 | 68 | 25 | 45 | 39 |
| casual | bot-seed-3 | 3/8 | 52/62 | 60/106 | 65% | 132 | no | 25 | 62 | 17 | 44 | 43 |
| casual | bot-seed-4 | 3/8 | 46/62 | 64/106 | 64% | 122 | no | 25 | 62 | 8 | 44 | 34 |
| casual | bot-seed-5 | 3/8 | 57/62 | 57/106 | 66% | 132 | no | 25 | 63 | 40 | 44 | 44 |
| casual | bot-seed-6 | 3/8 | 56/62 | 72/106 | 74% | 132 | no | 25 | 68 | 20 | 45 | 36 |
| casual | bot-seed-7 | 3/8 | 57/62 | 80/106 | 80% | 132 | no | 25 | 71 | 25 | 46 | 42 |
| casual | bot-seed-8 | 3/8 | 60/62 | 74/106 | 78% | 132 | no | 25 | 70 | 3 | 45 | 39 |
| casual | bot-seed-9 | 3/8 | 54/62 | 64/106 | 69% | 132 | no | 25 | 64 | 0 | 44 | 34 |
| casual | bot-seed-10 | 3/8 | 55/62 | 66/106 | 70% | 132 | no | 25 | 65 | 28 | 45 | 43 |
| casual | bot-seed-11 | 3/8 | 55/62 | 61/106 | 68% | 132 | no | 25 | 64 | 23 | 44 | 46 |
| casual | bot-seed-12 | 3/8 | 56/62 | 55/106 | 65% | 132 | no | 25 | 62 | 28 | 44 | 41 |
| casual | bot-seed-13 | 3/8 | 56/62 | 64/106 | 70% | 132 | no | 25 | 65 | 12 | 44 | 40 |
| casual | bot-seed-14 | 3/8 | 55/62 | 84/106 | 81% | 133 | no | 25 | 72 | 10 | 46 | 35 |
| casual | bot-seed-15 | 3/8 | 61/62 | 62/106 | 72% | 132 | no | 25 | 66 | 18 | 44 | 40 |
| casual | bot-seed-16 | 3/8 | 53/62 | 59/106 | 65% | 132 | no | 25 | 62 | 28 | 44 | 40 |
| casual | bot-seed-17 | 3/8 | 52/62 | 58/106 | 64% | 132 | no | 25 | 62 | 43 | 44 | 49 |
| casual | bot-seed-18 | 3/8 | 56/62 | 62/106 | 69% | 132 | no | 25 | 64 | 42 | 44 | 40 |
| casual | bot-seed-19 | 3/8 | 50/62 | 59/106 | 64% | 132 | no | 25 | 61 | 18 | 44 | 43 |
| casual | bot-seed-20 | 3/8 | 56/62 | 73/106 | 75% | 132 | no | 25 | 68 | 52 | 45 | 48 |
| greedy | bot-seed-1 | 0/8 | 44/62 | 57/106 | 57% | 122 | no | 25 | 47 | 53 | 44 | 62 |
| greedy | bot-seed-2 | 0/8 | 10/62 | 41/106 | 29% | 111 | no | 25 | 34 | 0 | 42 | 24 |
| greedy | bot-seed-3 | 0/8 | 9/62 | 36/106 | 26% | 111 | no | 25 | 31 | 0 | 42 | 27 |
| greedy | bot-seed-4 | 7/8 | 17/62 | 18/106 | 24% | 311 | no | 25 | 48 | 8 | 40 | 29 |
| greedy | bot-seed-5 | 0/8 | 25/62 | 25/106 | 28% | 111 | no | 25 | 27 | 2 | 41 | 37 |
| greedy | bot-seed-6 | 0/8 | 18/62 | 10/106 | 16% | 111 | no | 25 | 16 | 10 | 39 | 48 |
| greedy | bot-seed-7 | 0/8 | 13/62 | 43/106 | 32% | 111 | no | 25 | 36 | 0 | 42 | 24 |
| greedy | bot-seed-8 | 0/8 | 16/62 | 24/106 | 23% | 111 | no | 25 | 24 | 0 | 41 | 32 |
| greedy | bot-seed-9 | 0/8 | 21/62 | 18/106 | 22% | 111 | no | 25 | 22 | 0 | 40 | 32 |
| greedy | bot-seed-10 | 0/8 | 27/62 | 28/106 | 31% | 111 | no | 25 | 29 | 17 | 41 | 46 |
| greedy | bot-seed-11 | 0/8 | 21/62 | 19/106 | 23% | 111 | no | 25 | 22 | 0 | 40 | 29 |
| greedy | bot-seed-12 | 2/8 | 14/62 | 17/106 | 19% | 111 | no | 25 | 27 | 60 | 40 | 59 |
| greedy | bot-seed-13 | 0/8 | 36/62 | 32/106 | 39% | 121 | no | 25 | 34 | 43 | 41 | 55 |
| greedy | bot-seed-14 | 2/8 | 3/62 | 17/106 | 13% | 111 | no | 25 | 23 | 0 | 40 | 14 |
| greedy | bot-seed-15 | 2/8 | 23/62 | 22/106 | 27% | 111 | no | 25 | 33 | 0 | 40 | 38 |
| greedy | bot-seed-16 | 2/8 | 28/62 | 14/106 | 25% | 111 | no | 25 | 30 | 2 | 40 | 35 |
| greedy | bot-seed-17 | 0/8 | 27/62 | 23/106 | 28% | 111 | no | 25 | 26 | 17 | 40 | 47 |
| greedy | bot-seed-18 | 0/8 | 21/62 | 26/106 | 27% | 111 | no | 25 | 26 | 10 | 41 | 49 |
| greedy | bot-seed-19 | 1/8 | 8/62 | 10/106 | 11% | 111 | no | 25 | 16 | 0 | 39 | 21 |
| greedy | bot-seed-20 | 0/8 | 10/62 | 9/106 | 11% | 111 | no | 25 | 12 | 0 | 39 | 24 |
| smart | bot-seed-1 | 8/8 | 58/62 | 101/106 | 95% | 333 | yes | 25 | 98 | 0 | 48 | 22 |
| smart | bot-seed-2 | 8/8 | 58/62 | 102/106 | 95% | 333 | yes | 25 | 98 | 0 | 48 | 22 |
| smart | bot-seed-3 | 8/8 | 55/62 | 95/106 | 90% | 333 | yes | 25 | 95 | 8 | 47 | 31 |
| smart | bot-seed-4 | 3/8 | 57/62 | 96/106 | 89% | 133 | no | 25 | 76 | 0 | 48 | 25 |
| smart | bot-seed-5 | 8/8 | 55/62 | 91/106 | 88% | 333 | yes | 25 | 94 | 42 | 47 | 41 |
| smart | bot-seed-6 | 3/8 | 54/62 | 88/106 | 82% | 133 | no | 25 | 73 | 5 | 47 | 35 |
| smart | bot-seed-7 | 8/8 | 58/62 | 102/106 | 95% | 333 | yes | 25 | 98 | 0 | 48 | 22 |
| smart | bot-seed-8 | 8/8 | 58/62 | 102/106 | 95% | 333 | yes | 25 | 98 | 0 | 48 | 25 |
| smart | bot-seed-9 | 8/8 | 54/62 | 98/106 | 91% | 333 | yes | 25 | 96 | 8 | 48 | 28 |
| smart | bot-seed-10 | 3/8 | 56/62 | 95/106 | 88% | 133 | no | 25 | 76 | 10 | 47 | 28 |
| smart | bot-seed-11 | 8/8 | 58/62 | 96/106 | 92% | 333 | yes | 25 | 96 | 0 | 48 | 28 |
| smart | bot-seed-12 | 3/8 | 53/62 | 65/106 | 69% | 132 | no | 25 | 65 | 8 | 45 | 34 |
| smart | bot-seed-13 | 8/8 | 58/62 | 102/106 | 95% | 333 | yes | 25 | 98 | 5 | 48 | 28 |
| smart | bot-seed-14 | 8/8 | 59/62 | 103/106 | 97% | 333 | yes | 25 | 98 | 0 | 48 | 22 |
| smart | bot-seed-15 | 8/8 | 54/62 | 92/106 | 88% | 333 | yes | 25 | 94 | 5 | 47 | 35 |
| smart | bot-seed-16 | 8/8 | 58/62 | 96/106 | 92% | 333 | yes | 25 | 96 | 0 | 48 | 25 |
| smart | bot-seed-17 | 8/8 | 58/62 | 102/106 | 95% | 333 | yes | 25 | 98 | 0 | 48 | 22 |
| smart | bot-seed-18 | 8/8 | 58/62 | 102/106 | 95% | 333 | yes | 25 | 98 | 0 | 48 | 25 |
| smart | bot-seed-19 | 8/8 | 58/62 | 101/106 | 95% | 333 | yes | 25 | 98 | 0 | 48 | 28 |
| smart | bot-seed-20 | 8/8 | 55/62 | 87/106 | 85% | 333 | yes | 25 | 92 | 18 | 47 | 35 |
| far | bot-seed-1 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-2 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-3 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-4 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-5 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-6 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-7 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-8 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-9 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-10 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-11 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-12 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-13 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-14 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-15 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-16 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-17 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-18 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-19 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |
| far | bot-seed-20 | 0/8 | 0/62 | 0/106 | 0% | 111 | no | 25 | 0 | 0 | 38 | 16 |

## What each builds (mean per run)

Away: builds made where no storm's water reaches (they protect nothing, so they are not counted as defences).

| Archetype | dune | sandy_vegetation | seawall | breakwater | mangrove | khazan | small_dam | away |
|---|---|---|---|---|---|---|---|---|
| casual | 1.6 | 1.4 | 3.0 | 1.3 | 4.8 | 5.5 | 7.5 | 0.0 |
| greedy | 0.8 | 1.1 | 3.5 | 4.0 | 3.9 | 3.8 | 8.0 | 0.0 |
| smart | 1.7 | 1.4 | 3.1 | 3.7 | 3.5 | 3.5 | 8.2 | 0.0 |
| far | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 25.0 |
