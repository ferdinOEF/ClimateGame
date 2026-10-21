
> riptide-rising@1.0.0 bots
> tsx tools/panjimBots/index.ts

## Archetypes

20 seeds: bot-seed-1, bot-seed-2, bot-seed-3, bot-seed-4, bot-seed-5, bot-seed-6, bot-seed-7, bot-seed-8, bot-seed-9, bot-seed-10, bot-seed-11, bot-seed-12, bot-seed-13, bot-seed-14, bot-seed-15, bot-seed-16, bot-seed-17, bot-seed-18, bot-seed-19, bot-seed-20

A run is **won** when the level ends on three stars (the storms' stars averaged and rounded: at most one storm short of three stars, none below two). **2★ every storm** is the softer reading: every storm at two stars or more.

| Archetype | Won | 2★ every storm | Houses saved (all storms) | min | median | max | Stars per storm (mean) | Index (mean) |
|---|---|---|---|---|---|---|---|---|
| casual | 1/20 (5%) | 12/20 | 68% | 58% | 68% | 77% | 2.8 / 1.8 / 1.9 | 66 |
| greedy | 0/20 (0%) | 0/20 | 34% | 17% | 36% | 54% | 0.5 / 0.6 / 1.1 | 49 |
| smart | 7/20 (35%) | 20/20 | 80% | 72% | 80% | 87% | 2.9 / 2.0 / 2.4 | 61 |
| far | 0/20 (0%) | 0/20 | 0% | 0% | 0% | 0% | 0.0 / 0.0 / 0.0 | 25 |

Greedy beats Casual on 0 of 20 seeds.

## How often the wind decides a home (Section 12)

Homes lost whose water alone stayed under the house-loss line: the wind tipped them. Mean per run, and as a share of the homes lost in that storm.

| Archetype | 2030 cyclone | 2040 flood | 2050 compound |
|---|---|---|---|
| casual | 0.0 (0%) | 0.0 (0%) | 1.3 (8%) |
| greedy | 0.0 (0%) | 0.0 (0%) | 0.4 (2%) |
| smart | 0.0 (0%) | 0.0 (0%) | 1.0 (9%) |
| far | 0.0 (0%) | 0.0 (0%) | 0.0 (0%) |

## Every run

| Archetype | Seed | Storm 1 saved | Storm 2 saved | Storm 3 saved | All | Stars | Won | Builds | Resilience | Biodiversity | Population | Food |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casual | bot-seed-1 | 8/8 | 42/65 | 40/54 | 71% | 322 | no | 25 | 80 | 27 | 45 | 52 |
| casual | bot-seed-2 | 8/8 | 47/65 | 36/56 | 71% | 322 | no | 25 | 79 | 70 | 45 | 61 |
| casual | bot-seed-3 | 8/8 | 47/65 | 31/57 | 66% | 121 | no | 25 | 76 | 60 | 44 | 61 |
| casual | bot-seed-4 | 8/8 | 49/65 | 34/59 | 69% | 322 | no | 25 | 78 | 68 | 45 | 61 |
| casual | bot-seed-5 | 8/8 | 35/65 | 31/48 | 61% | 312 | no | 25 | 73 | 45 | 44 | 55 |
| casual | bot-seed-6 | 8/8 | 40/65 | 47/54 | 75% | 323 | yes | 25 | 83 | 58 | 45 | 57 |
| casual | bot-seed-7 | 8/8 | 30/65 | 33/49 | 58% | 312 | no | 25 | 71 | 52 | 44 | 59 |
| casual | bot-seed-8 | 8/8 | 42/65 | 44/54 | 74% | 322 | no | 25 | 82 | 40 | 45 | 51 |
| casual | bot-seed-9 | 8/8 | 48/65 | 34/59 | 68% | 322 | no | 25 | 77 | 50 | 44 | 55 |
| casual | bot-seed-10 | 8/8 | 34/65 | 36/48 | 64% | 312 | no | 25 | 76 | 57 | 44 | 64 |
| casual | bot-seed-11 | 8/8 | 31/65 | 38/47 | 64% | 312 | no | 25 | 76 | 90 | 44 | 61 |
| casual | bot-seed-12 | 8/8 | 46/65 | 40/54 | 74% | 322 | no | 25 | 82 | 37 | 45 | 54 |
| casual | bot-seed-13 | 8/8 | 39/65 | 25/52 | 58% | 321 | no | 25 | 69 | 62 | 43 | 65 |
| casual | bot-seed-14 | 8/8 | 40/65 | 30/49 | 64% | 322 | no | 25 | 74 | 58 | 44 | 58 |
| casual | bot-seed-15 | 8/8 | 45/65 | 41/59 | 71% | 322 | no | 25 | 80 | 75 | 45 | 55 |
| casual | bot-seed-16 | 8/8 | 39/65 | 35/52 | 66% | 322 | no | 25 | 76 | 47 | 44 | 49 |
| casual | bot-seed-17 | 8/8 | 42/65 | 36/53 | 68% | 322 | no | 25 | 78 | 48 | 45 | 58 |
| casual | bot-seed-18 | 8/8 | 33/65 | 39/51 | 65% | 312 | no | 25 | 76 | 18 | 44 | 52 |
| casual | bot-seed-19 | 8/8 | 47/65 | 44/55 | 77% | 122 | no | 25 | 84 | 22 | 46 | 54 |
| casual | bot-seed-20 | 8/8 | 45/65 | 39/55 | 72% | 322 | no | 25 | 80 | 43 | 45 | 63 |
| greedy | bot-seed-1 | 0/8 | 39/65 | 27/49 | 54% | 022 | no | 25 | 38 | 93 | 43 | 77 |
| greedy | bot-seed-2 | 2/8 | 4/65 | 10/23 | 17% | 001 | no | 25 | 25 | 2 | 41 | 46 |
| greedy | bot-seed-3 | 0/8 | 17/65 | 14/33 | 29% | 001 | no | 25 | 23 | 35 | 41 | 61 |
| greedy | bot-seed-4 | 3/8 | 25/65 | 18/38 | 41% | 111 | no | 25 | 41 | 48 | 42 | 54 |
| greedy | bot-seed-5 | 3/8 | 28/65 | 16/34 | 44% | 111 | no | 25 | 43 | 5 | 43 | 45 |
| greedy | bot-seed-6 | 0/8 | 23/65 | 15/35 | 35% | 011 | no | 25 | 26 | 0 | 42 | 48 |
| greedy | bot-seed-7 | 0/8 | 27/65 | 14/42 | 36% | 011 | no | 25 | 25 | 73 | 41 | 70 |
| greedy | bot-seed-8 | 3/8 | 23/65 | 17/40 | 38% | 111 | no | 25 | 38 | 27 | 42 | 51 |
| greedy | bot-seed-9 | 3/8 | 6/65 | 8/22 | 18% | 101 | no | 25 | 28 | 0 | 41 | 28 |
| greedy | bot-seed-10 | 2/8 | 15/65 | 24/34 | 38% | 002 | no | 25 | 40 | 30 | 42 | 48 |
| greedy | bot-seed-11 | 0/8 | 17/65 | 11/29 | 27% | 001 | no | 25 | 21 | 10 | 41 | 43 |
| greedy | bot-seed-12 | 0/8 | 22/65 | 17/33 | 37% | 011 | no | 25 | 28 | 50 | 42 | 51 |
| greedy | bot-seed-13 | 3/8 | 23/65 | 19/32 | 43% | 112 | no | 25 | 44 | 40 | 43 | 60 |
| greedy | bot-seed-14 | 2/8 | 10/65 | 14/25 | 27% | 001 | no | 25 | 32 | 0 | 42 | 37 |
| greedy | bot-seed-15 | 0/8 | 27/65 | 18/35 | 42% | 011 | no | 25 | 31 | 0 | 42 | 54 |
| greedy | bot-seed-16 | 0/8 | 26/65 | 16/39 | 38% | 011 | no | 25 | 27 | 0 | 42 | 48 |
| greedy | bot-seed-17 | 6/8 | 12/65 | 16/31 | 33% | 201 | no | 25 | 48 | 0 | 42 | 42 |
| greedy | bot-seed-18 | 0/8 | 14/65 | 18/32 | 30% | 002 | no | 25 | 26 | 20 | 41 | 46 |
| greedy | bot-seed-19 | 6/8 | 6/65 | 5/22 | 18% | 100 | no | 25 | 36 | 0 | 41 | 49 |
| greedy | bot-seed-20 | 3/8 | 14/65 | 17/31 | 33% | 101 | no | 25 | 38 | 0 | 42 | 36 |
| smart | bot-seed-1 | 8/8 | 47/65 | 42/61 | 72% | 322 | no | 25 | 80 | 25 | 45 | 43 |
| smart | bot-seed-2 | 8/8 | 54/65 | 56/64 | 86% | 323 | yes | 25 | 90 | 15 | 47 | 35 |
| smart | bot-seed-3 | 8/8 | 51/65 | 49/61 | 81% | 322 | no | 25 | 86 | 30 | 46 | 42 |
| smart | bot-seed-4 | 8/8 | 50/65 | 52/60 | 83% | 323 | yes | 25 | 88 | 33 | 46 | 47 |
| smart | bot-seed-5 | 8/8 | 53/65 | 44/65 | 76% | 322 | no | 25 | 83 | 13 | 45 | 36 |
| smart | bot-seed-6 | 8/8 | 50/65 | 51/63 | 80% | 322 | no | 25 | 86 | 33 | 46 | 45 |
| smart | bot-seed-7 | 8/8 | 41/65 | 54/54 | 81% | 323 | yes | 25 | 88 | 22 | 46 | 50 |
| smart | bot-seed-8 | 8/8 | 52/65 | 60/65 | 87% | 323 | yes | 25 | 91 | 30 | 47 | 41 |
| smart | bot-seed-9 | 8/8 | 44/65 | 53/59 | 80% | 323 | yes | 25 | 86 | 20 | 46 | 42 |
| smart | bot-seed-10 | 8/8 | 47/65 | 57/58 | 85% | 323 | yes | 25 | 90 | 57 | 47 | 53 |
| smart | bot-seed-11 | 8/8 | 50/65 | 45/63 | 76% | 322 | no | 25 | 83 | 27 | 45 | 45 |
| smart | bot-seed-12 | 8/8 | 52/65 | 48/66 | 78% | 322 | no | 25 | 84 | 27 | 46 | 42 |
| smart | bot-seed-13 | 8/8 | 45/65 | 54/55 | 84% | 323 | yes | 25 | 89 | 45 | 47 | 56 |
| smart | bot-seed-14 | 8/8 | 44/65 | 49/56 | 78% | 223 | no | 25 | 85 | 38 | 46 | 51 |
| smart | bot-seed-15 | 8/8 | 53/65 | 52/66 | 81% | 322 | no | 25 | 87 | 18 | 46 | 42 |
| smart | bot-seed-16 | 8/8 | 48/65 | 43/59 | 75% | 322 | no | 25 | 82 | 35 | 45 | 54 |
| smart | bot-seed-17 | 8/8 | 50/65 | 49/63 | 79% | 322 | no | 25 | 85 | 27 | 46 | 45 |
| smart | bot-seed-18 | 8/8 | 50/65 | 52/63 | 81% | 222 | no | 25 | 86 | 13 | 46 | 42 |
| smart | bot-seed-19 | 8/8 | 48/65 | 49/61 | 78% | 322 | no | 25 | 85 | 43 | 46 | 51 |
| smart | bot-seed-20 | 8/8 | 50/65 | 44/63 | 75% | 322 | no | 25 | 82 | 43 | 45 | 48 |
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
| casual | 0.7 | 1.2 | 2.4 | 0.7 | 11.6 | 4.2 | 4.3 | 0.0 |
| greedy | 0.8 | 0.8 | 3.6 | 3.2 | 8.1 | 4.4 | 4.2 | 0.0 |
| smart | 1.1 | 0.9 | 1.6 | 2.4 | 8.1 | 4.2 | 6.8 | 0.0 |
| far | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 25.0 |
