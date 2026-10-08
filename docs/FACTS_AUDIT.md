# Facts audit

Every claim the game makes about the real world, checked against a source.
The data lives in `src/data/facts.json`; `src/core/facts.ts` decides what is
shown; `tests/facts.test.ts` and `tests/noInventedPeople.test.ts` hold the
rules below.

## The rules

- A **fact** is a claim about the real world. It is shown only with a
  complete citation (title, authors, publisher, year, https URL, and a note
  of what the source says). It may hold a number only if the source note
  states that number, with its context.
- A **game rule** describes this game, not the world. It always starts
  "In this game, ..." and carries no citation.
- An entry marked `needsSource` is kept in the data for the record and is
  never shown.
- Following `docs/step-prompts/STEP_PROMPT_hazard_science.md`, only claims
  graded **"Solid, direct"** may be facts. Anything weaker is a game rule or
  hidden.
- Maya says only cited facts, game rules or practical guidance about the
  screen.
- No named real-world cyclone or flood, no dates and no statistics without
  a source.

## How the sources were checked (8 October 2026)

This build machine's network blocks all five source sites (library.sprep.org,
wetlands.org, assets.publishing.service.gov.uk, sahapedia.org and
downtoearth.org.in). A direct fetch of each URL was refused by the proxy,
so the pages could **not** be opened from here.

Each claim was instead checked against the text the sources expose through
web search, which quotes the pages themselves. Every URL was listed live in
those results on 8 October 2026.

| # | Fact id | Source | What the search text confirms | Status |
|---|---|---|---|---|
| 1 | `mangrove-waves` | McIvor, Möller, Spencer & Spalding (2012), TNC / Wetlands International | "wave height can be reduced by between 13 and 66% over 100 m of mangroves"; research has focused on small waves (< 70 cm) | Shown |
| 2 | `dunes-barrier` | Pye, Saye & Blott (2007), Defra / Environment Agency FD1302 summary | dunes "can provide an important natural coastal flood defence"; their importance lies in "their function as barriers to coastal flooding"; managed as dynamic natural defences; scope is England and Wales | Shown, with the England and Wales scope in its note |
| 3 | `khazan-what` | Jacob, Sahapedia (no date on the page) | an agro-aqua integrated system for sharing resources between farmers and fishers; land reclaimed from marshes; bunds keep out tidal water; a sluice gate regulates the flow | Shown |
| 4 | `khazan-mangrove-bund` | Jacob, Sahapedia | "the outer embankment comprises mangroves that act as wave breakers against tidal action" | Shown, cited to Sahapedia only (see below) |
| 5 | `khazan-bund-breach` | Lobo (24 July 2020), Down To Earth | mangroves reclaiming khazan lands because of breaching bunds (the article's photo caption) | Shown as "As reported by Lobo (2020)" |
| 6 | `khazan-holds-floodwater` | — | — | Game rule, word for word as the brief gives it |

**Notes on the six facts:**

- **Fact 4.** The brief also named Lobo (2020) for this claim. The text
  available here does not show Lobo saying that mangroves act as wave
  breakers, so the fact cites Sahapedia alone.
- **Fact 5.** "Unmaintained" is not in the shown text. The text available
  here supports breaching bunds and mangroves coming back, not the reason
  the bunds breach.
- **Fact 6.** It carries no number and no claim that real khazans store
  floodwater, as the brief asks.
- **Sahapedia has no date.** No publication date could be found for the
  Sahapedia article, so it is cited as "n.d.".
- **Dune authors.** The authors of the FD1302 series (Pye, Saye and Blott)
  are as the search results give them.

**Action for a person with normal network access:** open the five URLs
and confirm each note before release. If a page no longer says what its
note says, set `needsSource: true` on that fact; it then disappears from
the game and the Sources screen.

## Discovery cards (formerly `nuggets.json`, 30 lines)

The Discovery card now shows entries from `facts.json`; `nuggets.json`
lists them by id for each element. Verdicts:

| Element | Old line (abridged) | Verdict | Now |
|---|---|---|---|
| Mangrove | "can cut wave height by up to 66%... a monster storm surge arrives exhausted" | **Rewritten as a fact.** The source gives 13–66% over 100 m, mostly for small waves; "up to 66%" alone overstates it, and the source does not cover storm surges | `mangrove-waves` |
| Mangrove | "a coastal nursery: baby fish, crabs and prawns" | **Hidden** (no source checked) | `mangrove-nursery` |
| Mangrove | "lock away carbon faster than almost any rainforest" | **Hidden** (no source; unsourced comparison) | `mangrove-carbon` |
| Pandanus | "roots grip the sand tight enough to blunt an incoming storm surge" | **Game rule** | `pandanus-cheap` |
| Pandanus | "Goan families have woven pandanus leaves... for generations" | **Hidden** | `pandanus-weaving` |
| Pandanus | "cheapest defence... most biodiversity per coin" | **Game rule** (true in `elements.json`) | `pandanus-cheap` |
| Dune | "sacrifices its own sand... slowly rebuilds itself" | **Rewritten as a fact** (FD1302: natural barrier, dynamic) | `dunes-barrier` |
| Dune | "sea turtles and shorebirds nest in the sand" | **Hidden** | `dune-nesting` |
| Dune | "still there tomorrow, smaller but standing" | **Game rule** | `dune-shrinks` |
| Seawall | "bounce back up to 90% of an incoming wave's force" | **Game rule.** The only basis was a reflection-coefficient estimate, not a direct source for this sentence | `seawall-holds` |
| Seawall | "doesn't bend, it breaks... fails all at once" | **Game rule** | `seawall-fails` |
| Seawall | "nothing grows on a seawall" | **Game rule** (biodiversity −2) | `seawall-no-wildlife` |
| Breakwater | "sits out at sea and shatters the wave's power" | **Game rule** | `breakwater-offshore` |
| Breakwater | "barnacles, oysters and coral move in" | **Hidden** | `breakwater-reef` |
| Breakwater | "before breakwaters existed, open coastline had nowhere to hide" | **Removed** (not a meaningful claim) | — |
| Khazan | "one of the oldest engineered landscapes in India... since ancient times" | **Rewritten as a fact** (Sahapedia). The "oldest" and "ancient" claims were dropped | `khazan-what` |
| Khazan | "grows rice and raises fish at the same time... open the sluice gates" | **Merged into the fact** (farmers and fishers sharing the land; sluice gates) | `khazan-what` |
| Khazan | "doesn't block a flood, it drinks it... like a giant sponge" | **Game rule** (the brief's exact wording) | `khazan-holds-floodwater` |
| Small dam | "holds the line right up until it can't... fails all at once" | **Game rule** | `dam-fails` |
| Small dam | "skip the maintenance and a dam quietly weakens every turn" | **Removed: untrue in this game.** Dams do not decay per turn | — |
| Small dam | "storing floodwater and boosting resilience" | **Game rule** | `dam-coin` |
| Resort | "pays coin every turn, but replaces habitat" | **Game rule** | `resort-coin` |
| Resort | "Goa's coastline has lived this trade for real..." | **Hidden** | `resort-goa-coast` |
| Resort | "can't defend itself from anything" | **Game rule** | `resort-no-defence` |
| Sand mining | "fast money, imminent destruction" | **Game rule** | `sandmining-coin` |
| Sand mining | "every truckload... natural flood buffer gone" | **Hidden** | `sandmining-buffer` |
| Sand mining | "the sea starts creeping upstream" | **Hidden** | `sandmining-saltwater` |
| Yacht | "does absolutely nothing... purely to be seen" | **Game rule** | `yacht-nothing` |
| Yacht | "can flatten the seagrass meadow" | **Hidden** | `yacht-seagrass` |
| Yacht | "at 750 coin, the single most expensive thing" | **Game rule** (the number dropped, so it cannot drift from the data) | `yacht-cost` |

**Totals:**

- The cards now show 21 entries, all reached from the cards: 5 cited facts
  and 16 game rules.
- 9 entries are hidden pending a source.
- 2 lines were removed: one meaningless, one untrue in this game.

The card's progress line now reads "N of 21 discoveries", because most
entries are game rules, not facts. The count is computed, never written
into the code.

## Maya

| Tip | Verdict | Now |
|---|---|---|
| heat, shields, get-ready | Practical guidance about the screen | unchanged |
| mangroves | Game rule | "In this game, mangroves slow the surge before it reaches the houses. Plant them on the wetland edge early: they take a few years to grow." |
| khazans | Game rule (the brief's wording) | "In this game, a Khazan holds floodwater so nearby homes stay drier." |
| dunes | "Pandanus roots hold the sand when the wind gets up" was a real-world claim | "In this game, dunes and pandanus shield the beach from a cyclone's surge." |
| seawall | Game rule | "In this game, a seawall costs more and holds no water. If a storm is bigger than the wall, the wall fails all at once." |

**Her other lines:**

- **Removed in PC1:** the five lines from the removed residents (city
  "voices").
- **Unchanged:** the warning and aftermath templates. They report this
  game's outcomes.
- **Storm-phase lines** (`app/stormDirector.ts`): "The khazans are holding
  water" became "Your khazans are holding water". The compound line now
  says "Here the water cannot drain".
- **Screenshot samples** (`maya:<state>` scenarios): these match the new
  tips.

## Tooltips

| Key | Verdict |
|---|---|
| `sea` | Game number. Now says "Sea level in this game: {cm} cm above 2025". |
| `biodiversity`, `carbon`, `food` | Game rules, now prefixed "in this game". `carbon` was wrong for this game: dunes store no carbon here. It now lists what actually stores and emits. |
| `buildWhat.sandy_vegetation` | "roots hold the sand when the wind gets up" became a game rule. |
| `buildWhat.mangrove` | "feeds the creek" became "adds food". |
| `buildWhat.khazan` | "stores floodwater and grows rice and prawns" became "In this game it holds floodwater and adds food". |
| `buildWhat.sand_mining` | "strips the river bed" became a game rule. |
| everything else | UI or game mechanics: unchanged. |

## Field Guide species lines (10)

Each line described real natural history, with no source:

- the kingfisher's rattle;
- the mudskipper breathing through its skin;
- "a harvest as old as the bunds", and so on.

All ten now read "In this game, it turns up around your mangroves" (or
khazans, dunes, and so on). The species names stay.

## Other player-visible text

A sweep of every UI string found these. Each is now a game rule or
neutral wording:

- **Tutorial coach** (`ui/tutorialCoach.ts`), four steps:
  - "where fresh water meets salt";
  - "does a real job: loose sand takes the energy out of a wave";
  - "the best wave absorber on this coast";
  - "on a real coast".
- **How to play** (`ui/helpModal.ts`), 12 roster, meter and threat lines.
  "Skip upkeep and it weakens" was untrue in this game.
- **Storm report** (`ui/stormReport.ts`), six takeaways. They no longer
  say how roots or concrete behave in reality, or that "storms get stronger
  as the season goes on".
- **Aftermath** (`core/aftermath.ts`): a failed wall "was overwhelmed and
  let the water through all at once".
- **Map blurbs**, changed in the generators (`tools/mapgen/*.ts`) and the
  generated JSON:
  - the Tutorial's "every Goan river mouth has this shape";
  - Panjim's "old city sits on reclaimed water" and "all that stands
    between it and the Arabian Sea";
  - the legacy coast's "the shape every stretch of this coast shares";
  - the Tutorial brief in `levels.json`.
- **"km of real coast"** became "km of Panjim's map".
- **Landmarks:** "A real Panjim landmark" became "A Panjim landmark,
  placed from OpenStreetMap".
- **Page metadata** (`index.html`): "restore Khazan fields... survive the
  monsoon" became neutral wording.

## Left as they are, and why

- **Game settings:**
  - the storm years (2032, 2040, 2048);
  - sea-level rise of 0.4 cm a year;
  - the +2% a year baseline;
  - the cyclone and flood seasons.

  These drive this game's schedule and are labelled as the game's
  (tooltips "in this game"). They are not presented as forecasts, and no
  real storm is named.
- **Not displayed:**
  - the combo `line` texts in `core/combos.ts`;
  - the monuments' `category` strings with dates in
    `src/data/maps/panaji.json`.

  If either is ever shown, it needs this audit first.
- **Place and zone names** (Miramar, Taleigao, Ourem creek...) are names
  from OpenStreetMap, not claims.
- **Developer notes** in `elements.json` (`note`, `failureMode`) are never
  shown.
