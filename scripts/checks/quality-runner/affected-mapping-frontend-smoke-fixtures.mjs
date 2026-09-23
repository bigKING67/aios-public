import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';

export function assertFrontendSmokeAffectedMapping({
  assertFalse,
  assertTrue,
  registry,
}) {
  const smokeRoutesConfig = selectAffectedGates(registry, ['scripts/config/frontend/smoke-routes.json']);
  assertTrue(
    smokeRoutesConfig.names.includes('verify:frontend:smoke-behavior'),
    'frontend smoke route config should select smoke behavior coverage',
  );
  assertTrue(
    smokeRoutesConfig.names.includes('verify:frontend:quality-docs-drift'),
    'frontend smoke route config should select docs drift because routes are documented',
  );
  assertFalse(smokeRoutesConfig.names.includes('verify:backend:check'), 'frontend smoke route config should not use backend safe fallback');
  assertFalse(smokeRoutesConfig.names.includes('type-check'), 'frontend smoke route config should not pay TypeScript coverage when no source changed');

  const qualityDocsDriftHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-quality-docs-drift-core.mjs']);
  assertTrue(qualityDocsDriftHelper.names.includes('lint:scripts'), 'quality docs drift helper should keep script lint coverage');
  assertTrue(
    qualityDocsDriftHelper.names.includes('verify:frontend:quality-docs-drift'),
    'quality docs drift helper should select production docs drift gate',
  );
  assertTrue(
    qualityDocsDriftHelper.names.includes('verify:frontend:quality-docs-drift-behavior'),
    'quality docs drift helper should select behavior docs drift gate',
  );
  assertFalse(qualityDocsDriftHelper.names.includes('verify:backend:check'), 'quality docs drift helper should not use backend safe fallback');

  const qualityDocsDriftBehaviorFixture = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-quality-docs-drift-behavior-fixtures.mjs']);
  assertTrue(
    qualityDocsDriftBehaviorFixture.names.includes('verify:frontend:quality-docs-drift-behavior'),
    'quality docs drift behavior fixture should select behavior docs drift gate',
  );
  assertTrue(
    qualityDocsDriftBehaviorFixture.names.includes('verify:frontend:delivery-gate-registry'),
    'quality docs drift behavior fixture should keep delivery registry coverage',
  );
  assertFalse(
    qualityDocsDriftBehaviorFixture.names.includes('verify:frontend:quality-docs-drift'),
    'quality docs drift behavior fixture should not select production docs drift gate',
  );
  assertFalse(
    qualityDocsDriftBehaviorFixture.names.includes('verify:backend:check'),
    'quality docs drift behavior fixture should not use backend safe fallback',
  );

  const smokeRuntimeScript = selectAffectedGates(registry, ['scripts/frontend/smoke-frontend-routes.mjs']);
  assertTrue(smokeRuntimeScript.names.includes('lint:scripts'), 'frontend smoke runtime script should keep script lint coverage');
  assertTrue(
    smokeRuntimeScript.names.includes('verify:frontend:smoke-behavior'),
    'frontend smoke runtime script should select smoke behavior coverage',
  );
  assertTrue(
    smokeRuntimeScript.names.includes('verify:frontend:delivery-gate-registry'),
    'frontend smoke runtime script should keep delivery registry coverage',
  );
  assertFalse(smokeRuntimeScript.names.includes('verify:backend:check'), 'frontend smoke runtime script should not use backend safe fallback');
  assertFalse(smokeRuntimeScript.names.includes('type-check'), 'frontend smoke runtime script should not pay TypeScript coverage when no source changed');

  const smokePreviewScript = selectAffectedGates(registry, ['scripts/frontend/run-frontend-smoke-preview.mjs']);
  assertTrue(smokePreviewScript.names.includes('lint:scripts'), 'frontend smoke preview wrapper should keep script lint coverage');
  assertTrue(
    smokePreviewScript.names.includes('verify:frontend:smoke-behavior'),
    'frontend smoke preview wrapper should select smoke behavior coverage',
  );
  assertFalse(smokePreviewScript.names.includes('verify:backend:check'), 'frontend smoke preview wrapper should not use backend safe fallback');
  assertFalse(smokePreviewScript.names.includes('type-check'), 'frontend smoke preview wrapper should not pay TypeScript coverage when no source changed');

  const smokeHelper = selectAffectedGates(registry, ['scripts/lib/frontend/smoke/config.mjs']);
  assertTrue(smokeHelper.names.includes('lint:scripts'), 'frontend smoke helper should keep script lint coverage');
  assertTrue(
    smokeHelper.names.includes('verify:frontend:smoke-behavior'),
    'frontend smoke helper should select smoke behavior coverage',
  );
  assertTrue(
    smokeHelper.names.includes('verify:frontend:delivery-gate-registry'),
    'frontend smoke helper should keep delivery registry coverage',
  );
  assertFalse(smokeHelper.names.includes('verify:backend:check'), 'frontend smoke helper should not use backend safe fallback');
  assertFalse(smokeHelper.names.includes('type-check'), 'frontend smoke helper should not pay TypeScript coverage when no source changed');

  const smokeCdpHelper = selectAffectedGates(registry, ['scripts/lib/frontend/smoke/chrome-cdp-client.mjs']);
  assertTrue(smokeCdpHelper.names.includes('lint:scripts'), 'frontend smoke CDP helper should keep script lint coverage');
  assertTrue(
    smokeCdpHelper.names.includes('verify:frontend:smoke-behavior'),
    'frontend smoke CDP helper should select smoke behavior coverage',
  );
  assertFalse(smokeCdpHelper.names.includes('verify:backend:check'), 'frontend smoke CDP helper should not use backend safe fallback');
  assertFalse(smokeCdpHelper.names.includes('type-check'), 'frontend smoke CDP helper should not pay TypeScript coverage when no source changed');

  const frontendFingerprintHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-build-fingerprint.mjs']);
  assertTrue(
    frontendFingerprintHelper.names.includes('verify:frontend:build-fingerprint-behavior'),
    'frontend build fingerprint helper changes should select fingerprint behavior',
  );
  assertTrue(
    frontendFingerprintHelper.names.includes('verify:frontend:bundle-budget-behavior'),
    'frontend build fingerprint helper changes should select bundle budget behavior',
  );
  assertTrue(
    frontendFingerprintHelper.names.includes('verify:frontend:bundle-budget'),
    'frontend build fingerprint helper changes should select production bundle budget',
  );
  assertTrue(
    frontendFingerprintHelper.names.includes('verify:frontend:preview-contract'),
    'frontend build fingerprint helper changes should select production preview contract',
  );
  assertTrue(
    frontendFingerprintHelper.names.includes('verify:frontend:preview-contract-behavior'),
    'frontend build fingerprint helper changes should select preview contract behavior',
  );

  const specialReportSource = selectAffectedGates(registry, ['apps/web-vite/src/app/reports/special/_components/special-report-shell.tsx']);
  assertTrue(
    specialReportSource.names.includes('verify:reports:special-smoke'),
    'special report source changes should select special report smoke',
  );
  assertTrue(
    specialReportSource.names.includes('verify:components:size'),
    'special report TSX source changes should select component size coverage',
  );
  assertTrue(specialReportSource.names.includes('build'), 'special report source should still select normal frontend build coverage');
  assertFalse(specialReportSource.names.includes('verify:backend:check'), 'special report source should not use backend safe fallback');

  const specialReportSmokeScript = selectAffectedGates(registry, ['scripts/checks/reports/special-smoke.mjs']);
  assertTrue(specialReportSmokeScript.names.includes('lint:scripts'), 'special report smoke script should keep script lint coverage');
  assertTrue(
    specialReportSmokeScript.names.includes('verify:quality-runner:registry'),
    'special report smoke script should select registry self-check coverage',
  );
  assertTrue(
    specialReportSmokeScript.names.includes('verify:reports:special-smoke'),
    'special report smoke script should select its production gate',
  );
  assertFalse(specialReportSmokeScript.names.includes('verify:backend:check'), 'special report smoke script should not use backend safe fallback');

  const specialReportChartGalleryDocs = selectAffectedGates(registry, ['docs/SPECIAL_REPORT_CHART_GALLERY.md']);
  assertTrue(
    specialReportChartGalleryDocs.names.includes('verify:reports:special-smoke'),
    'special report chart gallery docs should select special report smoke',
  );
  assertTrue(
    specialReportChartGalleryDocs.names.includes('verify:frontend:quality-docs-drift'),
    'special report chart gallery docs should keep quality docs drift coverage',
  );
  assertFalse(
    specialReportChartGalleryDocs.names.includes('verify:backend:check'),
    'special report chart gallery docs should not use backend safe fallback',
  );

  const specialReportPageCompositionDocs = selectAffectedGates(registry, ['docs/SPECIAL_REPORT_PAGE_COMPOSITION.md']);
  assertTrue(
    specialReportPageCompositionDocs.names.includes('verify:reports:special-smoke'),
    'special report page composition docs should select special report smoke',
  );
  assertTrue(
    specialReportPageCompositionDocs.names.includes('verify:frontend:quality-docs-drift'),
    'special report page composition docs should keep quality docs drift coverage',
  );
  assertFalse(
    specialReportPageCompositionDocs.names.includes('verify:backend:check'),
    'special report page composition docs should not use backend safe fallback',
  );

  const specialReportSmokeConfig = selectAffectedGates(registry, ['scripts/config/reports/special-smoke-inputs.mjs']);
  assertTrue(
    specialReportSmokeConfig.names.includes('verify:quality-runner:registry'),
    'special report smoke config should select registry self-check coverage',
  );
  assertTrue(
    specialReportSmokeConfig.names.includes('verify:reports:special-smoke'),
    'special report smoke config should select its production gate',
  );
  assertFalse(specialReportSmokeConfig.names.includes('verify:backend:check'), 'special report smoke config should not use backend safe fallback');

  const specialReportChartGalleryHelper = selectAffectedGates(registry, ['scripts/lib/reports/special-report-chart-gallery-smoke.mjs']);
  assertTrue(
    specialReportChartGalleryHelper.names.includes('verify:quality-runner:registry'),
    'special report chart gallery helper should select registry self-check coverage',
  );
  assertTrue(
    specialReportChartGalleryHelper.names.includes('verify:reports:special-smoke'),
    'special report chart gallery helper should select its production gate',
  );
  assertFalse(specialReportChartGalleryHelper.names.includes('verify:backend:check'), 'special report chart gallery helper should not use backend safe fallback');

  const specialReportReaderFatigueHelper = selectAffectedGates(registry, ['scripts/lib/reports/special-report-reader-fatigue-smoke.mjs']);
  assertTrue(
    specialReportReaderFatigueHelper.names.includes('verify:quality-runner:registry'),
    'special report reader fatigue helper should select registry self-check coverage',
  );
  assertTrue(
    specialReportReaderFatigueHelper.names.includes('verify:reports:special-smoke'),
    'special report reader fatigue helper should select its production gate',
  );
  assertFalse(specialReportReaderFatigueHelper.names.includes('verify:backend:check'), 'special report reader fatigue helper should not use backend safe fallback');

  const specialReportSectionSourceHelper = selectAffectedGates(registry, ['scripts/lib/reports/special-report-section-source.mjs']);
  assertTrue(
    specialReportSectionSourceHelper.names.includes('verify:quality-runner:registry'),
    'special report section source helper should select registry self-check coverage',
  );
  assertTrue(
    specialReportSectionSourceHelper.names.includes('verify:reports:special-smoke'),
    'special report section source helper should select its production gate',
  );
  assertFalse(specialReportSectionSourceHelper.names.includes('verify:backend:check'), 'special report section source helper should not use backend safe fallback');

  const specialReportSmokeLib = selectAffectedGates(registry, ['scripts/lib/reports/special-report-smoke-gate.mjs']);
  assertTrue(
    specialReportSmokeLib.names.includes('verify:quality-runner:registry'),
    'special report smoke helper should select registry self-check coverage',
  );
  assertTrue(
    specialReportSmokeLib.names.includes('verify:reports:special-smoke'),
    'special report smoke helper should select its production gate',
  );
  assertFalse(specialReportSmokeLib.names.includes('verify:backend:check'), 'special report smoke helper should not use backend safe fallback');
}
