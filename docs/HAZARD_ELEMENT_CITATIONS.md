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
overlay, the storm animation and the damage resolution share.

| Constant | Value | What it does | Kind |
|---|---|---|---|
| `surge.baseM`, `surge.perStrengthM` | 8.5, 1.45 | Surge level at landfall = base + per-strength × strength (game metres) | gameRule |
| `surge.lossPerHex` (sea, channel, beach, land) | 0.43, 0.35, 0.8, 0.7 | How much the surge drops each hex; the lower channel loss is the funnelling up the river | gameRule |
| `flood.baseM`, `flood.perStrengthM` | 5, 1.9 | River flood level at its upstream sources | gameRule |
| `flood.sourceShare` | 0.35 | Which upstream part of the river feeds the flood | gameRule |
| `flood.lossPerHex` (sea, channel, wetland, beach, land) | 3, 0.25, 0.2, 1, 0.35 | How much the flood drops each hex; low wetland loss lets it spread across the khazan fields | gameRule |
| `compound.surgeShare`, `compound.floodShare` | 0.9, 0.85 | Each part's share in the finale | gameRule |
| `compound.backwaterShare`, `backwaterExponent` | 0.6, 1.2 | The surge holding the river back at the mouth | gameRule |
| `defence.metresPerResilience` | 0.9 | Game metres of protection per point of an element's resilience | gameRule |
| `defence.radiusHex`, `defence.falloff` | 3, [1, 0.9, 0.7, 0.45] | How far a defence's protection reaches, and how it fades | gameRule |
| `defence.stackCap` | 1.6 | Different kinds of defence on a tile add up to at most 1.6 × the strongest; several of one kind count once (layered defence) | gameRule |
| `defence.maxProtectionM` | 3.2 | Living defences together protect a tile by no more than this | gameRule |
| `defence.engineeredMaxProtectionM` | 4.5 | An engineered structure's own protection may rise to this (a seawall reaches further than a breakwater) | gameRule |
| `defence.pathShare`, `defence.neighbourShare` | 0.4, 0.5 | Drag on water passing through a defended tile and its neighbours (strongest of each kind counts once; on top of the area ceiling) | gameRule |
| `defence.comboMetresPerPoint` | 0.4 | Extra protection from a combo | gameRule |
| `defence.failDepthPerUnit` | 8.7 | Water depth (× an engineered element's failureThreshold) that breaks it | gameRule |
| `defence.overwhelmDepthPerUnit` | 3.5 | Water depth (× a nature element's overwhelmSeverity) that wears it | gameRule |
| `houseLossDepthM` | 0.6 | Water this deep on a house takes it | gameRule |
| `landfall.jitterSites` | 1 | The real landfall is at most one coastal site from the forecast centre (the bounded jitter) | gameRule |
| `landfall.coneFarSites` | 7 | Half-width of the forecast cone when the warning starts | gameRule |
| `landfall.centreMin`, `centreMax` | 0.15, 0.85 | Where along the coast a forecast centre may fall | gameRule |

## gameRule: the elements (`src/data/elements.json`)

Every cost, resilience, maturity, failure and wear number is a design choice.
The `note` fields in the file that say "PLACEHOLDER" are historical and mean
the same thing.

| Element | Cost | Resilience | Answers | Matures (quarters) | Breaks / wears at | Kind |
|---|---|---|---|---|---|---|
| Dune | 15 | 4 | cyclone | 8 | overwhelm 1.3 | gameRule |
| Pandanus (sandy vegetation) | 10 | 3 | cyclone | 8 | overwhelm 1.1 | gameRule |
| Seawall | 80 | 16 | cyclone | 0 | fails 1.2 | gameRule |
| Breakwater | 85 | 12 | cyclone | 0 | fails 1.25 | gameRule |
| Mangrove | 30 | 5 | cyclone, flood | 20 | overwhelm 1.4 | gameRule |
| Khazan | 65 | 5 | flood | 12 | overwhelm 1.6 | gameRule |
| Small dam | 55 | 10 | flood | 0 | fails 1.15 | gameRule |
| Sand mining | 35 | −4 | (harms) | 0 | – | gameRule |
| Beachside resort | 40 | −1 | (harms) | 0 | – | gameRule |

Income (`effects.money`), biodiversity, carbon, food and population effects
are gameRule too.

## gameRule: the level (`src/data/levels.json`, Panaji)

| Constant | Value | Kind |
|---|---|---|
| `startingCoin` | 500 | gameRule |
| `timeline.economy.incomeScale`, `jarStart` | 0.35, 40 | gameRule |
| Storm years, `jitterYears`, `strength` (1.2 / 1.8 / 2.6) | – | gameRule: the escalation, not a forecast for Goa |
| `climate.intensityPerStrength`, `baselinePerYear`, `seaLevelCmPerYear` | 50, 0.02, 0.4 | gameRule |
| `houseStars` (three 0.9, two 0.6) | – | gameRule |
| Time costs (build 1 quarter, 2 for a seawall or small dam; fast-forward a year 4) | – | gameRule |

The easy-test balance preset (coin × 10, softened storms) is deleted. There
is one baseline (`tests/section4.test.ts`).

## How the game keeps tuning from looking like science

- Real claims come only from `facts.json`, with a citation, and say what the
  source says. The Field Guide and Sources screen show those.
- Anything about how this game works is phrased "In this game, ..." and has
  no citation (`tests/facts.test.ts`).
- No screen quotes a hazard-model or element number as a real-world
  measurement. Depths in the storm animation are drawn, not labelled in
  metres.
