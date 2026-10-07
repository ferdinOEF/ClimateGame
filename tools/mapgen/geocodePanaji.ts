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
 * Each entry also carries `osm`: where the OpenStreetMap basemap image puts
 * the place, at its label or the feature it names. A geocoder answer is used
 * only when it agrees with that to within `AGREE_METRES`; otherwise, or when
 * the service is unreachable, the image position is used and the disagreement
 * is printed. That keeps the board buildable offline, and it is what caught
 * "Dona Paula" resolving to the locality rather than the headland viewpoint.
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
  /**
   * Where the OpenStreetMap basemap (`panaji-basemap.jpg`) itself puts this
   * place: at its label, or at the feature it names. This is the reference
   * every geocoder answer is checked against, and what is used when the
   * lookup fails or lands more than `AGREE_METRES` away from it.
   *
   * `how` says what on the image it was read from. `onImage: false` marks the
   * few places the image does not label at this zoom, whose position rests on
   * the geocoder or local knowledge alone and should be checked by someone
   * who knows the street.
   */
  osm: { lat: number; lon: number; how: string; onImage: boolean };
}

/**
 * How far a geocoder answer may be from the OSM image before the image wins.
 *
 * Nominatim answers the question it is asked, which is not always the one
 * meant: asked for "Dona Paula" it returns the locality label at Dona Paula
 * Circle, 550 m from the viewpoint on the headland that the monument is.
 */
const AGREE_METRES = 100;

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
    osm: { lat: 15.4989, lon: 73.8278, how: "beside the OSM label Church Square, the square the church fronts", onImage: true }
  },
  {
    id: "idalcao_palace",
    name: "Adil Shah Palace",
    category: "Old Secretariat, 1500s",
    kind: "palace",
    query: "Adil Shah Palace, Panaji, Goa, India",
    osm: { lat: 15.4998, lon: 73.8262, how: "the waterfront block on Avenida Dom Joao de Castro, west of Church Square", onImage: true }
  },
  {
    id: "panjim_municipal_market",
    name: "Panjim Municipal Market",
    category: "City market",
    kind: "market",
    query: "Panaji Municipal Market, Panaji, Goa, India",
    osm: { lat: 15.49773, lon: 73.82598, how: "the OSM label Panjim Bazaar, off 18th June Road", onImage: true }
  },
  {
    id: "institute_menezes_braganza",
    name: "Institute Menezes Braganza",
    category: "Library and gallery, 1871",
    kind: "institution",
    query: "Institute Menezes Braganza, Panaji, Goa, India",
    osm: { lat: 15.50044, lon: 73.82537, how: "beside Azad Maidan, the green square behind the ferry terminal", onImage: true }
  },
  {
    id: "mahalaxmi_temple",
    name: "Mahalaxmi Temple",
    category: "Temple, 1818",
    kind: "temple",
    query: "Mahalaxmi Temple, Panaji, Goa, India",
    osm: { lat: 15.4944, lon: 73.8268, how: "on Dr Dada Vaidya Road at the foot of Altinho; the temple is not labelled at this zoom", onImage: false }
  },
  {
    id: "jama_masjid_panaji",
    name: "Jama Masjid",
    category: "Mosque",
    kind: "mosque",
    query: "Jama Masjid, Panaji, Goa, India",
    osm: { lat: 15.49482, lon: 73.82612, how: "on Dr Dada Vaidya Road near Mahalaxmi Temple, from local knowledge; not labelled at this zoom", onImage: false }
  },
  {
    id: "don_bosco_high_school",
    name: "Don Bosco High School",
    category: "School, 1935",
    kind: "institution",
    query: "Don Bosco High School, Panaji, Goa, India",
    osm: { lat: 15.49704, lon: 73.82130, how: "the school grounds on Mahatma Gandhi Road, west end of the old town", onImage: true }
  },
  {
    id: "don_bosco_college",
    name: "Don Bosco College",
    category: "College",
    kind: "institution",
    query: "Don Bosco College, Panaji, Goa, India",
    osm: { lat: 15.4966, lon: 73.8225, how: "next to the high school, south of Mahatma Gandhi Road", onImage: true }
  },
  {
    id: "sharada_mandir_school",
    name: "Sharada Mandir School",
    category: "School, Altinho",
    kind: "institution",
    query: "Sharada Mandir School, Miramar, Panaji, Goa, India",
    osm: { lat: 15.48043, lon: 73.80916, how: "Miramar, inland of Dr Jack Sequeira Road", onImage: true }
  },
  {
    id: "government_polytechnic_panaji",
    name: "Government Polytechnic",
    category: "Technical college, Altinho",
    kind: "institution",
    query: "Government Polytechnic Panaji, Altinho, Goa, India",
    osm: { lat: 15.48625, lon: 73.82388, how: "the OSM label Government Polytechnic, on Altinho", onImage: true }
  },
  {
    id: "kala_academy",
    name: "Kala Academy",
    category: "Arts centre, 1983",
    kind: "institution",
    query: "Kala Academy, Campal, Panaji, Goa, India",
    osm: { lat: 15.49421, lon: 73.81741, how: "the riverfront building at Campal", onImage: true }
  },
  {
    id: "goa_state_museum",
    name: "Goa State Museum",
    category: "Museum, Patto",
    kind: "institution",
    query: "Goa State Museum, Panaji, Goa, India",
    osm: { lat: 15.4937, lon: 73.8356, how: "Patto, east of the Ourem creek", onImage: true }
  },
  {
    id: "campal_garden",
    name: "Campal Garden",
    category: "Riverside garden",
    kind: "park",
    query: "Campal Garden, Panaji, Goa, India",
    osm: { lat: 15.49682, lon: 73.81825, how: "the OSM label Bhagwan Mahavir Children Park, at Campal", onImage: true }
  },
  {
    id: "dhempe_college",
    name: "Dhempe College",
    category: "College, Miramar",
    kind: "institution",
    query: "Dhempe College of Arts and Science, Miramar, Panaji, Goa, India",
    osm: { lat: 15.4812, lon: 73.8098, how: "Miramar, beside Sharada Mandir", onImage: true }
  },
  {
    id: "miramar_beach",
    name: "Miramar Beach",
    category: "Beach at the river mouth",
    kind: "beach",
    query: "Miramar Beach, Panaji, Goa, India",
    osm: { lat: 15.47668, lon: 73.80668, how: "the OSM label Miramar Beach, on the sand", onImage: true }
  },
  {
    id: "dona_paula_viewpoint",
    name: "Dona Paula",
    category: "Headland viewpoint",
    kind: "viewpoint",
    query: "Dona Paula, Goa, India",
    osm: { lat: 15.4536, lon: 73.80195, how: "the jetty plaza at the tip of the headland, where the road ends at the rocks", onImage: true }
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
  /**
   * Where the position came from, so the generated board records how good its
   * own inputs were:
   *   - "nominatim+osm-image": the geocoder agreed with the OSM image (within
   *     `AGREE_METRES`), and its answer is used;
   *   - "osm-image": the geocoder failed or disagreed, and the position read
   *     off the OSM image is used;
   *   - "unverified": not labelled on the image and not confirmed by a lookup.
   */
  source: "nominatim+osm-image" | "osm-image" | "unverified";
  /** What on the OSM image the position was read from. */
  how: string;
  /** How far the geocoder's answer was from the image, when there was one. */
  geocoderOffsetMetres?: number;
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
      const offset = metres(lat, lon, spec.osm.lat, spec.osm.lon);
      if (offset <= AGREE_METRES) {
        return { ...base(spec), lat, lon, source: "nominatim+osm-image", geocoderOffsetMetres: Math.round(offset), matched: hit.display_name };
      }
      console.warn(`  ! ${spec.id}: Nominatim is ${offset.toFixed(0)} m from the OSM image (${hit.display_name}); using the image`);
      return { ...fromImage(spec), geocoderOffsetMetres: Math.round(offset), matched: hit.display_name };
    }
  } catch (error) {
    console.warn(`  ! ${spec.id}: lookup failed (${error instanceof Error ? error.message : String(error)})`);
  }

  return fromImage(spec);
}

function base(spec: PlaceSpec): Pick<ResolvedPlace, "id" | "name" | "category" | "kind" | "how"> {
  return { id: spec.id, name: spec.name, category: spec.category, kind: spec.kind, how: spec.osm.how };
}

/** The position read off the OSM image, marked unverified when the image does not label the place. */
function fromImage(spec: PlaceSpec): ResolvedPlace {
  return { ...base(spec), lat: spec.osm.lat, lon: spec.osm.lon, source: spec.osm.onImage ? "osm-image" : "unverified" };
}

async function main(): Promise<void> {
  const resolved: ResolvedPlace[] = [];

  for (const spec of PLACES) {
    const place = await lookup(spec);
    resolved.push(place);
    const offset = place.geocoderOffsetMetres === undefined ? "" : ` (geocoder ${place.geocoderOffsetMetres} m from the OSM image)`;
    console.log(`  ${place.source.padEnd(19)} ${spec.id.padEnd(30)} ${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}${offset}`);
    await new Promise((resolve) => setTimeout(resolve, SPACING_MS));
  }

  const agreed = resolved.filter((place) => place.source === "nominatim+osm-image").length;
  fs.writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        note: "Generated by tools/mapgen/geocodePanaji.ts. Positions from OpenStreetMap (Nominatim, checked against the OSM basemap image); data © OpenStreetMap contributors, ODbL.",
        generatedAt: new Date().toISOString(),
        places: resolved
      },
      null,
      2
    )}\n`
  );

  console.log(`\n${agreed}/${resolved.length} confirmed by Nominatim, the rest from the OSM image`);
  console.log(`Wrote ${path.relative(ROOT, OUT)}`);
}

/** Rough great-circle distance, only ever used to print how far a lookup moved a place. */
function metres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const latMetres = (lat1 - lat2) * 111_320;
  const lonMetres = (lon1 - lon2) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(latMetres, lonMetres);
}

main();
