// Renders a small citation badge for a risk figure's source. The citation text comes
// straight from the `sources` row returned by registry.js's live join query in
// simulate.js -- this module only formats it, it never re-derives or hardcodes it.

export function citationBadge(source) {
  const wrap = document.createElement('span');
  wrap.className = 'citation-badge';
  wrap.tabIndex = 0;
  wrap.textContent = `[${source.citationShort}]`;
  wrap.title = `${source.fullCitation} (${source.year}, ${source.publisherType})`;

  const detail = document.createElement('div');
  detail.className = 'citation-detail';
  detail.hidden = true;
  detail.innerHTML = `
    <div class="citation-detail-full">${escapeHtml(source.fullCitation)}</div>
    <div class="citation-detail-meta">${source.year} &middot; ${escapeHtml(source.publisherType)} &middot; ${escapeHtml(source.geographicScope || '')}</div>
    ${source.urlOrDoi ? `<a href="${escapeAttr(source.urlOrDoi)}" target="_blank" rel="noopener noreferrer">Source link</a>` : ''}
  `;

  function toggle() {
    detail.hidden = !detail.hidden;
  }
  wrap.addEventListener('click', toggle);
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });

  const container = document.createElement('span');
  container.className = 'citation-container';
  container.appendChild(wrap);
  container.appendChild(detail);
  return container;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}
