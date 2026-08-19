// Risk-chain cascade visualization (METRIC #1). A chain is an ORDERED sequence of
// steps (Registry.getRiskChain, step_order) -- rendered as a connected vertical
// cascade, never a flat list, so the causal sequence (mangrove protects bund -> bund
// protects flood storage -> if the bund still fails, saline intrusion follows) reads
// as a narrative. Each step is exactly one of:
//   - quantified (relationship_id set): hazard + value/range + unit + live citation
//   - a "break in the chain" (data_gap_id set): visually distinct -- dashed connector,
//     gap-red marker, no numeric value -- because forcing a gap step to look like a
//     quantified one would misrepresent a known-but-unquantified risk as measured.

import { citationBadge } from './citations.js';
import { confidenceBadge, proxyTag, isProxy } from './confidenceTiers.js';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function renderStep(step) {
  const li = document.createElement('li');
  const isGap = step.data_gap_id != null;
  li.className = isGap ? 'chain-step chain-step-gap' : 'chain-step chain-step-quantified';

  const marker = document.createElement('div');
  marker.className = 'chain-step-marker';
  marker.textContent = String(step.step_order);
  li.appendChild(marker);

  const content = document.createElement('div');
  content.className = 'chain-step-content';

  if (isGap) {
    content.innerHTML = `
      <div class="chain-step-desc">${escapeHtml(step.step_description)}</div>
      <div class="chain-step-gap-body">
        <span class="chain-step-gapflag">Break in the chain &mdash; not yet quantified</span>
        <div class="data-gap-desc">${escapeHtml(step.gap_description)}</div>
        <div class="data-gap-status">Status: ${escapeHtml(step.gap_status)}</div>
      </div>
    `;
  } else {
    const valueText =
      step.value_type === 'range'
        ? `${step.value_min}–${step.value_max} ${step.unit}`
        : `${step.value_min} ${step.unit}`;
    content.innerHTML = `
      <div class="chain-step-desc">${escapeHtml(step.step_description)}</div>
      <div class="chain-step-value">
        ${escapeHtml(step.rel_hazard_name ? step.rel_hazard_name.replace(/_/g, ' ') : '')}:
        ${escapeHtml(valueText)}
      </div>
    `;
    const valueEl = content.querySelector('.chain-step-value');
    if (isProxy(step.application_notes)) {
      valueEl.appendChild(document.createTextNode(' '));
      valueEl.appendChild(proxyTag());
    }
    valueEl.appendChild(document.createTextNode(' '));
    valueEl.appendChild(
      citationBadge({
        citationShort: step.citation_short,
        fullCitation: step.full_citation,
        year: step.year,
        publisherType: step.publisher_type,
        urlOrDoi: step.url_or_doi,
        geographicScope: step.geographic_scope,
      })
    );
    if (step.confidence_tier && step.confidence_tier !== 'measured') {
      valueEl.appendChild(confidenceBadge(step.confidence_tier));
    }
  }

  li.appendChild(content);
  return li;
}

/** chains: the array returned by Registry.getRiskChain(mitigationName). Renders
 * nothing if empty -- not every mitigation has a documented cascade. */
export function renderRiskChains(container, chains) {
  container.innerHTML = '';
  if (!chains || chains.length === 0) return;

  chains.forEach((chain) => {
    const wrap = document.createElement('div');
    wrap.className = 'risk-chain';
    wrap.innerHTML = `<div class="risk-chain-title">Risk chain: ${escapeHtml(chain.chainName)}</div>`;

    const ol = document.createElement('ol');
    ol.className = 'chain-steps';
    chain.steps.forEach((step) => ol.appendChild(renderStep(step)));
    wrap.appendChild(ol);

    container.appendChild(wrap);
  });
}
