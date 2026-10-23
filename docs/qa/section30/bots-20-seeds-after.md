
> riptide-rising@1.0.0 bots
> tsx tools/panjimBots/index.ts

## Archetypes

20 seeds: bot-seed-1, bot-seed-2, bot-seed-3, bot-seed-4, bot-seed-5, bot-seed-6, bot-seed-7, bot-seed-8, bot-seed-9, bot-seed-10, bot-seed-11, bot-seed-12, bot-seed-13, bot-seed-14, bot-seed-15, bot-seed-16, bot-seed-17, bot-seed-18, bot-seed-19, bot-seed-20

A run is **won** when the level ends on three stars (the storms' stars averaged and rounded: at most one storm short of three stars, none below two). **2★ every storm** is the softer reading: every storm at two stars or more.

| Archetype | Won | 2★ every storm | Houses saved (all storms) | min | median | max | Stars per storm (mean) | Index (mean) |
|---|---|---|---|---|---|---|---|---|
| casual | 0/20 (0%) | 6/20 | 68% | 59% | 69% | 74% | 1.6 / 2.0 / 1.4 | 54 |
| greedy | 0/20 (0%) | 0/20 | 30% | 1% | 31% | 54% | 0.0 / 0.6 / 0.7 | 42 |
| smart | 3/20 (15%) | 14/20 | 82% | 79% | 82% | 85% | 2.0 / 2.4 / 1.9 | 59 |
| far | 0/20 (0%) | 0/20 | 0% | 0% | 0% | 0% | 0.0 / 0.0 / 0.0 | 25 |

Greedy beats Casual on 0 of 20 seeds.

## How often the wind decides a home (Section 12)

Homes lost whose water alone stayed under the house-loss line: the wind tipped them. Mean per run, and as a share of the homes lost in that storm.

| Archetype | 2030 cyclone | 2040 flood | 2050 compound |
|---|---|---|---|
| casual | 1.3 (74%) | 0.0 (0%) | 6.8 (35%) |
| greedy | 1.4 (16%) | 0.0 (0%) | 0.1 (1%) |
| smart | 0.1 (100%) | 0.0 (0%) | 8.4 (70%) |
| far | 1.0 (11%) | 0.0 (0%) | 0.0 (0%) |

## Every run

| Archetype | Seed | Storm 1 saved | Storm 2 saved | Storm 3 saved | All | Stars | Won | Builds | Resilience | Biodiversity | Population | Food |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casual | bot-seed-1 | 5/9 | 41/57 | 31/50 | 66% | 222 | no | 25 | 63 | 38 | 46 | 36 |
| casual | bot-seed-2 | 5/9 | 41/57 | 31/46 | 69% | 121 | no | 25 | 65 | 0 | 46 | 35 |
| casual | bot-seed-3 | 8/9 | 41/57 | 29/52 | 66% | 222 | no | 25 | 72 | 27 | 46 | 42 |
| casual | bot-seed-4 | 7/9 | 44/57 | 33/52 | 71% | 121 | no | 25 | 73 | 0 | 46 | 32 |
| casual | bot-seed-5 | 9/9 | 46/57 | 28/55 | 69% | 321 | no | 25 | 77 | 55 | 46 | 42 |
| casual | bot-seed-6 | 9/9 | 34/57 | 32/50 | 65% | 121 | no | 25 | 75 | 0 | 46 | 30 |
| casual | bot-seed-7 | 9/9 | 43/57 | 33/54 | 71% | 222 | no | 25 | 79 | 35 | 46 | 38 |
| casual | bot-seed-8 | 6/9 | 44/57 | 35/53 | 71% | 222 | no | 25 | 70 | 25 | 46 | 35 |
| casual | bot-seed-9 | 5/9 | 40/57 | 24/49 | 60% | 121 | no | 25 | 58 | 0 | 45 | 36 |
| casual | bot-seed-10 | 8/9 | 40/57 | 40/53 | 74% | 222 | no | 25 | 78 | 25 | 47 | 35 |
| casual | bot-seed-11 | 6/9 | 39/57 | 41/52 | 73% | 222 | no | 25 | 71 | 35 | 47 | 35 |
| casual | bot-seed-12 | 6/9 | 40/57 | 34/50 | 69% | 122 | no | 25 | 68 | 2 | 46 | 35 |
| casual | bot-seed-13 | 9/9 | 44/57 | 30/53 | 70% | 122 | no | 25 | 78 | 7 | 46 | 35 |
| casual | bot-seed-14 | 9/9 | 42/57 | 28/51 | 68% | 321 | no | 25 | 76 | 25 | 46 | 39 |
| casual | bot-seed-15 | 5/9 | 42/57 | 29/50 | 66% | 121 | no | 25 | 62 | 0 | 46 | 39 |
| casual | bot-seed-16 | 9/9 | 37/57 | 22/50 | 59% | 321 | no | 25 | 70 | 58 | 45 | 40 |
| casual | bot-seed-17 | 5/9 | 41/57 | 33/49 | 69% | 121 | no | 25 | 65 | 0 | 46 | 32 |
| casual | bot-seed-18 | 7/9 | 42/57 | 35/52 | 71% | 121 | no | 25 | 73 | 0 | 46 | 35 |
| casual | bot-seed-19 | 9/9 | 38/57 | 37/51 | 72% | 121 | no | 25 | 80 | 0 | 46 | 38 |
| casual | bot-seed-20 | 9/9 | 38/57 | 34/51 | 69% | 121 | no | 25 | 78 | 0 | 46 | 32 |
| greedy | bot-seed-1 | 2/9 | 19/57 | 9/31 | 31% | 010 | no | 25 | 28 | 10 | 43 | 38 |
| greedy | bot-seed-2 | 0/9 | 17/57 | 7/32 | 24% | 000 | no | 25 | 17 | 0 | 42 | 39 |
| greedy | bot-seed-3 | 0/9 | 18/57 | 15/36 | 32% | 011 | no | 25 | 24 | 0 | 43 | 44 |
| greedy | bot-seed-4 | 0/9 | 19/57 | 11/29 | 32% | 011 | no | 25 | 24 | 0 | 43 | 29 |
| greedy | bot-seed-5 | 0/9 | 20/57 | 9/30 | 30% | 011 | no | 25 | 22 | 13 | 43 | 38 |
| greedy | bot-seed-6 | 0/9 | 5/57 | 5/23 | 11% | 000 | no | 25 | 10 | 0 | 42 | 27 |
| greedy | bot-seed-7 | 0/9 | 16/57 | 11/33 | 27% | 001 | no | 25 | 20 | 0 | 43 | 36 |
| greedy | bot-seed-8 | 0/9 | 24/57 | 10/36 | 33% | 010 | no | 25 | 23 | 3 | 43 | 44 |
| greedy | bot-seed-9 | 0/9 | 13/57 | 5/23 | 20% | 000 | no | 25 | 15 | 0 | 43 | 30 |
| greedy | bot-seed-10 | 2/9 | 26/57 | 13/39 | 39% | 011 | no | 25 | 34 | 0 | 43 | 38 |
| greedy | bot-seed-11 | 0/9 | 14/57 | 7/27 | 23% | 000 | no | 25 | 17 | 0 | 43 | 27 |
| greedy | bot-seed-12 | 0/9 | 29/57 | 25/44 | 49% | 012 | no | 25 | 36 | 28 | 44 | 61 |
| greedy | bot-seed-13 | 0/9 | 33/57 | 19/43 | 48% | 021 | no | 25 | 34 | 43 | 44 | 43 |
| greedy | bot-seed-14 | 0/9 | 9/57 | 9/27 | 19% | 001 | no | 25 | 16 | 0 | 42 | 18 |
| greedy | bot-seed-15 | 0/9 | 27/57 | 15/33 | 42% | 011 | no | 25 | 31 | 0 | 44 | 40 |
| greedy | bot-seed-16 | 0/9 | 12/57 | 8/27 | 22% | 000 | no | 25 | 17 | 0 | 42 | 30 |
| greedy | bot-seed-17 | 0/9 | 17/57 | 20/35 | 37% | 001 | no | 25 | 29 | 0 | 43 | 35 |
| greedy | bot-seed-18 | 0/9 | 35/57 | 24/44 | 54% | 021 | no | 25 | 39 | 28 | 45 | 55 |
| greedy | bot-seed-19 | 0/9 | 17/57 | 14/34 | 31% | 001 | no | 25 | 24 | 0 | 43 | 38 |
| greedy | bot-seed-20 | 0/9 | 0/57 | 1/18 | 1% | 000 | no | 25 | 2 | 0 | 41 | 13 |
| smart | bot-seed-1 | 9/9 | 45/57 | 47/59 | 81% | 121 | no | 25 | 86 | 0 | 47 | 37 |
| smart | bot-seed-2 | 9/9 | 48/57 | 49/58 | 85% | 222 | no | 25 | 90 | 28 | 48 | 40 |
| smart | bot-seed-3 | 9/9 | 48/57 | 43/57 | 81% | 122 | no | 25 | 87 | 8 | 47 | 40 |
| smart | bot-seed-4 | 9/9 | 46/57 | 45/57 | 81% | 122 | no | 25 | 87 | 2 | 47 | 34 |
| smart | bot-seed-5 | 8/9 | 49/57 | 42/57 | 80% | 232 | no | 25 | 83 | 33 | 47 | 37 |
| smart | bot-seed-6 | 7/9 | 47/57 | 45/55 | 82% | 222 | no | 25 | 81 | 10 | 48 | 34 |
| smart | bot-seed-7 | 9/9 | 49/57 | 47/58 | 85% | 332 | yes | 25 | 89 | 43 | 48 | 37 |
| smart | bot-seed-8 | 9/9 | 47/57 | 47/55 | 85% | 222 | no | 25 | 89 | 37 | 48 | 37 |
| smart | bot-seed-9 | 9/9 | 49/57 | 42/58 | 81% | 231 | no | 25 | 86 | 0 | 47 | 31 |
| smart | bot-seed-10 | 9/9 | 41/57 | 46/55 | 79% | 322 | no | 25 | 85 | 28 | 47 | 34 |
| smart | bot-seed-11 | 9/9 | 45/57 | 41/54 | 79% | 222 | no | 25 | 85 | 15 | 47 | 40 |
| smart | bot-seed-12 | 9/9 | 49/57 | 41/58 | 80% | 232 | no | 25 | 86 | 12 | 47 | 34 |
| smart | bot-seed-13 | 9/9 | 49/57 | 46/58 | 84% | 232 | no | 25 | 88 | 23 | 48 | 37 |
| smart | bot-seed-14 | 9/9 | 47/57 | 47/57 | 84% | 122 | no | 25 | 88 | 22 | 48 | 40 |
| smart | bot-seed-15 | 9/9 | 46/57 | 41/56 | 79% | 222 | no | 25 | 85 | 18 | 47 | 35 |
| smart | bot-seed-16 | 9/9 | 48/57 | 46/56 | 84% | 322 | no | 25 | 89 | 42 | 48 | 37 |
| smart | bot-seed-17 | 9/9 | 49/57 | 45/58 | 83% | 332 | yes | 25 | 88 | 28 | 48 | 34 |
| smart | bot-seed-18 | 9/9 | 46/57 | 45/55 | 83% | 122 | no | 25 | 88 | 8 | 48 | 34 |
| smart | bot-seed-19 | 9/9 | 47/57 | 47/59 | 82% | 322 | no | 25 | 87 | 35 | 48 | 37 |
| smart | bot-seed-20 | 9/9 | 49/57 | 45/58 | 83% | 332 | yes | 25 | 88 | 48 | 48 | 37 |
| far | bot-seed-1 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-2 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-3 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-4 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-5 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-6 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-7 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-8 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-9 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-10 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-11 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-12 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-13 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-14 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-15 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-16 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-17 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-18 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-19 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |
| far | bot-seed-20 | 0/9 | 0/57 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 41 | 13 |

## What each builds (mean per run)

Away: builds made where no storm's water reaches (they protect nothing, so they are not counted as defences).

| Archetype | dune | sandy_vegetation | seawall | breakwater | mangrove | khazan | small_dam | away |
|---|---|---|---|---|---|---|---|---|
| casual | 1.8 | 2.0 | 3.4 | 1.3 | 4.8 | 4.3 | 7.3 | 0.0 |
| greedy | 1.0 | 1.1 | 4.9 | 3.3 | 3.8 | 4.5 | 6.5 | 0.0 |
| smart | 1.1 | 3.5 | 2.6 | 2.6 | 4.7 | 5.1 | 5.5 | 0.0 |
| far | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 25.0 |
