# The best plan found for Play Panjim

Found by `npm run bestplan` (tools/bestPlan): a beam search over the game's own run code and hazard model, 20 plans kept a year, every build and repair the game allows weighed by running the game's own resolver for every storm to come; 3653 s with 4 child processes. In this game the storms are fixed, so the run is deterministic. A beam search is not proof of the optimum: the plan below is the best it found.

## Goal 1: 9 of 9 stars — reached

| # | Year | Defence | Tile (q,r) | Place | Changes stars, homes or end biodiversity |
|---|---|---|---|---|---|
| 1 | 2026 | Mangrove | 16,18 | near Merces | yes |
| 2 | 2027 | Dune | -4,18 | near Miramar | yes |
| 3 | 2028 | Pandanus | -5,21 | near Miramar | yes |
| 4 | 2029 | Mangrove | 7,21 | near Taleigao | yes |
| 5 | 2030 | Mangrove | 7,24 | near St Cruz | yes |
| 6 | 2031 | Khazan | 8,18 | near Altinho | yes |
| 7 | 2032 | Khazan | 16,16 | near Merces | yes |
| 8 | 2033 | Mangrove | 10,20 | near St Cruz | yes |
| 9 | 2034 | Mangrove | 20,12 | near Merces | yes |
| 10 | 2035 | Khazan | 22,8 | near Merces | yes |
| 11 | 2036 | Khazan | 21,9 | near Merces | yes |
| 12 | 2037 | Mangrove | 23,7 | near Atal Setu | yes |
| 13 | 2038 | Khazan | 11,17 | near Altinho | yes |
| 14 | 2039 | Mangrove | 15,8 | near São Tomé | yes |
| 15 | 2040 | Khazan | 13,12 | near Patto | yes |
| 16 | 2041 | Breakwater | 8,4 | near Campal | yes |
| 17 | 2042 | Breakwater | 2,12 | near Campal | yes |
| 18 | 2043 | Breakwater | 4,10 | near Campal | yes |
| 19 | 2044 | Pandanus | 2,13 | near Santa Inez | yes |
| 20 | 2045 | Pandanus | -12,28 | near Dona Paula | yes |
| 21 | 2046 | Mangrove | 26,6 | near Merces | yes |
| 22 | 2047 | Mangrove | 24,6 | near Atal Setu | yes |
| 23 | 2048 | Breakwater | 3,11 | near Campal | yes |
| 24 | 2049 | Breakwater | 1,0 | near Campal | yes |
| 25 | 2050 | Mangrove | 25,6 | near Atal Setu | yes |

| Storm | Year | Stars | Homes saved (of homes standing in its path) | Homes lost | Biodiversity since the start |
|---|---|---|---|---|---|
| Cyclone | 2030 | 3 | 8 of 9 | 1 | +14 |
| Monsoon flood | 2040 | 3 | 53 of 57 | 4 | +38 |
| Cyclone and flood | 2050 | 3 | 55 of 59 | 4 | +43 |
| **Whole run** | | **9 of 9** | | **9** | |

## Goal 2: the most homes saved — 9 homes lost over the run, so saving every home is not reached

The same plan as goal 1.

| Storm | Year | Stars | Homes saved (of homes standing in its path) | Homes lost | Biodiversity since the start |
|---|---|---|---|---|---|
| Cyclone | 2030 | 3 | 8 of 9 | 1 | +14 |
| Monsoon flood | 2040 | 3 | 53 of 57 | 4 | +38 |
| Cyclone and flood | 2050 | 3 | 55 of 59 | 4 | +43 |
| **Whole run** | | **9 of 9** | | **9** | |

What blocks saving every home:

- c1-cyclone: 1 lost: -2,18 (near Miramar). With 1 more build before that storm (the best the game allows, each tried) every one would stand: what limits it is the number of builds, one a year.
- c2-flood: 4 lost: 25,7 (near Merces), 14,15 (near Patto), 14,16 (near Merces), 8,7 (near Campal). With 3 more builds before that storm (the best the game allows, each tried) every one would stand: what limits it is the number of builds, one a year.
- c3-compound: 4 lost: 3,12 (near Campal), 4,11 (near Campal), 3,13 (near Santa Inez), 2,14 (near Santa Inez). Even 3 more builds before that storm (the best the game allows, each tried) save 0 of them.

