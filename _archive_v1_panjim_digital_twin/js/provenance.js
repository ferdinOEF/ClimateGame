// About / data-provenance panel (METRIC #5). The three disclosure paragraphs are
// fixed documentation transcribed from data/README_data_processing.md -- they
// describe how the DEM/boundary files were produced, not a hazard/mitigation risk
// figure, so they are not subject to the "must come from registry.db" rule that
// applies to risk numbers. The source list below them IS live-queried from `sources`.

import { Registry } from './registry.js';

export function renderProvenancePanel(container) {
  const sources = Registry.getAllSources();

  container.innerHTML = `
    <h2>About this data</h2>

    <section class="provenance-section">
      <h3>Elevation data (DEM)</h3>
      <p>
        The elevation model is a Cartosat-derived 30m DEM. Its raw values are
        <strong>ellipsoidal heights</strong>, not sea-level elevations, so a flat
        <strong>+88.9m vertical correction</strong> was applied, derived from the
        average offset at four known-elevation reference points in Goa. Those four
        points disagreed with each other by as much as 41m, so even after
        correction this DEM carries roughly <strong>&plusmn;20m of residual
        vertical uncertainty</strong>. Treat elevation and any flood-depth
        implication as illustrative, not engineering-grade, until the DEM is
        reprocessed with a proper EGM96/EGM2008 geoid model and validated against
        tide-gauge or survey data.
      </p>
    </section>

    <section class="provenance-section">
      <h3>No-data cells</h3>
      <p>
        18.1% of DEM pixels in this extent were flagged as physically implausible
        (below -5m or above 200m after correction) and removed. These concentrate
        almost entirely over open water and dense mangrove canopy -- both are known
        weak points for stereo-optical DEMs like Cartosat, which cannot correlate
        image pairs well over water or uniform canopy. These cells render as a
        visibly hatched "data unavailable" pattern on the map; they are never
        interpolated or filled in.
      </p>
    </section>

    <section class="provenance-section">
      <h3>CZMP reference layer</h3>
      <p>
        The toggleable coastal-zone overlay is a <strong>georeferenced scan of the
        official Goa CZMP map image</strong>, provided for visual context only. It
        is not vector data and is never read by any calculation in this app --
        zone geometry always comes from what you draw, and risk figures always
        come from the registry, never from this image.
      </p>
    </section>

    <section class="provenance-section">
      <h3>Analysis extent</h3>
      <p>
        The boundary shown on the map (Panjim + Chorao Island + the Mandovi
        estuary reach between them) is a <strong>working analysis extent chosen
        for this pilot</strong>, not an official Corporation of the City of Panaji
        jurisdiction boundary. It can be swapped for an official boundary file
        later without changing the grid, CRS, or simulation logic.
      </p>
    </section>

    <section class="provenance-section">
      <h3>Sources cited in this app</h3>
      <ul class="source-list">
        ${sources
          .map(
            (s) => `
          <li>
            <strong>${escapeHtml(s.citation_short)}</strong> (${s.year}, ${escapeHtml(s.publisher_type)})
            &mdash; ${escapeHtml(s.full_citation)}
            ${s.url_or_doi ? `<br><a href="${escapeAttr(s.url_or_doi)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.url_or_doi)}</a>` : ''}
            ${s.geographic_scope ? `<br><span class="source-scope">Scope: ${escapeHtml(s.geographic_scope)}</span>` : ''}
          </li>`
          )
          .join('')}
      </ul>
    </section>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}
