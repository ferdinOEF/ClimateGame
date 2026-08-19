// Zone-based risk calculation (METRIC #2 / #3). Given a zone (mitigation type +
// grid cells it was snapped to), this asks registry.js for every active
// hazard/mitigation relationship and applies the registry's value/range uniformly
// across the whole zone. There is no per-cell math here: every member cell is
// treated identically, because the registry's parameters are zone-level published
// figures (e.g. "% wave height reduction per 100m of belt"), not per-pixel models --
// inventing a decay curve across the zone would be exactly the kind of fabricated
// precision METRIC #3 forbids.

import { Registry } from './registry.js';

export function simulateZone(zone) {
  const relationships = Registry.getRelationshipsForMitigation(zone.mitigationName);
  const dataGaps = Registry.getDataGapsForMitigation(zone.mitigationName);

  const validCells = zone.snappedCells.filter((c) => !c.nodata);
  const nodataCells = zone.snappedCells.filter((c) => c.nodata);

  return {
    zoneId: zone.id,
    mitigationName: zone.mitigationName,
    areaM2: zone.areaM2,
    cellSizeM: zone.cellSizeM,
    cellCount: zone.snappedCells.length,
    validCellCount: validCells.length,
    nodataCellCount: nodataCells.length,
    effects: relationships.map((rel) => ({
      hazardId: rel.hazard_id,
      hazardName: rel.hazard_name,
      hazardDescription: rel.hazard_description,
      parameterId: rel.parameter_id,
      valueType: rel.value_type,
      valueMin: rel.value_min,
      valueMax: rel.value_max,
      unit: rel.unit,
      confidenceTier: rel.confidence_tier,
      applicableScope: rel.applicable_scope,
      locationName: rel.location_name,
      applicationMethod: rel.application_method,
      applicationNotes: rel.application_notes,
      isProxy: /^PROXY:/.test(rel.application_notes || ''),
      source: {
        sourceId: rel.source_id,
        citationShort: rel.citation_short,
        fullCitation: rel.full_citation,
        year: rel.year,
        publisherType: rel.publisher_type,
        urlOrDoi: rel.url_or_doi,
        geographicScope: rel.geographic_scope,
      },
    })),
    dataGaps: dataGaps.map((gap) => ({
      gapId: gap.gap_id,
      hazardName: gap.hazard_name,
      hazardDescription: gap.hazard_description,
      description: gap.description,
      status: gap.status,
      inherited: gap.inherited,
      inheritedFrom: gap.inherited_from,
    })),
  };
}
