import { ELEMENT_BY_ID } from "@core/elements";
import { HAZARD_MODEL } from "@core/hazardModel";
/**
 * What the build menu's cards say and show (Section 13, Panjim): a short
 * name, one plain line in game wording, and a small flat icon. Section 17.1
 * (owner decision): no home counts on the cards, and no "Best here"; the model's
 * numbers still drive the result cards, the objectives and the bots. No red
 * anywhere: red belongs to house roofs and to the heat.
 */

/**
 * The defences, in the order the cards list them (Section 17.1): a fixed order, nature-based first (dune, pandanus,
 * mangrove, khazan), then engineered (seawall, breakwater, small dam).
 */
export const DEFENCE_ORDER = ["dune", "sandy_vegetation", "mangrove", "khazan", "seawall", "breakwater", "small_dam"] as const;

export const CARD_NAME: Record<string, string> = {
  dune: "Dune",
  sandy_vegetation: "Pandanus",
  seawall: "Seawall",
  breakwater: "Breakwater",
  mangrove: "Mangrove",
  khazan: "Khazan",
  small_dam: "Small dam"
};

/**
 * Section 30.3 (owner decision): each card says what the defence is for, in two short lines: its main job in this
 * game, then one other thing it does. The owner asked for a real world fact with a source as each second line (the
 * seawall's a game rule). Only the khazan's could be sourced here (an existing citation, `khazan-what`); no web page
 * could be opened to check the others, so they are plain game lines (true in this game) until their sources are
 * checked. The owner's wordings and the leads found are kept in facts.json as hidden `card-*` entries
 * (`needsSource`). No pairing lines on the cards (the rule stays in the game).
 */
export const CARD_LINES: Record<string, readonly [string, string]> = {
  dune: ["Shields homes from cyclone waves and surge.", "Good for nature: it adds to biodiversity."],
  sandy_vegetation: ["Shields homes from cyclone waves and wind.", "The only shelter from a cyclone's wind."],
  mangrove: ["Protects against waves and surge in both storms.", "Grows on wetland; good for nature."],
  khazan: ["Holds back river floods.", "Farmers and fishers share it."],
  seawall: ["The strongest wall against cyclone surge.", "Costs nature, and cracks with age."],
  breakwater: ["Breaks cyclone waves out at sea.", "Costs nature, and breaks with age."],
  small_dam: ["Holds back river floods.", "Costs nature, and cracks with age."]
};

/**
 * Section 30.11 bug 4: the Tutorial's one storm. Its cards never mention a second storm, both storms or ageing.
 */
export const TUTORIAL_CARD_LINES: Record<string, readonly [string, string]> = {
  ...CARD_LINES,
  mangrove: ["Protects against waves and surge.", CARD_LINES.mangrove[1]],
  seawall: [CARD_LINES.seawall[0], "Costs nature."],
  breakwater: [CARD_LINES.breakwater[0], "Costs nature."],
  small_dam: [CARD_LINES.small_dam[0], "Costs nature."]
};

/** Section 30.3: the facts.json entry that sources a card's second line, where it is a real world fact. */
export const CARD_FACT: Record<string, string | null> = {
  dune: null,
  sandy_vegetation: null,
  mangrove: null,
  khazan: "khazan-what",
  seawall: null,
  breakwater: null,
  small_dam: null
};

/** Section 30.4: a build's change to biodiversity, for the card's leaf chip. */
export function cardBiodiversity(id: string): number {
  return ELEMENT_BY_ID.get(id)?.effects.biodiversity ?? 0;
}

const bio = (id: string): number => ELEMENT_BY_ID.get(id)?.effects.biodiversity ?? 0;
const nature = (id: string): string => {
  const v = bio(id);
  return v > 0 ? `adds ${v} to biodiversity` : v < 0 ? `costs ${-v} biodiversity` : "leaves biodiversity as it is";
};

/**
 * Section 25.1 (owner decisions): each defence's pro and con, as game rules, for the Field Guide (and in short in
 * Help). Built from the game's own data, so the words never disagree with the numbers.
 */
export function defenceRules(): { id: string; name: string; text: string }[] {
  const windShare = Math.round((HAZARD_MODEL.wind?.shelter.sandy_vegetation ?? 0) * 100);
  const reach = HAZARD_MODEL.wind?.shelterReachHex ?? 2;
  const rules: Record<string, string> = {
    dune: `In this game a dune shields the homes behind it from a cyclone's waves and surge, and it ${nature("dune")}.`,
    sandy_vegetation: `In this game pandanus is at full strength from the year it is planted and ${nature("sandy_vegetation")}. It lowers a cyclone's waves and surge a little (less than a dune), and it is the only defence that lowers a cyclone's wind: homes within ${reach} tiles of it take ${windShare}% less wind damage.`,
    mangrove: `In this game a mangrove has one strength from the year it is planted, ${nature("mangrove")} and helps in both kinds of storm. It grows only on wetland. A river tile takes only a small dam.`,
    khazan: `In this game a khazan holds back river floods. It is never worn, so it never needs a repair, and it ${nature("khazan")}; it does little against a cyclone's surge.`,
    seawall: `In this game a seawall is the strongest defence from the year it is built, but it ${nature("seawall")}. It comes through the first cyclone it faces and breaks in the second (every storm that brings a cyclone counts, the storm that brings both included); once it is ${ELEMENT_BY_ID.get("seawall")?.cracksAtAge} years old it is cracked and breaks in the next cyclone, even its first. It pushes extra water onto the land at each end of the wall.`,
    breakwater: `In this game a breakwater breaks a cyclone's waves out at sea but is almost no help in a river flood, and it ${nature("breakwater")}. It breaks when it is ${ELEMENT_BY_ID.get("breakwater")?.breaksAtAge} years old, storm or none, and must be built again.`,
    small_dam: `In this game a small dam is strong in a river flood and little help in a cyclone. It comes through the first flood it faces and breaks in the second (every storm that brings a river flood counts, the storm that brings both included); once it is ${ELEMENT_BY_ID.get("small_dam")?.cracksAtAge} years old it is cracked and breaks in the next flood, even its first. It ${nature("small_dam")}.`
  };
  return DEFENCE_ORDER.map((id) => ({ id, name: CARD_NAME[id], text: rules[id] }));
}

/** Section 25.1: what happens to a broken seawall or dam, a game rule. */
export const BROKEN_RULE = "In this game a broken breakwater, seawall or small dam stops protecting, keeps its cost to biodiversity and is drawn broken; you can build again on its tile.";

const svg = (body: string): string => `<svg viewBox="0 0 32 32" width="30" height="30" focusable="false">${body}</svg>`;

export const CARD_ICON: Record<string, string> = {
  dune: svg('<rect width="32" height="32" rx="7" fill="#2f6f8a"/><path d="M0 24 Q8 12 15 19 Q22 10 32 22 V32 H0Z" fill="#e8cf96"/><path d="M0 24 Q8 12 15 19" fill="none" stroke="#f6e7c1" stroke-width="1.5"/><path d="M9 16 l1-4 M11 16 l2-4 M22 14 l0-4 M24 14 l2-3" stroke="#5c8a3a" stroke-width="1.4" stroke-linecap="round"/>'),
  sandy_vegetation: svg('<rect width="32" height="32" rx="7" fill="#2f6f8a"/><path d="M0 25 H32 V32 H0Z" fill="#e8cf96"/><path d="M15 26 V15 M15 19 L10 13 M15 18 L21 12" stroke="#7a5a33" stroke-width="1.6" stroke-linecap="round"/><path d="M10 13 l-5 2 M10 13 l-3-4 M10 13 l1-5 M10 13 l4-3 M21 12 l-3-4 M21 12 l1-5 M21 12 l5-2 M21 12 l4 3 M15 15 l-3-5 M15 15 l3-5" stroke="#4f8f3a" stroke-width="1.5" stroke-linecap="round"/>'),
  seawall: svg('<rect width="32" height="32" rx="7" fill="#2f6f8a"/><path d="M0 22 Q6 19 12 22 V32 H0Z" fill="#7fc0d6"/><rect x="12" y="10" width="20" height="22" fill="#9a9c98"/><path d="M12 15 H32 M12 20 H32 M12 25 H32 M18 10 V15 M26 10 V15 M15 15 V20 M23 15 V20 M30 15 V20 M18 20 V25 M26 20 V25" stroke="#6f726e" stroke-width="1.2"/><rect x="11" y="8" width="21" height="3" fill="#d9d6cc"/>'),
  breakwater: svg('<rect width="32" height="32" rx="7" fill="#2f6f8a"/><path d="M3 17 q3-3 6 0 q3 3 6 0" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/><path d="M5 25 l4-6 h6 l3 6 Z M15 25 l4-7 h5 l4 7Z" fill="#8f9391" stroke="#5f6361" stroke-width="1"/>'),
  mangrove: svg('<rect width="32" height="32" rx="7" fill="#3d6f6a"/><path d="M0 26 H32 V32 H0Z" fill="#5d9aa3"/><ellipse cx="11" cy="12" rx="7" ry="5" fill="#1f5a32"/><ellipse cx="21" cy="11" rx="7" ry="5.5" fill="#2a6b3b"/><path d="M11 16 Q8 22 6 27 M11 16 Q12 22 14 27 M21 15 Q18 22 17 27 M21 15 Q24 22 26 27" fill="none" stroke="#8a5f38" stroke-width="1.5" stroke-linecap="round"/>'),
  khazan: svg('<rect width="32" height="32" rx="7" fill="#3d6f6a"/><ellipse cx="16" cy="17" rx="13" ry="10" fill="#a9793f"/><path d="M5 17 a11 8 0 0 1 11 -8 V25 a11 8 0 0 1 -11 -8Z" fill="#4a90a4"/><path d="M16 9 a11 8 0 0 1 0 16Z" fill="#3f6b3a"/><path d="M18 12 H25 M18 15 H27 M18 18 H27 M18 21 H25" stroke="#6fa24a" stroke-width="1.4"/><rect x="13" y="23" width="6" height="4" fill="#8a8f91"/>'),
  small_dam: svg('<rect width="32" height="32" rx="7" fill="#4c7a4a"/><path d="M10 0 H22 V32 H10Z" fill="#4a90a4"/><rect x="7" y="14" width="18" height="5" fill="#b9b9b2"/><rect x="14" y="14" width="4" height="2.5" fill="#6fc3e0"/><path d="M12 22 q2 2 4 0 q2 2 4 0 M12 26 q2 2 4 0 q2 2 4 0" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>')
};
