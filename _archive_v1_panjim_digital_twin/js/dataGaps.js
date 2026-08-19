// Renders "known risk, not yet quantified" notes for a zone (METRIC #7). The text is
// always the live description pulled from data_gaps via registry.js -- if that table
// changes, this output changes with it. Never hardcode gap wording here.

export function renderDataGaps(gaps) {
  const wrap = document.createElement('div');
  wrap.className = 'data-gaps';
  if (!gaps || gaps.length === 0) return wrap;

  gaps.forEach((gap) => {
    const item = document.createElement('div');
    item.className = 'data-gap-note';
    const inheritedNote = gap.inherited
      ? `<span class="data-gap-inherited">(applies via ${escapeHtml(gap.inheritedFrom)}, which this system includes)</span>`
      : '';
    item.innerHTML = `
      <div class="data-gap-label">Known risk, not yet quantified: ${escapeHtml(gap.hazardName.replace(/_/g, ' '))}</div>
      <div class="data-gap-desc">${escapeHtml(gap.description)} ${inheritedNote}</div>
      <div class="data-gap-status">Status: ${escapeHtml(gap.status)} &mdash; no figure exists in the registry for this; none is shown or estimated.</div>
    `;
    wrap.appendChild(item);
  });

  return wrap;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
