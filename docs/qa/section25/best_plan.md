# The best plan found for Play Panjim

Found by `npm run bestplan` (tools/bestPlan): a beam search over the game's own run code and hazard model, 18 plans kept a year, every build and repair the game allows weighed by running the game's own resolver for every storm to come; 782 s with 4 child processes. In this game the storms are fixed, so the run is deterministic. A beam search is not proof of the optimum: the plan below is the best it found.

## Goal 1: 9 of 9 stars — reached

| # | Year | Defence | Tile (q,r) | Place | Changes stars or homes lost |
|---|---|---|---|---|---|
| 1 | 2026 | Dune | -4,18 | near Miramar | yes |
| 2 | 2027 | Breakwater | 2,12 | near Campal | yes |
| 3 | 2028 | Mangrove | 10,4 | near Campal | yes |
| 4 | 2029 | Mangrove | 8,18 | near Altinho | yes |
| 5 | 2030 | Mangrove | 10,19 | near St Cruz | yes |
| 6 | 2031 | Khazan (Bundh & Sluice) | 7,23 | near Taleigao | yes |
| 7 | 2032 | Breakwater | 6,8 | near Campal | yes |
| 8 | 2033 | Khazan (Bundh & Sluice) | 16,16 | near Merces | yes |
| 9 | 2034 | Mangrove | 20,12 | near Merces | yes |
| 10 | 2035 | Khazan (Bundh & Sluice) | 21,9 | near Merces | yes |
| 11 | 2036 | Mangrove | 12,16 | near Patto | yes |
| 12 | 2037 | Mangrove | 13,9 | near Fontainhas | yes |
| 13 | 2038 | Mangrove | 22,8 | near Merces | yes |
| 14 | 2039 | Small Dam | 26,7 | near Merces | yes |
| 15 | 2040 | Seawall | 3,11 | near Campal | yes |
| 16 | 2041 | Small Dam | 26,8 | near Merces | yes |
| 17 | 2042 | Seawall | 1,12 | near Campal | yes |
| 18 | 2043 | Sandy Vegetation (Pandanus) | 2,13 | near Santa Inez | yes |
| 19 | 2044 | Mangrove | 25,1 | near Atal Setu | no |
| 20 | 2045 | Seawall | 1,0 | near Campal | no |
| 21 | 2046 | Seawall | 6,0 | near Campal | no |
| 22 | 2047 | Mangrove | 23,0 | near Atal Setu | no |
| 23 | 2048 | Breakwater | 0,1 | near Campal | no |
| 24 | 2049 | Mangrove | 22,1 | near Atal Setu | no |
| 25 | 2050 | Breakwater | 10,1 | near Campal | no |

| Storm | Year | Stars | Homes saved (of homes standing in its path) | Homes lost | Biodiversity since the start |
|---|---|---|---|---|---|
| Cyclone | 2030 | 3 | 7 of 8 | 1 | +9 |
| Monsoon flood | 2040 | 3 | 56 of 65 | 9 | +19 |
| Cyclone and flood | 2050 | 3 | 62 of 62 | 0 | +11 |
| **Whole run** | | **9 of 9** | | **10** | |

## Goal 2: the most homes saved — 10 homes lost over the run, so saving every home is not reached

The same plan as goal 1.

| Storm | Year | Stars | Homes saved (of homes standing in its path) | Homes lost | Biodiversity since the start |
|---|---|---|---|---|---|
| Cyclone | 2030 | 3 | 7 of 8 | 1 | +9 |
| Monsoon flood | 2040 | 3 | 56 of 65 | 9 | +19 |
| Cyclone and flood | 2050 | 3 | 62 of 62 | 0 | +11 |
| **Whole run** | | **9 of 9** | | **10** | |

What blocks saving every home:

- c1-cyclone: 1 lost: -5,22 (near Caranzalem). With 1 more build before that storm (the best the game allows, each tried) every one would stand: what limits it is the number of builds, one a year.
- c2-flood: 9 lost: 25,10 (near Merces), 24,10 (near Merces), 23,10 (near Merces), 24,12 (near Merces), 24,11 (near Merces), 23,12 (near Merces), 11,22 (near St Cruz), 8,7 (near Campal), 3,25 (near Taleigao). Even 3 more builds before that storm (the best the game allows, each tried) save 8 of them.

