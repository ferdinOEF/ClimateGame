// Feature detail panel (METRIC #2, #3, #4). Given a feature_id, live-queries
// governance_status, livelihood_dependencies, cultural_heritage_assets, and
// participatory_observations for that feature and renders them. Every section that
// has no rows renders an explicit "no ... recorded" empty state -- it is never
// omitted and never filled with an invented placeholder.
//
// Statuses considered ambiguous/unresolved get the same visual register as the
// existing data_gaps "known, not yet quantified" styling (METRIC #3) -- reusing
// dataGaps.js's .data-gap-note class rather than inventing a parallel look, so the
// app has one consistent visual language for "we don't have a confident answer here."
const AMBIGUOUS_STATUSES = new Set(['unclear', 'unknown', 'unverified', 'disputed']);

import { Registry } from './registry.js';
import { citationBadge } from './citations.js';

// Session-only participatory observations, keyed by feature_id. Never written to
// registry.db (there is no write path into it anywhere in this app), never put in
// localStorage or any other persistent store -- an in-memory Map that's gone on
// reload, exactly matching METRIC #4's "do not silently persist it anywhere."
const sessionObservations = new Map();

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function renderSourceLine(row) {
  if (!row.source_id) return '';
  const badge = citationBadge({
    citationShort: row.citation_short,
    fullCitation: row.full_citation,
    year: row.year,
    publisherType: row.publisher_type,
    urlOrDoi: row.url_or_doi,
    geographicScope: row.geographic_scope,
  });
  const wrap = document.createElement('span');
  wrap.appendChild(badge);
  return wrap.innerHTML;
}

function renderGovernanceSection(featureId) {
  const rows = Registry.getGovernanceStatus(featureId);
  const wrap = document.createElement('section');
  wrap.className = 'feature-detail-section';
  wrap.innerHTML = '<h3>Governance / maintenance status</h3>';

  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'feature-empty';
    empty.textContent = 'No governance data recorded for this feature.';
    wrap.appendChild(empty);
    return wrap;
  }

  rows.forEach((row) => {
    const isAmbiguous = AMBIGUOUS_STATUSES.has((row.status || '').toLowerCase());
    const item = document.createElement('div');
    item.className = isAmbiguous ? 'data-gap-note' : 'governance-note';
    item.innerHTML = `
      <div class="data-gap-label">Status: ${escapeHtml(row.status)}</div>
      <div class="data-gap-desc">
        ${row.responsible_party ? `Responsible party: ${escapeHtml(row.responsible_party)}<br>` : ''}
        ${escapeHtml(row.notes || '')}
      </div>
      <div class="data-gap-status">
        As of ${escapeHtml(row.as_of_date)} &middot; confidence: ${escapeHtml(row.confidence)}
        ${row.source_id ? ` &middot; ${renderSourceLine(row)}` : ''}
      </div>
    `;
    wrap.appendChild(item);
  });
  return wrap;
}

function renderLivelihoodSection(featureId) {
  const rows = Registry.getLivelihoodDependencies(featureId);
  const wrap = document.createElement('section');
  wrap.className = 'feature-detail-section';
  wrap.innerHTML = '<h3>Livelihood dependency</h3>';

  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'feature-empty';
    empty.textContent = 'No livelihood dependency data recorded for this feature.';
    wrap.appendChild(empty);
    return wrap;
  }

  rows.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'feature-fact-row';
    item.innerHTML = `
      <div class="feature-fact-label">${escapeHtml(row.livelihood_type.replace(/_/g, ' '))}</div>
      <div class="feature-fact-desc">${escapeHtml(row.dependency_description)}</div>
      <div class="feature-fact-meta">
        ${row.household_estimate != null ? `~${row.household_estimate} households &middot; ` : 'Household count: not available &middot; '}
        ${renderSourceLine(row)}
      </div>
    `;
    wrap.appendChild(item);
  });
  return wrap;
}

function renderCulturalSection(featureId) {
  const rows = Registry.getCulturalHeritageAssets(featureId);
  const wrap = document.createElement('section');
  wrap.className = 'feature-detail-section';
  wrap.innerHTML = '<h3>Cultural / heritage significance</h3>';

  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'feature-empty';
    empty.textContent = 'No cultural or heritage asset data recorded for this feature.';
    wrap.appendChild(empty);
    return wrap;
  }

  rows.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'feature-fact-row';
    item.innerHTML = `
      <div class="feature-fact-label">${escapeHtml(row.name)} <span class="feature-fact-type">(${escapeHtml(row.asset_type.replace(/_/g, ' '))})</span></div>
      <div class="feature-fact-desc">${escapeHtml(row.significance_note)}</div>
      <div class="feature-fact-meta">${renderSourceLine(row)}</div>
    `;
    wrap.appendChild(item);
  });
  return wrap;
}

function renderObservationItem(obs, { isSession }) {
  const item = document.createElement('div');
  item.className = isSession ? 'observation-item observation-session' : 'observation-item';
  const roleLabel = obs.observer_role || obs.role || 'anonymous';
  const hazardLabel = obs.hazard_name || obs.hazardName || null;
  item.innerHTML = `
    <div class="observation-meta">
      <strong>${escapeHtml(roleLabel)}</strong>${hazardLabel ? ` &middot; ${escapeHtml(hazardLabel.replace(/_/g, ' '))}` : ''}
    </div>
    <div class="observation-text">${escapeHtml(obs.observation_text || obs.text)}</div>
    ${isSession ? '<div class="observation-disclaimer">Not yet saved -- this pilot demonstrates the intended input flow; a production deployment would route submissions to a moderated backend before inclusion in the shared registry.</div>' : ''}
  `;
  return item;
}

function renderParticipatorySection(featureId, hazards) {
  const wrap = document.createElement('section');
  wrap.className = 'feature-detail-section';
  wrap.innerHTML = '<h3>Participatory knowledge</h3>';

  const list = document.createElement('div');
  list.className = 'observation-list';
  wrap.appendChild(list);

  function refreshList() {
    list.innerHTML = '';
    const registryRows = Registry.getParticipatoryObservations(featureId);
    const sessionRows = sessionObservations.get(featureId) || [];

    if (registryRows.length === 0 && sessionRows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'feature-empty';
      empty.textContent = 'No observations recorded for this feature yet.';
      list.appendChild(empty);
    } else {
      registryRows.forEach((row) => list.appendChild(renderObservationItem(row, { isSession: false })));
      sessionRows.forEach((row) => list.appendChild(renderObservationItem(row, { isSession: true })));
    }
  }
  refreshList();

  const form = document.createElement('form');
  form.className = 'participatory-form';
  const hazardOptions = hazards
    .map((h) => `<option value="${h.hazard_id}">${h.name.replace(/_/g, ' ')}</option>`)
    .join('');
  form.innerHTML = `
    <h4>Add local knowledge</h4>
    <label>Your role
      <input type="text" name="role" placeholder="e.g. fisherfolk, farmer, resident" required />
    </label>
    <label>Related hazard (optional)
      <select name="hazard_id">
        <option value="">-- none specified --</option>
        ${hazardOptions}
      </select>
    </label>
    <label>Observation
      <textarea name="text" rows="3" placeholder="What have you observed?" required></textarea>
    </label>
    <button type="submit">Add observation</button>
    <p class="participatory-disclaimer">
      This form is session-only. Submitting does not save anything to the registry or
      any server -- it demonstrates the intended input flow for a future moderated
      submission pipeline. Your entry will disappear if you reload the page.
    </p>
  `;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const role = String(data.get('role') || '').trim();
    const text = String(data.get('text') || '').trim();
    const hazardId = data.get('hazard_id') ? Number(data.get('hazard_id')) : null;
    const hazard = hazardId ? hazards.find((h) => h.hazard_id === hazardId) : null;
    if (!role || !text) return;

    const list_ = sessionObservations.get(featureId) || [];
    list_.push({
      role,
      text,
      hazardName: hazard ? hazard.name : null,
      submittedAt: new Date().toISOString(),
    });
    sessionObservations.set(featureId, list_);
    form.reset();
    refreshList();
  });

  wrap.appendChild(form);
  return wrap;
}

/** Render the full detail panel for a feature into `container`. Everything here is
 * either a live registry.js query result or the feature row itself -- nothing is
 * hardcoded. */
export function renderFeatureDetail(container, feature) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'feature-detail-header';
  header.innerHTML = `
    <h2>${escapeHtml(feature.name)}</h2>
    <div class="feature-detail-type">${escapeHtml(feature.feature_type.replace(/_/g, ' '))}</div>
    ${feature.description ? `<p class="feature-detail-desc">${escapeHtml(feature.description)}</p>` : ''}
    ${feature.location_note ? `<p class="feature-detail-location">${escapeHtml(feature.location_note)}</p>` : ''}
  `;
  container.appendChild(header);

  container.appendChild(renderGovernanceSection(feature.feature_id));
  container.appendChild(renderLivelihoodSection(feature.feature_id));
  container.appendChild(renderCulturalSection(feature.feature_id));

  const hazards = Registry.getAllHazards();
  container.appendChild(renderParticipatorySection(feature.feature_id, hazards));
}
