import {
  CI_META_GATES,
  QUALITY_RUNNER_REGISTRY_GATES,
  SPECIAL_REPORT_SMOKE_GATES,
} from './quality-affected-gates.mjs';
import {
  SPECIAL_REPORT_CHART_GALLERY_DOC,
  SPECIAL_REPORT_PAGE_COMPOSITION_DOC,
  isSpecialReportSmokeMaintenanceFile,
} from '../reports/special-report-smoke-gate.mjs';

export function reportScriptAffectedRuleForFile(file) {
  if (file === SPECIAL_REPORT_CHART_GALLERY_DOC || file === SPECIAL_REPORT_PAGE_COMPOSITION_DOC) {
    const docKind = file === SPECIAL_REPORT_CHART_GALLERY_DOC
      ? 'chart gallery'
      : 'page composition';

    return Object.freeze({
      gates: Object.freeze([
        'verify:design:docs',
        'verify:design:docs-behavior',
        'verify:frontend:quality-docs-drift',
        'verify:frontend:quality-docs-drift-behavior',
        ...QUALITY_RUNNER_REGISTRY_GATES,
        ...SPECIAL_REPORT_SMOKE_GATES,
      ]),
      reason: `${file}: special report ${docKind} governance impact`,
    });
  }

  if (!isSpecialReportSmokeMaintenanceFile(file)) {
    return null;
  }

  return Object.freeze({
    gates: Object.freeze([
      'lint:scripts',
      ...CI_META_GATES,
      ...QUALITY_RUNNER_REGISTRY_GATES,
      ...SPECIAL_REPORT_SMOKE_GATES,
    ]),
    reason: `${file}: special report smoke gate maintenance impact`,
  });
}
