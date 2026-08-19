// Mitigation/Adaptation view (D3, constraint #4, #5, #7). Two responsibilities:
//   1. The zone-tag panel: shown after a polygon is drawn, lets the planner pick a
//      mitigation type from two clearly separated groups (nature-based / engineered --
//      constraint #7, this platform must not visually favor either), and shows a live
//      per-hazard coverage preview (Registry.getFullHazardCoverage) with a confidence
//      hourglass on every non-'measured' tier BEFORE the planner commits to placing it.
//   2. A lightweight placed-zones list for this view (type, area, cell count, and a
//      compact confidence summary) -- the full quantified-effects breakdown with
//      citations and risk chains lives in the Result view (resultsPanel.js), not here,
//      per D3 vs D4's split of responsibilities.

import { Registry } from './registry.js';
import { confidenceBadge, tierInfo, isProxy, proxyTag } from './confidenceTiers.js';
import { zoneColor } from './zones.js';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

const TYPE_LABEL = { 'nature-based': 'Nature-based', engineered: 'Engineered' };
const GROUP_ORDER = ['nature-based', 'engineered'];

export function renderIdleTagPanel(container) {
  container.innerHTML = '<p class="help-text">Draw a polygon on the map to place an intervention.</p>';
}

/** mitigations: Registry.getAllMitigations() rows (each has .type = 'nature-based' | 'engineered'). */
export function renderZoneTagPanel(container, mitigations, { onApply, onCancel }) {
  container.innerHTML = '';

  const grouped = {};
  mitigations.forEach((m) => {
    if (!grouped[m.type]) grouped[m.type] = [];
    grouped[m.type].push(m);
  });

  let selectedName = null;
  const optionEls = new Map();

  const list = document.createElement('div');
  container.appendChild(list);

  GROUP_ORDER.forEach((type) => {
    if (!grouped[type] || grouped[type].length === 0) return;
    const label = document.createElement('div');
    label.className = 'mitigation-group-label';
    label.textContent = TYPE_LABEL[type] || type;
    list.appendChild(label);

    const optList = document.createElement('div');
    optList.className = 'mitigation-option-list';
    grouped[type].forEach((m) => {
      const opt = document.createElement('div');
      opt.className = `mitigation-option type-${m.type}`;
      opt.dataset.selected = 'false';
      opt.innerHTML = `
        <span class="mitigation-type-badge ${m.type}">${m.type === 'nature-based' ? 'NbS' : 'Engineered'}</span>
        <span>${escapeHtml(m.name.replace(/_/g, ' '))}</span>
      `;
      opt.addEventListener('click', () => selectMitigation(m, opt));
      optList.appendChild(opt);
      optionEls.set(m.name, opt);
    });
    list.appendChild(optList);
  });

  const coveragePreview = document.createElement('div');
  coveragePreview.className = 'coverage-preview';
  coveragePreview.hidden = true;
  container.appendChild(coveragePreview);

  const actions = document.createElement('div');
  actions.className = 'zone-tag-actions';
  actions.hidden = true;
  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.id = 'zone-tag-apply-btn';
  applyBtn.textContent = 'Place zone';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.id = 'zone-tag-cancel-btn';
  cancelBtn.textContent = 'Cancel';
  actions.appendChild(applyBtn);
  actions.appendChild(cancelBtn);
  container.appendChild(actions);

  function selectMitigation(m, el) {
    selectedName = m.name;
    optionEls.forEach((e2) => (e2.dataset.selected = 'false'));
    el.dataset.selected = 'true';
    renderCoverage(m.name);
    actions.hidden = false;
  }

  function renderCoverage(mitigationName) {
    const coverage = Registry.getFullHazardCoverage(mitigationName);
    coveragePreview.hidden = false;
    coveragePreview.innerHTML = '<h4>Registry coverage across all 6 hazards</h4>';

    coverage.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'coverage-row';

      const nameEl = document.createElement('span');
      nameEl.className = 'coverage-hazard-name';
      nameEl.textContent = row.hazard.name.replace(/_/g, ' ');

      const statusEl = document.createElement('span');
      statusEl.className = `coverage-status-${row.coverageType}`;

      if (row.coverageType === 'quantified') {
        const text = row.effects
          .map((e) => (e.value_type === 'range' ? `${e.value_min}–${e.value_max}` : `${e.value_min}`) + ` ${e.unit}`)
          .join('; ');
        statusEl.appendChild(document.createTextNode(text));
        const tiers = new Set(row.effects.map((e) => e.confidence_tier));
        tiers.forEach((t) => {
          if (t !== 'measured') statusEl.appendChild(confidenceBadge(t));
        });
        if (row.effects.some((e) => isProxy(e.application_notes))) {
          statusEl.appendChild(document.createTextNode(' '));
          statusEl.appendChild(proxyTag());
        }
      } else if (row.coverageType === 'data_gap') {
        statusEl.appendChild(document.createTextNode('Known gap, not quantified'));
      } else {
        statusEl.appendChild(document.createTextNode('No effect on record'));
        statusEl.appendChild(confidenceBadge('provisional_zero_default'));
      }

      rowEl.appendChild(nameEl);
      rowEl.appendChild(statusEl);
      coveragePreview.appendChild(rowEl);
    });
  }

  applyBtn.addEventListener('click', () => {
    if (selectedName) onApply(selectedName);
  });
  cancelBtn.addEventListener('click', () => onCancel());
}

/** Lightweight placed-zone card for the Mitigation view's list (not the full
 * quantified-effects breakdown -- that's resultsPanel.js's renderZoneResult, used in
 * the Result view). */
export function renderZoneSummary(container, zone, onRemove) {
  const coverage = Registry.getFullHazardCoverage(zone.mitigationName);
  const quantifiedCount = coverage.filter((c) => c.coverageType === 'quantified').length;
  const gapCount = coverage.filter((c) => c.coverageType === 'data_gap').length;
  const zeroCount = coverage.filter((c) => c.coverageType === 'provisional_zero_default').length;
  const mitigation = Registry.getMitigationByName(zone.mitigationName);

  const card = document.createElement('div');
  card.className = 'zone-result-card';
  card.style.borderLeftColor = zoneColor(zone.mitigationName);
  card.innerHTML = `
    <div class="zone-result-header">
      <h3>
        <span class="mitigation-type-badge ${mitigation ? mitigation.type : ''}">${mitigation && mitigation.type === 'nature-based' ? 'NbS' : 'Engineered'}</span>
        ${escapeHtml(zone.mitigationName.replace(/_/g, ' '))}
      </h3>
      <div class="zone-result-meta">
        ${(zone.areaM2 / 10000).toFixed(2)} ha &middot; ${zone.snappedCells.length} grid cells (${zone.cellSizeM}m)
      </div>
      <div class="zone-result-meta">
        ${quantifiedCount} quantified &middot; ${gapCount} known gap &middot; ${zeroCount} no registry data
      </div>
    </div>
  `;
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-remove-zone';
  removeBtn.textContent = 'Remove zone';
  removeBtn.addEventListener('click', () => onRemove(zone.id));
  card.appendChild(removeBtn);

  container.appendChild(card);
  return card;
}
