import { Registry } from './registry.js';
import { loadDemRaster, buildGrid, NATIVE_CELL_SIZE_M } from './dem.js';
import { legendRamp } from './gridRenderer.js';
import { initMap, setGridLayer, addCzmpLayer, toggleCzmpLayer, toggleGridLayer } from './map.js';
import { setupDrawing } from './zones.js';
import { simulateZone } from './simulate.js';
import { renderZoneResult } from './resultsPanel.js';
import { renderProvenancePanel } from './provenance.js';
import { setupLocalFeaturesLayer, renderNoLocationList, renderFeatureLegend } from './localFeatures.js';
import { renderFeatureDetail } from './featureDetail.js';
import { renderSeasonalCalendar } from './seasonalCalendar.js';
import { loadKhazanLayer, toggleKhazanLayer } from './khazanLayer.js';
import { computeKhazanCellKeys, relevanceFn, computeCumulative } from './hazardExposure.js';
import { renderHazardLayer, renderCumulativeLayer } from './hazardRenderer.js';
import { anchorYearRange, interpolateAtYear } from './timeline.js';
import { renderHazardSwitcher, renderTimelineControl, hazardCaption } from './riskView.js';
import { renderIdleTagPanel, renderZoneTagPanel, renderZoneSummary } from './mitigationView.js';
import { renderScenarioSummary, renderEmptyResultState } from './resultView.js';

async function main() {
  const [, raster] = await Promise.all([Registry.init(), loadDemRaster()]);

  let currentGrid = buildGrid(raster, NATIVE_CELL_SIZE_M);
  const mapState = await initMap(raster.boundsUTM);
  setGridLayer(mapState, currentGrid);
  await addCzmpLayer(mapState);

  renderLegend(currentGrid.cellSizeM);

  // --- Khazan vector layer (default OFF) ---
  const { layer: khazanLeafletLayer, geojson: khazanGeojson } = await loadKhazanLayer();
  let khazanCellKeysCache = null;
  let khazanCellKeysGrid = null;
  function getKhazanCellKeys() {
    if (khazanCellKeysGrid !== currentGrid) {
      khazanCellKeysCache = computeKhazanCellKeys(currentGrid, khazanGeojson);
      khazanCellKeysGrid = currentGrid;
    }
    return khazanCellKeysCache;
  }

  document.getElementById('toggle-khazan').addEventListener('change', (e) => {
    toggleKhazanLayer(mapState.map, khazanLeafletLayer, e.target.checked);
  });

  // --- Local features layer + detail modal ---
  const featureOverlay = document.getElementById('feature-overlay');
  const featureDetailContent = document.getElementById('feature-detail-content');

  function openFeatureDetail(featureId) {
    const feature = Registry.getFeatureById(featureId);
    if (!feature) return;
    renderFeatureDetail(featureDetailContent, feature);
    featureOverlay.hidden = false;
  }
  document.getElementById('feature-close').addEventListener('click', () => {
    featureOverlay.hidden = true;
  });
  featureOverlay.addEventListener('click', (e) => {
    if (e.target === featureOverlay) featureOverlay.hidden = true;
  });

  const localFeatures = Registry.getAllLocalFeatures();
  const { layer: featuresLayer, withoutCoords } = setupLocalFeaturesLayer(
    mapState.map,
    localFeatures,
    openFeatureDetail
  );
  featuresLayer.addTo(mapState.map);
  renderFeatureLegend(document.getElementById('feature-legend'), localFeatures);
  renderNoLocationList(document.getElementById('feature-no-location'), withoutCoords, openFeatureDetail);

  document.getElementById('toggle-features').addEventListener('change', (e) => {
    if (e.target.checked) {
      featuresLayer.addTo(mapState.map);
    } else {
      mapState.map.removeLayer(featuresLayer);
    }
  });

  // --- Seasonal calendar ---
  renderSeasonalCalendar(document.getElementById('seasonal-calendar'));

  // =====================================================================
  // App state shared across the three views
  // =====================================================================
  const hazards = Registry.getAllHazards();
  const slrAnchors = Registry.getTemporalProjections('sea_level_rise');
  const slrRange = anchorYearRange(slrAnchors);

  const appState = {
    activeView: 'risk',
    activeHazard: 'flood',
    selectedYear: slrRange ? slrRange.maxYear : null, // latest real anchor -- not an invented default
    hazardOverlay: null,
  };

  function currentSlrThresholdM() {
    if (!slrRange || appState.selectedYear == null) return null;
    const cm = interpolateAtYear(slrAnchors, appState.selectedYear);
    return cm == null ? null : cm / 100;
  }

  // --- Risk view: hazard switcher + timeline + map overlay ---
  const hazardSwitcherEl = document.getElementById('hazard-switcher');
  const hazardCaptionEl = document.getElementById('hazard-caption');
  const timelinePanelEl = document.getElementById('timeline-control');

  function updateHazardOverlay() {
    if (mapState.hazardOverlay) {
      mapState.map.removeLayer(mapState.hazardOverlay);
      mapState.hazardOverlay = null;
    }

    if (appState.activeHazard === 'flood') {
      // Flood's only spatially-real basis is DEM elevation -- no separate overlay,
      // the existing elevation grid layer already carries the signal.
      return;
    }

    const khazanCellKeys = getKhazanCellKeys();
    const slrThresholdM = currentSlrThresholdM();

    let rendered;
    if (appState.activeHazard === 'cumulative') {
      const results = computeCumulative(currentGrid, { khazanCellKeys, slrThresholdM });
      rendered = renderCumulativeLayer(currentGrid, results);
    } else {
      const fn = relevanceFn(appState.activeHazard, { khazanCellKeys, slrThresholdM });
      rendered = renderHazardLayer(currentGrid, fn);
    }
    mapState.hazardOverlay = L.imageOverlay(rendered.dataUrl, rendered.boundsLatLng, { opacity: 0.85 }).addTo(
      mapState.map
    );
  }

  function updateHazardCaption() {
    let extra = '';
    if (appState.activeHazard === 'sea_level_rise') {
      const cm = appState.selectedYear != null ? interpolateAtYear(slrAnchors, appState.selectedYear) : null;
      extra =
        cm != null
          ? `At ${appState.selectedYear}: ${cm.toFixed(1)} cm projected sea level rise (SSP2-4.5). Cells at or below this elevation are marked relevant -- the only hazard here with a real, non-invented spatial threshold.`
          : 'No timeline data available.';
    }
    hazardCaptionEl.textContent = hazardCaption(appState.activeHazard, extra);
  }

  function updateTimelinePanel() {
    const anchors = appState.activeHazard === 'sea_level_rise' ? slrAnchors : [];
    renderTimelineControl(timelinePanelEl, appState.activeHazard, anchors, appState.selectedYear ?? 0, (year) => {
      appState.selectedYear = year;
      updateHazardCaption();
      updateHazardOverlay();
      if (appState.activeView === 'result') refreshResultView();
    });
  }

  function onHazardSelect(hazardName) {
    appState.activeHazard = hazardName;
    renderHazardSwitcher(hazardSwitcherEl, hazards, appState.activeHazard, onHazardSelect);
    updateHazardCaption();
    updateTimelinePanel();
    updateHazardOverlay();
    if (appState.activeView === 'result') refreshResultView();
  }

  renderHazardSwitcher(hazardSwitcherEl, hazards, appState.activeHazard, onHazardSelect);
  updateHazardCaption();
  updateTimelinePanel();
  updateHazardOverlay();

  // =====================================================================
  // Mitigation / Adaptation view: zone drawing + tagging + placed-zone list
  // =====================================================================
  const mitigations = Registry.getAllMitigations();
  const zoneTagPanelEl = document.getElementById('zone-tag-panel');
  const mitigationZoneListEl = document.getElementById('zone-list');
  const resultZoneListEl = document.getElementById('result-zone-list');
  let pendingLayer = null;
  let drawState;

  renderIdleTagPanel(zoneTagPanelEl);

  function onPendingZone(layer) {
    pendingLayer = layer;
    renderZoneTagPanel(zoneTagPanelEl, mitigations, {
      onApply: (mitigationName) => {
        drawState.finalizeZone(layer, mitigationName);
        pendingLayer = null;
        renderIdleTagPanel(zoneTagPanelEl);
      },
      onCancel: () => {
        drawState.cancelPendingZone(layer);
        pendingLayer = null;
        renderIdleTagPanel(zoneTagPanelEl);
      },
    });
  }

  function refreshMitigationZoneList() {
    mitigationZoneListEl.innerHTML = '';
    if (drawState.zones.size === 0) {
      const empty = document.createElement('p');
      empty.className = 'help-text empty-state';
      empty.textContent = 'No zones drawn yet.';
      mitigationZoneListEl.appendChild(empty);
      return;
    }
    for (const zone of drawState.zones.values()) {
      renderZoneSummary(mitigationZoneListEl, zone, (zoneId) => drawState.removeZone(zoneId));
    }
  }

  function refreshResultView() {
    const scenario = {
      hazardName: appState.activeHazard === 'cumulative' ? null : appState.activeHazard,
      isCumulative: appState.activeHazard === 'cumulative',
      year: appState.selectedYear,
      hasTimeline: appState.activeHazard === 'sea_level_rise' && !!slrRange,
      interpolatedValue:
        appState.activeHazard === 'sea_level_rise' && appState.selectedYear != null
          ? interpolateAtYear(slrAnchors, appState.selectedYear)
          : null,
      unit: slrAnchors[0] ? slrAnchors[0].unit : '',
    };
    renderScenarioSummary(document.getElementById('result-scenario-summary'), scenario);

    resultZoneListEl.innerHTML = '';
    if (drawState.zones.size === 0) {
      renderEmptyResultState(resultZoneListEl);
      return;
    }
    for (const zone of drawState.zones.values()) {
      const result = simulateZone(zone);
      const card = document.createElement('div');
      resultZoneListEl.appendChild(card);
      renderZoneResult(card, zone, result);
    }
  }

  function onZoneFinalized(zone, action) {
    if (action === 'select') return; // click-to-highlight not needed with per-view lists
    refreshMitigationZoneList();
    if (appState.activeView === 'result') refreshResultView();
  }

  function onZoneRemoved() {
    refreshMitigationZoneList();
    if (appState.activeView === 'result') refreshResultView();
  }

  drawState = setupDrawing(mapState.map, () => currentGrid, onPendingZone, onZoneFinalized, onZoneRemoved);
  refreshMitigationZoneList();

  function clearAllZones() {
    for (const zone of [...drawState.zones.values()]) {
      drawState.removeZone(zone.id);
    }
    if (pendingLayer) {
      drawState.cancelPendingZone(pendingLayer);
      pendingLayer = null;
      renderIdleTagPanel(zoneTagPanelEl);
    }
  }

  // =====================================================================
  // Three-view switcher
  // =====================================================================
  const viewTabs = [...document.querySelectorAll('.view-tab')];
  const viewPanels = {
    risk: document.getElementById('view-risk'),
    mitigation: document.getElementById('view-mitigation'),
    result: document.getElementById('view-result'),
  };

  function switchView(viewName) {
    if (appState.activeView === 'mitigation' && viewName !== 'mitigation' && pendingLayer) {
      drawState.cancelPendingZone(pendingLayer);
      pendingLayer = null;
      renderIdleTagPanel(zoneTagPanelEl);
    }

    appState.activeView = viewName;
    viewTabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.view === viewName)));
    Object.entries(viewPanels).forEach(([name, el]) => {
      el.hidden = name !== viewName;
    });

    if (viewName === 'mitigation') {
      mapState.map.addControl(drawState.drawControl);
    } else {
      mapState.map.removeControl(drawState.drawControl);
    }

    if (viewName === 'result') refreshResultView();
  }

  viewTabs.forEach((tab) => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });
  switchView('risk');

  // --- Layer toggles ---
  document.getElementById('toggle-grid').addEventListener('change', (e) => {
    toggleGridLayer(mapState, e.target.checked);
  });
  document.getElementById('toggle-czmp').addEventListener('change', (e) => {
    toggleCzmpLayer(mapState, e.target.checked);
  });

  // --- Cell size control ---
  const cellSizeSelect = document.getElementById('cell-size-select');
  cellSizeSelect.value = String(NATIVE_CELL_SIZE_M);
  cellSizeSelect.addEventListener('change', () => {
    const requested = Number(cellSizeSelect.value);
    if (drawState.zones.size > 0) {
      const proceed = confirm(
        'Changing grid resolution clears existing drawn zones (they were snapped to the previous grid). Continue?'
      );
      if (!proceed) {
        cellSizeSelect.value = String(currentGrid.cellSizeM);
        return;
      }
      clearAllZones();
    }
    currentGrid = buildGrid(raster, requested);
    cellSizeSelect.value = String(currentGrid.cellSizeM);
    setGridLayer(mapState, currentGrid);
    toggleGridLayer(mapState, document.getElementById('toggle-grid').checked);
    renderLegend(currentGrid.cellSizeM);
    updateHazardOverlay();
  });

  // --- About panel ---
  const aboutOverlay = document.getElementById('about-overlay');
  const aboutContent = document.getElementById('about-content');
  renderProvenancePanel(aboutContent);
  document.getElementById('about-btn').addEventListener('click', () => {
    aboutOverlay.hidden = false;
  });
  document.getElementById('about-close').addEventListener('click', () => {
    aboutOverlay.hidden = true;
  });
  aboutOverlay.addEventListener('click', (e) => {
    if (e.target === aboutOverlay) aboutOverlay.hidden = true;
  });

  document.getElementById('loading-overlay').hidden = true;
}

function renderLegend(cellSizeM) {
  const legend = document.getElementById('legend');
  const ramp = legendRamp();
  const stops = ramp
    .map((r) => {
      const color = `rgb(${r.color[0]},${r.color[1]},${r.color[2]})`;
      return `<span style="background:${color}"></span>`;
    })
    .join('');
  legend.innerHTML = `
    <div>Elevation (post-correction, m MSL) &middot; ${cellSizeM}m cells</div>
    <div class="legend-ramp">${stops}</div>
    <div class="legend-labels"><span>${ramp[0].at}m</span><span>${ramp[ramp.length - 1].at}m+</span></div>
    <div class="legend-nodata">
      <span class="legend-nodata-swatch"></span>
      <span>No data (removed as implausible; concentrated over water/mangrove canopy)</span>
    </div>
  `;
}

main().catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading-overlay');
  loading.querySelector('.loading-box').textContent = `Failed to load: ${err.message}`;
});
