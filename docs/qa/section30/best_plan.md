# The best plan found for Play Panjim

Found by `npm run bestplan` (tools/bestPlan): a beam search over the game's own run code and hazard model, 20 plans kept a year, every build and repair the game allows weighed by running the game's own resolver for every storm to come; 1127 s with 4 child processes. In this game the storms are fixed, so the run is deterministic. A beam search is not proof of the optimum: the plan below is the best it found.

## Goal 1: 9 of 9 stars — reached

| # | Year | Defence | Tile (q,r) | Place | Changes stars, homes or end biodiversity |
|---|---|---|---|---|---|
| 1 | 2026 | Pandanus | -3,17 | near Miramar | yes |
| 2 | 2027 | Pandanus | -5,20 | near Miramar | yes |
| 3 | 2028 | Mangrove | 7,21 | near Taleigao | yes |
| 4 | 2029 | Mangrove | 16,18 | near Merces | yes |
| 5 | 2030 | Mangrove | 10,20 | near St Cruz | yes |
| 6 | 2031 | Mangrove | 8,18 | near Altinho | yes |
| 7 | 2032 | Khazan | 11,17 | near Altinho | yes |
| 8 | 2033 | Mangrove | 15,8 | near São Tomé | yes |
| 9 | 2034 | Mangrove | 9,16 | near Altinho | yes |
| 10 | 2035 | Mangrove | 7,23 | near Taleigao | yes |
| 11 | 2036 | Mangrove | 20,13 | near Merces | yes |
| 12 | 2037 | Mangrove | 16,15 | near Merces | yes |
| 13 | 2038 | Mangrove | 19,11 | near Merces | yes |
| 14 | 2039 | Khazan | 22,8 | near Merces | yes |
| 15 | 2040 | Khazan | 21,9 | near Merces | yes |
| 16 | 2041 | Seawall | 2,12 | near Campal | yes |
| 17 | 2042 | Pandanus | 2,13 | near Santa Inez | yes |
| 18 | 2043 | Breakwater | 8,4 | near Campal | yes |
| 19 | 2044 | Dune | 1,13 | near Miramar | yes |
| 20 | 2045 | Mangrove | 24,6 | near Atal Setu | yes |
| 21 | 2046 | Breakwater | 4,10 | near Campal | yes |
| 22 | 2047 | Small Dam | 23,0 | near Atal Setu | yes |
| 23 | 2048 | Mangrove | 25,6 | near Atal Setu | yes |
| 24 | 2049 | Small Dam | 25,1 | near Atal Setu | yes |
| 25 | 2050 | Small Dam | 22,1 | near Atal Setu | yes |

| Storm | Year | Stars | Homes saved (of homes standing in its path) | Homes lost | Biodiversity since the start |
|---|---|---|---|---|---|
| Cyclone | 2030 | 3 | 8 of 9 | 1 | +15 |
| Monsoon flood | 2040 | 3 | 52 of 57 | 5 | +42 |
| Cyclone and flood | 2050 | 3 | 49 of 57 | 8 | +41 |
| **Whole run** | | **9 of 9** | | **14** | |

## Goal 2: the most homes saved — 14 homes lost over the run, so saving every home is not reached

The same plan as goal 1.

| Storm | Year | Stars | Homes saved (of homes standing in its path) | Homes lost | Biodiversity since the start |
|---|---|---|---|---|---|
| Cyclone | 2030 | 3 | 8 of 9 | 1 | +15 |
| Monsoon flood | 2040 | 3 | 52 of 57 | 5 | +42 |
| Cyclone and flood | 2050 | 3 | 49 of 57 | 8 | +41 |
| **Whole run** | | **9 of 9** | | **14** | |

What blocks saving every home:

- c1-cyclone: 1 lost: -6,23 (near Caranzalem). With 1 more build before that storm (the best the game allows, each tried) every one would stand: what limits it is the number of builds, one a year.
- c2-flood: 5 lost: 25,7 (near Merces), 23,12 (near Merces), 11,11 (near Fontainhas), 10,12 (near Altinho), 8,7 (near Campal). Even 3 more builds before that storm (the best the game allows, each tried) save 4 of them.
- c3-compound: 8 lost: 3,12 (near Campal), 4,11 (near Campal), 3,13 (near Santa Inez), 2,14 (near Santa Inez), 5,10 (near Campal), 6,9 (near Campal), 8,8 (near Campal), 9,8 (near Campal). Even 3 more builds before that storm (the best the game allows, each tried) save 0 of them.

