# The best plan found for Play Panjim

Found by `npm run bestplan` (tools/bestPlan): a beam search over the game's own run code and hazard model, 20 plans kept a year, every build and repair the game allows weighed by running the game's own resolver for every storm to come; 1944 s with 4 child processes. In this game the storms are fixed, so the run is deterministic. A beam search is not proof of the optimum: the plan below is the best it found.

## Goal 1: 9 of 9 stars — reached

| # | Year | Defence | Tile (q,r) | Place | Changes stars, homes or end biodiversity |
|---|---|---|---|---|---|
| 1 | 2026 | Sandy Vegetation (Pandanus) | -5,21 | near Miramar | yes |
| 2 | 2027 | Mangrove | 2,17 | near Santa Inez | yes |
| 3 | 2028 | Mangrove | 16,18 | near Merces | yes |
| 4 | 2029 | Mangrove | 7,21 | near Taleigao | yes |
| 5 | 2030 | Mangrove | 10,4 | near Campal | yes |
| 6 | 2031 | Mangrove | 11,17 | near Altinho | yes |
| 7 | 2032 | Mangrove | 8,23 | near St Cruz | yes |
| 8 | 2033 | Mangrove | 8,18 | near Altinho | yes |
| 9 | 2034 | Khazan (Bundh & Sluice) | 16,14 | near Merces | yes |
| 10 | 2035 | Mangrove | 20,12 | near Merces | yes |
| 11 | 2036 | Khazan (Bundh & Sluice) | 21,9 | near Merces | yes |
| 12 | 2037 | Mangrove | 12,11 | near Fontainhas | yes |
| 13 | 2038 | Small Dam | 26,8 | near Merces | yes |
| 14 | 2039 | Mangrove | 8,6 | near Campal | yes |
| 15 | 2040 | Sandy Vegetation (Pandanus) | 2,13 | near Santa Inez | yes |
| 16 | 2041 | Breakwater | 2,12 | near Campal | yes |
| 17 | 2042 | Sandy Vegetation (Pandanus) | -12,28 | near Dona Paula | yes |
| 18 | 2043 | Mangrove | 26,7 | near Merces | yes |
| 19 | 2044 | Small Dam | 26,9 | near Merces | yes |
| 20 | 2045 | Breakwater | 3,11 | near Campal | yes |
| 21 | 2046 | Mangrove | 10,2 | near Campal | yes |
| 22 | 2047 | Breakwater | 5,9 | near Campal | yes |
| 23 | 2048 | Mangrove | 22,1 | near Atal Setu | yes |
| 24 | 2049 | Mangrove | 23,0 | near Atal Setu | yes |
| 25 | 2050 | Breakwater | 1,0 | near Campal | yes |

| Storm | Year | Stars | Homes saved (of homes standing in its path) | Homes lost | Biodiversity since the start |
|---|---|---|---|---|---|
| Cyclone | 2030 | 3 | 8 of 9 | 1 | +15 |
| Monsoon flood | 2040 | 3 | 58 of 65 | 7 | +39 |
| Cyclone and flood | 2050 | 3 | 55 of 64 | 9 | +45 |
| **Whole run** | | **9 of 9** | | **17** | |

## Goal 2: the most homes saved — 17 homes lost over the run, so saving every home is not reached

The same plan as goal 1.

| Storm | Year | Stars | Homes saved (of homes standing in its path) | Homes lost | Biodiversity since the start |
|---|---|---|---|---|---|
| Cyclone | 2030 | 3 | 8 of 9 | 1 | +15 |
| Monsoon flood | 2040 | 3 | 58 of 65 | 7 | +39 |
| Cyclone and flood | 2050 | 3 | 55 of 64 | 9 | +45 |
| **Whole run** | | **9 of 9** | | **17** | |

What blocks saving every home:

- c1-cyclone: 1 lost: -2,18 (near Miramar). With 1 more build before that storm (the best the game allows, each tried) every one would stand: what limits it is the number of builds, one a year.
- c2-flood: 7 lost: 25,7 (near Merces), 24,8 (near Merces), 23,8 (near Merces), 23,10 (near Merces), 24,12 (near Merces), 24,11 (near Merces), 23,12 (near Merces). With 3 more builds before that storm (the best the game allows, each tried) every one would stand: what limits it is the number of builds, one a year.
- c3-compound: 9 lost: 3,12 (near Campal), 4,11 (near Campal), 3,13 (near Santa Inez), 2,14 (near Santa Inez), 5,10 (near Campal), 6,9 (near Campal), 8,7 (near Campal), 8,8 (near Campal), 9,8 (near Campal). Even 3 more builds before that storm (the best the game allows, each tried) save 0 of them.

