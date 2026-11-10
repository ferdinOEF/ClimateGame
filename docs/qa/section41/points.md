# Section 35.6: the points, tuned on the bots

`npx tsx tools/panjimBots/points35.ts jobs=4`, 20 seeds (`bot-seed-1` to `bot-seed-20`), 526 s. Each
bot's run was replayed with points on; the stars matched the bots' own runs on every seed (the tool stops if not).
The best plan is tools/bestPlan's for this board (`docs/qa/section41/best_plan.json`, goal 1). "Smart" is the
mixed run (the defences it builds, a mean per run: mangrove 6.3, khazan 5.4, small_dam 4.3, sandy_vegetation 3.0, seawall 2.8, breakwater 2.4, dune 0.8); "seawalls" is Smart limited to seawalls and
breakwaters (seawall 21.0, breakwater 4.0).

## The starting values

{"home":10,"place":250,"objective":300,"coastStanding":20,"coastProtecting":30,"biodiversity":5,"veteran":50}

largest single source in a best play run 42% (Places; target at most 40%); mixed over seawalls at least 145% on every seed (target 15%); the worst best run is 1.66 times the best random run (target above 1): **not every target met**.

| Player | Median | Spread (min to max) | Best | Median stars of 9 | Best run: Homes | Places | Objective | Living coast | Biodiversity | Veterans |
|---|---|---|---|---|---|---|---|---|---|---|
| random | 1515 | 1050 to 2490 | 2490 | 2 | 590 | 1000 | 0 | 750 | 0 | 150 |
| far | 180 | 180 to 180 | 180 | 0 | 180 | 0 | 0 | 0 | 0 | 0 |
| nature | 3600 | 2950 to 3945 | 3945 | 6 | 1000 | 750 | 0 | 1620 | 325 | 250 |
| seawalls | 1400 | 1340 to 1400 | 1400 | 2 | 400 | 1000 | 0 | 0 | 0 | 0 |
| smart | 3898 | 3435 to 4460 | 4460 | 6.5 | 1170 | 1750 | 0 | 1210 | 130 | 200 |
| guided | 4540 | 4025 to 5135 | 5135 | 7 | 1110 | 1500 | 900 | 1290 | 185 | 150 |
| best | 4220 | 4125 to 4440 | 4440 | 7 | 1180 | 1750 | 0 | 1210 | 100 | 200 |
| bestPlan | 4875 | 4875 to 4875 | 4875 | 9 | 1220 | 1250 | 300 | 1640 | 215 | 250 |

## The final values

{"home":10,"place":200,"objective":300,"coastStanding":20,"coastProtecting":30,"biodiversity":5,"veteran":50}

largest single source in a best play run 37% (Places; target at most 40%); mixed over seawalls at least 161% on every seed (target 15%); the worst best run is 1.65 times the best random run (target above 1): **every target met**. Chosen as the values
nearest the starting ones (by ratio) that meet every target, keeping their order of importance
(objective ≥ place ≥ veteran ≥ coastProtecting ≥ coastStanding ≥ home ≥ biodiversity), from 1068 candidates.

| Player | Median | Spread (min to max) | Best | Median stars of 9 | Best run: Homes | Places | Objective | Living coast | Biodiversity | Veterans |
|---|---|---|---|---|---|---|---|---|---|---|
| random | 1415 | 1050 to 2290 | 2290 | 2 | 590 | 800 | 0 | 750 | 0 | 150 |
| far | 180 | 180 to 180 | 180 | 0 | 180 | 0 | 0 | 0 | 0 | 0 |
| nature | 3500 | 2950 to 3795 | 3795 | 6 | 1000 | 600 | 0 | 1620 | 325 | 250 |
| seawalls | 1200 | 1140 to 1200 | 1200 | 2 | 400 | 800 | 0 | 0 | 0 | 0 |
| smart | 3638 | 3135 to 4110 | 4110 | 6.5 | 1170 | 1400 | 0 | 1210 | 130 | 200 |
| guided | 4465 | 3975 to 4845 | 4845 | 7 | 1120 | 600 | 900 | 1770 | 255 | 200 |
| best | 3870 | 3775 to 4090 | 4090 | 7 | 1180 | 1400 | 0 | 1210 | 100 | 200 |
| bestPlan | 4625 | 4625 to 4625 | 4625 | 9 | 1220 | 1000 | 300 | 1640 | 215 | 250 |

### Mixed against seawalls only, seed by seed (final values)

| Seed | Smart (mixed) | Seawalls only | Mixed over seawalls | Random | Best |
|---|---|---|---|---|---|
| bot-seed-1 | 3135 | 1200 | 161% | 1790 | 3780 |
| bot-seed-2 | 3510 | 1200 | 192% | 1050 | 3875 |
| bot-seed-3 | 3815 | 1200 | 218% | 1080 | 3865 |
| bot-seed-4 | 3495 | 1200 | 191% | 1210 | 3835 |
| bot-seed-5 | 3865 | 1200 | 222% | 1300 | 4015 |
| bot-seed-6 | 3815 | 1200 | 218% | 2080 | 3795 |
| bot-seed-7 | 3760 | 1200 | 213% | 1090 | 3815 |
| bot-seed-8 | 4055 | 1170 | 247% | 1590 | 3775 |
| bot-seed-9 | 3475 | 1200 | 190% | 1550 | 3920 |
| bot-seed-10 | 3230 | 1200 | 169% | 1090 | 3945 |
| bot-seed-11 | 3630 | 1200 | 203% | 1580 | 3865 |
| bot-seed-12 | 3550 | 1170 | 203% | 2050 | 3900 |
| bot-seed-13 | 3430 | 1170 | 193% | 1460 | 4005 |
| bot-seed-14 | 3645 | 1200 | 204% | 1270 | 3830 |
| bot-seed-15 | 3490 | 1200 | 191% | 1080 | 3915 |
| bot-seed-16 | 3650 | 1200 | 204% | 1370 | 3840 |
| bot-seed-17 | 3980 | 1140 | 249% | 2100 | 3890 |
| bot-seed-18 | 4110 | 1200 | 242% | 1360 | 3915 |
| bot-seed-19 | 3330 | 1170 | 185% | 1590 | 3775 |
| bot-seed-20 | 3715 | 1200 | 210% | 2290 | 4090 |

## The game's values, as played (`POINT_VALUES`, src/core/resiliencePoints.ts)

{"home":10,"place":150,"objective":300,"coastStanding":20,"coastProtecting":30,"biodiversity":5,"veteran":50}

largest single source in a best play run 37% (Living coast; target at most 40%); mixed over seawalls at least 184% on every seed (target 15%); the worst best run is 1.64 times the best random run (target above 1): **every target met**. These are the values the game
counts with (Section 35.6); the search above is this tool's own and changes nothing.

| Player | Median | Spread (min to max) | Best | Median stars of 9 | Best run: Homes | Places | Objective | Living coast | Biodiversity | Veterans |
|---|---|---|---|---|---|---|---|---|---|---|
| random | 1385 | 1040 to 2090 | 2090 | 2 | 590 | 600 | 0 | 750 | 0 | 150 |
| far | 180 | 180 to 180 | 180 | 0 | 180 | 0 | 0 | 0 | 0 | 0 |
| nature | 3400 | 2950 to 3645 | 3645 | 6 | 1000 | 450 | 0 | 1620 | 325 | 250 |
| seawalls | 1000 | 940 to 1000 | 1000 | 2 | 400 | 600 | 0 | 0 | 0 | 0 |
| smart | 3365 | 2835 to 3760 | 3760 | 6.5 | 1170 | 1050 | 0 | 1210 | 130 | 200 |
| guided | 4383 | 3925 to 4695 | 4695 | 7 | 1120 | 450 | 900 | 1770 | 255 | 200 |
| best | 3520 | 3425 to 3740 | 3740 | 7 | 1180 | 1050 | 0 | 1210 | 100 | 200 |
| bestPlan | 4375 | 4375 to 4375 | 4375 | 9 | 1220 | 750 | 300 | 1640 | 215 | 250 |

### Mixed against seawalls only, seed by seed (the game's values)

| Seed | Smart (mixed) | Seawalls only | Mixed over seawalls | Random | Best |
|---|---|---|---|---|---|
| bot-seed-1 | 2835 | 1000 | 184% | 1740 | 3430 |
| bot-seed-2 | 3210 | 1000 | 221% | 1050 | 3525 |
| bot-seed-3 | 3515 | 1000 | 252% | 1080 | 3515 |
| bot-seed-4 | 3245 | 1000 | 225% | 1210 | 3485 |
| bot-seed-5 | 3515 | 1000 | 252% | 1300 | 3665 |
| bot-seed-6 | 3465 | 1000 | 247% | 1880 | 3445 |
| bot-seed-7 | 3410 | 1000 | 241% | 1090 | 3465 |
| bot-seed-8 | 3755 | 970 | 287% | 1540 | 3425 |
| bot-seed-9 | 3175 | 1000 | 217% | 1450 | 3570 |
| bot-seed-10 | 2980 | 1000 | 198% | 1040 | 3595 |
| bot-seed-11 | 3380 | 1000 | 238% | 1430 | 3515 |
| bot-seed-12 | 3200 | 970 | 230% | 1950 | 3550 |
| bot-seed-13 | 3130 | 970 | 223% | 1410 | 3655 |
| bot-seed-14 | 3395 | 1000 | 240% | 1270 | 3480 |
| bot-seed-15 | 3190 | 1000 | 219% | 1080 | 3565 |
| bot-seed-16 | 3350 | 1000 | 235% | 1220 | 3490 |
| bot-seed-17 | 3680 | 940 | 291% | 1900 | 3540 |
| bot-seed-18 | 3760 | 1000 | 276% | 1360 | 3565 |
| bot-seed-19 | 3030 | 970 | 212% | 1490 | 3425 |
| bot-seed-20 | 3415 | 1000 | 242% | 2090 | 3740 |
