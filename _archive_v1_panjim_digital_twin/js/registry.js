// Read-only access layer for data/registry.db (SQLite, loaded in-browser via sql.js/WASM).
//
// This is the ONLY module in the app allowed to touch registry.db, and it never issues
// anything but SELECT. registry.db is immutable seed data (sources, hazards, mitigations,
// parameters, relationships, data_gaps, local_features, governance_status,
// livelihood_dependencies, cultural_heritage_assets, participatory_observations,
// risk_chains, seasonal_windows, temporal_projections) -- no code anywhere may add,
// alter, or invent a row. Every risk figure shown in the UI must be traceable back
// through here to a `parameters` row via `relationships`, and every citation must come
// from `sources`.
//
// parameters.confidence_tier is threaded through every query that returns a parameter
// value (getRelationshipsForMitigation, getRiskChain, getFullHazardCoverage) rather than
// fetched separately -- every number in the UI carries its tier at the point it's read,
// so no caller can accidentally display a value without also having its tier on hand.
//
// participatory_observations is seeded empty and stays empty -- there is no write path
// from this module or anywhere else in the app back into registry.db (see featureDetail.js,
// which composes session-only submissions in memory and never calls back into this file
// to persist them).
//
// Swap-out note: this module's public surface (the Registry object below) is the seam for
// swapping sql.js-in-browser for a real backend API later -- callers never touch SQL or
// sql.js directly, only these functions.

let db = null;
let initPromise = null;

async function init() {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const SQL = await initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`,
    });
    const buf = await fetch('data/registry.db').then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch registry.db: ${r.status}`);
      return r.arrayBuffer();
    });
    db = new SQL.Database(new Uint8Array(buf));
    return db;
  })();

  return initPromise;
}

/** Run a read-only SELECT and return rows as an array of plain objects. */
function query(sql, params = []) {
  if (!db) throw new Error('Registry not initialized -- call Registry.init() first');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export const Registry = {
  init,

  getAllMitigations() {
    return query('SELECT * FROM mitigations ORDER BY mitigation_id');
  },

  getAllHazards() {
    return query('SELECT * FROM hazards ORDER BY hazard_id');
  },

  getMitigationByName(name) {
    const rows = query('SELECT * FROM mitigations WHERE name = ?', [name]);
    return rows[0] || null;
  },

  getSource(sourceId) {
    const rows = query('SELECT * FROM sources WHERE source_id = ?', [sourceId]);
    return rows[0] || null;
  },

  getAllSources() {
    return query('SELECT * FROM sources ORDER BY source_id');
  },

  getParameter(parameterId) {
    const rows = query('SELECT * FROM parameters WHERE parameter_id = ?', [parameterId]);
    return rows[0] || null;
  },

  /**
   * All active relationships for a mitigation (by name), joined to their active
   * parameter, that parameter's source, and the hazard. This is the sole path by
   * which a zone tagged with a mitigation type acquires risk-change figures.
   */
  getRelationshipsForMitigation(mitigationName) {
    return query(
      `SELECT
         r.relationship_id, r.application_method, r.application_notes,
         h.hazard_id, h.name AS hazard_name, h.description AS hazard_description,
         p.parameter_id, p.value_type, p.value_min, p.value_max, p.unit,
         p.applicable_scope, p.location_name, p.status, p.confidence_tier,
         s.source_id, s.citation_short, s.full_citation, s.year, s.publisher_type,
         s.url_or_doi, s.geographic_scope
       FROM relationships r
       JOIN mitigations m ON m.mitigation_id = r.mitigation_id
       JOIN hazards h ON h.hazard_id = r.hazard_id
       JOIN parameters p ON p.parameter_id = r.active_parameter_id
       JOIN sources s ON s.source_id = p.source_id
       WHERE m.name = ? AND p.status = 'active'
       ORDER BY h.hazard_id`,
      [mitigationName]
    );
  },

  /**
   * Known-but-unquantified risks (data_gaps) relevant to a mitigation, by name.
   *
   * `mangrove_fronted_khazan` is modeled in the registry as a khazan_bund with an
   * intact mangrove fringe (see relationships 5-7: the mangrove protects bund
   * integrity, but flood-storage capacity and bund-breach exposure are inherited
   * directly from khazan_bund). The registry's only saline_intrusion data_gaps row
   * is scoped to khazan_bund (mitigation_id 2) because the breach mechanism it
   * describes belongs to the bund itself. Since mangrove_fronted_khazan structurally
   * contains that same bund, its data_gaps rows are inherited using the identical
   * logic the registry's own authors used for relationship 7 -- this is not an
   * invented figure, it surfaces an existing qualitative caveat for a system that
   * includes the component the gap is about. Gaps are also matched on mitigation_id
   * IS NULL for hazard-only (mitigation-agnostic) gaps, should any be added later.
   */
  getDataGapsForMitigation(mitigationName) {
    const mitigation = this.getMitigationByName(mitigationName);
    if (!mitigation) return [];

    const mitigationIds = new Set([mitigation.mitigation_id]);
    if (mitigationName === 'mangrove_fronted_khazan') {
      const bund = this.getMitigationByName('khazan_bund');
      if (bund) {
        mitigationIds.add(bund.mitigation_id);
      }
    }

    const placeholders = [...mitigationIds].map(() => '?').join(',');
    const rows = query(
      `SELECT
         g.gap_id, g.description, g.status,
         g.mitigation_id AS gap_mitigation_id,
         h.hazard_id, h.name AS hazard_name, h.description AS hazard_description
       FROM data_gaps g
       JOIN hazards h ON h.hazard_id = g.hazard_id
       WHERE g.mitigation_id IN (${placeholders}) OR g.mitigation_id IS NULL
       ORDER BY g.gap_id`,
      [...mitigationIds]
    );

    return rows.map((row) => ({
      ...row,
      inherited: row.gap_mitigation_id !== mitigation.mitigation_id,
      inherited_from: row.gap_mitigation_id !== mitigation.mitigation_id ? 'khazan_bund' : null,
    }));
  },

  // --- local_features + related tables ---

  getAllLocalFeatures() {
    return query('SELECT * FROM local_features ORDER BY feature_id');
  },

  getFeatureById(featureId) {
    const rows = query('SELECT * FROM local_features WHERE feature_id = ?', [featureId]);
    return rows[0] || null;
  },

  /** Governance status rows for a feature, live-joined to their source. Most features
   * will have zero rows -- callers must render "no governance data recorded", never
   * omit the section or invent a status (METRIC #2). */
  getGovernanceStatus(featureId) {
    return query(
      `SELECT
         gs.status_id, gs.status, gs.responsible_party, gs.as_of_date, gs.confidence, gs.notes,
         s.source_id, s.citation_short, s.full_citation, s.year, s.publisher_type,
         s.url_or_doi, s.geographic_scope
       FROM governance_status gs
       LEFT JOIN sources s ON s.source_id = gs.source_id
       WHERE gs.feature_id = ?
       ORDER BY gs.as_of_date DESC`,
      [featureId]
    );
  },

  getLivelihoodDependencies(featureId) {
    return query(
      `SELECT
         ld.dependency_id, ld.livelihood_type, ld.dependency_description, ld.household_estimate,
         s.source_id, s.citation_short, s.full_citation, s.year, s.publisher_type,
         s.url_or_doi, s.geographic_scope
       FROM livelihood_dependencies ld
       LEFT JOIN sources s ON s.source_id = ld.source_id
       WHERE ld.feature_id = ?
       ORDER BY ld.dependency_id`,
      [featureId]
    );
  },

  getCulturalHeritageAssets(featureId) {
    return query(
      `SELECT
         cha.asset_id, cha.name, cha.asset_type, cha.significance_note,
         s.source_id, s.citation_short, s.full_citation, s.year, s.publisher_type,
         s.url_or_doi, s.geographic_scope
       FROM cultural_heritage_assets cha
       LEFT JOIN sources s ON s.source_id = cha.source_id
       WHERE cha.feature_id = ?
       ORDER BY cha.asset_id`,
      [featureId]
    );
  },

  /** Registry-stored participatory observations for a feature. Table is seeded empty
   * on purpose -- this always returns [] today. Session-only observations composed in
   * the UI (featureDetail.js) are never written back here and are not included. */
  getParticipatoryObservations(featureId) {
    return query(
      `SELECT
         po.observation_id, po.hazard_id, h.name AS hazard_name,
         po.observer_role, po.observation_text, po.observation_date, po.date_logged,
         po.tier, po.verified
       FROM participatory_observations po
       LEFT JOIN hazards h ON h.hazard_id = po.hazard_id
       WHERE po.feature_id = ?
       ORDER BY po.date_logged DESC`,
      [featureId]
    );
  },

  /**
   * Risk chain(s) applicable to a mitigation (by name): every step of every chain that
   * has at least one step whose relationship belongs to this mitigation. A chain is
   * fetched and returned in full (all its steps, in step_order) once it's found to be
   * relevant -- individual steps may reference a different mitigation_id indirectly
   * (e.g. a bund-breach data_gap step in a mangrove-fronted-khazan cascade is scoped to
   * khazan_bund in data_gaps, because the breach mechanism belongs to the bund
   * component) or reference no mitigation at all (a data_gap step has no mitigation_id
   * path of its own). That mirrors the same inheritance reasoning as
   * getDataGapsForMitigation above -- the chain is a narrative about the whole system,
   * not a per-step mitigation filter.
   *
   * Each step resolves to exactly one of:
   *   - a quantified step (relationship_id set): hazard, value, unit, citation
   *   - a "break in the chain" step (data_gap_id set): hazard, gap description, status
   */
  getRiskChain(mitigationName) {
    const mitigation = this.getMitigationByName(mitigationName);
    if (!mitigation) return [];

    const chainNames = query(
      `SELECT DISTINCT rc.chain_name
       FROM risk_chains rc
       JOIN relationships r ON r.relationship_id = rc.relationship_id
       WHERE r.mitigation_id = ?`,
      [mitigation.mitigation_id]
    ).map((row) => row.chain_name);

    if (chainNames.length === 0) return [];

    return chainNames.map((chainName) => {
      const steps = query(
        `SELECT
           rc.chain_id, rc.chain_name, rc.step_order, rc.step_description,
           rc.relationship_id, rc.data_gap_id,
           rel_h.hazard_id AS rel_hazard_id, rel_h.name AS rel_hazard_name,
           r.application_notes,
           p.parameter_id, p.value_type, p.value_min, p.value_max, p.unit, p.confidence_tier,
           s.source_id, s.citation_short, s.full_citation, s.year, s.publisher_type,
           s.url_or_doi, s.geographic_scope,
           gap_h.hazard_id AS gap_hazard_id, gap_h.name AS gap_hazard_name,
           g.gap_id, g.description AS gap_description, g.status AS gap_status
         FROM risk_chains rc
         LEFT JOIN relationships r ON r.relationship_id = rc.relationship_id
         LEFT JOIN parameters p ON p.parameter_id = r.active_parameter_id
         LEFT JOIN sources s ON s.source_id = p.source_id
         LEFT JOIN hazards rel_h ON rel_h.hazard_id = r.hazard_id
         LEFT JOIN data_gaps g ON g.gap_id = rc.data_gap_id
         LEFT JOIN hazards gap_h ON gap_h.hazard_id = g.hazard_id
         WHERE rc.chain_name = ?
         ORDER BY rc.step_order`,
        [chainName]
      );
      return { chainName, steps };
    });
  },

  getSeasonalWindows() {
    return query(
      `SELECT
         sw.window_id, sw.label, sw.start_month, sw.end_month, sw.livelihood_type,
         sw.description,
         h.hazard_id, h.name AS hazard_name,
         s.source_id, s.citation_short, s.full_citation, s.year, s.publisher_type,
         s.url_or_doi, s.geographic_scope
       FROM seasonal_windows sw
       LEFT JOIN hazards h ON h.hazard_id = sw.hazard_id
       LEFT JOIN sources s ON s.source_id = sw.source_id
       ORDER BY sw.start_month, sw.window_id`
    );
  },

  /**
   * Real timeline anchor points for a hazard (by name), live-joined to source. Only
   * sea_level_rise has any rows today (2026 baseline, 2100 SSP2-4.5, both is_anchor=1,
   * from CSTEP 2024). Callers must linearly interpolate ONLY between rows this function
   * actually returns, and only for years between the earliest and latest anchor -- never
   * extrapolate past the last real anchor, and never invent anchors for a hazard this
   * returns [] for.
   */
  getTemporalProjections(hazardName) {
    return query(
      `SELECT
         tp.projection_id, tp.scenario, tp.year, tp.value, tp.unit, tp.is_anchor,
         s.source_id, s.citation_short, s.full_citation, s.year AS source_year,
         s.publisher_type, s.url_or_doi, s.geographic_scope
       FROM temporal_projections tp
       JOIN hazards h ON h.hazard_id = tp.hazard_id
       JOIN sources s ON s.source_id = tp.source_id
       WHERE h.name = ?
       ORDER BY tp.year`,
      [hazardName]
    );
  },

  /**
   * Full 6-hazard coverage for a mitigation (by name) -- constraint #4 from the pilot
   * spec: a mitigation x hazard pair must never be blank or silently omitted from the
   * Mitigation view. For each of the 6 hazards, exactly one of:
   *   - 'quantified': one or more active relationships exist (each carries its own
   *     confidence_tier straight from `parameters` -- 'measured' rows render with no
   *     icon, anything else gets an hourglass, per constraint #4)
   *   - 'data_gap': no relationship, but a data_gaps row documents the known-unquantified
   *     risk (reuses getDataGapsForMitigation's khazan-inheritance logic)
   *   - 'provisional_zero_default': NEITHER exists in the registry. This row is
   *     synthesized here, not read from a table -- there is no database row for "we
   *     have nothing on this," so the app itself has to say so. value is fixed at 0 by
   *     definition (absence of any documented effect, not a measurement), tier is
   *     always the literal string 'provisional_zero_default', and this is the ONLY
   *     place in the codebase allowed to construct a parameter-shaped object outside a
   *     query result -- every field on it is either a live hazard name/id or the fixed
   *     absence-marker required by the pilot spec, never a plausible-looking number.
   */
  getFullHazardCoverage(mitigationName) {
    const hazards = this.getAllHazards();
    const relationships = this.getRelationshipsForMitigation(mitigationName);
    const gaps = this.getDataGapsForMitigation(mitigationName);

    return hazards.map((hazard) => {
      const quantified = relationships.filter((r) => r.hazard_id === hazard.hazard_id);
      if (quantified.length > 0) {
        return { hazard, coverageType: 'quantified', effects: quantified };
      }
      const hazardGaps = gaps.filter((g) => g.hazard_id === hazard.hazard_id);
      if (hazardGaps.length > 0) {
        return { hazard, coverageType: 'data_gap', gaps: hazardGaps };
      }
      return {
        hazard,
        coverageType: 'provisional_zero_default',
        effects: [
          {
            hazard_id: hazard.hazard_id,
            hazard_name: hazard.name,
            hazard_description: hazard.description,
            value_type: 'point_estimate',
            value_min: 0,
            value_max: null,
            unit: 'no registry-documented effect',
            confidence_tier: 'provisional_zero_default',
            application_notes: null,
            source_id: null,
          },
        ],
      };
    });
  },
};
