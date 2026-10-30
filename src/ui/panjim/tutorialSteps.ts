import { ELEMENT_BY_ID } from "@core/elements";
import { NUDGE_ORDER, type NudgeId } from "@core/tutorialNudge";
import { CARD_ICON, CARD_NAME } from "./defenceCards";

/**
 * Section 31.3 (owner decision): the Tutorial's caption for each defence, in the order of the nudge.
 *
 *   - `protects`: what it protects against (chips);
 *   - `how`: two lines on how it works, real world descriptions, each backed by the facts in `sources`
 *     (facts.json, shown on the Sources screen);
 *   - `inGame`: one line, its trade off as a game rule, every number read from the game's data (elements.json),
 *     as `defenceRules()` does;
 *   - `maya`: Maya's one short line for the step;
 *   - `bestAt`: one line for the final card, on what it is best at (a game rule).
 *
 * No hyphens and no dots between words (Section 17b; `tests/punctuation.test.ts`).
 */
export type Protects = "Cyclone waves" | "Surge" | "Wind" | "River flood";

export interface TutorialStep {
  id: NudgeId;
  name: string;
  icon: string;
  protects: Protects[];
  how: [string, string];
  sources: string[];
  inGame: string;
  maya: string;
  bestAt: string;
}

const bio = (id: string): number => ELEMENT_BY_ID.get(id)?.effects.biodiversity ?? 0;
const def = (id: string) => ELEMENT_BY_ID.get(id);
const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th"];
/** "2nd": the storm a defence that comes through `survivesStorms` of them breaks in. */
export const breaksIn = (id: string): string => ORDINAL[(def(id)?.survivesStorms ?? 0) + 1] ?? `${(def(id)?.survivesStorms ?? 0) + 1}th`;
const defenceBios = NUDGE_ORDER.map((id) => bio(id));
const mostBio = Math.max(...defenceBios);
const leastBio = Math.min(...defenceBios);
/** The other defences that add as much biodiversity as `id`, by name. */
const tiedWith = (id: string): string[] => NUDGE_ORDER.filter((other) => other !== id && bio(other) === bio(id)).map((other) => CARD_NAME[other].toLowerCase());

function mangroveLine(): string {
  const n = bio("mangrove");
  const ties = tiedWith("mangrove");
  const best = n === mostBio ? (ties.length ? `, the most of any defense, as ${ties.join(" and ")} does` : ", the most of any defense") : "";
  return `In this game: helps in both kinds of storm and adds ${n} biodiversity${best}.`;
}

function seawallLine(): string {
  const n = -bio("seawall");
  const most = bio("seawall") === leastBio ? "the most of any defense" : "";
  return `In this game: the strongest barrier against a cyclone's surge; it costs ${n} biodiversity${most ? `, ${most}` : ""}, pushes water to its ends and breaks in its ${breaksIn("seawall")} cyclone or once ${def("seawall")?.cracksAtAge} years old.`;
}

const STEPS: Omit<TutorialStep, "name" | "icon">[] = [
  {
    id: "dune",
    protects: ["Cyclone waves", "Surge"],
    how: ["Sand held by grasses and creepers.", "It stands as a barrier between the sea and the homes behind it."],
    sources: ["dune-plants", "dunes-barrier"],
    inGame: `In this game: adds ${bio("dune")} biodiversity.`,
    maya: "Try a dune on the glowing beach.",
    bestAt: "Takes a cyclone's waves and surge on the beach."
  },
  {
    id: "sandy_vegetation",
    protects: ["Cyclone waves", "Wind"],
    how: ["Screw pine.", "It holds the sand, and a row of it shelters what is behind from the wind."],
    sources: ["pandanus-windbreak"],
    inGame: "In this game: the only defense that shields homes from a cyclone's wind.",
    maya: "Now pandanus on the beach: it breaks the wind.",
    bestAt: "The only shelter from a cyclone's wind."
  },
  {
    id: "breakwater",
    protects: ["Cyclone waves"],
    how: ["A barrier out in the sea.", "It breaks the waves before they reach the shore."],
    sources: ["card-breakwater"],
    inGame: `In this game: little help in a river flood, costs ${-bio("breakwater")} biodiversity, breaks at ${def("breakwater")?.breaksAtAge} years old.`,
    maya: "A breakwater goes out in the sea. Try the glowing water.",
    bestAt: "Breaks cyclone waves out at sea."
  },
  {
    id: "seawall",
    protects: ["Cyclone waves", "Surge"],
    how: ["A hard wall along the shore.", "It shields the land behind it from waves and surge."],
    sources: ["seawall-what"],
    inGame: seawallLine(),
    maya: "Try a seawall on a glowing tile by the sea.",
    bestAt: "The strongest wall against a cyclone's surge."
  },
  {
    id: "mangrove",
    protects: ["Cyclone waves", "Surge", "River flood"],
    how: ["Mangrove forests slow the flow of the water.", "They lower a storm's surge and cut the height of its waves."],
    sources: ["mangrove-surge", "mangrove-waves"],
    inGame: mangroveLine(),
    maya: "Plant a mangrove in the estuary: it helps in both storms.",
    bestAt: "Helps in both storms, and adds the most to nature."
  },
  {
    id: "khazan",
    protects: ["River flood"],
    how: ["Goa's old farmed wetland: a bund and a sluice gate round paddy fields and fish ponds.", "The gate lets water in and out."],
    sources: ["khazan-what"],
    inGame: `In this game: holds back floods, adds ${bio("khazan")} biodiversity, little help in a cyclone.`,
    maya: "Now a khazan in the estuary.",
    bestAt: "Holds back river floods, and adds to nature."
  },
  {
    id: "small_dam",
    protects: ["River flood"],
    how: ["A low wall across the river.", "It holds back the river's water."],
    sources: ["card-small-dam"],
    inGame: `In this game: little help in a cyclone, costs ${-bio("small_dam")} biodiversity, breaks in its ${breaksIn("small_dam")} flood or once ${def("small_dam")?.cracksAtAge} years old.`,
    maya: "Try a small dam on the river.",
    bestAt: "Holds back a river flood, on the river itself."
  }
];

export const TUTORIAL_STEPS: readonly TutorialStep[] = STEPS.map((step) => ({ ...step, name: CARD_NAME[step.id], icon: CARD_ICON[step.id] }));

export const STEP_BY_ID = new Map(TUTORIAL_STEPS.map((step) => [step.id, step]));

/** Every string a player can read from the steps (the punctuation test checks them all). */
export function tutorialStepStrings(): string[] {
  return TUTORIAL_STEPS.flatMap((s) => [s.name, ...s.protects, ...s.how, s.inGame, s.maya, s.bestAt]);
}
