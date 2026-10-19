import factsData from "@data/facts.json";
import nuggetsData from "@data/nuggets.json";
import { ELEMENT_BY_ID } from "./elements";

/**
 * Everything the game says about the real world, in one place
 * (`src/data/facts.json`).
 *
 * A `fact` is a claim about the real world and must carry a citation; it is
 * shown only as written there, with its numbers only when the source states
 * them. A `gameRule` describes how this game works, so it carries no
 * citation and is always labelled "Game rule" where it is shown (Maya's
 * bubble, the Sources screen), never presented as science. An entry with `needsSource` is kept for the record
 * (docs/FACTS_AUDIT.md) but never shown.
 *
 * Pure data and string helpers: no DOM.
 */
export interface Citation {
  title: string;
  authors: string;
  publisher: string;
  /** "n.d." when the source carries no date. */
  year: string;
  url: string;
  /** A landing page for the same work, when the main URL is a file. */
  landingUrl?: string;
  /** What the source says that supports the text, in its own terms. */
  note: string;
}

export interface Fact {
  id: string;
  kind: "fact" | "gameRule";
  text: string;
  /** Elements whose build can bring Maya to say it. */
  elements: string[];
  citation?: Citation;
  /** Shown as "As reported by <author> (<year>)": a single, non-peer-reviewed source. */
  reported?: boolean;
  /** Shown only on the Sources screen (and the Field Guide), never said on a build: the dolphins come whatever is built. */
  sourcesOnly?: boolean;
  /** No source yet: never shown. */
  needsSource?: boolean;
  /** A game rule about a feature this version has switched off (coins, growth): not shown until it returns. */
  needs?: ("economy" | "growth")[];
  hiddenBecause?: string;
}

export const ALL_FACTS: readonly Fact[] = (factsData as { facts: Fact[] }).facts;
const BY_ID = new Map(ALL_FACTS.map((fact) => [fact.id, fact]));

/**
 * Features this version of the game has switched off (Section 5): the rules
 * about them are kept but not shown, so nothing names a price or a growing
 * time. Re-enabling coins or growth means taking it out of this set.
 */
// ECONOMY_DISABLED_V1: coin mechanics reserved for a future version
// GROWTH_DISABLED_V1: growth and maturity reserved for a future version
export const FEATURES_OFF: ReadonlySet<string> = new Set(["economy", "growth"]);

/** Whether a fact may be shown: game rules always (unless about a feature that is off), real-world facts only with a citation. */
export function isShown(fact: Fact): boolean {
  if (fact.needsSource) return false;
  if (fact.needs?.some((feature) => FEATURES_OFF.has(feature))) return false;
  return fact.kind === "gameRule" || Boolean(fact.citation);
}

export const SHOWN_FACTS: readonly Fact[] = ALL_FACTS.filter(isShown);
/** The cited real-world facts the Sources screen lists. */
export const CITED_FACTS: readonly Fact[] = SHOWN_FACTS.filter((fact) => fact.kind === "fact");

export function factById(id: string): Fact | undefined {
  return BY_ID.get(id);
}

/** The facts Maya can say when an element is built, in order; hidden ones dropped. */
export function discoveryFacts(elementId: string): Fact[] {
  const ids = (nuggetsData as Record<string, string[]>)[elementId] ?? [];
  return ids.map((id) => BY_ID.get(id)).filter((fact): fact is Fact => Boolean(fact && isShown(fact)));
}

/** Every distinct fact Maya can say on a build: the "N of M" denominator. */
export function discoveryTotal(): number {
  const ids = new Set<string>();
  for (const list of Object.values(nuggetsData as Record<string, string[]>)) {
    for (const id of list) if (BY_ID.get(id) && isShown(BY_ID.get(id)!)) ids.add(id);
  }
  return ids.size;
}

/** The title a discovery gets in the Field Guide's notes: the first element it belongs to. */
export function discoveryNoteTitle(fact: Fact): string {
  const id = fact.elements[0] ?? fact.id;
  return ELEMENT_BY_ID.get(id)?.name ?? id;
}

/** "McIvor et al." / "Lobo": the first author's surname, for short credits. */
export function firstAuthor(citation: Citation): string {
  const first = citation.authors.split(",")[0].trim();
  // Authors are written "Surname, I.J.", so each "Surname, I." is one person.
  const people = citation.authors.match(/\p{Lu}[\p{L}'-]+, (?:\p{Lu}\.)+/gu)?.length ?? 1;
  return people > 1 ? `${first} et al.` : first;
}

/** "McIvor et al., 2012, The Nature Conservancy ...": the Source tooltip. */
export function shortCredit(citation: Citation): string {
  return `${firstAuthor(citation)}, ${citation.year}, ${citation.publisher}`;
}

/** The text as the player sees it: a reported fact is attributed in the sentence itself. */
export function displayText(fact: Fact): string {
  if (fact.reported && fact.citation) return `As reported by ${firstAuthor(fact.citation)} (${fact.citation.year}): ${fact.text}`;
  return fact.text;
}

/** The full reference line on the Sources screen. */
export function fullReference(citation: Citation): string {
  return `${citation.authors} (${citation.year}). ${citation.title}. ${citation.publisher}.`;
}
