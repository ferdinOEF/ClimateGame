/**
 * What the build menu's cards say and show (Section 13, Panjim): a short
 * name, one plain line in game wording (no numbers: the number on each card
 * comes from the model), and a small flat icon. No red anywhere: red belongs
 * to house roofs and to the heat.
 */

/** The defences, in the order the cards list them. */
export const DEFENCE_ORDER = ["dune", "sandy_vegetation", "seawall", "breakwater", "mangrove", "khazan", "small_dam"] as const;

export const CARD_NAME: Record<string, string> = {
  dune: "Dune",
  sandy_vegetation: "Pandanus",
  seawall: "Seawall",
  breakwater: "Breakwater",
  mangrove: "Mangrove",
  khazan: "Khazan",
  small_dam: "Small dam",
  sand_mining: "Sand mining"
};

export const CARD_LINE: Record<string, string> = {
  dune: "Soaks up waves on the beach",
  sandy_vegetation: "Softens waves a little and slows the wind",
  seawall: "Strong; can break in big storms",
  breakwater: "Stops waves out at sea, before the beach",
  mangrove: "Slows the surge and the wind at the water's edge",
  khazan: "Holds floodwater in the fields",
  small_dam: "Holds back river floods",
  sand_mining: "Makes floods worse downstream"
};

const svg = (body: string): string => `<svg viewBox="0 0 32 32" width="30" height="30" focusable="false">${body}</svg>`;

export const CARD_ICON: Record<string, string> = {
  dune: svg('<rect width="32" height="32" rx="7" fill="#2f6f8a"/><path d="M0 24 Q8 12 15 19 Q22 10 32 22 V32 H0Z" fill="#e8cf96"/><path d="M0 24 Q8 12 15 19" fill="none" stroke="#f6e7c1" stroke-width="1.5"/><path d="M9 16 l1-4 M11 16 l2-4 M22 14 l0-4 M24 14 l2-3" stroke="#5c8a3a" stroke-width="1.4" stroke-linecap="round"/>'),
  sandy_vegetation: svg('<rect width="32" height="32" rx="7" fill="#2f6f8a"/><path d="M0 25 H32 V32 H0Z" fill="#e8cf96"/><path d="M15 26 V15 M15 19 L10 13 M15 18 L21 12" stroke="#7a5a33" stroke-width="1.6" stroke-linecap="round"/><path d="M10 13 l-5 2 M10 13 l-3-4 M10 13 l1-5 M10 13 l4-3 M21 12 l-3-4 M21 12 l1-5 M21 12 l5-2 M21 12 l4 3 M15 15 l-3-5 M15 15 l3-5" stroke="#4f8f3a" stroke-width="1.5" stroke-linecap="round"/>'),
  seawall: svg('<rect width="32" height="32" rx="7" fill="#2f6f8a"/><path d="M0 22 Q6 19 12 22 V32 H0Z" fill="#7fc0d6"/><rect x="12" y="10" width="20" height="22" fill="#9a9c98"/><path d="M12 15 H32 M12 20 H32 M12 25 H32 M18 10 V15 M26 10 V15 M15 15 V20 M23 15 V20 M30 15 V20 M18 20 V25 M26 20 V25" stroke="#6f726e" stroke-width="1.2"/><rect x="11" y="8" width="21" height="3" fill="#d9d6cc"/>'),
  breakwater: svg('<rect width="32" height="32" rx="7" fill="#2f6f8a"/><path d="M3 17 q3-3 6 0 q3 3 6 0" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/><path d="M5 25 l4-6 h6 l3 6 Z M15 25 l4-7 h5 l4 7Z" fill="#8f9391" stroke="#5f6361" stroke-width="1"/>'),
  mangrove: svg('<rect width="32" height="32" rx="7" fill="#3d6f6a"/><path d="M0 26 H32 V32 H0Z" fill="#5d9aa3"/><ellipse cx="11" cy="12" rx="7" ry="5" fill="#1f5a32"/><ellipse cx="21" cy="11" rx="7" ry="5.5" fill="#2a6b3b"/><path d="M11 16 Q8 22 6 27 M11 16 Q12 22 14 27 M21 15 Q18 22 17 27 M21 15 Q24 22 26 27" fill="none" stroke="#8a5f38" stroke-width="1.5" stroke-linecap="round"/>'),
  khazan: svg('<rect width="32" height="32" rx="7" fill="#3d6f6a"/><ellipse cx="16" cy="17" rx="13" ry="10" fill="#a9793f"/><path d="M5 17 a11 8 0 0 1 11 -8 V25 a11 8 0 0 1 -11 -8Z" fill="#4a90a4"/><path d="M16 9 a11 8 0 0 1 0 16Z" fill="#3f6b3a"/><path d="M18 12 H25 M18 15 H27 M18 18 H27 M18 21 H25" stroke="#6fa24a" stroke-width="1.4"/><rect x="13" y="23" width="6" height="4" fill="#8a8f91"/>'),
  small_dam: svg('<rect width="32" height="32" rx="7" fill="#4c7a4a"/><path d="M10 0 H22 V32 H10Z" fill="#4a90a4"/><rect x="7" y="14" width="18" height="5" fill="#b9b9b2"/><rect x="14" y="14" width="4" height="2.5" fill="#6fc3e0"/><path d="M12 22 q2 2 4 0 q2 2 4 0 M12 26 q2 2 4 0 q2 2 4 0" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>'),
  sand_mining: svg('<rect width="32" height="32" rx="7" fill="#4c7a4a"/><path d="M10 0 H22 V32 H10Z" fill="#4a90a4"/><path d="M6 26 Q16 12 26 26Z" fill="#c9a86a"/><path d="M20 8 L13 19" stroke="#5b4a35" stroke-width="2" stroke-linecap="round"/><path d="M11 18 l4 3 -3 3 -3-3Z" fill="#6f726e"/>')
};

/** The pill under a card's line: the model's number for this tile and the storm coming. */
export function cardPill(saved: number | null, defence = true): { pill: string | null; tone: "good" | "zero" | "bad" } {
  if (saved === null) return { pill: null, tone: "zero" };
  // Not a defence (sand mining): "Protects 0" would read as a defence that failed.
  if (saved === 0 && !defence) return { pill: "Saves no homes here", tone: "zero" };
  if (saved > 0) return { pill: `Protects ${saved} ${saved === 1 ? "home" : "homes"} here`, tone: "good" };
  if (saved < 0) return { pill: `Puts ${-saved} more ${saved === -1 ? "home" : "homes"} at risk`, tone: "bad" };
  return { pill: "Protects 0 homes here", tone: "zero" };
}
