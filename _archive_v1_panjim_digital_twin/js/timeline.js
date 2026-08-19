// Linear interpolation between REAL registry anchor points only (constraint #3).
// Never extrapolates past the earliest/latest anchor a hazard actually has, and never
// fabricates anchors for a hazard that has none -- both are checked by callers via
// Registry.getTemporalProjections(hazardName) returning [] for anything but
// sea_level_rise today.

/** anchors: rows from Registry.getTemporalProjections, sorted by year ascending
 * (the query already orders by year). Returns { minYear, maxYear } or null if fewer
 * than 2 anchors exist (can't interpolate with 0 or 1 point). */
export function anchorYearRange(anchors) {
  if (!anchors || anchors.length < 2) return null;
  return { minYear: anchors[0].year, maxYear: anchors[anchors.length - 1].year };
}

/** Linearly interpolates `value` at `year` between the two anchors that bracket it.
 * Returns null if year is outside the anchor range (no extrapolation) or if there
 * aren't at least 2 anchors to interpolate between. */
export function interpolateAtYear(anchors, year) {
  const range = anchorYearRange(anchors);
  if (!range) return null;
  if (year < range.minYear || year > range.maxYear) return null;

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (year >= a.year && year <= b.year) {
      if (a.year === b.year) return a.value;
      const t = (year - a.year) / (b.year - a.year);
      return a.value + (b.value - a.value) * t;
    }
  }
  return null;
}

export function isAnchorYear(anchors, year) {
  return anchors.some((a) => a.year === year);
}
