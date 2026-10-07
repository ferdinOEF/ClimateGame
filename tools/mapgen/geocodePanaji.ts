/**
 * Looks up where the Panjim landmarks actually are.
 *
 * WHY THIS EXISTS
 *
 * The sixteen landmark coordinates the board shipped with came out of an
 * earlier build's bundle, as hex coordinates with no geography behind them.
 * Checked against the real city they are wrong in ways a local would notice
 * immediately: Dhempe College was placed nineteen columns east of the church
 * when it is actually at Miramar, west of it; Dona Paula and Miramar were
 * roughly the same distance from the centre when Dona Paula is twice as far.
 *
 * So they get looked up instead of guessed. `lookup()` asks Nominatim (the
 * OpenStreetMap search service) for each place by name, and writes the result
 * to `panajiPlaces.json` for `buildPanajiMap.ts` to project onto the grid.
 *
 * WHY THE ANSWER IS CHECKED RATHER THAN TRUSTED
 *
 * A geocoder asked for "Don Bosco" will cheerfully return a school in another
 * state. Every result is therefore rejected unless it falls inside
 * `PLAUSIBLE`, a box drawn tightly around Panaji and the Dona Paula headland.
 * A query that returns nothing inside the box is reported rather than
 * silently dropped, because a missing landmark is a visible hole in the board
 * and should fail the build that made it.
 *
 * Each entry carries a `fallback` — a coordinate read off the map by hand.
 * It is used only when the lookup finds nothing plausible, which keeps the
 * board buildable offline and on a day when the service is down, and means a
 * network failure degrades to "slightly less precise" rather than "no
 * monuments".
 *
 * RATE LIMIT
 *
 * Nominatim's usage policy is one request a second from an identified client.
 * `SPACING_MS` honours it and the User-Agent names the project. This runs
 * once, by hand, and its output is checked in — the game never calls a
 * geocoder.
 *
 * `npm run mapgen:geocode`.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, "tools/mapgen/panajiPlaces.json");

/** Anything outside this box is not in Panaji, whatever the geocoder says. */
const PLAUSIBLE = { south: 15.42, north: 15.53, west: 73.77, east: 73.87 };

/** One request a second, per the Nominatim usage policy. */
const SPACING_MS = 1100;

const USER_AGENT = "RiptideRising/1.0 (coastal-resilience teaching game; contact ferdin@oneearth.world)";

interface PlaceSpec {
  id: string;
  /** Shown on the board and in the build popover. */
  name: string;
  category: string;
  /** Which monument geometry the renderer builds. */
  kind: string;
  /** What to ask the geocoder. More specific than `name`, because "Don Bosco" alone matches half of India. */
  query: string;
  /** Read off the map by hand; used only if the lookup finds nothing plausible. */
  fallback: { lat: number; lon: number };
}

/*
 * The sixteen places, with the real-world relationships the old coordinates
 * got wrong spelled out, because the whole point of this pass is that a person
 * from Panjim should recognise where things are relative to each other:
 *
 *   - The old town core is the strip between the church and the river: the
 *     church, the Municipal Market, Idalcao Palace on the waterfront and the
 *     Institute Menezes Braganza are all within a few hundred metres.
 *   - Altinho is the hill immediately south of the core. Mahalaxmi Temple sits
 *     on its northern slope; Sharada Mandir and the Polytechnic are up on it.
 *   - Campal is the strip west of the core along the river, running out to
 *     Miramar. Kala Academy, the Goa State Museum area and Campal Garden are
 *     there, in that order going west then south.
 *   - Miramar is the beach at the river mouth, south-west of the city. Dhempe
 *     College is at Miramar, NOT inland.
 *   - Dona Paula is much further south-west again, out on the headland between
 *     the Mandovi and the Zuari.
 */
const PLACES: PlaceSpec[] = [
  {
    id: "panjim_church",
    name: "Our Lady of the Immaculate Conception",
    category: "Heritage church, 1541",
    kind: "church",
    query: "Church of Our Lady of the Immaculate Conception, Panaji, Goa, India",
    fallback: { lat: 15.4989, lon: 73.8278 }
  },
  {
    id: "idalcao_palace",
    name: "Adil Shah Palace",
    category: "Old Secretariat, 1500s",
    kind: "palace",
    query: "Adil Shah Palace, Panaji, Goa, India",
    fallback: { lat: 15.4998, lon: 73.8262 }
  },
  {
    id: "panjim_municipal_market",
    name: "Panjim Municipal Market",
    category: "City market",
    kind: "market",
    query: "Panaji Municipal Market, Panaji, Goa, India",
    fallback: { lat: 15.4962, lon: 73.8295 }
  },
  {
    id: "institute_menezes_braganza",
    name: "Institute Menezes Braganza",
    category: "Library and gallery, 1871",
    kind: "institution",
    query: "Institute Menezes Braganza, Panaji, Goa, India",
    fallback: { lat: 15.4977, lon: 73.8259 }
  },
  {
    id: "mahalaxmi_temple",
    name: "Mahalaxmi Temple",
    category: "Temple, 1818",
    kind: "temple",
    query: "Mahalaxmi Temple, Panaji, Goa, India",
    fallback: { lat: 15.4944, lon: 73.8268 }
  },
  {
    id: "jama_masjid_panaji",
    name: "Jama Masjid",
    category: "Mosque",
    kind: "mosque",
    query: "Jama Masjid, Panaji, Goa, India",
    fallback: { lat: 15.4958, lon: 73.8332 }
  },
  {
    id: "don_bosco_high_school",
    name: "Don Bosco High School",
    category: "School, 1935",
    kind: "institution",
    query: "Don Bosco High School, Panaji, Goa, India",
    fallback: { lat: 15.4971, lon: 73.8231 }
  },
  {
    id: "don_bosco_college",
    name: "Don Bosco College",
    category: "College",
    kind: "institution",
    query: "Don Bosco College, Panaji, Goa, India",
    fallback: { lat: 15.4966, lon: 73.8225 }
  },
  {
    id: "sharada_mandir_school",
    name: "Sharada Mandir School",
    category: "School, Altinho",
    kind: "institution",
    query: "Sharada Mandir School, Miramar, Panaji, Goa, India",
    fallback: { lat: 15.4886, lon: 73.8213 }
  },
  {
    id: "government_polytechnic_panaji",
    name: "Government Polytechnic",
    category: "Technical college, Altinho",
    kind: "institution",
    query: "Government Polytechnic Panaji, Altinho, Goa, India",
    fallback: { lat: 15.4921, lon: 73.8243 }
  },
  {
    id: "kala_academy",
    name: "Kala Academy",
    category: "Arts centre, 1983",
    kind: "institution",
    query: "Kala Academy, Campal, Panaji, Goa, India",
    fallback: { lat: 15.4932, lon: 73.8166 }
  },
  {
    id: "goa_state_museum",
    name: "Goa State Museum",
    category: "Museum, Patto",
    kind: "institution",
    query: "Goa State Museum, Panaji, Goa, India",
    fallback: { lat: 15.4937, lon: 73.8356 }
  },
  {
    id: "campal_garden",
    name: "Campal Garden",
    category: "Riverside garden",
    kind: "park",
    query: "Campal Garden, Panaji, Goa, India",
    fallback: { lat: 15.4909, lon: 73.8149 }
  },
  {
    id: "dhempe_college",
    name: "Dhempe College",
    category: "College, Miramar",
    kind: "institution",
    query: "Dhempe College of Arts and Science, Miramar, Panaji, Goa, India",
    fallback: { lat: 15.4812, lon: 73.8098 }
  },
  {
    id: "miramar_beach",
    name: "Miramar Beach",
    category: "Beach at the river mouth",
    kind: "beach",
    query: "Miramar Beach, Panaji, Goa, India",
    fallback: { lat: 15.4793, lon: 73.8062 }
  },
  {
    id: "dona_paula_viewpoint",
    name: "Dona Paula",
    category: "Headland viewpoint",
    kind: "viewpoint",
    query: "Dona Paula, Goa, India",
    fallback: { lat: 15.4505, lon: 73.8031 }
  }
];

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  class?: string;
}

export interface ResolvedPlace {
  id: string;
  name: string;
  category: string;
  kind: string;
  lat: number;
  lon: number;
  /** "geocoded" or "fallback", so the generated board records how good its own inputs were. */
  source: "geocoded" | "fallback";
  /** What the geocoder actually matched, for a human to sanity-check the result against. */
  matched?: string;
}

function inside(lat: number, lon: number): boolean {
  return lat >= PLAUSIBLE.south && lat <= PLAUSIBLE.north && lon >= PLAUSIBLE.west && lon <= PLAUSIBLE.east;
}

async function lookup(spec: PlaceSpec): Promise<ResolvedPlace> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", spec.query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  // Bias the search to Goa so a same-named place elsewhere ranks below the
  // one we mean, rather than relying on the plausibility box to catch it.
  url.searchParams.set("viewbox", `${PLAUSIBLE.west},${PLAUSIBLE.north},${PLAUSIBLE.east},${PLAUSIBLE.south}`);

  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const hits = (await response.json()) as NominatimHit[];

    for (const hit of hits) {
      const lat = Number(hit.lat);
      const lon = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (!inside(lat, lon)) continue;
      return {
        id: spec.id,
        name: spec.name,
        category: spec.category,
        kind: spec.kind,
        lat,
        lon,
        source: "geocoded",
        matched: hit.display_name
      };
    }
  } catch (error) {
    console.warn(`  ! ${spec.id}: lookup failed (${error instanceof Error ? error.message : String(error)})`);
  }

  return { id: spec.id, name: spec.name, category: spec.category, kind: spec.kind, ...spec.fallback, source: "fallback" };
}

async function main(): Promise<void> {
  const resolved: ResolvedPlace[] = [];

  for (const spec of PLACES) {
    const place = await lookup(spec);
    resolved.push(place);
    const drift =
      place.source === "geocoded"
        ? ` (${metres(place.lat, place.lon, spec.fallback.lat, spec.fallback.lon).toFixed(0)}m from the hand-read position)`
        : "";
    console.log(`  ${place.source === "geocoded" ? "✓" : "·"} ${spec.id.padEnd(30)} ${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}${drift}`);
    await new Promise((resolve) => setTimeout(resolve, SPACING_MS));
  }

  const geocoded = resolved.filter((place) => place.source === "geocoded").length;
  fs.writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        note: "Generated by tools/mapgen/geocodePanaji.ts. Positions from OpenStreetMap via Nominatim; data © OpenStreetMap contributors, ODbL.",
        generatedAt: new Date().toISOString(),
        places: resolved
      },
      null,
      2
    )}\n`
  );

  console.log(`\n${geocoded}/${resolved.length} geocoded, ${resolved.length - geocoded} from the hand-read fallback`);
  console.log(`Wrote ${path.relative(ROOT, OUT)}`);
}

/** Rough great-circle distance, only ever used to print how far a lookup moved a place. */
function metres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const latMetres = (lat1 - lat2) * 111_320;
  const lonMetres = (lon1 - lon2) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(latMetres, lonMetres);
}

main();
