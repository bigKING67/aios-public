import {
  ALLOWLIST_CONFIG_GATE_GROUPS,
} from '../../lib/quality/quality-allowlist-affected-gates.mjs';
import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';

function assertAllowlistConfigSelection({
  assertExcludesAll,
  assertFalse,
  assertIncludesAll,
  expected,
  file,
  registry,
}) {
  const selection = selectAffectedGates(registry, [file]);
  assertIncludesAll(selection.names, expected, `${file} should select its consumer gates`);
  assertExcludesAll(
    selection.names,
    ['lint:scripts', 'type-check', 'verify:backend:check', 'verify:frontend:preflight'],
    `${file} should not use safe fallback gates`,
  );
  for (const reasons of Object.values(selection.reasons ?? {})) {
    assertFalse(
      reasons.some((reason) => reason.includes('unknown path safe fallback')),
      `${file} should not report unknown fallback reasons`,
    );
  }
}

export function assertRepoConfigAffectedMapping({
  assertEqual,
  assertExcludesAll,
  assertFalse,
  assertIncludesAll,
  assertTrue,
  registry,
}) {
  for (const file of [
    'scripts/backend-rust/cache-maintenance.py',
    'scripts/checks/repo/backend-cargo-cache-behavior.py',
    'scripts/config/backend-cargo-cache.json',
  ]) {
    const selected = selectAffectedGates(registry, [file]);
    assertTrue(selected.names.includes('verify:repo:backend-cargo-governance'), `${file} should select Cargo safety fixtures`);
  }
  for (const file of [
    'scripts/lib/frontend/inline-visual-style-audit.mjs',
    'scripts/lib/frontend/inline-visual-style-core.mjs',
    'scripts/lib/frontend/inline-visual-style-parser.mjs',
    'scripts/lib/frontend/inline-visual-style-runner.mjs',
  ]) {
    const inlineVisualStyleHelper = selectAffectedGates(registry, [file]);
    assertTrue(inlineVisualStyleHelper.names.includes('verify:app:inline-styles'), `${file} should select app inline-style gate`);
    assertTrue(inlineVisualStyleHelper.names.includes('verify:app:inline-styles-behavior'), `${file} should select app inline-style behavior gate`);
    assertTrue(inlineVisualStyleHelper.names.includes('verify:components:inline-styles'), `${file} should select component inline-style gate`);
    assertTrue(inlineVisualStyleHelper.names.includes('verify:components:inline-styles-behavior'), `${file} should select component inline-style behavior gate`);
  }

  const prePushHook = selectAffectedGates(registry, ['.githooks/pre-push']);
  assertTrue(prePushHook.names.includes('verify:quality-runner:hook'), 'pre-push hook source should select hook self-check slice');

  const hookSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/hook.mjs']);
  assertTrue(hookSliceCheck.names.includes('verify:quality-runner:hook'), 'hook self-check source should select hook slice');
  assertTrue(!hookSliceCheck.names.includes('verify:quality-runner:cache-local'), 'hook self-check source should not fan out to unrelated cache slices');

  const backendCheck = selectAffectedGates(registry, ['scripts/checks/backend-rust/module-size.mjs']);
  assertTrue(backendCheck.names.includes('verify:backend:size'), 'backend check command should select backend size gate');
  assertTrue(backendCheck.names.includes('verify:quality-runner:registry'), 'backend check command should select quality runner registry self-check');

  const dashboardLatencySmoke = selectAffectedGates(registry, [
    'scripts/checks/backend-rust/dashboard-api-latency-smoke.mjs',
  ]);
  assertTrue(
    dashboardLatencySmoke.names.includes('verify:backend:dashboard-api-latency-smoke-behavior'),
    'dashboard latency smoke command should select its behavior gate',
  );

  const dashboardLatencySmokeBehavior = selectAffectedGates(registry, [
    'scripts/checks/backend-rust/dashboard-api-latency-smoke.behavior.mjs',
  ]);
  assertTrue(
    dashboardLatencySmokeBehavior.names.includes('verify:backend:dashboard-api-latency-smoke-behavior'),
    'dashboard latency smoke behavior command should select itself',
  );

  const dashboardLatencyHistory = selectAffectedGates(registry, [
    'scripts/checks/backend-rust/dashboard-api-latency-history.mjs',
  ]);
  assertTrue(
    dashboardLatencyHistory.names.includes('verify:backend:dashboard-api-latency-history-behavior'),
    'dashboard latency history command should select its behavior gate',
  );

  const dashboardLatencyHistoryBehavior = selectAffectedGates(registry, [
    'scripts/checks/backend-rust/dashboard-api-latency-history.behavior.mjs',
  ]);
  assertTrue(
    dashboardLatencyHistoryBehavior.names.includes('verify:backend:dashboard-api-latency-history-behavior'),
    'dashboard latency history behavior command should select itself',
  );

  const dashboardLatencyHistoryReport = selectAffectedGates(registry, [
    'scripts/checks/backend-rust/dashboard-api-latency-history-report.mjs',
  ]);
  assertTrue(
    dashboardLatencyHistoryReport.names.includes('verify:backend:dashboard-api-latency-history-report-behavior'),
    'dashboard latency history report command should select its behavior gate',
  );

  const dashboardLatencyHistoryReportBehavior = selectAffectedGates(registry, [
    'scripts/checks/backend-rust/dashboard-api-latency-history-report.behavior.mjs',
  ]);
  assertTrue(
    dashboardLatencyHistoryReportBehavior.names.includes('verify:backend:dashboard-api-latency-history-report-behavior'),
    'dashboard latency history report behavior command should select itself',
  );

  const dashboardLatencyHistoryRollup = selectAffectedGates(registry, [
    'scripts/checks/backend-rust/dashboard-api-latency-history-rollup.mjs',
  ]);
  assertTrue(
    dashboardLatencyHistoryRollup.names.includes('verify:backend:dashboard-api-latency-history-rollup-behavior'),
    'dashboard latency history rollup command should select its behavior gate',
  );

  const dashboardLatencyHistoryRollupBehavior = selectAffectedGates(registry, [
    'scripts/checks/backend-rust/dashboard-api-latency-history-rollup.behavior.mjs',
  ]);
  assertTrue(
    dashboardLatencyHistoryRollupBehavior.names.includes('verify:backend:dashboard-api-latency-history-rollup-behavior'),
    'dashboard latency history rollup behavior command should select itself',
  );

  const dashboardLatencyObservation = selectAffectedGates(registry, [
    'scripts/checks/backend-rust/run-dashboard-api-latency-observation.sh',
  ]);
  assertTrue(
    dashboardLatencyObservation.names.includes('verify:shell:syntax'),
    'dashboard latency observation shell wrapper should select shell syntax',
  );
  assertTrue(
    dashboardLatencyObservation.names.includes('verify:backend:dashboard-api-latency-observation-behavior'),
    'dashboard latency observation shell wrapper should select its behavior gate',
  );
  assertTrue(
    dashboardLatencyObservation.names.includes('verify:quality-runner:registry'),
    'dashboard latency observation shell wrapper should select quality runner registry self-check',
  );

  const dashboardLatencyObservationBehavior = selectAffectedGates(registry, [
    'scripts/checks/backend-rust/dashboard-api-latency-observation.behavior.mjs',
  ]);
  assertTrue(
    dashboardLatencyObservationBehavior.names.includes('verify:backend:dashboard-api-latency-observation-behavior'),
    'dashboard latency observation behavior command should select itself',
  );

  const dashboardDateRangeBehavior = selectAffectedGates(registry, [
    'scripts/checks/dashboard/date-range-bounds.behavior.mjs',
  ]);
  assertTrue(
    dashboardDateRangeBehavior.names.includes('verify:dashboard:date-range-bounds-behavior'),
    'dashboard date range behavior command should select itself',
  );

  const dashboardDateRangeSource = selectAffectedGates(registry, [
    'apps/web-vite/src/app/dashboard/_components/dashboard-date-range-resolvers.ts',
  ]);
  assertTrue(
    dashboardDateRangeSource.names.includes('verify:dashboard:date-range-bounds-behavior'),
    'dashboard date range resolver source should select its behavior guard',
  );

  const creatorShortVideoBehavior = selectAffectedGates(registry, [
    'scripts/checks/dashboard/creator-short-video.behavior.mjs',
  ]);
  assertTrue(
    creatorShortVideoBehavior.names.includes('verify:dashboard:creator-short-video-behavior'),
    'creator short video dashboard behavior command should select itself',
  );
  for (const fixturePath of [
    'scripts/lib/frontend/creator-short-video-data-source-behavior-fixtures.mjs',
    'scripts/lib/frontend/creator-short-video-rendering-behavior-fixtures.mjs',
    'scripts/lib/frontend/creator-short-video-upload-link-behavior-fixtures.mjs',
  ]) {
    const creatorShortVideoFixture = selectAffectedGates(registry, [fixturePath]);
    assertTrue(
      creatorShortVideoFixture.names.includes('verify:dashboard:creator-short-video-behavior'),
      `creator short video fixture ${fixturePath} should select its behavior guard`,
    );
  }

  const creatorShortVideoSource = selectAffectedGates(registry, [
    'apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-detail-columns.tsx',
  ]);
  assertTrue(
    creatorShortVideoSource.names.includes('verify:dashboard:creator-short-video-behavior'),
    'creator short video dashboard source should select its behavior guard',
  );
  const creatorShortVideoMetricStyles = selectAffectedGates(registry, [
    'apps/web-vite/src/app/dashboard/creator/_components/creator-live-dashboard-metrics.module.css',
  ]);
  assertTrue(
    creatorShortVideoMetricStyles.names.includes('verify:dashboard:creator-short-video-behavior'),
    'split creator short video metric styles should select its behavior guard',
  );

  const dataopsCheck = selectAffectedGates(registry, ['scripts/checks/dataops/config-sync.mjs']);
  assertTrue(dataopsCheck.names.includes('verify:dataops-config:sync'), 'dataops check command should select dataops config sync gate');
  assertTrue(dataopsCheck.names.includes('verify:quality-runner:registry'), 'dataops check command should select quality runner registry self-check');

  const stage2Gate = 'verify:marketing:content-assets-qianchuan-production-migration-card-ratio-stage2-behavior';
  const stage2Check = selectAffectedGates(registry, [
    'scripts/checks/marketing/content-assets-qianchuan-production-migration-card-ratio-stage2.behavior.mjs',
  ]);
  assertTrue(stage2Check.names.includes(stage2Gate), 'marketing behavior command should select its direct gate');
  assertTrue(stage2Check.names.includes('verify:quality-runner:registry'), 'marketing check should select quality runner registry');

  const stage2Core = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-card-ratio-stage2.mjs',
  ]);
  assertTrue(stage2Core.names.includes(stage2Gate), 'Stage 2 core should select Stage 2 behavior');
  assertTrue(stage2Core.names.includes('lint:scripts'), 'Stage 2 core should select scripts lint');
  assertFalse(stage2Core.names.includes('verify:backend:check'), 'Stage 2 core should avoid backend fallback');

  const ledgerBootstrapGate = 'verify:marketing:content-assets-qianchuan-production-migration-ledger-bootstrap-plan-behavior';
  const ledgerBootstrapWriterGate = 'verify:migrations:aios-ledger-bootstrap-behavior';
  const sampleInventoryCutoverGate = 'verify:migrations:aios-sample-inventory-forward-cutover-behavior';
  const sampleInventoryPublicCutoverGate = 'verify:migrations:aios-sample-inventory-public-cutover-behavior';
  const sampleInventoryApprovalStockCutoverGate = 'verify:migrations:aios-sample-inventory-approval-stock-cutover-behavior';
  const agentContextCutoverGate = 'verify:migrations:aios-agent-context-cutover-behavior';
  const taobaoGoodsCutoverGate = 'verify:migrations:aios-taobao-goods-forward-cutover-behavior';
  const ownerReviewedOverlayGate = 'verify:migrations:aios-owner-reviewed-overlay-behavior';
  const ledgerContractCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-migration-ledger-contract.mjs',
  ]);
  assertTrue(
    ledgerContractCore.names.includes('verify:migrations:aios-behavior'),
    'migration ledger contract should select the generic migration behavior gate',
  );
  assertTrue(
    ledgerContractCore.names.includes(ledgerBootstrapGate),
    'migration ledger contract should select the Qianchuan bootstrap architecture behavior gate',
  );
  assertTrue(
    ledgerContractCore.names.includes(ledgerBootstrapWriterGate),
    'migration ledger contract should select the canonical v2 bootstrap writer behavior gate',
  );
  assertTrue(
    ledgerContractCore.names.includes('lint:scripts'),
    'migration ledger contract should select scripts lint',
  );
  const sampleInventoryCutoverCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-sample-inventory-forward-cutover.mjs',
  ]);
  assertTrue(
    sampleInventoryCutoverCore.names.includes(sampleInventoryCutoverGate),
    'sample inventory cutover core should select its behavior gate',
  );
  assertTrue(
    sampleInventoryCutoverCore.names.includes('verify:migrations:aios'),
    'sample inventory cutover core should select migration filesystem governance',
  );
  assertTrue(
    sampleInventoryCutoverCore.names.includes('lint:scripts'),
    'sample inventory cutover core should select scripts lint',
  );
  const taobaoGoodsCutoverCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-taobao-goods-forward-cutover.mjs',
  ]);
  assertTrue(
    taobaoGoodsCutoverCore.names.includes(taobaoGoodsCutoverGate),
    'Taobao goods cutover core should select its behavior gate',
  );
  assertTrue(
    taobaoGoodsCutoverCore.names.includes('verify:migrations:aios'),
    'Taobao goods cutover core should select migration filesystem governance',
  );
  assertTrue(
    taobaoGoodsCutoverCore.names.includes('lint:scripts'),
    'Taobao goods cutover core should select scripts lint',
  );
  const sampleInventoryPublicCutoverCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-sample-inventory-public-cutover.mjs',
  ]);
  assertTrue(
    sampleInventoryPublicCutoverCore.names.includes(sampleInventoryPublicCutoverGate),
    'sample inventory public cutover core should select its behavior gate',
  );
  assertTrue(
    sampleInventoryPublicCutoverCore.names.includes('verify:migrations:aios'),
    'sample inventory public cutover core should select migration filesystem governance',
  );
  assertTrue(
    sampleInventoryPublicCutoverCore.names.includes('lint:scripts'),
    'sample inventory public cutover core should select scripts lint',
  );
  const sampleInventoryApprovalStockCutoverCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-sample-inventory-approval-stock-cutover.mjs',
  ]);
  assertTrue(
    sampleInventoryApprovalStockCutoverCore.names.includes(sampleInventoryApprovalStockCutoverGate),
    'sample inventory approval-stock cutover core should select its behavior gate',
  );
  assertTrue(
    sampleInventoryApprovalStockCutoverCore.names.includes('verify:migrations:aios'),
    'sample inventory approval-stock cutover core should select migration filesystem governance',
  );
  assertTrue(
    sampleInventoryApprovalStockCutoverCore.names.includes('lint:scripts'),
    'sample inventory approval-stock cutover core should select scripts lint',
  );
  const agentContextCutoverCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-agent-context-cutover.mjs',
  ]);
  assertTrue(
    agentContextCutoverCore.names.includes(agentContextCutoverGate),
    'Agent context cutover core should select its behavior gate',
  );
  assertTrue(
    agentContextCutoverCore.names.includes('verify:migrations:aios'),
    'Agent context cutover core should select migration filesystem governance',
  );
  assertTrue(
    agentContextCutoverCore.names.includes('lint:scripts'),
    'Agent context cutover core should select scripts lint',
  );
  const ledgerExceptionOverlayCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-ledger-exception-owner-overlay.mjs',
  ]);
  assertTrue(
    ledgerExceptionOverlayCore.names.includes(ledgerBootstrapGate),
    'ledger exception owner overlay should select the bootstrap planner behavior gate',
  );
  assertTrue(
    ledgerExceptionOverlayCore.names.includes('lint:scripts'),
    'ledger exception owner overlay should select scripts lint',
  );
  const ownerReviewedOverlayCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-production-migration-owner-reviewed-overlay.mjs',
  ]);
  assertIncludesAll(ownerReviewedOverlayCore.names, [
    ownerReviewedOverlayGate,
    ledgerBootstrapGate,
    'verify:migrations:aios',
    'verify:migrations:aios-behavior',
    'lint:scripts',
  ], 'migration owner-reviewed overlay should select its complete contract gates');
  assertFalse(
    ownerReviewedOverlayCore.names.includes('verify:backend:check'),
    'migration owner-reviewed overlay should avoid unrelated backend fallback',
  );
  const ledgerBootstrapWriterCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-migration-ledger-bootstrap-writer.mjs',
  ]);
  assertTrue(
    ledgerBootstrapWriterCore.names.includes(ledgerBootstrapWriterGate),
    'migration ledger bootstrap writer should select its direct behavior gate',
  );
  assertTrue(
    ledgerBootstrapWriterCore.names.includes(ledgerBootstrapGate),
    'migration ledger bootstrap writer should select the offline planner parity gate',
  );
  assertFalse(
    ledgerBootstrapWriterCore.names.includes('verify:backend:check'),
    'migration ledger bootstrap writer should avoid unrelated backend fallback',
  );

  const sharedStage1Sql = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-card-ratio-stage1-sql.mjs',
  ]);
  assertTrue(sharedStage1Sql.names.includes(
    'verify:marketing:content-assets-qianchuan-production-migration-card-ratio-stage1-behavior',
  ), 'shared ratio SQL should select Stage 1 behavior');
  assertTrue(sharedStage1Sql.names.includes(stage2Gate), 'shared ratio SQL should select Stage 2 behavior');

  const readonlyCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-card-ratio-readonly-probe.mjs',
  ]);
  assertTrue(readonlyCore.names.includes(
    'verify:marketing:content-assets-qianchuan-production-migration-card-ratio-readonly-probe-behavior',
  ), 'read-only ratio core should select its behavior');
  assertTrue(readonlyCore.names.includes(stage2Gate), 'read-only ratio core should select Stage 2 behavior');

  const influencerTagGate = 'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-readonly-probe-behavior';
  const influencerTagPlanGate = 'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-repair-plan-behavior';
  const influencerTagStage1Gate = 'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-stage1-behavior';
  const influencerTagStage2Gate = 'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-stage2-behavior';
  const influencerTagCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-readonly-probe.mjs',
  ]);
  assertTrue(influencerTagCore.names.includes(influencerTagGate), 'influencer-tag read-only core should select its behavior');
  assertTrue(influencerTagCore.names.includes(influencerTagPlanGate), 'influencer-tag read-only core should select repair-plan behavior');
  assertTrue(influencerTagCore.names.includes(influencerTagStage1Gate), 'influencer-tag read-only core should select Stage 1 behavior');
  assertTrue(influencerTagCore.names.includes(influencerTagStage2Gate), 'influencer-tag read-only core should select Stage 2 behavior');
  assertTrue(influencerTagCore.names.includes('lint:scripts'), 'influencer-tag read-only core should select scripts lint');

  const influencerTagSharedSql = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-normalization-sql.mjs',
  ]);
  assertTrue(influencerTagSharedSql.names.includes(influencerTagGate), 'shared influencer-tag SQL should select specialized behavior');
  assertTrue(influencerTagSharedSql.names.includes(influencerTagPlanGate), 'shared influencer-tag SQL should select repair-plan behavior');
  assertTrue(influencerTagSharedSql.names.includes(influencerTagStage1Gate), 'shared influencer-tag SQL should select Stage 1 behavior');
  assertTrue(influencerTagSharedSql.names.includes(influencerTagStage2Gate), 'shared influencer-tag SQL should select Stage 2 behavior');
  assertTrue(influencerTagSharedSql.names.includes(
    'verify:marketing:content-assets-qianchuan-production-migration-p1d-readonly-probe-behavior',
  ), 'shared influencer-tag SQL should select generic P1D behavior');

  const influencerTagPlanCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-repair-plan.mjs',
  ]);
  assertTrue(influencerTagPlanCore.names.includes(influencerTagPlanGate), 'influencer-tag repair-plan core should select its behavior');
  assertTrue(influencerTagPlanCore.names.includes(influencerTagStage1Gate), 'influencer-tag repair-plan core should select Stage 1 behavior');
  assertTrue(influencerTagPlanCore.names.includes(influencerTagStage2Gate), 'influencer-tag repair-plan core should select Stage 2 behavior');
  assertTrue(influencerTagPlanCore.names.includes('lint:scripts'), 'influencer-tag repair-plan core should select scripts lint');

  const influencerTagStage1Core = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-stage1.mjs',
  ]);
  assertTrue(influencerTagStage1Core.names.includes(influencerTagStage1Gate), 'influencer-tag Stage 1 core should select Stage 1 behavior');
  assertTrue(influencerTagStage1Core.names.includes(influencerTagStage2Gate), 'influencer-tag Stage 1 core should select Stage 2 behavior');
  assertTrue(influencerTagStage1Core.names.includes('lint:scripts'), 'influencer-tag Stage 1 core should select scripts lint');
  assertFalse(influencerTagStage1Core.names.includes('verify:backend:check'), 'influencer-tag Stage 1 core should avoid backend fallback');

  const influencerTagStage2Core = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-stage2.mjs',
  ]);
  assertTrue(influencerTagStage2Core.names.includes(influencerTagStage2Gate), 'influencer-tag Stage 2 core should select Stage 2 behavior');
  assertTrue(influencerTagStage2Core.names.includes('verify:marketing:content-assets-qianchuan-production-migration-p1d-review-decisions-behavior'), 'influencer-tag Stage 2 core should select owner-decision behavior');
  assertTrue(influencerTagStage2Core.names.includes('lint:scripts'), 'influencer-tag Stage 2 core should select scripts lint');
  assertFalse(influencerTagStage2Core.names.includes('verify:backend:check'), 'influencer-tag Stage 2 core should avoid backend fallback');

  const influencerTagDecisionCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-forward-repair-decisions.mjs',
  ]);
  assertTrue(influencerTagDecisionCore.names.includes(influencerTagStage2Gate), 'influencer-tag decision core should select Stage 2 behavior');
  assertTrue(influencerTagDecisionCore.names.includes('verify:marketing:content-assets-qianchuan-production-migration-p1d-review-decisions-behavior'), 'influencer-tag decision core should select owner-decision behavior');
  assertTrue(influencerTagDecisionCore.names.includes('lint:scripts'), 'influencer-tag decision core should select scripts lint');
  assertFalse(influencerTagDecisionCore.names.includes('verify:backend:check'), 'influencer-tag decision core should avoid backend fallback');

  const parseHelperPlanGate = 'verify:marketing:content-assets-qianchuan-production-migration-parse-helper-forward-contract-plan-behavior';
  const parseHelperReadonlyGate = 'verify:marketing:content-assets-qianchuan-production-migration-parse-helper-readonly-probe-behavior';
  const parseHelperPlanCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-parse-helper-forward-contract-plan.mjs',
  ]);
  assertTrue(parseHelperPlanCore.names.includes(parseHelperPlanGate), 'parse-helper plan core should select its behavior');
  assertTrue(parseHelperPlanCore.names.includes(parseHelperReadonlyGate), 'parse-helper plan core should select read-only behavior');
  assertTrue(parseHelperPlanCore.names.includes('lint:scripts'), 'parse-helper plan core should select scripts lint');

  const parseHelperReadonlyCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-parse-helper-readonly-probe.mjs',
  ]);
  assertTrue(parseHelperReadonlyCore.names.includes(parseHelperReadonlyGate), 'parse-helper read-only core should select its behavior');
  assertTrue(parseHelperReadonlyCore.names.includes('lint:scripts'), 'parse-helper read-only core should select scripts lint');

  const parseHelperMigration = selectAffectedGates(registry, [
    'etl/groland_postgres/sql/migrations/20260725_2300__ensure_marketing_content_report_parse_helpers.sql',
  ]);
  assertTrue(parseHelperMigration.names.includes(parseHelperPlanGate), 'parse-helper migration should select plan behavior');
  assertTrue(parseHelperMigration.names.includes(parseHelperReadonlyGate), 'parse-helper migration should select read-only behavior');

  const parseHelperSqlCheck = selectAffectedGates(registry, [
    'etl/groland_postgres/tests/sql/marketing_content_report_parse_helpers_check.sql',
  ]);
  assertTrue(parseHelperSqlCheck.names.includes(parseHelperPlanGate), 'parse-helper SQL check should select plan behavior');
  assertTrue(parseHelperSqlCheck.names.includes(parseHelperReadonlyGate), 'parse-helper SQL check should select read-only behavior');

  const platformVideoIdentityGate = 'verify:marketing:content-assets-qianchuan-production-migration-platform-video-identity-contract-plan-behavior';
  const platformVideoIdentityReadonlyCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-platform-video-identity-readonly-probe.mjs',
  ]);
  assertTrue(platformVideoIdentityReadonlyCore.names.includes(platformVideoIdentityGate), 'platform-video identity read-only core should select contract behavior');
  assertTrue(platformVideoIdentityReadonlyCore.names.includes('lint:scripts'), 'platform-video identity read-only core should select scripts lint');

  const platformVideoIdentityPlanCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-platform-video-identity-contract-plan.mjs',
  ]);
  assertTrue(platformVideoIdentityPlanCore.names.includes(platformVideoIdentityGate), 'platform-video identity plan core should select contract behavior');
  assertTrue(platformVideoIdentityPlanCore.names.includes('lint:scripts'), 'platform-video identity plan core should select scripts lint');

  const platformVideoIdentityMigration = selectAffectedGates(registry, [
    'etl/groland_postgres/sql/migrations/20260726_1000__enforce_marketing_content_platform_video_identity.sql',
  ]);
  assertTrue(platformVideoIdentityMigration.names.includes(platformVideoIdentityGate), 'platform-video identity migration should select contract behavior');
  assertTrue(platformVideoIdentityMigration.names.includes('lint:scripts'), 'platform-video identity migration should select scripts lint');

  const platformVideoIdentitySqlCheck = selectAffectedGates(registry, [
    'etl/groland_postgres/tests/sql/marketing_content_platform_video_identity_check.sql',
  ]);
  assertTrue(platformVideoIdentitySqlCheck.names.includes(platformVideoIdentityGate), 'platform-video identity SQL check should select contract behavior');
  assertTrue(platformVideoIdentitySqlCheck.names.includes('lint:scripts'), 'platform-video identity SQL check should select scripts lint');

  const alimamaRetirementGate = 'verify:marketing:content-assets-qianchuan-production-migration-alimama-runtime-retirement-plan-behavior';
  const alimamaReadonlyCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-alimama-runtime-replacement-readonly-probe.mjs',
  ]);
  assertTrue(alimamaReadonlyCore.names.includes(alimamaRetirementGate), 'Alimama read-only core should select retirement behavior');
  assertTrue(alimamaReadonlyCore.names.includes('lint:scripts'), 'Alimama read-only core should select scripts lint');

  const alimamaPlanCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-plan.mjs',
  ]);
  assertTrue(alimamaPlanCore.names.includes(alimamaRetirementGate), 'Alimama retirement plan core should select its behavior');
  assertTrue(alimamaPlanCore.names.includes('lint:scripts'), 'Alimama retirement plan core should select scripts lint');

  const alimamaDecisionCore = selectAffectedGates(registry, [
    'scripts/lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-decisions.mjs',
  ]);
  assertTrue(alimamaDecisionCore.names.includes(alimamaRetirementGate), 'Alimama decision core should select retirement behavior');
  assertTrue(alimamaDecisionCore.names.includes('verify:marketing:content-assets-qianchuan-production-migration-p1d-review-decisions-behavior'), 'Alimama decision core should select P1D decision behavior');
  assertTrue(alimamaDecisionCore.names.includes('lint:scripts'), 'Alimama decision core should select scripts lint');

  const docs = selectAffectedGates(registry, ['README.md']);
  assertTrue(docs.names.includes('verify:design:docs'), 'README changes should select design docs drift gate');
  assertTrue(!docs.names.includes('verify:backend:check'), 'README changes should not fall back to backend quick gates');

  const plans = selectAffectedGates(registry, ['PLANS.md']);
  assertTrue(plans.names.includes('verify:repo:agent-workflow'), 'PLANS changes should select the agent workflow doctor');
  assertTrue(plans.names.includes('verify:design:docs'), 'PLANS changes should keep docs drift coverage');

  const trellisSpec = selectAffectedGates(registry, ['.trellis/spec/repo/quality-gates.md']);
  assertTrue(trellisSpec.names.includes('verify:design:docs'), 'Trellis spec changes should keep docs drift coverage');
  assertTrue(
    trellisSpec.names.includes('verify:repo:trellis-spec-compact'),
    'Trellis spec changes should select compactness gate',
  );
  assertTrue(
    trellisSpec.names.includes('verify:repo:trellis-spec-compact-behavior'),
    'Trellis spec changes should select compactness behavior coverage',
  );
  assertTrue(!trellisSpec.names.includes('verify:backend:check'), 'Trellis spec changes should not fall back to backend quick gates');

  const tempPid = selectAffectedGates(registry, ['.tmp-backend-rust.pid']);
  assertEqual(tempPid.names.length, 0, 'local temp pid files should be ignored by affected selection');

  const gitignore = selectAffectedGates(registry, ['.gitignore']);
  assertTrue(gitignore.names.includes('verify:ci:wiring'), '.gitignore should select CI wiring guard');
  assertFalse(gitignore.names.includes('verify:backend:check'), '.gitignore should not use backend safe fallback');

  const tokenCoverageConfig = selectAffectedGates(registry, ['scripts/config/design/token-color-sync.config.json']);
  assertTrue(tokenCoverageConfig.names.includes('verify:design:tokens'), 'token coverage config should select design token sync gate');
  assertTrue(tokenCoverageConfig.names.includes('verify:design:token-values-sync'), 'token coverage config should select token value sync gate');
  assertTrue(tokenCoverageConfig.names.includes('verify:design:echarts-css-token-sync'), 'token coverage config should select ECharts CSS token sync gate');
  assertFalse(tokenCoverageConfig.names.includes('verify:backend:check'), 'token coverage config should not use backend safe fallback');

  const qualityDescriptor = selectAffectedGates(registry, ['scripts/config/quality/quality-gates.mjs']);
  assertTrue(qualityDescriptor.names.includes('verify:quality-runner:registry'), 'quality descriptor should select registry validation');
  assertTrue(qualityDescriptor.names.includes('verify:ci:wiring'), 'quality descriptor should select CI wiring');
  assertFalse(qualityDescriptor.names.includes('verify:backend:check'), 'quality descriptor should not use backend fallback');

  const dependencyAuditPolicy = selectAffectedGates(registry, [
    'scripts/config/security/dependency-audit-exceptions.json',
  ]);
  assertTrue(
    dependencyAuditPolicy.names.includes('verify:ci:dependency-audit-behavior'),
    'dependency audit policy should select shared behavior coverage',
  );
  assertTrue(
    dependencyAuditPolicy.names.includes('audit:dependencies:npm'),
    'dependency audit policy should select the production npm audit gate',
  );
  assertTrue(
    dependencyAuditPolicy.names.includes('audit:dependencies:rust'),
    'dependency audit policy should select the production Rust audit gate',
  );
  assertFalse(
    dependencyAuditPolicy.names.includes('verify:backend:check'),
    'dependency audit policy should not use the generic backend fallback',
  );

  const tokenColorSyncHelper = selectAffectedGates(registry, ['scripts/lib/frontend/frontend-design-token-color-sync-core.mjs']);
  assertTrue(tokenColorSyncHelper.names.includes('lint:scripts'), 'token color sync helper should keep script lint coverage');
  assertTrue(tokenColorSyncHelper.names.includes('verify:design:tokens'), 'token color sync helper should select design token sync gate');
  assertTrue(
    tokenColorSyncHelper.names.includes('verify:design:behavior-gate-registry'),
    'token color sync helper should keep design behavior registry coverage',
  );
  assertFalse(tokenColorSyncHelper.names.includes('type-check'), 'token color sync helper should avoid TypeScript coverage');
  assertFalse(tokenColorSyncHelper.names.includes('verify:backend:check'), 'token color sync helper should not use backend safe fallback');

  const designTokens = selectAffectedGates(registry, ['DESIGN_TOKENS.json']);
  assertIncludesAll(
    designTokens.names,
    [
      'verify:design:mirror',
      'verify:design:tokens',
      'verify:design:runtime-tokens',
      'verify:design:token-values-sync',
      'verify:design:tailwind',
      'verify:design:tailwind-non-color-aliases',
      'verify:design:antd-theme-token-sync',
      'verify:design:echarts-theme-token-sync',
      'verify:design:echarts-css-token-sync',
      'verify:frontend:design-evolution',
      'verify:frontend:delivery-gate-registry',
    ],
    'DESIGN_TOKENS.json should select design token consumer gates',
  );
  assertExcludesAll(
    designTokens.names,
    ['lint:scripts', 'type-check', 'verify:backend:check', 'verify:frontend:preflight'],
    'DESIGN_TOKENS.json should not use safe fallback gates',
  );

  const rustToolchainConfig = selectAffectedGates(registry, ['rust-toolchain.toml']);
  assertIncludesAll(
    rustToolchainConfig.names,
    ['verify:backend:fmt', 'verify:backend:check', 'verify:backend:test', 'verify:backend:clippy'],
    'rust-toolchain.toml should select Rust toolchain-sensitive backend gates',
  );
  assertExcludesAll(
    rustToolchainConfig.names,
    ['lint:scripts', 'type-check', 'verify:frontend:preflight'],
    'rust-toolchain.toml should not use frontend safe fallback gates',
  );
  for (const selection of [designTokens, rustToolchainConfig]) {
    for (const reasons of Object.values(selection.reasons ?? {})) {
      assertFalse(
        reasons.some((reason) => reason.includes('unknown path safe fallback')),
        'known authority/toolchain config should not report unknown fallback reasons',
      );
    }
  }

  for (const [file, expected] of Object.entries(ALLOWLIST_CONFIG_GATE_GROUPS)) {
    assertAllowlistConfigSelection({
      assertExcludesAll,
      assertFalse,
      assertIncludesAll,
      expected,
      file,
      registry,
    });
  }
}
