// Renders one zone's simulateZone() result: quantified effects (each figure with its
// live source citation) plus any khazan-style "known, not yet quantified" data-gap
// notes. Pure presentation -- all numbers/text passed in already came from registry.js.

import { citationBadge } from './citations.js';
import { renderDataGaps } from './dataGaps.js';
import { zoneColor } from './zones.js';
import { renderRiskChains } from './riskChain.js';
import { Registry } from './registry.js';
import { confidenceBadge, proxyTag } from './confidenceTiers.js';

function formatValue(effect) {
  if (effect.valueType === 'range') {
    return `${effect.valueMin}–${effect.valueMax} ${effect.unit}`;
  }
  return `${effect.valueMin} ${effect.unit}`;
}

export function renderZoneResult(container, zone, result) {
  container.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'zone-result-card';
  card.style.borderLeftColor = zoneColor(zone.mitigationName);

  const header = document.createElement('div');
  header.className = 'zone-result-header';
  header.innerHTML = `
    <h3>${zone.mitigationName.replace(/_/g, ' ')}</h3>
    <div class="zone-result-meta">
      ${(result.areaM2 / 10000).toFixed(2)} ha &middot;
      ${result.cellCount} grid cells (${result.cellSizeM}m) &middot;
      ${result.nodataCellCount > 0 ? `<span class="nodata-flag">${result.nodataCellCount} no-data cells excluded from elevation context</span>` : 'no no-data cells'}
    </div>
  `;
  card.appendChild(header);

  if (result.effects.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'zone-result-empty';
    empty.textContent =
      'No quantified relationship exists in the registry for this mitigation type yet.';
    card.appendChild(empty);
  }

  result.effects.forEach((effect) => {
    const row = document.createElement('div');
    row.className = 'effect-row';
    row.innerHTML = `
      <div class="effect-hazard">${effect.hazardName.replace(/_/g, ' ')}</div>
      <div class="effect-value">${formatValue(effect)}</div>
      <div class="effect-notes">${effect.applicationNotes || ''}</div>
    `;
    if (effect.isProxy) {
      row.querySelector('.effect-hazard').appendChild(document.createTextNode(' '));
      row.querySelector('.effect-hazard').appendChild(proxyTag());
    }
    row.querySelector('.effect-value').appendChild(document.createTextNode(' '));
    row.querySelector('.effect-value').appendChild(citationBadge(effect.source));
    if (effect.confidenceTier && effect.confidenceTier !== 'measured') {
      row.querySelector('.effect-value').appendChild(confidenceBadge(effect.confidenceTier));
    }
    card.appendChild(row);
  });

  if (result.dataGaps.length > 0) {
    card.appendChild(renderDataGaps(result.dataGaps));
  }

  const chains = Registry.getRiskChain(zone.mitigationName);
  if (chains.length > 0) {
    const chainContainer = document.createElement('div');
    card.appendChild(chainContainer);
    renderRiskChains(chainContainer, chains);
  }

  container.appendChild(card);
}
