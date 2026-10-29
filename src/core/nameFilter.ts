/**
 * Section 35.3: the name a player gives for the board (their name or an Instagram handle). The client's name card,
 * the feedback form and the server (api/) all check a name here, with the same rules and the same list.
 *
 *   - 2 to 30 characters: letters, numbers, spaces, "@", "." and "_" (spaces at the ends dropped, runs of spaces made
 *     one);
 *   - not a rude word, in English or in common romanised Hindi and Konkani, however it is spelt out: upper or lower
 *     case, with spaces, dots or underscores between the letters, digits for letters ("5h1t") or letters doubled.
 *
 * Words that are also names or parts of names (Assam, Chodankar, Hancock, Dickson, Kshitij, Scunthorpe) are matched only as a
 * whole word, so a real name is never refused for what it happens to contain.
 *
 * Pure: no DOM, no network.
 */
export const NAME_MIN = 2;
export const NAME_MAX = 30;

/** Shown under the field. */
export const NAME_HINT = "2 to 30 letters or numbers. Shown only on the board.";
/** Shown when a name is refused for its words. */
export const NAME_REFUSED = "Please choose another name.";
/** Shown when a name is too short, too long or has other characters. */
export const NAME_SHAPE = "Please use 2 to 30 letters or numbers.";

/** Found anywhere in the name, once its spaces, dots and underscores are taken out: never part of a real name. */
const ANYWHERE = [
  // English
  "fuck", "nigger", "nigga", "faggot", "motherf", "asshole", "bitch", "whore", "bastard", "bollocks", "wanker",
  // romanised Hindi
  "chutiya", "chutiye", "chutia", "bhenchod", "behenchod", "benchod", "madarchod", "maderchod", "betichod", "bhosdi", "bhosda",
  "bhosad", "gandu", "harami", "kutiya",
  // romanised Konkani (and Marathi, which Goa shares)
  "randecho", "randechya", "randeche", "zhavnyo", "zhavnya", "zavadya", "zhavadya", "bhadvo", "bhadwa", "bhadva"
];

/** A word of the name that starts with one of these. */
const WORD_START = ["cunt", "shit", "slut", "twat", "wank", "rapist", "porn", "penis", "vagina", "dildo", "retard", "pussy", "boob", "jhaat", "tatti", "zhav", "nazi", "hitler", "lauda", "lavda"];

/** A word of the name that is exactly one of these (each is also the start of ordinary words or names). */
const WHOLE_WORD = ["ass", "arse", "cum", "tit", "tits", "anal", "rape", "dick", "cock", "fag", "prick", "piss", "sex", "kkk", "gand", "gaand", "lund", "loda", "chod", "chodu", "randi", "rand", "puchi", "pucchi", "kutta", "kutti"];

/** Digits and symbols written for letters. */
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s" };

/** Letters from other alphabets that look like Latin ones (Cyrillic and Greek), read as the Latin letter. */
const LOOK_ALIKE: Record<string, string> = {
  а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", ԁ: "d", ʏ: "y",
  α: "a", β: "b", ε: "e", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u", χ: "x"
};

/** Runs of one letter made one ("fuuuck" to "fuck"). */
const single = (s: string): string => s.replace(/(.)\1+/g, "$1");

/** The name as written: ends trimmed, runs of spaces made one (Section 37.9: shown as the player typed it otherwise). */
export function tidyName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Section 37.9: the key two names are the same board name by: trimmed, runs of spaces made one, Unicode NFKC (fullwidth
 * and other compatibility forms become the plain letters they stand for) and case ignored. One board row per key.
 */
export function boardNameKey(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

export type NameCheck = { ok: true; name: string } | { ok: false; reason: "shape" | "refused"; message: string };

/** Whether `name` contains a word on the list (see the header). */
export function isRude(name: string): boolean {
  const lower = [...name.normalize("NFKC").toLowerCase()].map((c) => LOOK_ALIKE[c] ?? c).join("").normalize("NFD").replace(/\p{M}/gu, "");
  // A leading "@" is a handle's mark, not an "a".
  const leet = lower.replace(/^@/, "").replace(/[013457@8$]/g, (c) => LEET[c] ?? c);
  const words = leet.split(/[\s._@]+/).filter(Boolean);
  const joined = words.join("");
  // A name spelt out letter by letter ("f u c k") is one word.
  const spelt = words.every((w) => w.length === 1) ? [joined] : [];
  const forms = (s: string): string[] => [s, single(s)];
  const anywhere = ANYWHERE.flatMap(forms);
  if (forms(joined).some((s) => anywhere.some((bad) => s.includes(bad)))) return true;
  for (const word of [...words, ...spelt].flatMap(forms)) {
    if (WHOLE_WORD.some((bad) => word === bad || word === single(bad))) return true;
    if (WORD_START.some((bad) => word.startsWith(bad) || word.startsWith(single(bad)))) return true;
  }
  return false;
}

/** Checks a name for the board: its shape, then its words. */
export function checkName(raw: string): NameCheck {
  // Kept as typed (NFC only joins a letter and its accents, so fullwidth letters stay fullwidth), checked as its plain
  // letters too (NFKC: "ｆｕｃｋ" is "fuck"); the length and the stacked accents are checked on both forms.
  const name = tidyName(raw).normalize("NFC");
  const plain = name.normalize("NFKC").replace(/\s+/g, " ").trim();
  const badLength = (s: string): boolean => [...s].length < NAME_MIN || [...s].length > NAME_MAX || /\p{M}{3,}/u.test(s);
  if (badLength(name) || badLength(plain) || !/^[\p{L}\p{M}\p{N} @._]+$/u.test(plain) || !/[\p{L}\p{N}]/u.test(plain)) {
    return { ok: false, reason: "shape", message: NAME_SHAPE };
  }
  if (isRude(plain)) return { ok: false, reason: "refused", message: NAME_REFUSED };
  return { ok: true, name };
}
