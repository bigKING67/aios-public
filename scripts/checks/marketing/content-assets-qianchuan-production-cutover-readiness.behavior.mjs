#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { redactMigrationText } from '../../lib/migrations/aios-migration-safety.mjs';
import {
  formatQianchuanProductionCutoverReadiness,
  parseQianchuanProductionCutoverArgs,
  qianchuanProductionCutoverExitCode,
  resolveQianchuanProductionCutoverConfig,
} from '../../lib/migrations/aios-qianchuan-production-cutover-cli.mjs';
import {
  QIANCHUAN_CUTOVER_RELATIONS,
  QIANCHUAN_CUTOVER_REQUIRED_COLUMNS,
  runQianchuanProductionCutoverReadiness,
} from '../../lib/migrations/aios-qianchuan-production-cutover-readiness.mjs';

const TARGET_CHECKSUM = 'a'.repeat(64);
const FIXTURE_DESCRIPTOR = Object.freeze({
  ledgerTable: 'public.aios_schema_migrations',
});
const FIXTURE_RECORDS = Object.freeze([{
  checksum: TARGET_CHECKSUM,
  executionMode: 'transactional',
  namespace: 'warehouse',
  relativePath: 'etl/groland_postgres/sql/migrations/20260618_1430__add_qianchuan_all_domain_material_performance.sql',
  sizeBytes: 120000,
  version: '20260618_1430',
}]);

function metricRow(overrides = {}) {
  return {
    duplicate_excess_rows: '0',
    duplicate_groups: '0',
    latest_ingest: '2026-07-24T00:00:00.000Z',
    materials: '10',
    max_date: '2026-07-22',
    max_rows_per_material_date: '1',
    min_date: '2026-04-07',
    rows: '100',
    ...overrides,
  };
}

function baseScenario() {
  return {
    aiWriteback: { assets: '12' },
    assetSummary: { latest_date: '2026-07-22', populated_assets: '25', rows: '25' },
    columnsMissing: new Set(),
    coverageRows: [
      { matched_assets: '8', matched_materials: '10', scope: 'product', source_materials: '10' },
      { matched_assets: '17', matched_materials: '20', scope: 'live', source_materials: '20' },
      { matched_assets: '25', matched_materials: '30', scope: 'combined', source_materials: '30' },
    ],
    crossSource: { material_ids: '0' },
    dwd: {
      bound_assets: '25',
      latest_date: '2026-07-22',
      live_materials: '20',
      materials: '30',
      product_materials: '10',
      rows: '300',
    },
    failOnTag: '',
    identities: {
      active_rows: '30',
      bound_assets: '25',
      distinct_material_ids: '30',
      duplicate_active_asset_material_groups: '0',
      source_rows: { manual: 5, report_import: 25 },
    },
    ledgerRows: [{
      applied_at: '2026-07-24T00:00:00.000Z',
      app_version: '2.3.388',
      checksum: TARGET_CHECKSUM,
      execution_mode: 'transactional',
      namespace: 'warehouse',
      version: '20260618_1430',
    }],
    liveAcceptanceSource: {
      anchors: '5',
      latest_ingest: '2026-07-24T00:00:00.000Z',
      max_date: '2026-07-24',
      min_date: '2025-12-07',
      rows: '50',
    },
    liveAcceptanceWarehouse: { accounts: '5', latest_date: '2026-07-24', rows: '50' },
    liveSource: metricRow({ materials: '20', rows: '200' }),
    materialSummary: { bound_assets: '25', latest_date: '2026-07-22', materials: '30', rows: '30' },
    missingRelations: new Set(),
    productSource: metricRow(),
    thinFact: { materials: '30', rows: '300' },
    videoJobs: { assets: '12', rows: '15', schema_v21_rows: '15', succeeded_rows: '14' },
    videoResults: { assets: '12', rows: '14', schema_v21_rows: '14', structured_rows: '14' },
  };
}

class FakeReadOnlyClient {
  constructor(scenario) {
    this.scenario = scenario;
    this.queries = [];
  }

  async query(sql, params = []) {
    const text = String(sql);
    this.queries.push({ params, sql: text });
    if (this.scenario.failOnTag && text.includes(this.scenario.failOnTag)) {
      throw new Error(`fixture query failure at ${this.scenario.failOnTag}`);
    }
    if (text.includes('qianchuan_cutover:relations')) {
      return {
        rows: QIANCHUAN_CUTOVER_RELATIONS.map((relationName) => ({
          relation_name: relationName,
          resolved_name: this.scenario.missingRelations.has(relationName) ? null : relationName,
        })),
      };
    }
    if (text.includes('qianchuan_cutover:columns')) {
      return {
        rows: QIANCHUAN_CUTOVER_REQUIRED_COLUMNS.map(([schema, table, column]) => ({
          column_name: column,
          present: !this.scenario.missingRelations.has(`${schema}.${table}`)
            && !this.scenario.columnsMissing.has(`${schema}.${table}.${column}`),
          table_name: table,
          table_schema: schema,
        })),
      };
    }
    if (text.includes('qianchuan_cutover:ledger')) return { rows: this.scenario.ledgerRows };
    if (text.includes('qianchuan_cutover:product_source')) return { rows: [this.scenario.productSource] };
    if (text.includes('qianchuan_cutover:live_source')) return { rows: [this.scenario.liveSource] };
    if (text.includes('qianchuan_cutover:live_acceptance_source')) {
      return { rows: [this.scenario.liveAcceptanceSource] };
    }
    if (text.includes('qianchuan_cutover:cross_source_overlap')) return { rows: [this.scenario.crossSource] };
    if (text.includes('qianchuan_cutover:identities')) return { rows: [this.scenario.identities] };
    if (text.includes('qianchuan_cutover:binding_coverage')) return { rows: this.scenario.coverageRows };
    if (text.includes('qianchuan_cutover:dwd')) return { rows: [this.scenario.dwd] };
    if (text.includes('qianchuan_cutover:material_summary')) return { rows: [this.scenario.materialSummary] };
    if (text.includes('qianchuan_cutover:asset_summary')) return { rows: [this.scenario.assetSummary] };
    if (text.includes('qianchuan_cutover:live_acceptance_warehouse')) {
      return { rows: [this.scenario.liveAcceptanceWarehouse] };
    }
    if (text.includes('qianchuan_cutover:thin_fact')) return { rows: [this.scenario.thinFact] };
    if (text.includes('qianchuan_cutover:video_jobs')) return { rows: [this.scenario.videoJobs] };
    if (text.includes('qianchuan_cutover:video_results')) return { rows: [this.scenario.videoResults] };
    if (text.includes('qianchuan_cutover:ai_writeback')) return { rows: [this.scenario.aiWriteback] };
    return { rows: [] };
  }
}

function withoutLeadingComment(sql) {
  return sql.replace(/^\s*\/\*[\s\S]*?\*\//, '').trim();
}

function assertReadOnlyQueries(assertions, client) {
  const { assertEqual, assertFalse, assertTrue } = assertions;
  const sqlStatements = client.queries.map((query) => query.sql);
  assertEqual(sqlStatements[0], 'BEGIN READ ONLY', 'audit should begin with an explicit read-only transaction');
  assertEqual(sqlStatements.at(-1), 'ROLLBACK', 'audit should always roll back its read-only transaction');
  assertTrue(
    sqlStatements.some((sql) => sql.startsWith('SET LOCAL statement_timeout = ')),
    'audit should set a transaction-local statement timeout',
  );
  for (const sql of sqlStatements) {
    const normalized = withoutLeadingComment(sql).toUpperCase();
    assertTrue(
      ['BEGIN READ ONLY', 'SET LOCAL', 'SELECT', 'WITH', 'ROLLBACK'].some((prefix) => normalized.startsWith(prefix)),
      `unexpected SQL statement in read-only audit: ${normalized.slice(0, 80)}`,
    );
    assertFalse(
      /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|CALL|PERFORM|COMMIT|GRANT|REVOKE)\b/i.test(sql),
      `read-only audit must not contain write SQL: ${normalized.slice(0, 80)}`,
    );
    assertFalse(/pg_advisory_(?:lock|unlock)|refresh_marketing_content/i.test(sql), 'audit must not lock or refresh');
  }
}

async function runScenario(overrides = {}) {
  const scenario = { ...baseScenario(), ...overrides };
  const client = new FakeReadOnlyClient(scenario);
  const result = await runQianchuanProductionCutoverReadiness({
    client,
    descriptor: FIXTURE_DESCRIPTOR,
    minimumCoveragePct: 95,
    now: () => new Date('2026-07-24T08:00:00.000Z'),
    records: FIXTURE_RECORDS,
    statementTimeoutMs: 15000,
  });
  return { client, result };
}

async function captureAsyncError(callback) {
  try {
    await callback();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const assertions = createCheckGuard('qianchuan-production-cutover-readiness-behavior');
const {
  assertDeepEqual,
  assertEqual,
  assertIncludes,
  assertNotIncludes,
  assertTrue,
  reportOk,
} = assertions;

const missingSchema = baseScenario();
missingSchema.missingRelations = new Set([
  'public.aios_schema_migrations',
  'dwd.marketing_content_qianchuan_material_performance_di',
  'dws.marketing_content_qianchuan_material_summary',
  'dws.marketing_content_asset_qianchuan_summary',
  'dws.marketing_content_qianchuan_live_room_acceptance_di',
]);
missingSchema.columnsMissing = new Set([
  'ads.marketing_content_ad_materials.delivery_mode',
  'ads.marketing_content_ad_materials.objective',
  'ads.marketing_content_ad_materials.objective_source',
  'ads.marketing_content_ad_materials.performance_source_table',
  'ads.marketing_content_ad_materials.last_performance_seen_at',
  'ads.marketing_content_ad_materials.data_quality_status',
]);
const missingRun = await runScenario(missingSchema);
assertEqual(missingRun.result.status, 'ledger_missing', 'missing ledger should remain the primary cutover blocker');
assertEqual(missingRun.result.schema.missingTargetRelations.length, 4, 'all missing warehouse relations should be reported');
assertEqual(missingRun.result.schema.missingTargetColumns.length, 6, 'all missing target identity columns should be reported');
assertReadOnlyQueries(assertions, missingRun.client);

const partialSchema = baseScenario();
partialSchema.columnsMissing = new Set([
  'dwd.marketing_content_qianchuan_material_performance_di.source_table',
]);
const partialSchemaRun = await runScenario(partialSchema);
assertEqual(
  partialSchemaRun.result.status,
  'warehouse_schema_missing',
  'a present relation with a missing required column should remain a schema blocker',
);
assertEqual(
  partialSchemaRun.result.schema.missingTargetColumns.length,
  1,
  'partial target schema drift should identify the exact missing column',
);
assertReadOnlyQueries(assertions, partialSchemaRun.client);

const missingLiveSettlementSource = baseScenario();
missingLiveSettlementSource.columnsMissing = new Set([
  'ods.douyin_qianchuan_live_video_raw.boost_settlement_roi_14d',
]);
const missingLiveSettlementSourceRun = await runScenario(missingLiveSettlementSource);
assertEqual(
  missingLiveSettlementSourceRun.result.status,
  'warehouse_schema_missing',
  'a live-video source missing a referenced settlement horizon should block refresh readiness',
);
assertDeepEqual(
  missingLiveSettlementSourceRun.result.schema.missingTargetColumns,
  ['ods.douyin_qianchuan_live_video_raw.boost_settlement_roi_14d'],
  'refresh readiness should identify the exact missing live-video source column',
);
assertReadOnlyQueries(assertions, missingLiveSettlementSourceRun.client);

const emptyRun = await runScenario({
  assetSummary: { latest_date: null, populated_assets: '0', rows: '0' },
  dwd: {
    bound_assets: '0',
    latest_date: null,
    live_materials: '0',
    materials: '0',
    product_materials: '0',
    rows: '0',
  },
  materialSummary: { bound_assets: '0', latest_date: null, materials: '0', rows: '0' },
  thinFact: { materials: '0', rows: '0' },
});
assertEqual(emptyRun.result.status, 'warehouse_unpopulated', 'empty DWD/DWS should block live validation');
assertEqual(emptyRun.result.warehouse.populated, false, 'empty DWD/DWS should not be marked populated');
assertReadOnlyQueries(assertions, emptyRun.client);

const insufficientRun = await runScenario({
  coverageRows: [
    { matched_assets: '1', matched_materials: '1', scope: 'product', source_materials: '10' },
    { matched_assets: '1', matched_materials: '1', scope: 'live', source_materials: '20' },
    { matched_assets: '2', matched_materials: '2', scope: 'combined', source_materials: '30' },
  ],
});
assertEqual(
  insufficientRun.result.status,
  'binding_coverage_insufficient',
  'populated warehouse should still fail when source-to-identity binding coverage is insufficient',
);
assertEqual(insufficientRun.result.bindings.combined.coveragePct, 6.67, 'coverage should retain two decimal precision');

const readyRun = await runScenario();
assertEqual(readyRun.result.status, 'ready_for_live_validation', 'fully populated fixture should be ready');
assertTrue(readyRun.result.ready, 'ready fixture should expose ready=true');
assertEqual(qianchuanProductionCutoverExitCode(readyRun.result, true), 0, '--require-ready should pass a ready audit');
assertEqual(
  qianchuanProductionCutoverExitCode(insufficientRun.result, true),
  1,
  '--require-ready should fail an unready audit',
);
assertEqual(qianchuanProductionCutoverExitCode(insufficientRun.result, false), 0, 'default audit should remain diagnostic');
assertReadOnlyQueries(assertions, readyRun.client);
const productSourceSql = readyRun.client.queries.find((query) => (
  query.sql.includes('qianchuan_cutover:product_source')
))?.sql ?? '';
assertIncludes(productSourceSql, 'MIN(stat_date)::TEXT', 'DATE values should stay calendar dates in JSON output');
assertIncludes(
  productSourceSql,
  'CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END',
  'non-empty source data without duplicates should report max material/date rows as one',
);

const failingScenario = baseScenario();
failingScenario.failOnTag = 'qianchuan_cutover:identities';
const failingClient = new FakeReadOnlyClient(failingScenario);
const queryFailure = await captureAsyncError(() => runQianchuanProductionCutoverReadiness({
  client: failingClient,
  descriptor: FIXTURE_DESCRIPTOR,
  records: FIXTURE_RECORDS,
}));
assertIncludes(queryFailure, 'fixture query failure', 'query failures should propagate without false success');
assertEqual(failingClient.queries.at(-1).sql, 'ROLLBACK', 'query failure should still roll back the read-only transaction');
assertReadOnlyQueries(assertions, failingClient);

assertDeepEqual(
  parseQianchuanProductionCutoverArgs(['--json', '--require-ready']),
  { help: false, json: true, requireReady: true },
  'CLI options should parse deterministically',
);
let unknownOptionError = '';
try {
  parseQianchuanProductionCutoverArgs(['--apply']);
} catch (error) {
  unknownOptionError = error instanceof Error ? error.message : String(error);
}
assertIncludes(unknownOptionError, 'Unknown qianchuan cutover audit option', 'write-like CLI options should fail closed');

let missingOptInError = '';
try {
  resolveQianchuanProductionCutoverConfig({ DATABASE_URL: 'postgres://user:secret@example.invalid/aios' });
} catch (error) {
  missingOptInError = error instanceof Error ? error.message : String(error);
}
assertIncludes(missingOptInError, 'AIOS_QC_ALLOW_LIVE_READONLY=1', 'live audit should require explicit opt-in');

const redacted = redactMigrationText(
  'failed postgres://admin:secret@example.invalid/aios?password=hunter2 token=visible',
);
assertNotIncludes(redacted, 'secret', 'database credentials should be redacted');
assertNotIncludes(redacted, 'hunter2', 'database query password should be redacted');
const formatted = formatQianchuanProductionCutoverReadiness(readyRun.result);
assertNotIncludes(formatted, 'DATABASE_URL', 'formatted audit should not mention secret environment values');
assertNotIncludes(formatted, 'postgres://', 'formatted audit should not expose a database URL');
assertIncludes(formatted, 'status=ready_for_live_validation', 'formatted audit should expose the decisive status');

reportOk('missing-ledger, empty-warehouse, binding, ready, SQL-safety, CLI, and redaction fixtures passed');
