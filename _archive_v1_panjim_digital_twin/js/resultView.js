// Result view (D4). Shows the CURRENT Risk-view hazard/timeline selection (so this
// view stands alone -- a planner doesn't need to flip back to the Risk view to know
// what scenario they're looking at) plus every placed zone's full quantified effects
// (resultsPanel.js's renderZoneResult -- citations, confidence tiers, PROXY tags, data
// gaps, risk chains, all already wired there). Never renders a fabricated aggregate
// score; each effect stays its own line with its own unit and citation.

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/**
 * scenario: { hazardName, isCumulative, year, interpolatedValue, unit, hasTimeline }
 */
export function renderScenarioSummary(container, scenario) {
  if (scenario.isCumulative) {
    container.innerHTML = `
      <p><strong>Cumulative hazard exposure</strong> is currently shown on the map --
      a count of how many of the 6 mapped hazards have registry-backed relevance to
      each area, on a sequential scale. Not a weighted risk score.</p>
    `;
    return;
  }

  const hazardLabel = escapeHtml(scenario.hazardName.replace(/_/g, ' '));
  if (scenario.hasTimeline && scenario.interpolatedValue != null) {
    container.innerHTML = `
      <p>
        Hazard: <strong>${hazardLabel}</strong><br>
        Year: <strong>${scenario.year}</strong> &middot;
        Projected value: <strong>${scenario.interpolatedValue.toFixed(1)} ${escapeHtml(scenario.unit)}</strong>
      </p>
    `;
  } else {
    container.innerHTML = `
      <p>
        Hazard: <strong>${hazardLabel}</strong><br>
        No future timeline projection exists for this hazard in the registry.
      </p>
    `;
  }
}

export function renderEmptyResultState(container) {
  container.innerHTML = '<p class="result-empty">No zones placed yet -- switch to Mitigation / Adaptation to draw one.</p>';
}
