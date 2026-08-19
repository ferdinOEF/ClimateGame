// Seasonal calendar strip (METRIC #5). Renders every row from seasonal_windows as an
// overlaid band across a 12-month grid, positioned purely from that row's
// start_month/end_month -- nothing about which months are shaded is hardcoded here.

import { Registry } from './registry.js';
import { citationBadge } from './citations.js';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const BAND_COLORS = ['#0d6b52', '#1565c0', '#b06a2b', '#6a1b9a', '#00838f'];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/** Greedy row assignment so overlapping windows stack instead of collide. */
function assignRows(windows) {
  const rows = []; // each entry: array of {start,end} already placed
  return windows.map((w) => {
    const segments = w.start_month <= w.end_month
      ? [[w.start_month, w.end_month]]
      : [[w.start_month, 12], [1, w.end_month]]; // defensive: handles a Dec->Feb-style wrap, not present in current data

    let rowIndex = rows.findIndex((row) =>
      row.every((placed) => segments.every(([s, e]) => e < placed[0] || s > placed[1]))
    );
    if (rowIndex === -1) {
      rowIndex = rows.length;
      rows.push([]);
    }
    rows[rowIndex].push(...segments);
    return { window: w, rowIndex, segments };
  });
}

export function renderSeasonalCalendar(container) {
  const windows = Registry.getSeasonalWindows();
  container.innerHTML = '';

  if (windows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'feature-empty';
    empty.textContent = 'No seasonal windows recorded in the registry.';
    container.appendChild(empty);
    return;
  }

  const placed = assignRows(windows);
  const rowCount = Math.max(...placed.map((p) => p.rowIndex)) + 1;

  const header = document.createElement('div');
  header.className = 'calendar-header';
  header.style.gridTemplateColumns = 'repeat(12, 1fr)';
  MONTH_LABELS.forEach((m) => {
    const cell = document.createElement('div');
    cell.className = 'calendar-month-label';
    cell.textContent = m;
    header.appendChild(cell);
  });
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'calendar-grid';
  grid.style.gridTemplateColumns = 'repeat(12, 1fr)';
  grid.style.gridTemplateRows = `repeat(${rowCount}, auto)`;

  const detail = document.createElement('div');
  detail.className = 'calendar-detail';
  detail.hidden = true;

  placed.forEach(({ window: w, rowIndex, segments }, i) => {
    const color = BAND_COLORS[i % BAND_COLORS.length];
    segments.forEach(([start, end]) => {
      const band = document.createElement('button');
      band.type = 'button';
      band.className = 'calendar-band';
      band.style.gridColumn = `${start} / ${end + 1}`;
      band.style.gridRow = String(rowIndex + 1);
      band.style.background = color;
      band.title = w.label;
      band.textContent = w.label;

      band.addEventListener('click', () => {
        const isOpen = !detail.hidden && detail.dataset.windowId === String(w.window_id);
        if (isOpen) {
          detail.hidden = true;
          return;
        }
        detail.dataset.windowId = String(w.window_id);
        detail.innerHTML = `
          <div class="calendar-detail-title">${escapeHtml(w.label)}</div>
          ${w.hazard_name ? `<div class="calendar-detail-hazard">Hazard: ${escapeHtml(w.hazard_name.replace(/_/g, ' '))}</div>` : ''}
          ${w.livelihood_type ? `<div class="calendar-detail-hazard">Livelihood: ${escapeHtml(w.livelihood_type.replace(/_/g, ' '))}</div>` : ''}
          <div class="calendar-detail-desc">${escapeHtml(w.description)}</div>
        `;
        if (w.source_id) {
          detail.appendChild(document.createTextNode(' '));
          detail.appendChild(
            citationBadge({
              citationShort: w.citation_short,
              fullCitation: w.full_citation,
              year: w.year,
              publisherType: w.publisher_type,
              urlOrDoi: w.url_or_doi,
              geographicScope: w.geographic_scope,
            })
          );
        }
        detail.hidden = false;
      });

      grid.appendChild(band);
    });
  });

  container.appendChild(grid);
  container.appendChild(detail);
}
