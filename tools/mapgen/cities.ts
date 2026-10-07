import type { LatLon } from "./geo";

/**
 * The real places the campaign is played on, described in latitude and
 * longitude.
 *
 * WHY THE GEOGRAPHY LIVES HERE RATHER THAN IN THE TILE DATA
 *
 * `src/data/maps/*.json` is a list of hexes with terrain ids — useful to the
 * game, useless to a human trying to check whether Miramar is on the right
 * side of the Mandovi. This file is the reviewable source: every coastline,
 * river centreline and beach strip is a list of coordinates anyone can paste
 * into a map and compare against the real thing. `buildCityMaps.ts`
 * rasterises it; nothing is hand-placed downstream.
 *
 * HOW ACCURATE THIS IS, HONESTLY
 *
 * The anchor points — town centres, forts, river mouths, beach endpoints —
 * are real coordinates. The coastlines and river banks between them are
 * traced polylines at roughly 500 m to 1 km vertex spacing, not survey data.
 * At 400-520 m per hex, a hex is 20-25 hectares, so a 200 m tracing error
 * cannot move a tile. What the maps therefore get RIGHT is the thing the
 * game needs: proportion and arrangement. Panaji genuinely sits on the south
 * bank of a river roughly 1.3 km wide at that point, Miramar genuinely sits
 * south of its mouth, the Mormugao peninsula genuinely encloses a 3 km-wide
 * Zuari estuary, and the Colva beach strip genuinely runs 8 km north-south
 * with the Sal behind it. What they do NOT claim to be is a navigational
 * chart.
 *
 * LAND POLYGONS OVERSHOOT THE FRAME ON PURPOSE
 *
 * Wherever a polygon edge means "and the land carries on past the edge of the
 * map" rather than a real shoreline, its vertices sit well outside the grid.
 * Trimming them to the exact frame bound leaves hexes near the border falling
 * outside every polygon, so they classify as open water and the result is a
 * thin rind of sea around three sides of a landmass. The row-offset grid makes
 * this worse, because each row is sheared sideways from the last, so the true
 * corner is not where the authored numbers suggest.
 *
 * ONE DELIBERATE DISTORTION, APPLIED EVERYWHERE
 *
 * A river narrower than one hex cannot be drawn on a hex grid. Baga creek is
 * about 60 m across; a hex here is 400 m. Every channel width below is
 * therefore floored at roughly one hex spacing (see `buildCityMaps.ts`), so
 * small creeks render one tile wide rather than vanishing. The alternative —
 * dropping them — would delete the river terrain, and with it the whole Small
 * Dam and Sand Mining branch of the build menu, from half the campaign.
 */

/** One reach of a watercourse: a centreline, plus how wide the channel and its brackish fringe are. */
export interface RiverDef {
  name: string;
  /** Centreline, ordered mouth-first (seaward end at index 0). */
  points: LatLon[];
  /**
   * Channel width in metres at each centreline vertex, interpolated between
   * them. Mouth-first, so these normally taper downward: a river is widest
   * where it meets the sea.
   */
  widthsM: number[];
  /**
   * How far the brackish/mangrove fringe extends beyond the channel edge.
   * This is where Mangrove and Khazan get built, so it is a gameplay dial as
   * much as a geographic one.
   */
  fringeM: number;
}

export interface BeachDef {
  name: string;
  /** The waterline, as a polyline. */
  points: LatLon[];
  /** How far inland the sand runs. Goa's north-coast beaches are genuinely wide; the south-coast ones wider still. */
  depthM: number;
}

export interface EstuaryPatchDef {
  name: string;
  center: LatLon;
  radiusM: number;
}

export interface CityDef {
  id: string;
  /** Shown on the level card and in the HUD. */
  name: string;
  region: string;
  /** One or two sentences of real context, shown when the level opens. */
  blurb: string;
  /** Centre of the hex grid. */
  origin: LatLon;
  /** Centre-to-centre hex spacing on the ground. */
  metersPerHex: number;
  cols: number;
  rows: number;
  /** Everything above the waterline. Anything outside every polygon is open water. */
  landmasses: LatLon[][];
  rivers: RiverDef[];
  estuaryPatches: EstuaryPatchDef[];
  beaches: BeachDef[];
  landmarks: { name: string; at: LatLon }[];
  /** Where the camera opens. Picked to put sea, sand, river and town in one frame. */
  focus: LatLon;
}

/* ------------------------------------------------------------------ *
 * 1. Panaji (Panjim) — the mouth of the Mandovi
 * ------------------------------------------------------------------ */

const PANAJI: CityDef = {
  id: "panaji",
  name: "Panaji",
  region: "Tiswadi, North Goa",
  blurb:
    "Goa's capital sits on the south bank of the Mandovi, a kilometre and a half from where the river meets the Arabian Sea. Miramar's sand holds that mouth open; Fort Aguada watches it from the far bank.",
  origin: { lat: 15.489, lon: 73.8 },
  metersPerHex: 430,
  cols: 19,
  rows: 17,
  landmasses: [
    // Bardez, north of the river: Aguada headland, then the north bank
    // running east past Reis Magos to Betim.
    [
      { lat: 15.4938, lon: 73.7752 }, // Aguada point
      { lat: 15.4965, lon: 73.77 },
      { lat: 15.507, lon: 73.7688 },
      { lat: 15.532, lon: 73.7695 },
      { lat: 15.532, lon: 73.857 },
      { lat: 15.512, lon: 73.857 },
      { lat: 15.5075, lon: 73.83 }, // Betim
      { lat: 15.503, lon: 73.816 }, // Verem
      { lat: 15.4988, lon: 73.8058 }, // Reis Magos
      { lat: 15.4948, lon: 73.7928 }, // Nerul
      { lat: 15.494, lon: 73.7822 }
    ],
    // Tiswadi, south of the river: Miramar's spit, the Panaji waterfront,
    // then down the coast to Caranzalem and the Dona Paula headland.
    [
      { lat: 15.48, lon: 73.8045 }, // north tip of the Miramar spit
      { lat: 15.485, lon: 73.8105 },
      { lat: 15.4915, lon: 73.8195 },
      { lat: 15.497, lon: 73.8275 }, // Panaji waterfront
      { lat: 15.5015, lon: 73.838 },
      { lat: 15.5045, lon: 73.857 },
      { lat: 15.446, lon: 73.857 },
      { lat: 15.446, lon: 73.7975 },
      { lat: 15.464, lon: 73.805 },
      { lat: 15.4715, lon: 73.809 }, // Caranzalem
      { lat: 15.476, lon: 73.8072 } // Miramar
    ]
  ],
  rivers: [
    {
      // The centreline starts at the Reis Magos narrows, not out at sea.
      // West of that the Mandovi opens into Aguada Bay, which is 3-4 km
      // across and behaves like open coast — so the rasteriser is told to
      // treat it as coast by simply not running the river out into it.
      name: "Mandovi",
      points: [
        { lat: 15.4895, lon: 73.807 }, // the narrows at Reis Magos
        { lat: 15.4925, lon: 73.815 },
        { lat: 15.4955, lon: 73.823 },
        { lat: 15.4995, lon: 73.832 },
        { lat: 15.5035, lon: 73.842 }
      ],
      widthsM: [1250, 1100, 960, 840, 760],
      fringeM: 320
    }
  ],
  estuaryPatches: [
    { name: "Ribandar khazans", center: { lat: 15.5028, lon: 73.8375 }, radiusM: 520 },
    { name: "Nerul mangroves", center: { lat: 15.4962, lon: 73.7952 }, radiusM: 460 }
  ],
  beaches: [
    {
      name: "Miramar & Caranzalem",
      points: [
        { lat: 15.4525, lon: 73.8005 },
        { lat: 15.4715, lon: 73.809 },
        { lat: 15.48, lon: 73.8048 }
      ],
      depthM: 480
    },
    {
      name: "Sinquerim & Candolim",
      points: [
        { lat: 15.4945, lon: 73.771 },
        { lat: 15.507, lon: 73.769 },
        { lat: 15.532, lon: 73.7697 }
      ],
      depthM: 480
    }
  ],
  landmarks: [
    { name: "Panaji", at: { lat: 15.4989, lon: 73.8278 } },
    { name: "Miramar Beach", at: { lat: 15.476, lon: 73.807 } },
    { name: "Fort Aguada", at: { lat: 15.4925, lon: 73.7733 } },
    { name: "Reis Magos", at: { lat: 15.4983, lon: 73.8064 } },
    { name: "Mandovi River", at: { lat: 15.4915, lon: 73.8105 } }
  ],
  focus: { lat: 15.4865, lon: 73.807 }
};

/* ------------------------------------------------------------------ *
 * 2. Morjim & the Chapora mouth
 * ------------------------------------------------------------------ */

const MORJIM: CityDef = {
  id: "morjim",
  name: "Morjim & Chapora",
  region: "Pernem & Bardez, North Goa",
  blurb:
    "The Chapora river opens into the sea between Chapora Fort and the sandbar at Morjim, where olive ridley turtles still nest. Mangroves line the reach upstream toward Siolim.",
  origin: { lat: 15.615, lon: 73.745 },
  metersPerHex: 400,
  cols: 17,
  rows: 17,
  landmasses: [
    // Bardez, south of the mouth: Chapora Fort headland down to Vagator.
    [
      { lat: 15.6148, lon: 73.7345 }, // Chapora Fort point
      { lat: 15.608, lon: 73.7325 },
      { lat: 15.6, lon: 73.732 }, // Vagator
      { lat: 15.59, lon: 73.734 },
      { lat: 15.578, lon: 73.7362 },
      { lat: 15.578, lon: 73.791 },
      { lat: 15.6112, lon: 73.791 },
      { lat: 15.6108, lon: 73.764 },
      { lat: 15.611, lon: 73.752 },
      { lat: 15.6135, lon: 73.742 }
    ],
    // Pernem, north of the mouth: the Morjim sandbar and the coast north
    // toward Ashwem.
    [
      { lat: 15.6215, lon: 73.733 }, // north tip of the Morjim bar
      { lat: 15.629, lon: 73.7318 },
      { lat: 15.64, lon: 73.73 },
      { lat: 15.651, lon: 73.7285 },
      { lat: 15.651, lon: 73.791 },
      { lat: 15.619, lon: 73.791 },
      { lat: 15.621, lon: 73.764 },
      { lat: 15.623, lon: 73.752 },
      { lat: 15.6222, lon: 73.7415 }
    ]
  ],
  rivers: [
    {
      name: "Chapora",
      points: [
        { lat: 15.6182, lon: 73.7338 }, // the mouth, between the fort and the bar
        { lat: 15.6178, lon: 73.742 },
        { lat: 15.6172, lon: 73.752 },
        { lat: 15.615, lon: 73.764 },
        { lat: 15.614, lon: 73.7775 }
      ],
      widthsM: [760, 660, 580, 520, 480],
      fringeM: 330
    }
  ],
  estuaryPatches: [
    { name: "Siolim mangroves", center: { lat: 15.616, lon: 73.76 }, radiusM: 460 },
    { name: "Morjim backwater", center: { lat: 15.624, lon: 73.743 }, radiusM: 360 }
  ],
  beaches: [
    {
      name: "Morjim & Ashwem",
      points: [
        { lat: 15.6215, lon: 73.7328 },
        { lat: 15.632, lon: 73.7312 },
        { lat: 15.651, lon: 73.7285 }
      ],
      depthM: 470
    },
    {
      name: "Vagator & Chapora",
      points: [
        { lat: 15.578, lon: 73.736 },
        { lat: 15.602, lon: 73.732 },
        { lat: 15.6145, lon: 73.733 }
      ],
      depthM: 470
    }
  ],
  landmarks: [
    { name: "Morjim Beach", at: { lat: 15.629, lon: 73.732 } },
    { name: "Chapora Fort", at: { lat: 15.6077, lon: 73.7372 } },
    { name: "Siolim", at: { lat: 15.623, lon: 73.759 } },
    { name: "Vagator Beach", at: { lat: 15.6, lon: 73.734 } },
    { name: "Chapora River", at: { lat: 15.6178, lon: 73.742 } }
  ],
  focus: { lat: 15.618, lon: 73.74 }
};

/* ------------------------------------------------------------------ *
 * 3. Calangute, Candolim & Baga
 * ------------------------------------------------------------------ */

const CALANGUTE: CityDef = {
  id: "calangute",
  name: "Calangute & Baga",
  region: "Bardez, North Goa",
  blurb:
    "Seven unbroken kilometres of sand from Candolim to Baga, and the most heavily built coast in Goa. Every monsoon takes some of it back, and every dry season someone pours concrete to stop it.",
  origin: { lat: 15.5295, lon: 73.766 },
  metersPerHex: 400,
  cols: 15,
  rows: 21,
  landmasses: [
    [
      { lat: 15.491, lon: 73.7745 },
      { lat: 15.512, lon: 73.766 },
      { lat: 15.519, lon: 73.7628 }, // Candolim
      { lat: 15.529, lon: 73.759 },
      { lat: 15.538, lon: 73.7566 }, // Calangute
      { lat: 15.546, lon: 73.754 },
      { lat: 15.554, lon: 73.7518 }, // Baga
      { lat: 15.562, lon: 73.75 },
      { lat: 15.574, lon: 73.7485 },
      { lat: 15.574, lon: 73.807 },
      { lat: 15.491, lon: 73.807 }
    ]
  ],
  rivers: [
    {
      name: "Baga creek",
      points: [
        { lat: 15.5572, lon: 73.7512 }, // the mouth, at the north end of Baga
        { lat: 15.556, lon: 73.756 },
        { lat: 15.5545, lon: 73.762 },
        { lat: 15.556, lon: 73.77 },
        { lat: 15.558, lon: 73.778 },
        { lat: 15.56, lon: 73.7875 }
      ],
      // Baga creek is a few tens of metres across in reality. Floored at one
      // hex so it renders as a watercourse rather than disappearing — see
      // this file's header note.
      widthsM: [430, 420, 410, 410, 410, 410],
      fringeM: 300
    },
    {
      name: "Nerul creek",
      points: [
        { lat: 15.5018, lon: 73.7705 },
        { lat: 15.503, lon: 73.778 },
        { lat: 15.506, lon: 73.787 },
        { lat: 15.509, lon: 73.7945 }
      ],
      widthsM: [430, 420, 410, 410],
      fringeM: 340
    }
  ],
  estuaryPatches: [
    { name: "Arpora backwater", center: { lat: 15.5548, lon: 73.7645 }, radiusM: 400 },
    { name: "Nerul mangroves", center: { lat: 15.5062, lon: 73.7868 }, radiusM: 450 }
  ],
  beaches: [
    {
      name: "Candolim to Baga",
      points: [
        { lat: 15.4925, lon: 73.774 },
        { lat: 15.519, lon: 73.7628 },
        { lat: 15.538, lon: 73.7566 },
        { lat: 15.554, lon: 73.7518 },
        { lat: 15.573, lon: 73.7487 }
      ],
      depthM: 560
    }
  ],
  landmarks: [
    { name: "Calangute Beach", at: { lat: 15.5439, lon: 73.7553 } },
    { name: "Candolim", at: { lat: 15.5186, lon: 73.7626 } },
    { name: "Baga Creek", at: { lat: 15.5553, lon: 73.7517 } },
    { name: "Arpora", at: { lat: 15.5565, lon: 73.7675 } },
    { name: "Nerul Mangroves", at: { lat: 15.506, lon: 73.7855 } }
  ],
  focus: { lat: 15.535, lon: 73.76 }
};

/* ------------------------------------------------------------------ *
 * 4. Colva, Benaulim & the Sal
 * ------------------------------------------------------------------ */

const COLVA: CityDef = {
  id: "colva",
  name: "Colva & the Sal",
  region: "Salcete, South Goa",
  blurb:
    "South Goa's long western beach, with the river Sal running behind it barely a kilometre inland. A storm comes at this coast from the sea; the monsoon comes at it from the river. Both arrive in June.",
  origin: { lat: 15.255, lon: 73.94 },
  metersPerHex: 520,
  cols: 19,
  rows: 17,
  landmasses: [
    [
      { lat: 15.208, lon: 73.9245 },
      { lat: 15.229, lon: 73.92 }, // Varca
      { lat: 15.245, lon: 73.9205 },
      { lat: 15.258, lon: 73.9212 }, // Benaulim
      { lat: 15.27, lon: 73.9215 },
      { lat: 15.28, lon: 73.9218 }, // Colva
      { lat: 15.302, lon: 73.9235 },
      { lat: 15.302, lon: 74.0 },
      { lat: 15.208, lon: 74.0 }
    ]
  ],
  rivers: [
    {
      // The Sal reaches the sea at Betul, south of this frame; within it the
      // river runs north-south a kilometre or so behind the dune line, which
      // is exactly what makes this coast flood from both directions.
      name: "Sal",
      points: [
        { lat: 15.219, lon: 73.935 },
        { lat: 15.235, lon: 73.938 },
        { lat: 15.25, lon: 73.942 },
        { lat: 15.264, lon: 73.948 },
        { lat: 15.276, lon: 73.956 },
        { lat: 15.288, lon: 73.964 }
      ],
      widthsM: [660, 640, 620, 600, 580, 560],
      fringeM: 500
    }
  ],
  estuaryPatches: [
    { name: "Mungul khazans", center: { lat: 15.27, lon: 73.952 }, radiusM: 540 },
    { name: "Benaulim khazans", center: { lat: 15.252, lon: 73.94 }, radiusM: 500 },
    { name: "Varca wetland", center: { lat: 15.23, lon: 73.9365 }, radiusM: 470 }
  ],
  beaches: [
    {
      name: "Colva, Benaulim & Varca",
      points: [
        { lat: 15.208, lon: 73.9242 },
        { lat: 15.242, lon: 73.9208 },
        { lat: 15.26, lon: 73.9212 },
        { lat: 15.28, lon: 73.9218 },
        { lat: 15.302, lon: 73.9234 }
      ],
      depthM: 660
    }
  ],
  landmarks: [
    { name: "Colva Beach", at: { lat: 15.2793, lon: 73.922 } },
    { name: "Benaulim", at: { lat: 15.2578, lon: 73.9218 } },
    { name: "Varca", at: { lat: 15.229, lon: 73.9185 } },
    { name: "River Sal", at: { lat: 15.25, lon: 73.942 } },
    { name: "Margao", at: { lat: 15.2832, lon: 73.9798 } }
  ],
  focus: { lat: 15.26, lon: 73.933 }
};

/* ------------------------------------------------------------------ *
 * 5. Cavelossim, Betul & the mouth of the Sal — khazan country
 * ------------------------------------------------------------------ */

const BETUL: CityDef = {
  id: "betul",
  name: "Cavelossim & Betul",
  region: "Salcete, South Goa",
  blurb:
    "The Sal runs south behind a kilometre-wide sand spit before letting itself out at Betul. The fields either side are khazan: saline land reclaimed with earth bunds and tidal sluice gates, farmed this way since long before anyone here poured concrete.",
  origin: { lat: 15.17, lon: 73.96 },
  metersPerHex: 450,
  cols: 19,
  rows: 17,
  landmasses: [
    // The Mobor-Cavelossim spit: sea on its west side, the Sal on its east.
    [
      { lat: 15.21, lon: 73.9285 },
      { lat: 15.19, lon: 73.9315 },
      { lat: 15.18, lon: 73.9335 },
      { lat: 15.17, lon: 73.9365 }, // Cavelossim
      { lat: 15.162, lon: 73.94 }, // Mobor
      { lat: 15.1555, lon: 73.944 }, // Mobor point, at the river mouth
      { lat: 15.159, lon: 73.948 },
      { lat: 15.17, lon: 73.947 },
      { lat: 15.18, lon: 73.945 },
      { lat: 15.19, lon: 73.9435 },
      { lat: 15.21, lon: 73.9415 }
    ],
    // Betul, Assolna and Velim: one landmass east of the river, traced from
    // the south bank of the mouth round to the river's east bank. The Sal's
    // own channel is what divides this from the spit.
    [
      { lat: 15.15, lon: 73.942 },
      { lat: 15.131, lon: 73.9492 },
      { lat: 15.131, lon: 74.016 },
      { lat: 15.21, lon: 74.016 },
      { lat: 15.21, lon: 73.9605 },
      { lat: 15.19, lon: 73.9585 },
      { lat: 15.18, lon: 73.9575 },
      { lat: 15.17, lon: 73.958 },
      { lat: 15.1605, lon: 73.9575 },
      { lat: 15.1545, lon: 73.9535 },
      { lat: 15.149, lon: 73.947 }
    ]
  ],
  rivers: [
    {
      name: "Sal",
      points: [
        { lat: 15.152, lon: 73.9425 }, // the mouth at Betul
        { lat: 15.158, lon: 73.9485 },
        { lat: 15.165, lon: 73.9515 },
        { lat: 15.175, lon: 73.952 },
        { lat: 15.185, lon: 73.9515 },
        { lat: 15.195, lon: 73.951 },
        { lat: 15.208, lon: 73.9506 }
      ],
      widthsM: [1050, 1000, 960, 920, 900, 880, 870],
      fringeM: 420
    }
  ],
  estuaryPatches: [
    { name: "Assolna khazans", center: { lat: 15.168, lon: 73.9685 }, radiusM: 560 },
    { name: "Velim khazans", center: { lat: 15.186, lon: 73.9655 }, radiusM: 560 },
    { name: "Betul khazans", center: { lat: 15.1505, lon: 73.9645 }, radiusM: 520 },
    { name: "Cavelossim khazans", center: { lat: 15.177, lon: 73.9455 }, radiusM: 360 },
    { name: "Sal mouth mangroves", center: { lat: 15.1575, lon: 73.9455 }, radiusM: 380 }
  ],
  beaches: [
    {
      name: "Mobor & Cavelossim",
      points: [
        { lat: 15.209, lon: 73.929 },
        { lat: 15.18, lon: 73.9338 },
        { lat: 15.162, lon: 73.9403 },
        { lat: 15.1558, lon: 73.9442 }
      ],
      depthM: 500
    },
    {
      name: "Betul",
      points: [
        { lat: 15.1495, lon: 73.9435 },
        { lat: 15.142, lon: 73.9472 }
      ],
      depthM: 400
    }
  ],
  landmarks: [
    { name: "Cavelossim", at: { lat: 15.17, lon: 73.9365 } },
    { name: "Mobor", at: { lat: 15.162, lon: 73.9402 } },
    { name: "Betul", at: { lat: 15.148, lon: 73.9492 } },
    { name: "Assolna Khazans", at: { lat: 15.168, lon: 73.9685 } },
    { name: "River Sal", at: { lat: 15.175, lon: 73.952 } }
  ],
  focus: { lat: 15.17, lon: 73.9455 }
};

/* ------------------------------------------------------------------ *
 * 6. Vasco da Gama, Mormugao & the Zuari
 * ------------------------------------------------------------------ */

const VASCO: CityDef = {
  id: "vasco",
  name: "Vasco & Mormugão",
  region: "Mormugão, South Goa",
  blurb:
    "Goa's port and its densest industry, on a headland wrapped around the three-kilometre mouth of the Zuari. Everyone here wants to build, and the khazans on the far bank are the cheapest land to build on.",
  origin: { lat: 15.4165, lon: 73.8265 },
  metersPerHex: 490,
  cols: 17,
  rows: 17,
  landmasses: [
    // The Mormugao peninsula: Vasco, the port, and the south bank.
    [
      { lat: 15.41, lon: 73.8005 }, // harbour headland
      { lat: 15.4, lon: 73.801 },
      { lat: 15.392, lon: 73.806 }, // Baina
      { lat: 15.388, lon: 73.815 },
      { lat: 15.3775, lon: 73.8235 },
      { lat: 15.3775, lon: 73.893 },
      { lat: 15.408, lon: 73.893 },
      { lat: 15.407, lon: 73.864 },
      { lat: 15.408, lon: 73.848 },
      { lat: 15.411, lon: 73.83 },
      { lat: 15.412, lon: 73.815 }
    ],
    // Tiswadi's south shore: Dona Paula across to Agassaim.
    [
      { lat: 15.458, lon: 73.7995 },
      { lat: 15.462, lon: 73.893 },
      { lat: 15.433, lon: 73.893 },
      { lat: 15.431, lon: 73.864 },
      { lat: 15.429, lon: 73.848 },
      { lat: 15.433, lon: 73.83 },
      { lat: 15.44, lon: 73.815 },
      { lat: 15.4525, lon: 73.8018 }
    ]
  ],
  rivers: [
    {
      // The Zuari mouth genuinely is close to 3 km across, which is why the
      // river occupies so much of this board. That is the level's point: the
      // Mormugao headland is holding a very large body of water.
      name: "Zuari",
      points: [
        { lat: 15.4215, lon: 73.8035 }, // the mouth, between the headlands
        { lat: 15.421, lon: 73.818 },
        { lat: 15.4195, lon: 73.833 },
        { lat: 15.418, lon: 73.848 },
        { lat: 15.417, lon: 73.863 },
        { lat: 15.4165, lon: 73.892 }
      ],
      widthsM: [2300, 2150, 2000, 1850, 1700, 1600],
      fringeM: 460
    }
  ],
  estuaryPatches: [
    { name: "Sancoale khazans", center: { lat: 15.41, lon: 73.86 }, radiusM: 560 },
    { name: "Agassaim khazans", center: { lat: 15.43, lon: 73.862 }, radiusM: 560 },
    { name: "Zuari north mangroves", center: { lat: 15.429, lon: 73.842 }, radiusM: 500 }
  ],
  beaches: [
    {
      name: "Baina & Hollant",
      points: [
        { lat: 15.3785, lon: 73.8215 },
        { lat: 15.392, lon: 73.8055 },
        { lat: 15.401, lon: 73.8008 }
      ],
      depthM: 760
    },
    {
      name: "Dona Paula",
      points: [
        { lat: 15.4435, lon: 73.804 },
        { lat: 15.457, lon: 73.8 }
      ],
      depthM: 620
    }
  ],
  landmarks: [
    { name: "Vasco da Gama", at: { lat: 15.3981, lon: 73.8113 } },
    { name: "Mormugão Port", at: { lat: 15.408, lon: 73.803 } },
    { name: "Baina Beach", at: { lat: 15.3905, lon: 73.813 } },
    { name: "Zuari River", at: { lat: 15.4195, lon: 73.835 } },
    { name: "Sancoale Khazans", at: { lat: 15.41, lon: 73.86 } }
  ],
  focus: { lat: 15.415, lon: 73.822 }
};

/* ------------------------------------------------------------------ *
 * 7. Palolem, Patnem & the Talpona
 * ------------------------------------------------------------------ */

const PALOLEM: CityDef = {
  id: "palolem",
  name: "Palolem & Patnem",
  region: "Canacona, South Goa",
  blurb:
    "Goa's southern corner: a run of small headland-held bays, and the Talpona river letting itself out between two sand spits. The rock here does half the work a seawall would, and the sand does the other half.",
  origin: { lat: 14.996, lon: 74.038 },
  metersPerHex: 430,
  cols: 17,
  rows: 21,
  landmasses: [
    [
      { lat: 15.042, lon: 74.0062 },
      { lat: 15.02, lon: 74.015 },
      { lat: 15.0145, lon: 74.0192 }, // Palolem north headland
      { lat: 15.01, lon: 74.0218 },
      { lat: 15.0075, lon: 74.025 }, // Palolem south headland
      { lat: 15.0045, lon: 74.028 }, // Patnem
      { lat: 14.999, lon: 74.0308 },
      { lat: 14.995, lon: 74.0332 }, // Rajbag
      { lat: 14.988, lon: 74.0372 },
      { lat: 14.98, lon: 74.0402 },
      { lat: 14.972, lon: 74.0422 },
      { lat: 14.969, lon: 74.0432 }, // north bank of the Talpona mouth
      { lat: 14.969, lon: 74.082 },
      { lat: 15.042, lon: 74.082 },
      { lat: 15.042, lon: 74.0062 }
    ],
    // The Galgibaga spit, south of the river mouth.
    [
      { lat: 14.9655, lon: 74.0425 },
      { lat: 14.9568, lon: 74.0468 },
      { lat: 14.9525, lon: 74.082 },
      { lat: 14.9672, lon: 74.082 },
      { lat: 14.9668, lon: 74.0505 }
    ]
  ],
  rivers: [
    {
      name: "Talpona",
      points: [
        { lat: 14.9692, lon: 74.0428 }, // the mouth, between the two spits
        { lat: 14.97, lon: 74.049 },
        { lat: 14.973, lon: 74.0555 },
        { lat: 14.977, lon: 74.0625 },
        { lat: 14.982, lon: 74.0705 },
        { lat: 14.986, lon: 74.0805 }
      ],
      widthsM: [620, 560, 520, 500, 480, 470],
      fringeM: 430
    }
  ],
  estuaryPatches: [
    { name: "Talpona mangroves", center: { lat: 14.9722, lon: 74.0478 }, radiusM: 480 },
    { name: "Chaudi backwater", center: { lat: 14.9795, lon: 74.0628 }, radiusM: 420 },
    { name: "Rajbag estuary", center: { lat: 14.9928, lon: 74.0352 }, radiusM: 400 },
    { name: "Palolem creek", center: { lat: 15.0108, lon: 74.0248 }, radiusM: 360 }
  ],
  beaches: [
    {
      name: "Palolem",
      points: [
        { lat: 15.0145, lon: 74.0192 },
        { lat: 15.0108, lon: 74.0222 },
        { lat: 15.0075, lon: 74.025 }
      ],
      depthM: 440
    },
    {
      name: "Patnem & Rajbag",
      points: [
        { lat: 15.0045, lon: 74.028 },
        { lat: 14.995, lon: 74.0332 },
        { lat: 14.988, lon: 74.0372 }
      ],
      depthM: 470
    },
    {
      name: "Talpona & Galgibaga",
      points: [
        { lat: 14.98, lon: 74.0402 },
        { lat: 14.9705, lon: 74.0428 },
        { lat: 14.9585, lon: 74.0458 }
      ],
      depthM: 470
    }
  ],
  landmarks: [
    { name: "Palolem Beach", at: { lat: 15.011, lon: 74.0215 } },
    { name: "Patnem", at: { lat: 15.0045, lon: 74.028 } },
    { name: "Rajbag", at: { lat: 14.995, lon: 74.0332 } },
    { name: "Talpona River", at: { lat: 14.97, lon: 74.0449 } },
    { name: "Chaudi", at: { lat: 15.0075, lon: 74.0495 } }
  ],
  focus: { lat: 15.0, lon: 74.03 }
};

/* ------------------------------------------------------------------ *
 * 8. Querim, Arambol & the Terekhol
 * ------------------------------------------------------------------ */

const TEREKHOL: CityDef = {
  id: "terekhol",
  name: "Arambol & the Terekhol",
  region: "Pernem, North Goa",
  blurb:
    "Goa's northern limit, where the Terekhol river is also the state border. The most exposed coast in the campaign: nothing between Arambol and the open Arabian Sea but the sand you are standing on.",
  origin: { lat: 15.695, lon: 73.715 },
  metersPerHex: 430,
  cols: 17,
  rows: 19,
  landmasses: [
    // Pernem, south of the river: Querim down through Arambol to Mandrem.
    [
      { lat: 15.714, lon: 73.6875 }, // north tip of Querim
      { lat: 15.706, lon: 73.69 },
      { lat: 15.698, lon: 73.696 },
      { lat: 15.69, lon: 73.701 }, // Arambol
      { lat: 15.682, lon: 73.706 },
      { lat: 15.674, lon: 73.71 },
      { lat: 15.666, lon: 73.714 }, // Mandrem
      { lat: 15.654, lon: 73.7195 },
      { lat: 15.654, lon: 73.761 },
      { lat: 15.71, lon: 73.761 },
      { lat: 15.709, lon: 73.734 },
      { lat: 15.71, lon: 73.718 },
      { lat: 15.712, lon: 73.702 },
      { lat: 15.713, lon: 73.692 }
    ],
    // Tiracol, north of the river.
    [
      { lat: 15.719, lon: 73.6865 },
      { lat: 15.725, lon: 73.688 },
      { lat: 15.737, lon: 73.6918 },
      { lat: 15.737, lon: 73.761 },
      { lat: 15.718, lon: 73.761 },
      { lat: 15.717, lon: 73.734 },
      { lat: 15.7165, lon: 73.718 },
      { lat: 15.7175, lon: 73.702 },
      { lat: 15.7185, lon: 73.692 }
    ]
  ],
  rivers: [
    {
      name: "Terekhol",
      points: [
        { lat: 15.7165, lon: 73.6872 }, // the mouth, between Querim and Tiracol
        { lat: 15.7148, lon: 73.698 },
        { lat: 15.7138, lon: 73.712 },
        { lat: 15.7132, lon: 73.726 },
        { lat: 15.713, lon: 73.74 },
        { lat: 15.7128, lon: 73.762 }
      ],
      widthsM: [720, 680, 650, 620, 600, 580],
      fringeM: 400
    }
  ],
  estuaryPatches: [
    { name: "Terekhol mangroves", center: { lat: 15.714, lon: 73.72 }, radiusM: 500 },
    { name: "Arambol sweet lake", center: { lat: 15.688, lon: 73.701 }, radiusM: 340 },
    { name: "Mandrem backwater", center: { lat: 15.67, lon: 73.712 }, radiusM: 390 }
  ],
  beaches: [
    {
      name: "Querim",
      points: [
        { lat: 15.714, lon: 73.6878 },
        { lat: 15.705, lon: 73.6905 }
      ],
      depthM: 470
    },
    {
      name: "Arambol & Mandrem",
      points: [
        { lat: 15.698, lon: 73.6962 },
        { lat: 15.688, lon: 73.7015 },
        { lat: 15.676, lon: 73.709 },
        { lat: 15.6545, lon: 73.719 }
      ],
      depthM: 500
    },
    {
      name: "Tiracol",
      points: [
        { lat: 15.7195, lon: 73.6868 },
        { lat: 15.736, lon: 73.6912 }
      ],
      depthM: 420
    }
  ],
  landmarks: [
    { name: "Arambol Beach", at: { lat: 15.686, lon: 73.704 } },
    { name: "Querim", at: { lat: 15.712, lon: 73.688 } },
    { name: "Tiracol Fort", at: { lat: 15.723, lon: 73.687 } },
    { name: "Terekhol River", at: { lat: 15.7138, lon: 73.712 } },
    { name: "Mandrem", at: { lat: 15.666, lon: 73.714 } }
  ],
  focus: { lat: 15.71, lon: 73.698 }
};

/**
 * Campaign order. The first entry is Panaji by explicit request, and the
 * sequence afterwards is chosen so each place suits the mechanic its level
 * teaches: mangroves where Goa's mangroves actually are (Morjim, Chorão),
 * seawalls on the coast that actually builds them (Calangute), the Khazan
 * level in khazan country (Betul), and the growth level in the port town.
 */
export const CITIES: CityDef[] = [PANAJI, MORJIM, CALANGUTE, COLVA, BETUL, VASCO, PALOLEM, TEREKHOL];
