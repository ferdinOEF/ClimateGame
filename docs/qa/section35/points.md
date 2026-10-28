# Section 35.6: the points, tuned on the bots

`npx tsx tools/panjimBots/points35.ts jobs=4`, 20 seeds (`bot-seed-1` to `bot-seed-20`), 174 s. Each
bot's run was replayed with points on; the stars matched the bots' own runs on every seed (the tool stops if not).
The best plan is tools/bestPlan's for this board (`docs/qa/section34c/best_plan.json`, goal 1). "Smart" is the
mixed run (the defences it builds, a mean per run: khazan 5.4, small_dam 5.3, mangrove 4.8, sandy_vegetation 3.4, breakwater 3.4, seawall 1.5, dune 1.1); "seawalls" is Smart limited to seawalls and
breakwaters (breakwater 17.2, seawall 7.8).

## The starting values

{"home":10,"place":250,"objective":300,"coastStanding":20,"coastProtecting":30,"biodiversity":5,"veteran":50}

largest single source in a best play run 46% (Places; target at most 40%); mixed over seawalls at least 147% on every seed (target 15%); the worst best run is 1.97 times the best random run (target above 1): **not every target met**.

| Player | Median | Spread (min to max) | Best | Median stars of 9 | Best run: Homes | Places | Objective | Living coast | Biodiversity | Veterans |
|---|---|---|---|---|---|---|---|---|---|---|
| random | 935 | 280 to 2030 | 2030 | 1 | 360 | 1000 | 0 | 620 | 0 | 50 |
| far | 0 | 0 to 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| nature | 4150 | 3460 to 4530 | 4530 | 7 | 950 | 1000 | 300 | 1710 | 320 | 250 |
| seawalls | 1410 | 1160 to 1410 | 1410 | 2 | 160 | 1250 | 0 | 0 | 0 | 0 |
| smart | 4278 | 3480 to 4795 | 4795 | 7 | 1030 | 2000 | 300 | 1130 | 85 | 250 |
| guided | 5070 | 4540 to 5410 | 5410 | 7 | 1000 | 1750 | 900 | 1410 | 200 | 150 |
| best | 4505 | 3990 to 4655 | 4655 | 7 | 1150 | 2000 | 0 | 1210 | 95 | 200 |
| bestPlan | 4915 | 4915 to 4915 | 4915 | 9 | 1150 | 1750 | 0 | 1550 | 215 | 250 |

## The final values

{"home":10,"place":150,"objective":300,"coastStanding":20,"coastProtecting":30,"biodiversity":5,"veteran":50}

largest single source in a best play run 37% (Living coast; target at most 40%); mixed over seawalls at least 238% on every seed (target 15%); the worst best run is 2.02 times the best random run (target above 1): **every target met**. Chosen as the values
nearest the starting ones (by ratio) that meet every target, keeping their order of importance
(objective ≥ place ≥ veteran ≥ coastProtecting ≥ coastStanding ≥ home ≥ biodiversity), from 1068 candidates.

| Player | Median | Spread (min to max) | Best | Median stars of 9 | Best run: Homes | Places | Objective | Living coast | Biodiversity | Veterans |
|---|---|---|---|---|---|---|---|---|---|---|
| random | 820 | 280 to 1630 | 1630 | 1 | 360 | 600 | 0 | 620 | 0 | 50 |
| far | 0 | 0 to 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| nature | 3765 | 3260 to 4130 | 4130 | 7 | 950 | 600 | 300 | 1710 | 320 | 250 |
| seawalls | 910 | 760 to 910 | 910 | 2 | 160 | 750 | 0 | 0 | 0 | 0 |
| smart | 3550 | 3080 to 3995 | 3995 | 7 | 1030 | 1200 | 300 | 1130 | 85 | 250 |
| guided | 4595 | 4240 to 4800 | 4800 | 7 | 1020 | 750 | 900 | 1600 | 280 | 250 |
| best | 3705 | 3290 to 3855 | 3855 | 7 | 1150 | 1200 | 0 | 1210 | 95 | 200 |
| bestPlan | 4215 | 4215 to 4215 | 4215 | 9 | 1150 | 1050 | 0 | 1550 | 215 | 250 |

### Mixed against seawalls only, seed by seed (final values)

| Seed | Smart (mixed) | Seawalls only | Mixed over seawalls | Random | Best |
|---|---|---|---|---|---|
| bot-seed-1 | 3535 | 910 | 288% | 440 | 3845 |
| bot-seed-2 | 3595 | 910 | 295% | 780 | 3600 |
| bot-seed-3 | 3995 | 910 | 339% | 1130 | 3290 |
| bot-seed-4 | 3540 | 910 | 289% | 1630 | 3725 |
| bot-seed-5 | 3315 | 910 | 264% | 880 | 3820 |
| bot-seed-6 | 3600 | 760 | 374% | 1140 | 3595 |
| bot-seed-7 | 3630 | 910 | 299% | 580 | 3290 |
| bot-seed-8 | 3745 | 910 | 312% | 470 | 3585 |
| bot-seed-9 | 3200 | 760 | 321% | 1320 | 3845 |
| bot-seed-10 | 3565 | 910 | 292% | 530 | 3845 |
| bot-seed-11 | 3775 | 760 | 397% | 1100 | 3290 |
| bot-seed-12 | 3670 | 910 | 303% | 750 | 3705 |
| bot-seed-13 | 3230 | 760 | 325% | 830 | 3550 |
| bot-seed-14 | 3960 | 760 | 421% | 940 | 3855 |
| bot-seed-15 | 3080 | 910 | 238% | 340 | 3705 |
| bot-seed-16 | 3355 | 910 | 269% | 280 | 3600 |
| bot-seed-17 | 3560 | 760 | 368% | 810 | 3740 |
| bot-seed-18 | 3495 | 760 | 360% | 1100 | 3635 |
| bot-seed-19 | 3155 | 760 | 315% | 620 | 3710 |
| bot-seed-20 | 3385 | 910 | 272% | 1350 | 3830 |
