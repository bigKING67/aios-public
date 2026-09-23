export const SPECIAL_REPORT_SMOKE_GATE_NAME = 'verify:reports:special-smoke';
export const SPECIAL_REPORT_SMOKE_COMMAND = 'tsx scripts/checks/reports/gsv-snapshot-artifact.ts && node scripts/checks/reports/special-smoke.mjs';
export const SPECIAL_REPORT_BROWSER_SMOKE_GATE_NAME = 'verify:reports:special-browser-smoke';
export const SPECIAL_REPORT_BROWSER_SMOKE_COMMAND = 'node scripts/checks/reports/special-browser-visual-smoke.mjs';
export const SPECIAL_REPORT_SMOKE_ROUTE = '/reports/special/gsv-monthly-channel';
export const SPECIAL_REPORT_CHART_GALLERY_DOC = 'docs/SPECIAL_REPORT_CHART_GALLERY.md';
export const SPECIAL_REPORT_PAGE_COMPOSITION_DOC = 'docs/SPECIAL_REPORT_PAGE_COMPOSITION.md';

export const SPECIAL_REPORT_SMOKE_SOURCE_PATTERNS = Object.freeze([
  'apps/web-vite/src/app/reports/special/**',
  'public/reports/special/**',
]);

export const SPECIAL_REPORT_SMOKE_MAINTENANCE_FILES = Object.freeze([
  'scripts/checks/reports/special-smoke.mjs',
  'scripts/checks/reports/gsv-snapshot-artifact.ts',
  'scripts/checks/reports/special-browser-visual-smoke.mjs',
  'scripts/checks/reports/special-browser-smoke-evidence.behavior.mjs',
  'scripts/config/reports/special-smoke-inputs.mjs',
  'scripts/lib/reports/special-report-browser-smoke-evidence-fixtures.mjs',
  'scripts/lib/reports/special-report-browser-smoke-evidence.mjs',
  'scripts/lib/reports/special-report-browser-auth-redirect-smoke.mjs',
  'scripts/lib/reports/special-report-browser-snapshot-capture.mjs',
  'scripts/lib/reports/special-report-browser-visual-smoke.mjs',
  'scripts/lib/reports/special-report-browser-visual-smoke-summary.mjs',
  'scripts/lib/reports/special-report-chart-gallery-smoke.mjs',
  'scripts/lib/reports/gsv-snapshot-data-smoke.mjs',
  'scripts/lib/reports/special-report-reader-fatigue-smoke.mjs',
  'scripts/lib/reports/special-report-section-source.mjs',
  'scripts/lib/reports/special-report-smoke-gate.mjs',
  'scripts/lib/reports/special-report-tmall-css-smoke.mjs',
]);

export const SPECIAL_REPORT_SMOKE_GATE_INPUTS = Object.freeze([
  'DESIGN.md',
  SPECIAL_REPORT_CHART_GALLERY_DOC,
  SPECIAL_REPORT_PAGE_COMPOSITION_DOC,
  '@packageRuntime',
  ...SPECIAL_REPORT_SMOKE_SOURCE_PATTERNS,
  ...SPECIAL_REPORT_SMOKE_MAINTENANCE_FILES,
]);
