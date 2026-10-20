
> riptide-rising@1.0.0 bots
> tsx tools/panjimBots/index.ts

## Archetypes

20 seeds: bot-seed-1, bot-seed-2, bot-seed-3, bot-seed-4, bot-seed-5, bot-seed-6, bot-seed-7, bot-seed-8, bot-seed-9, bot-seed-10, bot-seed-11, bot-seed-12, bot-seed-13, bot-seed-14, bot-seed-15, bot-seed-16, bot-seed-17, bot-seed-18, bot-seed-19, bot-seed-20

A run is **won** when the level ends on three stars (the storms' stars averaged and rounded: at most one storm short of three stars, none below two). **2★ every storm** is the softer reading: every storm at two stars or more.

| Archetype | Won | 2★ every storm | Houses saved (all storms) | min | median | max | Stars per storm (mean) | Index (mean) |
|---|---|---|---|---|---|---|---|---|
| casual | 0/20 (0%) | 0/20 | 73% | 65% | 73% | 79% | 1.0 / 2.0 / 2.5 | 51 |
| greedy | 0/20 (0%) | 0/20 | 32% | 6% | 36% | 55% | 0.1 / 0.6 / 1.3 | 45 |
| smart | 16/20 (80%) | 16/20 | 87% | 82% | 87% | 91% | 2.6 / 2.0 / 3.0 | 54 |
| far | 0/20 (0%) | 0/20 | 0% | 0% | 0% | 0% | 0.0 / 0.0 / 0.0 | 25 |

Greedy beats Casual on 0 of 20 seeds.

## How often the wind decides a home (Section 12)

Homes lost whose water alone stayed under the house-loss line: the wind tipped them. Mean per run, and as a share of the homes lost in that storm.

| Archetype | 2030 cyclone | 2040 flood | 2050 compound |
|---|---|---|---|
| casual | 0.0 (0%) | 0.0 (0%) | 0.5 (5%) |
| greedy | 0.0 (0%) | 0.0 (0%) | 0.1 (1%) |
| smart | 0.0 (0%) | 0.0 (0%) | 0.1 (13%) |
| far | 0.0 (0%) | 0.0 (0%) | 0.0 (0%) |

## Every run

| Archetype | Seed | Storm 1 saved | Storm 2 saved | Storm 3 saved | All | Stars | Won | Builds | Resilience | Biodiversity | Population | Food |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casual | bot-seed-1 | 3/8 | 47/65 | 43/58 | 71% | 122 | no | 25 | 61 | 3 | 45 | 31 |
| casual | bot-seed-2 | 3/8 | 45/65 | 52/56 | 78% | 123 | no | 25 | 67 | 27 | 46 | 36 |
| casual | bot-seed-3 | 3/8 | 41/65 | 46/51 | 73% | 123 | no | 25 | 64 | 0 | 45 | 30 |
| casual | bot-seed-4 | 3/8 | 43/65 | 53/56 | 77% | 123 | no | 25 | 66 | 0 | 46 | 36 |
| casual | bot-seed-5 | 3/8 | 36/65 | 46/55 | 66% | 122 | no | 25 | 59 | 5 | 44 | 28 |
| casual | bot-seed-6 | 3/8 | 45/65 | 42/53 | 71% | 122 | no | 25 | 62 | 38 | 45 | 42 |
| casual | bot-seed-7 | 3/8 | 37/65 | 46/50 | 70% | 123 | no | 25 | 62 | 5 | 45 | 31 |
| casual | bot-seed-8 | 3/8 | 40/65 | 52/56 | 74% | 123 | no | 25 | 64 | 0 | 45 | 30 |
| casual | bot-seed-9 | 3/8 | 48/65 | 49/58 | 76% | 122 | no | 25 | 65 | 17 | 46 | 36 |
| casual | bot-seed-10 | 3/8 | 46/65 | 52/55 | 79% | 123 | no | 25 | 68 | 37 | 46 | 42 |
| casual | bot-seed-11 | 3/8 | 37/65 | 43/51 | 67% | 122 | no | 25 | 60 | 2 | 45 | 34 |
| casual | bot-seed-12 | 3/8 | 46/65 | 48/56 | 75% | 123 | no | 25 | 65 | 7 | 45 | 33 |
| casual | bot-seed-13 | 3/8 | 44/65 | 44/57 | 70% | 122 | no | 25 | 61 | 15 | 45 | 37 |
| casual | bot-seed-14 | 3/8 | 49/65 | 42/59 | 71% | 122 | no | 25 | 61 | 17 | 45 | 37 |
| casual | bot-seed-15 | 3/8 | 46/65 | 40/56 | 69% | 122 | no | 25 | 60 | 15 | 45 | 37 |
| casual | bot-seed-16 | 3/8 | 48/65 | 43/57 | 72% | 122 | no | 25 | 62 | 22 | 45 | 36 |
| casual | bot-seed-17 | 3/8 | 46/65 | 51/57 | 77% | 123 | no | 25 | 66 | 13 | 46 | 36 |
| casual | bot-seed-18 | 3/8 | 48/65 | 51/59 | 77% | 123 | no | 25 | 66 | 15 | 46 | 33 |
| casual | bot-seed-19 | 3/8 | 48/65 | 45/56 | 74% | 122 | no | 25 | 64 | 2 | 45 | 33 |
| casual | bot-seed-20 | 3/8 | 41/65 | 39/54 | 65% | 122 | no | 25 | 58 | 30 | 44 | 37 |
| greedy | bot-seed-1 | 0/8 | 39/65 | 28/49 | 55% | 022 | no | 25 | 39 | 75 | 43 | 68 |
| greedy | bot-seed-2 | 0/8 | 4/65 | 9/22 | 14% | 001 | no | 25 | 16 | 0 | 41 | 25 |
| greedy | bot-seed-3 | 0/8 | 17/65 | 13/34 | 28% | 001 | no | 25 | 21 | 3 | 41 | 40 |
| greedy | bot-seed-4 | 3/8 | 25/65 | 19/38 | 42% | 112 | no | 25 | 42 | 33 | 42 | 45 |
| greedy | bot-seed-5 | 0/8 | 26/65 | 13/32 | 37% | 011 | no | 25 | 27 | 2 | 42 | 39 |
| greedy | bot-seed-6 | 0/8 | 22/65 | 13/34 | 33% | 011 | no | 25 | 24 | 13 | 42 | 49 |
| greedy | bot-seed-7 | 0/8 | 27/65 | 21/42 | 42% | 012 | no | 25 | 31 | 53 | 42 | 60 |
| greedy | bot-seed-8 | 0/8 | 20/65 | 17/37 | 34% | 011 | no | 25 | 26 | 22 | 41 | 46 |
| greedy | bot-seed-9 | 3/8 | 6/65 | 5/22 | 15% | 100 | no | 25 | 23 | 0 | 41 | 25 |
| greedy | bot-seed-10 | 2/8 | 11/65 | 21/30 | 33% | 002 | no | 25 | 37 | 22 | 42 | 45 |
| greedy | bot-seed-11 | 0/8 | 18/65 | 9/29 | 26% | 001 | no | 25 | 20 | 0 | 41 | 28 |
| greedy | bot-seed-12 | 0/8 | 21/65 | 17/32 | 36% | 012 | no | 25 | 28 | 38 | 42 | 48 |
| greedy | bot-seed-13 | 0/8 | 23/65 | 19/32 | 40% | 012 | no | 25 | 32 | 15 | 42 | 42 |
| greedy | bot-seed-14 | 2/8 | 10/65 | 10/25 | 22% | 001 | no | 25 | 27 | 0 | 41 | 28 |
| greedy | bot-seed-15 | 0/8 | 26/65 | 16/34 | 39% | 011 | no | 25 | 29 | 15 | 42 | 54 |
| greedy | bot-seed-16 | 0/8 | 27/65 | 18/40 | 40% | 011 | no | 25 | 29 | 7 | 42 | 39 |
| greedy | bot-seed-17 | 0/8 | 9/65 | 7/27 | 16% | 000 | no | 25 | 13 | 0 | 40 | 23 |
| greedy | bot-seed-18 | 0/8 | 17/65 | 23/35 | 37% | 002 | no | 25 | 31 | 10 | 42 | 36 |
| greedy | bot-seed-19 | 0/8 | 4/65 | 2/20 | 6% | 000 | no | 25 | 5 | 0 | 40 | 35 |
| greedy | bot-seed-20 | 0/8 | 23/65 | 18/35 | 38% | 012 | no | 25 | 29 | 0 | 42 | 33 |
| smart | bot-seed-1 | 8/8 | 53/65 | 66/66 | 91% | 323 | yes | 25 | 94 | 0 | 47 | 22 |
| smart | bot-seed-2 | 8/8 | 50/65 | 63/63 | 89% | 323 | yes | 25 | 92 | 0 | 47 | 20 |
| smart | bot-seed-3 | 8/8 | 46/65 | 53/58 | 82% | 323 | yes | 25 | 87 | 18 | 46 | 38 |
| smart | bot-seed-4 | 3/8 | 51/65 | 59/59 | 86% | 123 | no | 25 | 72 | 10 | 47 | 35 |
| smart | bot-seed-5 | 8/8 | 49/65 | 57/57 | 88% | 323 | yes | 25 | 92 | 17 | 47 | 35 |
| smart | bot-seed-6 | 3/8 | 49/65 | 60/60 | 84% | 123 | no | 25 | 71 | 2 | 47 | 32 |
| smart | bot-seed-7 | 8/8 | 53/65 | 66/66 | 91% | 323 | yes | 25 | 94 | 0 | 47 | 25 |
| smart | bot-seed-8 | 8/8 | 50/65 | 63/63 | 89% | 323 | yes | 25 | 92 | 0 | 47 | 23 |
| smart | bot-seed-9 | 8/8 | 47/65 | 61/62 | 86% | 323 | yes | 25 | 90 | 0 | 47 | 23 |
| smart | bot-seed-10 | 3/8 | 50/65 | 64/64 | 85% | 123 | no | 25 | 71 | 15 | 47 | 29 |
| smart | bot-seed-11 | 8/8 | 47/65 | 62/62 | 87% | 323 | yes | 25 | 91 | 0 | 47 | 23 |
| smart | bot-seed-12 | 3/8 | 50/65 | 56/58 | 83% | 123 | no | 25 | 70 | 20 | 46 | 35 |
| smart | bot-seed-13 | 8/8 | 52/65 | 60/60 | 90% | 323 | yes | 25 | 93 | 5 | 47 | 34 |
| smart | bot-seed-14 | 8/8 | 53/65 | 65/66 | 91% | 323 | yes | 25 | 93 | 0 | 47 | 25 |
| smart | bot-seed-15 | 8/8 | 47/65 | 54/55 | 85% | 323 | yes | 25 | 90 | 17 | 47 | 38 |
| smart | bot-seed-16 | 8/8 | 48/65 | 61/61 | 87% | 323 | yes | 25 | 91 | 0 | 47 | 17 |
| smart | bot-seed-17 | 8/8 | 50/65 | 63/63 | 89% | 323 | yes | 25 | 92 | 3 | 47 | 26 |
| smart | bot-seed-18 | 8/8 | 47/65 | 62/62 | 87% | 323 | yes | 25 | 91 | 0 | 47 | 20 |
| smart | bot-seed-19 | 8/8 | 47/65 | 55/55 | 86% | 323 | yes | 25 | 91 | 0 | 47 | 32 |
| smart | bot-seed-20 | 8/8 | 48/65 | 56/61 | 84% | 323 | yes | 25 | 89 | 8 | 46 | 35 |
| far | bot-seed-1 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-2 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-3 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-4 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-5 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-6 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-7 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-8 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-9 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-10 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-11 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-12 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-13 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-14 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-15 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-16 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-17 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-18 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-19 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |
| far | bot-seed-20 | 0/8 | 0/65 | 0/18 | 0% | 000 | no | 25 | 0 | 0 | 40 | 14 |

## What each builds (mean per run)

Away: builds made where no storm's water reaches (they protect nothing, so they are not counted as defences).

| Archetype | dune | sandy_vegetation | seawall | breakwater | mangrove | khazan | small_dam | away |
|---|---|---|---|---|---|---|---|---|
| casual | 1.5 | 1.8 | 3.9 | 2.1 | 5.0 | 3.4 | 7.3 | 0.0 |
| greedy | 1.0 | 0.6 | 3.6 | 3.4 | 5.0 | 4.3 | 7.1 | 0.0 |
| smart | 1.7 | 1.5 | 3.6 | 3.6 | 3.3 | 3.5 | 7.7 | 0.0 |
| far | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 25.0 |
