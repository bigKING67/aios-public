import {
  EXPECTED_EVIDENCE_DRAWER_SECTION_IDS,
  EXPECTED_REPORT_ECHARTS,
  EXPECTED_STATIC_DOM_VISUAL_NAMES,
} from './special-report-browser-visual-contract.mjs';

export function auditSpecialReportBrowserVisualContract({
  chartBuilders,
  findings,
  renderedSectionIds,
  staticVisuals,
}) {
  const knownChartBuilders = new Set(chartBuilders.map((entry) => entry.name));
  for (const { builder, sectionId } of EXPECTED_REPORT_ECHARTS) {
    if (!knownChartBuilders.has(builder)) {
      findings.push(`Browser ECharts owner ${sectionId} references unknown builder ${builder}.`);
    }
    if (!renderedSectionIds.includes(sectionId)) {
      findings.push(`Browser ECharts owner ${builder} references missing section ${sectionId}.`);
    }
  }

  const catalogNames = staticVisuals.map((entry) => entry.name).sort();
  const browserNames = [...EXPECTED_STATIC_DOM_VISUAL_NAMES].sort();
  if (catalogNames.join('|') !== browserNames.join('|')) {
    findings.push(`Browser static visual owners drifted from the catalog; expected ${catalogNames.join(', ')}, got ${browserNames.join(', ')}.`);
  }

  for (const sectionId of EXPECTED_EVIDENCE_DRAWER_SECTION_IDS) {
    if (!renderedSectionIds.includes(sectionId)) {
      findings.push(`Browser evidence drawer owner references missing section ${sectionId}.`);
    }
  }
}
