
> riptide-rising@1.0.0 bots
> tsx tools/panjimBots/index.ts

## Archetypes

20 seeds: bot-seed-1, bot-seed-2, bot-seed-3, bot-seed-4, bot-seed-5, bot-seed-6, bot-seed-7, bot-seed-8, bot-seed-9, bot-seed-10, bot-seed-11, bot-seed-12, bot-seed-13, bot-seed-14, bot-seed-15, bot-seed-16, bot-seed-17, bot-seed-18, bot-seed-19, bot-seed-20

A run is **won** when the level ends on three stars (the storms' stars averaged and rounded: at most one storm short of three stars, none below two). **2★ every storm** is the softer reading: every storm at two stars or more.

| Archetype | Won | 2★ every storm | Houses saved (all storms) | min | median | max | Stars per storm (mean) | Index (mean) |
|---|---|---|---|---|---|---|---|---|
| casual | 0/20 (0%) | 8/20 | 72% | 66% | 72% | 80% | 1.6 / 2.1 / 1.8 | 56 |
| greedy | 0/20 (0%) | 0/20 | 29% | 1% | 31% | 49% | 0.1 / 0.6 / 0.7 | 41 |
| smart | 3/20 (15%) | 15/20 | 82% | 75% | 83% | 88% | 2.0 / 2.7 / 1.9 | 59 |
| far | 0/20 (0%) | 0/20 | 0% | 0% | 0% | 0% | 0.0 / 0.0 / 0.0 | 26 |

Greedy beats Casual on 0 of 20 seeds.

## How often the wind decides a home (Section 12)

Homes lost whose water alone stayed under the house-loss line: the wind tipped them. Mean per run, and as a share of the homes lost in that storm.

| Archetype | 2030 cyclone | 2040 flood | 2050 compound |
|---|---|---|---|
| casual | 1.3 (74%) | 0.0 (0%) | 7.8 (43%) |
| greedy | 1.1 (13%) | 0.0 (0%) | 0.3 (2%) |
| smart | 0.1 (100%) | 0.0 (0%) | 8.3 (64%) |
| far | 1.0 (11%) | 0.0 (0%) | 0.0 (0%) |

## Every run

| Archetype | Seed | Storm 1 saved | Storm 2 saved | Storm 3 saved | All | Stars | Won | Builds | Resilience | Biodiversity | Population | Food |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casual | bot-seed-1 | 5/9 | 39/54 | 29/48 | 66% | 222 | no | 25 | 63 | 40 | 46 | 45 |
| casual | bot-seed-2 | 5/9 | 41/54 | 35/48 | 73% | 122 | no | 25 | 68 | 7 | 47 | 38 |
| casual | bot-seed-3 | 8/9 | 42/54 | 31/52 | 70% | 222 | no | 25 | 75 | 32 | 46 | 41 |
| casual | bot-seed-4 | 7/9 | 45/54 | 39/51 | 80% | 121 | no | 25 | 79 | 0 | 48 | 37 |
| casual | bot-seed-5 | 9/9 | 38/54 | 33/50 | 71% | 322 | no | 25 | 79 | 42 | 47 | 38 |
| casual | bot-seed-6 | 9/9 | 39/54 | 39/51 | 76% | 122 | no | 25 | 83 | 18 | 47 | 44 |
| casual | bot-seed-7 | 9/9 | 44/54 | 38/54 | 78% | 222 | no | 25 | 84 | 12 | 47 | 34 |
| casual | bot-seed-8 | 6/9 | 44/54 | 39/53 | 77% | 222 | no | 25 | 74 | 22 | 47 | 38 |
| casual | bot-seed-9 | 5/9 | 46/54 | 27/52 | 68% | 131 | no | 25 | 64 | 20 | 46 | 47 |
| casual | bot-seed-10 | 8/9 | 42/54 | 31/53 | 70% | 222 | no | 25 | 75 | 33 | 46 | 35 |
| casual | bot-seed-11 | 6/9 | 41/54 | 34/52 | 70% | 222 | no | 25 | 69 | 8 | 46 | 35 |
| casual | bot-seed-12 | 6/9 | 39/54 | 35/53 | 69% | 122 | no | 25 | 68 | 8 | 46 | 32 |
| casual | bot-seed-13 | 9/9 | 43/54 | 31/53 | 72% | 121 | no | 25 | 79 | 0 | 47 | 38 |
| casual | bot-seed-14 | 9/9 | 43/54 | 36/52 | 77% | 322 | no | 25 | 83 | 18 | 47 | 38 |
| casual | bot-seed-15 | 5/9 | 44/54 | 34/51 | 73% | 121 | no | 25 | 68 | 0 | 47 | 38 |
| casual | bot-seed-16 | 9/9 | 46/54 | 24/55 | 67% | 331 | no | 25 | 76 | 53 | 46 | 39 |
| casual | bot-seed-17 | 5/9 | 42/54 | 33/48 | 72% | 122 | no | 25 | 67 | 0 | 47 | 38 |
| casual | bot-seed-18 | 7/9 | 41/54 | 31/51 | 69% | 122 | no | 25 | 71 | 25 | 46 | 41 |
| casual | bot-seed-19 | 9/9 | 45/54 | 31/54 | 73% | 122 | no | 25 | 80 | 23 | 47 | 38 |
| casual | bot-seed-20 | 9/9 | 41/54 | 40/53 | 78% | 122 | no | 25 | 84 | 12 | 47 | 34 |
| greedy | bot-seed-1 | 2/9 | 19/54 | 14/33 | 36% | 011 | no | 25 | 33 | 35 | 44 | 44 |
| greedy | bot-seed-2 | 0/9 | 22/54 | 18/41 | 38% | 011 | no | 25 | 28 | 10 | 43 | 41 |
| greedy | bot-seed-3 | 0/9 | 18/54 | 12/37 | 30% | 011 | no | 25 | 22 | 0 | 43 | 32 |
| greedy | bot-seed-4 | 0/9 | 27/54 | 15/32 | 44% | 011 | no | 25 | 32 | 8 | 45 | 46 |
| greedy | bot-seed-5 | 0/9 | 13/54 | 4/25 | 19% | 000 | no | 25 | 13 | 0 | 43 | 26 |
| greedy | bot-seed-6 | 0/9 | 11/54 | 6/30 | 18% | 000 | no | 25 | 13 | 0 | 42 | 24 |
| greedy | bot-seed-7 | 0/9 | 10/54 | 7/30 | 18% | 000 | no | 25 | 14 | 0 | 42 | 24 |
| greedy | bot-seed-8 | 0/9 | 22/54 | 11/36 | 33% | 011 | no | 25 | 24 | 0 | 43 | 32 |
| greedy | bot-seed-9 | 0/9 | 7/54 | 5/26 | 13% | 000 | no | 25 | 11 | 0 | 42 | 30 |
| greedy | bot-seed-10 | 2/9 | 16/54 | 11/31 | 31% | 001 | no | 25 | 29 | 0 | 43 | 32 |
| greedy | bot-seed-11 | 0/9 | 17/54 | 10/36 | 27% | 010 | no | 25 | 20 | 8 | 43 | 33 |
| greedy | bot-seed-12 | 0/9 | 23/54 | 26/38 | 49% | 012 | no | 25 | 37 | 13 | 45 | 52 |
| greedy | bot-seed-13 | 3/9 | 17/54 | 10/30 | 32% | 111 | no | 25 | 33 | 0 | 44 | 26 |
| greedy | bot-seed-14 | 1/9 | 7/54 | 11/28 | 21% | 001 | no | 25 | 21 | 0 | 43 | 24 |
| greedy | bot-seed-15 | 0/9 | 20/54 | 8/28 | 31% | 010 | no | 25 | 22 | 0 | 44 | 38 |
| greedy | bot-seed-16 | 0/9 | 22/54 | 16/39 | 37% | 011 | no | 25 | 27 | 0 | 43 | 32 |
| greedy | bot-seed-17 | 0/9 | 12/54 | 15/32 | 28% | 001 | no | 25 | 23 | 0 | 43 | 29 |
| greedy | bot-seed-18 | 0/9 | 23/54 | 19/34 | 43% | 011 | no | 25 | 33 | 0 | 44 | 43 |
| greedy | bot-seed-19 | 0/9 | 13/54 | 14/32 | 28% | 001 | no | 25 | 23 | 13 | 43 | 41 |
| greedy | bot-seed-20 | 0/9 | 0/54 | 1/20 | 1% | 000 | no | 25 | 2 | 0 | 42 | 12 |
| smart | bot-seed-1 | 9/9 | 43/54 | 40/55 | 78% | 121 | no | 25 | 84 | 0 | 47 | 37 |
| smart | bot-seed-2 | 9/9 | 46/54 | 46/58 | 83% | 232 | no | 25 | 88 | 32 | 48 | 37 |
| smart | bot-seed-3 | 9/9 | 48/54 | 40/57 | 81% | 132 | no | 25 | 86 | 8 | 48 | 34 |
| smart | bot-seed-4 | 9/9 | 48/54 | 49/58 | 88% | 131 | no | 25 | 91 | 0 | 48 | 36 |
| smart | bot-seed-5 | 8/9 | 46/54 | 48/57 | 85% | 232 | no | 25 | 86 | 22 | 48 | 37 |
| smart | bot-seed-6 | 7/9 | 47/54 | 46/55 | 85% | 232 | no | 25 | 83 | 32 | 48 | 43 |
| smart | bot-seed-7 | 9/9 | 44/54 | 44/56 | 82% | 322 | no | 25 | 87 | 52 | 48 | 37 |
| smart | bot-seed-8 | 9/9 | 47/54 | 48/56 | 87% | 232 | no | 25 | 91 | 18 | 48 | 36 |
| smart | bot-seed-9 | 9/9 | 46/54 | 45/56 | 84% | 232 | no | 25 | 89 | 5 | 48 | 37 |
| smart | bot-seed-10 | 9/9 | 42/54 | 47/55 | 83% | 322 | no | 25 | 88 | 33 | 48 | 37 |
| smart | bot-seed-11 | 9/9 | 46/54 | 39/56 | 79% | 232 | no | 25 | 85 | 8 | 47 | 31 |
| smart | bot-seed-12 | 9/9 | 43/54 | 44/56 | 81% | 222 | no | 25 | 86 | 22 | 48 | 37 |
| smart | bot-seed-13 | 9/9 | 46/54 | 37/59 | 75% | 232 | no | 25 | 83 | 12 | 47 | 32 |
| smart | bot-seed-14 | 9/9 | 47/54 | 46/58 | 84% | 132 | no | 25 | 89 | 30 | 48 | 40 |
| smart | bot-seed-15 | 9/9 | 43/54 | 39/56 | 76% | 222 | no | 25 | 83 | 28 | 47 | 41 |
| smart | bot-seed-16 | 9/9 | 45/54 | 42/57 | 80% | 322 | no | 25 | 86 | 13 | 47 | 34 |
| smart | bot-seed-17 | 9/9 | 47/54 | 45/59 | 83% | 332 | yes | 25 | 88 | 37 | 48 | 37 |
| smart | bot-seed-18 | 9/9 | 47/54 | 47/58 | 85% | 132 | no | 25 | 89 | 13 | 48 | 34 |
| smart | bot-seed-19 | 9/9 | 48/54 | 47/57 | 87% | 332 | yes | 25 | 90 | 43 | 48 | 37 |
| smart | bot-seed-20 | 9/9 | 47/54 | 42/59 | 80% | 332 | yes | 25 | 86 | 23 | 47 | 31 |
| far | bot-seed-1 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-2 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-3 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-4 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-5 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-6 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-7 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-8 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-9 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-10 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-11 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-12 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-13 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-14 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-15 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-16 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-17 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-18 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-19 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |
| far | bot-seed-20 | 0/9 | 0/54 | 0/20 | 0% | 000 | no | 25 | 0 | 0 | 42 | 13 |

## What each builds (mean per run)

Away: builds made where no storm's water reaches (they protect nothing, so they are not counted as defences).

| Archetype | dune | sandy_vegetation | seawall | breakwater | mangrove | khazan | small_dam | away |
|---|---|---|---|---|---|---|---|---|
| casual | 1.9 | 2.2 | 3.3 | 1.4 | 5.0 | 5.2 | 6.0 | 0.0 |
| greedy | 0.8 | 0.9 | 4.5 | 3.8 | 3.9 | 3.5 | 7.7 | 0.0 |
| smart | 1.4 | 3.3 | 2.6 | 2.6 | 4.0 | 5.7 | 5.3 | 0.0 |
| far | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 25.0 |
done
