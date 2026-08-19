// Risk view UI (D2): hazard switcher (6 hazards + Cumulative) and the timeline
// control. Pure DOM rendering -- the actual per-cell computation lives in
// hazardExposure.js/hazardRenderer.js/timeline.js, wired together in main.js where the
// grid/khazan/map state already lives.
//
// Captions are fixed UI copy per hazard-rendering MODE (how the layer is computed),
// not registry content -- worded once here, reused for every hazard in that mode, same
// pattern as confidenceTiers.js's fixed tier explanations.

const CAPTIONS = {
  uniform:
    'No spatially resolved data exists for this hazard in the registry. Shown as a uniform exposure buffer across the whole studied extent -- not an intensity map, and not evidence that risk is equal everywhere in reality, only that this pilot has nothing to spatially differentiate it with.',
  flood:
    'The registry defines no flood-prone elevation threshold. Elevation is shown as illustrative context via the elevation grid layer (lower ground generally more exposed) -- not a modeled flood extent or depth.',
  saline_intrusion:
    'Restricted to cells that fall inside extracted khazan land -- the only real spatial constraint this hazard has, since saline intrusion is mechanistically tied to khazan bund breach. Khazan boundaries are AI-derived from a map scan, not surveyed (see the khazan layer toggle for the full disclosure).',
  cumulative:
    'Count of hazards with registry-backed relevance to each cell, 0-6. This is a simple count, never a weighted composite -- no defensible basis exists in the registry for weighting one hazard as worse than another.',
};

// Hazards with NO spatially rendered overlay at all -- captioned as a flat buffer.
// Note this is a caption-text grouping, not the cumulative-count relevance grouping in
// hazardExposure.js (there, 'flood' also counts as uniformly relevant for the count;
// here, 'flood' gets its own caption below because its single-hazard view shows the
// elevation grid instead of a flat wash).
const NO_OVERLAY_HAZARDS = new Set(['cyclone_wave', 'cyclone_wind', 'storm_surge']);

export function hazardCaption(hazardName, extra) {
  if (hazardName === 'cumulative') return CAPTIONS.cumulative;
  if (hazardName === 'flood') return CAPTIONS.flood;
  if (hazardName === 'saline_intrusion') return CAPTIONS.saline_intrusion;
  if (hazardName === 'sea_level_rise') return extra || '';
  if (NO_OVERLAY_HAZARDS.has(hazardName)) return CAPTIONS.uniform;
  return '';
}

export function renderHazardSwitcher(container, hazards, activeHazard, onSelect) {
  container.innerHTML = '';
  hazards.forEach((h) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hazard-chip';
    btn.textContent = h.name.replace(/_/g, ' ');
    btn.setAttribute('aria-pressed', String(h.name === activeHazard));
    btn.addEventListener('click', () => onSelect(h.name));
    container.appendChild(btn);
  });

  const cumBtn = document.createElement('button');
  cumBtn.type = 'button';
  cumBtn.className = 'hazard-chip cumulative-chip';
  cumBtn.textContent = 'Cumulative';
  cumBtn.setAttribute('aria-pressed', String(activeHazard === 'cumulative'));
  cumBtn.addEventListener('click', () => onSelect('cumulative'));
  container.appendChild(cumBtn);
}

/**
 * anchors: Registry.getTemporalProjections(hazardName) rows (possibly []).
 * onYearChange(year): called as the slider moves, only when anchors.length >= 2.
 */
export function renderTimelineControl(container, hazardName, anchors, currentYear, onYearChange) {
  container.innerHTML = '';

  if (!anchors || anchors.length < 2) {
    container.innerHTML = `
      <div class="timeline-disabled">
        <input type="range" disabled />
      </div>
      <div class="timeline-disabled-reason">
        No future projection data available for ${hazardName.replace(/_/g, ' ')} in the registry.
        Timeline is shown disabled rather than hidden so it's clear this is a data gap, not an
        oversight.
      </div>
    `;
    return { minYear: null, maxYear: null };
  }

  const minYear = anchors[0].year;
  const maxYear = anchors[anchors.length - 1].year;
  const unit = anchors[0].unit;
  const clampedYear = Math.min(Math.max(currentYear, minYear), maxYear);

  const readout = document.createElement('div');
  readout.className = 'timeline-readout';
  readout.innerHTML = `<span class="timeline-year">${clampedYear}</span><span class="timeline-value" id="timeline-value-readout"></span>`;
  container.appendChild(readout);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(minYear);
  slider.max = String(maxYear);
  slider.step = '1';
  slider.value = String(clampedYear);
  container.appendChild(slider);

  const interpNote = document.createElement('div');
  interpNote.className = 'timeline-interp-note';
  container.appendChild(interpNote);

  function updateReadout(year) {
    const isAnchor = anchors.some((a) => a.year === year);
    readout.querySelector('.timeline-year').textContent = String(year);
    interpNote.textContent = isAnchor
      ? `Published anchor point (${anchors.find((a) => a.year === year).citation_short}).`
      : `Interpolated between published anchor points (${minYear} and ${maxYear}), not itself a published figure.`;
    return unit;
  }
  updateReadout(clampedYear);

  slider.addEventListener('input', () => {
    const year = Number(slider.value);
    updateReadout(year);
    onYearChange(year);
  });

  return { minYear, maxYear, slider, readout, unit };
}

export function setTimelineValueReadout(container, text) {
  const el = container.querySelector('#timeline-value-readout');
  if (el) el.textContent = text;
}
