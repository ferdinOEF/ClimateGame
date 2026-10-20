# Section 24: the best plan found for Play Panjim

Found by `npm run bestplan` (tools/bestPlan): a beam search over the game's own run code and hazard model, 16 plans kept a year, every build and repair the game allows weighed by running the game's own resolver for every storm to come; 677 s with 4 child processes. In this game the storms are fixed, so the run is deterministic. A beam search is not proof of the optimum: the plan below is the best it found.

## Goal 1: 9 of 9 stars — reached

| # | Year | Defence | Tile (q,r) | Place | Changes stars or homes lost |
|---|---|---|---|---|---|
| 1 | 2026 | Seawall | 2,12 | near Campal | yes |
| 2 | 2027 | Small Dam | 15,16 | near Merces | yes |
| 3 | 2028 | Seawall | -5,18 | near Miramar | yes |
| 4 | 2029 | Small Dam | 9,18 | near Altinho | yes |
| 5 | 2030 | Seawall | 8,3 | near Campal | yes |
| 6 | 2031 | Mangrove | 7,23 | near Taleigao | yes |
| 7 | 2032 | Small Dam | 21,8 | near Patto | yes |
| 8 | 2033 | Small Dam | 26,7 | near Merces | yes |
| 9 | 2034 | Mangrove | 20,12 | near Merces | yes |
| 10 | 2035 | Small Dam | 17,10 | near Patto | yes |
| 11 | 2036 | Small Dam | 26,9 | near Merces | yes |
| 12 | 2037 | Breakwater | 4,10 | near Campal | yes |
| 13 | 2038 | Small Dam | 12,13 | near Patto | yes |
| 14 | 2039 | Small Dam | 15,13 | near Patto | yes |
| 15 | 2040 | Khazan (Bundh & Sluice) | 20,10 | near Merces | yes |
| 16 | 2041 | Small Dam | 28,1 | near Atal Setu | no |
| 17 | 2042 | Seawall | 1,0 | near Campal | no |
| 18 | 2043 | Seawall | 6,0 | near Campal | no |
| 19 | 2044 | Small Dam | 23,0 | near Atal Setu | no |
| 20 | 2045 | Seawall | 0,1 | near Campal | no |
| 21 | 2046 | Seawall | 10,1 | near Campal | no |
| 22 | 2047 | Small Dam | 22,1 | near Atal Setu | no |
| 23 | 2048 | Small Dam | 25,1 | near Atal Setu | no |
| 24 | 2049 | Small Dam | 26,1 | near Atal Setu | no |
| 25 | 2050 | Small Dam | 27,1 | near Atal Setu | no |

| Storm | Year | Stars | Homes saved (of homes standing in its path) | Homes lost |
|---|---|---|---|---|
| Cyclone | 2030 | 3 | 8 of 8 | 0 |
| Monsoon flood | 2040 | 3 | 63 of 65 | 2 |
| Cyclone and flood | 2050 | 3 | 69 of 69 | 0 |
| **Whole run** | | **9 of 9** | | **2** |

## Goal 2: the most homes saved — 2 homes lost over the run, so saving every home is not reached

The same plan as goal 1.

| Storm | Year | Stars | Homes saved (of homes standing in its path) | Homes lost |
|---|---|---|---|---|
| Cyclone | 2030 | 3 | 8 of 8 | 0 |
| Monsoon flood | 2040 | 3 | 63 of 65 | 2 |
| Cyclone and flood | 2050 | 3 | 69 of 69 | 0 |
| **Whole run** | | **9 of 9** | | **2** |

What blocks saving every home:

- c2-flood: 2 lost: 23,10 (near Merces), 8,7 (near Campal). With 2 more builds before that storm (the best the game allows, each tried) every one would stand: what limits it is the number of builds, one a year.

