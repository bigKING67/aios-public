import { createHash } from 'node:crypto';

import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import { validateQianchuanAlimamaRuntimeConsumerInventory } from './aios-qianchuan-production-migration-alimama-runtime-inventory.mjs';
import { validateQianchuanAlimamaRuntimeReplacementReadonlyProbe } from './aios-qianchuan-production-migration-alimama-runtime-replacement-readonly-probe.mjs';

export const ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS = Object.freeze({
  historicalMigration: 'etl/groland_postgres/sql/migrations/20260212_1600__add_incremental_refresh_for_dwd_alimama_goods_marketing_di.sql',
  renameSuccessor: 'etl/groland_postgres/sql/migrations/20260212_1630__rename_dwd_alimama_goods_marketing_di_to_taobao_alimama_goods_marketingscene.sql',
  reportMigration: 'etl/groland_postgres/sql/migrations/20260302_1900__create_ads_taobao_one_goods_traffic_channel_metric_week.sql',
  reportModelMigration: 'etl/groland_postgres/sql/migrations/20260430_1200__rebuild_report_data_model.sql',
  reportRepairMigration: 'etl/groland_postgres/sql/migrations/20260528_1320__repair_report_week_incremental_procedures.sql',
  backendConfig: 'backend-rust/src/dataops_config.json',
  backendStreams: 'backend-rust/src/dataops/runtime/streams.rs',
  backendConsumer: 'backend-rust/src/reports/weekly_goods_channel_funnel/queries/paid_funnel.rs',
  prefectFlow: 'etl/groland_postgres/scripts/prefect_incremental_report_taobao_one_goods_traffic_channel_metric_week.py',
  prefectDeploy: 'etl/groland_postgres/scripts/deploy_prefect_incremental_report_taobao_one_goods_traffic_channel_metric_week.sh',
  frontendPipelines: 'apps/web-vite/src/config/dataops-hub-report-pipelines.ts',
  frontendStreams: 'apps/web-vite/src/config/dataops-hub-streams.ts',
  dataopsMapping: 'docs/DATAOPS_HUB_ETL_MAPPING.md',
  warehouseCatalog: 'docs/DATA_WAREHOUSE_CATALOG.md',
});

const REQUIRED_RUNTIME_CONSUMER_PATHS = Object.freeze([
  ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS.backendConfig,
  ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS.backendStreams,
  ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS.backendConsumer,
  ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS.prefectFlow,
  ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS.prefectDeploy,
  ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS.frontendPipelines,
  ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS.frontendStreams,
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO-8601 UTC timestamp.`);
}

function assertNeedles(content, label, needles) {
  for (const needle of needles) {
    if (!content.includes(needle)) throw new Error(`${label} no longer contains required contract: ${needle}`);
  }
}

function buildSourceEvidence(sources) {
  const expectedKeys = Object.keys(ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS).sort();
  if (JSON.stringify(Object.keys(sources ?? {}).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error('Alimama runtime retirement sources are incomplete.');
  }
  const evidence = {};
  for (const key of expectedKeys) {
    const content = sources[key];
    if (typeof content !== 'string' || !content) throw new Error(`Alimama source ${key} is empty.`);
    evidence[key] = {
      path: ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS[key],
      bytes: Buffer.byteLength(content),
      sha256: sha256(content),
    };
  }
  return evidence;
}

function validateSourceContracts(sources) {
  assertNeedles(sources.historicalMigration, 'Historical Alimama migration', [
    'etl.alimama_goods_marketing_di_refresh_state',
    'dwd.refresh_dwd_alimama_goods_marketing_di_incremental',
  ]);
  assertNeedles(sources.renameSuccessor, 'Alimama rename successor', [
    'DROP TABLE etl.alimama_goods_marketing_di_refresh_state',
    'dwd.refresh_taobao_alimama_goods_marketingscene_incremental',
  ]);
  assertNeedles(sources.reportMigration, 'Current Alimama report migration', [
    'ods.taobao_one_alimama_goods_marketingscenario',
    'ads.taobao_one_goods_traffic_channel_metric_week',
    'refresh_taobao_one_goods_traffic_channel_metric_week',
  ]);
  assertNeedles(sources.reportModelMigration, 'Current report model migration', [
    'ads.report_taobao_one_goods_traffic_channel_metric_week',
    'refresh_report_taobao_one_goods_traffic_channel_metric_week',
  ]);
  assertNeedles(sources.reportRepairMigration, 'Current report repair migration', [
    'ads.refresh_report_taobao_one_goods_traffic_channel_metric_week_incremental',
    'ods.taobao_one_alimama_goods_marketingscenario',
  ]);
  for (const key of ['backendConfig', 'backendConsumer', 'prefectFlow', 'frontendPipelines', 'frontendStreams']) {
    assertNeedles(sources[key], key, ['report_taobao_one_goods_traffic_channel_metric_week']);
  }
  assertNeedles(sources.backendStreams, 'backendStreams', ['stream_report_taobao_one_goods_traffic_channel_metric_week']);
  assertNeedles(sources.prefectDeploy, 'prefectDeploy', ['incremental_refresh_report_taobao_one_goods_traffic_channel_metric_week_flow']);
  assertNeedles(sources.dataopsMapping, 'DataOps mapping', [
    'stream_report_taobao_one_goods_traffic_channel_metric_week',
    'dwd.taobao_alimama_goods_marketingscene',
    '## 已移除的 active 链路',
  ]);
  assertNeedles(sources.warehouseCatalog, 'Warehouse catalog', [
    '旧阿里妈妈 DWD/DWS/ADS 归因链路',
    'ads.report_taobao_one_goods_traffic_channel_metric_week',
  ]);
}

function validateRuntimeInventoryForRetirement(inventory) {
  validateQianchuanAlimamaRuntimeConsumerInventory(inventory);
  if (inventory.legacyMatches.length !== 0) {
    throw new Error('Legacy Alimama runtime symbols are still referenced by active runtime roots.');
  }
  const currentPaths = new Set(inventory.currentMatches.map((value) => value.path));
  for (const requiredPath of REQUIRED_RUNTIME_CONSUMER_PATHS) {
    if (!currentPaths.has(requiredPath)) throw new Error(`Current Alimama runtime consumer is missing: ${requiredPath}`);
  }
}

export function validateQianchuanAlimamaRuntimeRetirementPlan(plan) {
  assertIsoTimestamp(plan?.generatedAt, 'Alimama runtime retirement plan generatedAt');
  if (plan?.schemaVersion !== 2 || plan.mode !== 'offline_readonly_alimama_runtime_retirement_plan'
    || plan.policy?.networkAccess !== false || plan.policy?.productionWritesAuthorized !== false
    || plan.policy?.migrationApplyAuthorized !== false || plan.policy?.ledgerWritesAuthorized !== false
    || plan.policy?.ownerDecisionRecorded !== false || plan.policy?.deployAuthorized !== false
    || plan.policy?.arkInvoked !== false || plan.summary?.retirementRecommendationReady !== true) {
    throw new Error('Alimama runtime retirement plan policy or readiness is invalid.');
  }
  assertPinnedMigrationReviewArtifact(plan.sourceArtifacts?.probe, plan.sourceArtifacts?.probe?.sha256, 'Alimama replacement probe');
  if (plan.currentEvidence?.runtimeReplacementReady !== true
    || plan.currentEvidence?.legacyRelationsPresent !== 0
    || plan.currentEvidence?.legacyRoutinesPresent !== 0
    || plan.currentEvidence?.replacementRelationsPresent !== 4
    || plan.currentEvidence?.replacementRoutinesPresent !== 2
    || plan.currentEvidence?.waitingLocks !== 0
    || plan.currentEvidence?.sourceRows < 1 || plan.currentEvidence?.platformRows < 1
    || plan.currentEvidence?.reportRows < 1
    || plan.currentEvidence?.stateRows !== 1
    || plan.currentEvidence?.latestExpectedRows < 1
    || plan.currentEvidence?.latestExpectedRows !== plan.currentEvidence?.latestActualRows
    || plan.currentEvidence?.latestMissingRows !== 0
    || plan.currentEvidence?.latestExtraRows !== 0
    || plan.currentEvidence?.latestContractMismatchRows !== 0
    || plan.currentEvidence?.watermarkCoversSource !== true
    || plan.currentEvidence?.watermarkCoversPlatform !== true
    || plan.currentEvidence?.watermarkCoversInputs !== true
    || plan.currentEvidence?.currentRoutineContractsReady !== true) {
    throw new Error('Alimama runtime retirement plan does not carry complete replacement evidence.');
  }
  if (plan.recommendation?.recommendedOwnerDecision !== 'not_applicable'
    || plan.recommendation?.reviewStatus !== 'verified_not_applicable_candidate'
    || plan.recommendation?.ledgerAction !== 'do_not_record'
    || plan.recommendation?.historicalExecution !== false
    || plan.recommendation?.historicalMigrationReplayRecommended !== false
    || plan.recommendation?.restoreLegacyDwdDwsAdsRecommended !== false
    || plan.recommendation?.ownerConfirmationRequired !== true) {
    throw new Error('Alimama runtime retirement recommendation is invalid.');
  }
  if (plan.forwardMigration?.required !== false || plan.forwardMigration?.sqlStatements?.length !== 0
    || plan.forwardMigration?.dataMutationRows !== 0 || plan.rollback?.dataRestoreRequired !== false
    || plan.rollback?.legacyRuntimeRestoreRecommended !== false) {
    throw new Error('Alimama runtime retirement plan must not create a forward migration or restore legacy data.');
  }
  validateRuntimeInventoryForRetirement(plan.repositoryEvidence?.runtimeInventory);
  const expectedSourceKeys = Object.keys(ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS).sort();
  if (JSON.stringify(Object.keys(plan.repositoryEvidence?.sources ?? {}).sort()) !== JSON.stringify(expectedSourceKeys)) {
    throw new Error('Alimama runtime retirement source evidence is incomplete.');
  }
  for (const key of expectedSourceKeys) {
    const source = plan.repositoryEvidence.sources[key];
    if (source?.path !== ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS[key]
      || !Number.isSafeInteger(source?.bytes) || source.bytes < 1
      || !/^[a-f0-9]{64}$/u.test(source?.sha256 ?? '')) {
      throw new Error(`Alimama runtime retirement source evidence is invalid: ${key}`);
    }
  }
  const inventory = plan.repositoryEvidence.runtimeInventory;
  const currentConsumerFiles = new Set(inventory.currentMatches.map((value) => value.path)).size;
  if (plan.summary.activeRuntimeConsumerFiles !== currentConsumerFiles
    || plan.summary.legacyRuntimeMatches !== inventory.legacyMatches.length
    || plan.summary.migrationSqlStatements !== 0 || plan.summary.dataMutationRows !== 0) {
    throw new Error('Alimama runtime retirement summary is inconsistent.');
  }
  return plan;
}

export function buildQianchuanAlimamaRuntimeRetirementPlan({
  generatedAt = new Date().toISOString(),
  probe,
  probeArtifact,
  probeSha256,
  runtimeInventory,
  sources,
}) {
  validateQianchuanAlimamaRuntimeReplacementReadonlyProbe(probe);
  assertPinnedMigrationReviewArtifact(probeArtifact, probeSha256, 'Alimama replacement probe');
  if (probe.summary.runtimeReplacementReady !== true) {
    throw new Error('Alimama replacement probe is not ready for a retirement recommendation.');
  }
  validateRuntimeInventoryForRetirement(runtimeInventory);
  validateSourceContracts(sources);
  const sourceEvidence = buildSourceEvidence(sources);
  const plan = {
    schemaVersion: 2,
    generatedAt,
    mode: 'offline_readonly_alimama_runtime_retirement_plan',
    policy: {
      networkAccess: false, productionWritesAuthorized: false, migrationApplyAuthorized: false,
      ledgerWritesAuthorized: false, ownerDecisionRecorded: false,
      deployAuthorized: false, arkInvoked: false,
    },
    target: { ...probe.target },
    sourceArtifacts: { probe: probeArtifact },
    currentEvidence: { ...probe.summary, latestWeek: probe.dataShapes.latestReconciliation?.weekPeriod ?? null },
    repositoryEvidence: { runtimeInventory, sources: sourceEvidence },
    recommendation: {
      recommendedOwnerDecision: 'not_applicable',
      reviewStatus: 'verified_not_applicable_candidate',
      rationale: 'The historical incremental migration belongs to a retired DWD/DWS/ADS chain; the active ODS-and-platform-to-report runtime is registered, populated, fully watermark-covered, and reconciled across every consumer-facing field.',
      ledgerAction: 'do_not_record',
      historicalExecution: false,
      historicalMigrationReplayRecommended: false,
      restoreLegacyDwdDwsAdsRecommended: false,
      ownerConfirmationRequired: true,
    },
    forwardMigration: { required: false, sqlStatements: [], dataMutationRows: 0 },
    ownerDecisionRequirements: {
      explicitRepositoryOwnerConfirmation: true,
      pinnedProbeRequired: true,
      reviewerAndReviewedAtRequired: true,
      authoritativeOverlayRegenerationRequired: true,
    },
    rollback: {
      dataRestoreRequired: false,
      legacyRuntimeRestoreRecommended: false,
      actionIfReplacementEvidenceDrifts: 'keep_owner_decision_unrecorded_and_refresh_readonly_evidence',
    },
    summary: {
      retirementRecommendationReady: true,
      activeRuntimeConsumerFiles: new Set(runtimeInventory.currentMatches.map((value) => value.path)).size,
      legacyRuntimeMatches: runtimeInventory.legacyMatches.length,
      migrationSqlStatements: 0,
      dataMutationRows: 0,
    },
  };
  return validateQianchuanAlimamaRuntimeRetirementPlan(plan);
}
