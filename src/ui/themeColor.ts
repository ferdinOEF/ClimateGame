/**
 * Section 33 (Harbour Morning): a token's colour as the page has it now (src/ui/theme.css), for the pictures drawn
 * on a canvas (the share cards), which cannot read CSS variables themselves. `fallback` is the calm value, used
 * where there is no page (tests).
 */
export function themeColor(token: string, fallback: string): string {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || fallback;
}
