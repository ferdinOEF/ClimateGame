
> riptide-rising@1.0.0 bots
> tsx tools/panjimBots/index.ts

## Archetypes

20 seeds: bot-seed-1, bot-seed-2, bot-seed-3, bot-seed-4, bot-seed-5, bot-seed-6, bot-seed-7, bot-seed-8, bot-seed-9, bot-seed-10, bot-seed-11, bot-seed-12, bot-seed-13, bot-seed-14, bot-seed-15, bot-seed-16, bot-seed-17, bot-seed-18, bot-seed-19, bot-seed-20

A run is **won** when the level ends on three stars (the storms' stars averaged and rounded: at most one storm short of three stars, none below two). **2★ every storm** is the softer reading: every storm at two stars or more.

| Archetype | Won | 2★ every storm | Houses saved (all storms) | min | median | max | Stars per storm (mean) | Index (mean) |
|---|---|---|---|---|---|---|---|---|
| casual | 3/20 (15%) | 10/20 | 68% | 57% | 69% | 81% | 2.8 / 1.7 / 2.0 | 68 |
| greedy | 0/20 (0%) | 0/20 | 34% | 17% | 36% | 55% | 0.5 / 0.6 / 1.1 | 49 |
| smart | 6/20 (30%) | 20/20 | 80% | 75% | 81% | 86% | 2.9 / 2.0 / 2.4 | 61 |
| far | 0/20 (0%) | 0/20 | 0% | 0% | 0% | 0% | 0.0 / 0.0 / 0.0 | 25 |

Greedy beats Casual on 0 of 20 seeds.

## How often the wind decides a home (Section 12)

Homes lost whose water alone stayed under the house-loss line: the wind tipped them. Mean per run, and as a share of the homes lost in that storm.

| Archetype | 2030 cyclone | 2040 flood | 2050 compound |
|---|---|---|---|
| casual | 0.0 (0%) | 0.0 (0%) | 0.8 (5%) |
| greedy | 0.0 (0%) | 0.0 (0%) | 0.4 (2%) |
| smart | 0.0 (0%) | 0.0 (0%) | 0.9 (8%) |
| far | 0.0 (0%) | 0.0 (0%) | 0.0 (0%) |

## Every run

| Archetype | Seed | Storm 1 saved | Storm 2 saved | Storm 3 saved | All | Stars | Won | Builds | Resilience | Biodiversity | Population | Food |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casual | bot-seed-1 | 8/8 | 50/65 | 41/58 | 76% | 322 | no | 25 | 83 | 72 | 45 | 60 |
| casual | bot-seed-2 | 8/8 | 47/65 | 36/56 | 71% | 322 | no | 25 | 79 | 70 | 45 | 61 |
| casual | bot-seed-3 | 8/8 | 47/65 | 31/57 | 66% | 121 | no | 25 | 76 | 60 | 44 | 61 |
| casual | bot-seed-4 | 8/8 | 49/65 | 36/59 | 70% | 322 | no | 25 | 79 | 68 | 45 | 61 |
| casual | bot-seed-5 | 8/8 | 35/65 | 31/48 | 61% | 312 | no | 25 | 73 | 45 | 44 | 55 |
| casual | bot-seed-6 | 8/8 | 40/65 | 47/54 | 75% | 323 | yes | 25 | 83 | 58 | 45 | 57 |
| casual | bot-seed-7 | 8/8 | 33/65 | 32/51 | 59% | 312 | no | 25 | 71 | 47 | 44 | 56 |
| casual | bot-seed-8 | 8/8 | 42/65 | 46/54 | 76% | 323 | yes | 25 | 83 | 33 | 46 | 48 |
| casual | bot-seed-9 | 8/8 | 48/65 | 35/59 | 69% | 322 | no | 25 | 78 | 50 | 45 | 55 |
| casual | bot-seed-10 | 8/8 | 34/65 | 36/48 | 64% | 312 | no | 25 | 76 | 57 | 44 | 64 |
| casual | bot-seed-11 | 8/8 | 31/65 | 38/47 | 64% | 312 | no | 25 | 76 | 90 | 44 | 61 |
| casual | bot-seed-12 | 8/8 | 46/65 | 44/54 | 77% | 322 | no | 25 | 84 | 37 | 46 | 54 |
| casual | bot-seed-13 | 8/8 | 39/65 | 26/52 | 58% | 321 | no | 25 | 70 | 62 | 44 | 65 |
| casual | bot-seed-14 | 8/8 | 40/65 | 45/50 | 76% | 323 | yes | 25 | 84 | 62 | 46 | 60 |
| casual | bot-seed-15 | 8/8 | 41/65 | 36/55 | 66% | 322 | no | 25 | 76 | 85 | 44 | 58 |
| casual | bot-seed-16 | 8/8 | 35/65 | 38/51 | 65% | 312 | no | 25 | 76 | 68 | 44 | 64 |
| casual | bot-seed-17 | 8/8 | 47/65 | 39/58 | 72% | 322 | no | 25 | 80 | 60 | 45 | 58 |
| casual | bot-seed-18 | 8/8 | 26/65 | 34/46 | 57% | 312 | no | 25 | 71 | 62 | 44 | 62 |
| casual | bot-seed-19 | 8/8 | 48/65 | 48/56 | 81% | 123 | no | 25 | 87 | 28 | 46 | 53 |
| casual | bot-seed-20 | 8/8 | 44/65 | 31/58 | 63% | 321 | no | 25 | 74 | 55 | 44 | 61 |
| greedy | bot-seed-1 | 0/8 | 39/65 | 28/49 | 55% | 022 | no | 25 | 39 | 93 | 43 | 77 |
| greedy | bot-seed-2 | 2/8 | 4/65 | 10/23 | 17% | 001 | no | 25 | 25 | 2 | 41 | 46 |
| greedy | bot-seed-3 | 0/8 | 17/65 | 14/33 | 29% | 001 | no | 25 | 23 | 35 | 41 | 61 |
| greedy | bot-seed-4 | 3/8 | 25/65 | 18/38 | 41% | 111 | no | 25 | 41 | 48 | 42 | 54 |
| greedy | bot-seed-5 | 3/8 | 28/65 | 16/34 | 44% | 111 | no | 25 | 43 | 5 | 43 | 45 |
| greedy | bot-seed-6 | 0/8 | 23/65 | 15/35 | 35% | 011 | no | 25 | 26 | 0 | 42 | 48 |
| greedy | bot-seed-7 | 0/8 | 27/65 | 14/42 | 36% | 011 | no | 25 | 25 | 73 | 41 | 70 |
| greedy | bot-seed-8 | 3/8 | 23/65 | 17/40 | 38% | 111 | no | 25 | 38 | 27 | 42 | 51 |
| greedy | bot-seed-9 | 3/8 | 6/65 | 8/22 | 18% | 101 | no | 25 | 28 | 0 | 41 | 28 |
| greedy | bot-seed-10 | 2/8 | 17/65 | 25/36 | 40% | 002 | no | 25 | 40 | 30 | 42 | 48 |
| greedy | bot-seed-11 | 0/8 | 17/65 | 11/29 | 27% | 001 | no | 25 | 21 | 10 | 41 | 43 |
| greedy | bot-seed-12 | 0/8 | 22/65 | 17/33 | 37% | 011 | no | 25 | 28 | 50 | 42 | 51 |
| greedy | bot-seed-13 | 3/8 | 23/65 | 19/32 | 43% | 112 | no | 25 | 44 | 40 | 43 | 60 |
| greedy | bot-seed-14 | 2/8 | 10/65 | 14/25 | 27% | 001 | no | 25 | 32 | 0 | 42 | 37 |
| greedy | bot-seed-15 | 0/8 | 30/65 | 19/36 | 45% | 011 | no | 25 | 33 | 0 | 43 | 54 |
| greedy | bot-seed-16 | 0/8 | 26/65 | 16/39 | 38% | 011 | no | 25 | 27 | 0 | 42 | 48 |
| greedy | bot-seed-17 | 6/8 | 12/65 | 16/31 | 33% | 201 | no | 25 | 48 | 0 | 42 | 42 |
| greedy | bot-seed-18 | 0/8 | 14/65 | 18/32 | 30% | 002 | no | 25 | 26 | 20 | 41 | 46 |
| greedy | bot-seed-19 | 6/8 | 6/65 | 5/22 | 18% | 100 | no | 25 | 36 | 0 | 41 | 49 |
| greedy | bot-seed-20 | 3/8 | 14/65 | 17/31 | 33% | 101 | no | 25 | 38 | 0 | 42 | 36 |
| smart | bot-seed-1 | 8/8 | 47/65 | 48/61 | 77% | 322 | no | 25 | 84 | 27 | 46 | 42 |
| smart | bot-seed-2 | 8/8 | 54/65 | 56/64 | 86% | 323 | yes | 25 | 90 | 15 | 47 | 35 |
| smart | bot-seed-3 | 8/8 | 51/65 | 49/61 | 81% | 322 | no | 25 | 86 | 30 | 46 | 42 |
| smart | bot-seed-4 | 8/8 | 50/65 | 52/60 | 83% | 323 | yes | 25 | 88 | 33 | 46 | 47 |
| smart | bot-seed-5 | 8/8 | 53/65 | 44/65 | 76% | 322 | no | 25 | 83 | 13 | 45 | 36 |
| smart | bot-seed-6 | 8/8 | 50/65 | 53/63 | 82% | 322 | no | 25 | 87 | 22 | 46 | 41 |
| smart | bot-seed-7 | 8/8 | 41/65 | 55/55 | 81% | 323 | yes | 25 | 88 | 22 | 46 | 50 |
| smart | bot-seed-8 | 8/8 | 53/65 | 55/66 | 83% | 322 | no | 25 | 88 | 22 | 46 | 44 |
| smart | bot-seed-9 | 8/8 | 46/65 | 54/59 | 82% | 323 | yes | 25 | 87 | 20 | 46 | 41 |
| smart | bot-seed-10 | 8/8 | 47/65 | 57/58 | 85% | 323 | yes | 25 | 90 | 57 | 47 | 53 |
| smart | bot-seed-11 | 8/8 | 50/65 | 46/63 | 76% | 322 | no | 25 | 83 | 25 | 45 | 45 |
| smart | bot-seed-12 | 8/8 | 52/65 | 47/66 | 77% | 322 | no | 25 | 84 | 33 | 45 | 45 |
| smart | bot-seed-13 | 8/8 | 46/65 | 55/56 | 84% | 323 | yes | 25 | 90 | 45 | 47 | 56 |
| smart | bot-seed-14 | 8/8 | 44/65 | 49/56 | 78% | 223 | no | 25 | 85 | 38 | 46 | 51 |
| smart | bot-seed-15 | 8/8 | 53/65 | 55/66 | 83% | 322 | no | 25 | 88 | 18 | 46 | 41 |
| smart | bot-seed-16 | 8/8 | 48/65 | 43/59 | 75% | 322 | no | 25 | 82 | 33 | 45 | 54 |
| smart | bot-seed-17 | 8/8 | 50/65 | 49/63 | 79% | 322 | no | 25 | 85 | 25 | 46 | 45 |
| smart | bot-seed-18 | 8/8 | 50/65 | 52/63 | 81% | 222 | no | 25 | 86 | 13 | 46 | 42 |
| smart | bot-seed-19 | 8/8 | 48/65 | 49/61 | 78% | 322 | no | 25 | 85 | 43 | 46 | 51 |
| smart | bot-seed-20 | 8/8 | 50/65 | 46/63 | 76% | 322 | no | 25 | 83 | 60 | 45 | 54 |
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
| casual | 0.8 | 1.3 | 1.8 | 0.8 | 11.9 | 4.4 | 4.1 | 0.0 |
| greedy | 0.8 | 0.8 | 3.6 | 3.2 | 8.1 | 4.4 | 4.2 | 0.0 |
| smart | 1.0 | 1.0 | 1.8 | 2.3 | 7.9 | 4.5 | 6.6 | 0.0 |
| far | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 25.0 |
