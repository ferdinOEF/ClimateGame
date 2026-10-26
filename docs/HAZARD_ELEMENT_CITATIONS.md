# Hazard and element numbers: what is cited and what is design

Section 4 (`STEP_PROMPT_city_hill_risk_mechanics.md`, 4.1) made a deliberate
break: **the geography stays real, the numbers become game design.** This
file lists every number the hazards and defences run on and says which kind
it is. Nothing labelled **gameRule** comes from a study, and the game never
presents one as if it did. The handful of real claims the game makes about
the world are in `src/data/facts.json`, each with its full citation, and are
audited in `docs/FACTS_AUDIT.md`; they are unchanged by Section 4.

## Three kinds of number

| Kind | Meaning | Where |
|---|---|---|
| **Fixed (real data)** | Measured or mapped, or held fixed by the brief. Never tuned. | OSM tile map, terrain, coastline, river and creek channels, DEM elevation, real positions, placement rules |
| **Cited fact** | A claim about the real world, shown to the player only with its citation. | `src/data/facts.json` (6 entries; see `docs/FACTS_AUDIT.md`) |
| **gameRule** | A design choice, tuned so Panaji plays as a fair build-and-protect game. **No study backs it.** | Everything below |

## Fixed: real data (do not tune)

| What | Source | Where |
|---|---|---|
| Tile map, terrain types, coastline, river and creek channels | OpenStreetMap contributors (ODbL), accessed 2026-10-05 | `tools/mapgen/`, generated into `src/data/maps/panaji.json` |
| Ground elevation of every tile (`elevationM`) | Copernicus DEM GLO-30, tile N15E073, accessed 2026-10-10 | `tools/mapgen/dem/`, generated into the map |
| Positions of landmarks and localities | OpenStreetMap | `src/data/maps/panaji.json` |
| What may be built on which terrain (the placement rules standing in for the CRZ rules) | Section 4 keeps them as they are | `validTerrainIds` in `src/data/elements.json`, `GameState.canBuild` |

The vertical exaggeration of the drawn relief (`src/data/relief.json`) is
presentation only: it changes how high Altinho looks, never the ground
height the water is compared with.

## Cited facts (unchanged)

`mangrove-waves`, `dunes-barrier`, `khazan-what`, `khazan-mangrove-bund`,
`khazan-bund-breach` are shown with their citations on the Sources screen
and in the Field Guide. `khazan-holds-floodwater` was already a game rule
("In this game, ...") and carries no citation. None of these facts supplies
a number to the hazard model: a mangrove's 13–66% wave-height reduction over
100 m (McIvor et al. 2012) is shown as what the research says, and is **not**
the mangrove's strength in the game.

## gameRule: the hazard model (`src/data/hazardModel.json`)

All read by `src/core/hazardModel.ts`, the one module the preview, the risk
overlay, the storm animation and the damage resolution share. Brought up to
date with the data in Section 34 (the tables had drifted since Section 4).

| Constant | Value | What it does | Kind |
|---|---|---|---|
| `surge.baseM`, `surge.perStrengthM` | 7, 2.027 | Surge level at landfall = base + per-strength × strength (game metres) | gameRule |
| `surge.weakStorm` (refStrength, seaExponent, channelExponent) | 2.6, 1.42, 0.9 | A storm weaker than 2.6 loses more height per hex, × (2.6 / strength) to these powers (Section 6.1) | gameRule |
| `surge.lossPerHex` (sea, channel, beach, land) | 0.43, 0.35, 0.8, 0.7 | How much the surge drops each hex; the lower channel loss is the funnelling up the river | gameRule |
| `flood.baseM`, `flood.perStrengthM` | 5, 1.9 | River flood level at its upstream sources | gameRule |
| `flood.sourceShare` | 0.35 | Which upstream part of the river feeds the flood, on a map with no `floodSource` (Panjim names its own) | gameRule |
| `flood.lossPerHex` (sea, channel, wetland, beach, land) | 3, 0.2, 0.15, 1, 0.35 | How much the flood drops each hex | gameRule |
| `compound.surgeShare`, `compound.floodShare` | 0.9, 0.85 | Each part's share in the 2050 storm | gameRule |
| `compound.backwaterShare`, `backwaterExponent` | 0.6, 1.2 | The surge holding the river back at the mouth | gameRule |
| `defence.metresPerResilience` | 0.9 | Game metres of protection per point of a defence's resilience | gameRule |
| `defence.radiusHex`, `defence.falloff` | 3, [1, 0.9, 0.7, 0.45] | How far a defence's protection reaches, and how it fades | gameRule |
| `defence.stackCap` | 1.6 | Different kinds on a tile add up to at most 1.6 × the strongest; several of one kind count once, except a pair (`pairsLike`: two dunes side by side count like a seawall, two khazans like a small dam, Section 25) | gameRule |
| `defence.maxProtectionM`, `engineeredMaxProtectionM` | 5, 6 | The ceiling on a tile's protection, living defences only, and with an engineered one | gameRule |
| `defence.pathShare`, `defence.neighbourShare` | 0.4, 0.5 | Drag on water passing through a defended tile and its neighbours | gameRule |
| `defence.comboMetresPerPoint` | 0.4 | Extra protection from a combo (a khazan beside mangroves; three mangroves together) | gameRule |
| `defence.overwhelmDepthPerUnit` | 3.5 | Water depth (× a nature element's overwhelmSeverity) that wears it | gameRule |
| `defence.failDepthPerUnit` | 8.7 | The old depth failure; no engineered defence on today's levels uses it (they break by storm count and age, below) | gameRule (unused) |
| `houseLossDepthM` | 0.6 | Water (plus wind) this deep on a house takes it | gameRule |
| `wind.perStrengthM`, `inlandKeep`, `landfallReachHex` | 0.2, 0.75, 14 | The default cyclone wind (the Tutorial's): metres of water equivalent per strength at landfall, kept per hex inland | gameRule |
| `wind.shelter.sandy_vegetation`, `shelterReachHex`, `minKeep` | 0.5, 2, 0.4 | Pandanus halves the wind on homes within 2 tiles; wind never falls below 0.4 of itself | gameRule |
| Panjim's own wind (`levels.json`, on the storms) | 2030: 1.0 a strength, 0.8 a hex; 2050: 0.6, 0.8, 1.1 in the compound storm | The two Panjim cyclones' wind (Section 26.3) | gameRule |

## gameRule: the elements (`src/data/elements.json`)

Every resilience, biodiversity, ageing and wear number is a design choice.
Costs and growth times are kept in the file for when coins and growth return
(both off on every level, Section 5).

| Element | Resilience | Biodiversity | Builds on | Breaks or wears | Kind |
|---|---|---|---|---|---|
| Dune | 4 | +2 | beach | worn by a big storm (overwhelm 1.3), until repaired; two side by side count like a seawall | gameRule |
| Pandanus | 3 | +3 | beach | worn (overwhelm 1.1); the only wind shelter | gameRule |
| Mangrove | 5 | +3 | estuary (wetland) | worn (overwhelm 1.4) | gameRule |
| Khazan | 4.5 | +2 | estuary (wetland) | never worn; two side by side count like a small dam | gameRule |
| Seawall | 16 | −5 | beach, coast | breaks in its 2nd cyclone; cracked from 10 years old, then breaks in its next | gameRule |
| Breakwater | 12 | −2 | coast (near sea) | breaks at 10 years old | gameRule |
| Small dam | 10 | −1 | river | breaks in its 2nd flood; cracked from 10 years old, then breaks in its next | gameRule |
| Sand mining | −4 | −3 | river | retired: no level offers it (Section 17.3) | gameRule |
| Beachside resort, yacht | – | – | – | built only with coins on | gameRule |

## gameRule: the level (`src/data/levels.json`, Panjim)

| Constant | Value | Kind |
|---|---|---|
| Storms (year, strength, landfall) | 2030 cyclone 1.2 at -5,18; 2040 flood 2.35 from the Mandovi (33,1 33,2 32,3); 2050 cyclone and flood 3.0 at 2,12 | gameRule: the escalation, not a forecast for Goa |
| `houseStars` | one 30%, two 55% with biodiversity at or above the start, three 85% with biodiversity up 6 (up 40 by the end of 2050 for the 2050 storm) | gameRule |
| The clear rule | a star in every storm and 5 of 9 in all | gameRule |
| `shelteredTiles` on the 2050 storm | 134 tiles in the middle of Taleigao take no water or wind | gameRule |
| `climate.seaLevelCmPerYear` | 0.4 (not shown anywhere: no cited source) | gameRule |
| `economy`, `growth` | off (`startingCoin` 10000 kept for when coins return) | gameRule |
| `parTurns`, `starThresholds` | old score fields; the yearly game has no par (Section 34) | unused |

## How the game keeps tuning from looking like science

- Real claims come only from `facts.json`, with a citation, and say what the
  source says. The Field Guide and Sources screen show those.
- Anything about how this game works is phrased "In this game, ..." and has
  no citation (`tests/facts.test.ts`).
- No screen quotes a hazard-model or element number as a real-world
  measurement. Depths in the storm animation are drawn, not labelled in
  metres.
