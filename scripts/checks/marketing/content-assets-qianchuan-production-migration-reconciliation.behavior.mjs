#!/usr/bin/env node

import assert from 'node:assert/strict';

import { readAiosMigrationDescriptor } from '../../lib/migrations/aios-migration-descriptor.mjs';
import { discoverAiosMigrations } from '../../lib/migrations/aios-migration-discovery.mjs';
import { analyzeAiosMigrationStaticEvidence } from '../../lib/migrations/aios-migration-reconciliation-static.mjs';
import {
  parseQianchuanProductionMigrationReconciliationArgs,
  resolveExternalReconciliationArtifactPath,
  writeQianchuanProductionMigrationReconciliationArtifact,
} from '../../lib/migrations/aios-qianchuan-production-migration-reconciliation-cli.mjs';
import {
  qianchuanProductionMigrationReconciliationExitCode,
  runQianchuanProductionMigrationReconciliation,
} from '../../lib/migrations/aios-qianchuan-production-migration-reconciliation.mjs';

const EXPECTED_MIGRATION_INVENTORY = 206;

class FakeClient {
  constructor({ failOn = null, ledgerRows = null, presence = new Map() } = {}) {
    this.failOn = failOn;
    this.ledgerRows = ledgerRows;
    this.presence = presence;
    this.queries = [];
  }

  async query(sql, params = []) {
    this.queries.push({ params, sql });
    if (this.failOn && sql.includes(this.failOn)) throw new Error('fixture query failure');
    if (sql === 'BEGIN READ ONLY' || sql.startsWith('SET LOCAL') || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('aios_migration_reconciliation:ledger_presence')) {
      return { rows: [{ present: Array.isArray(this.ledgerRows) }] };
    }
    if (sql.includes('aios_migration_reconciliation:ledger')) {
      return { rows: this.ledgerRows ?? [] };
    }
    if (sql.includes('aios_migration_reconciliation:')) {
      return {
        rows: (params[0] ?? []).map((effectKey) => ({
          effect_key: effectKey,
          present: this.presence.get(effectKey) === true,
        })),
      };
    }
    throw new Error(`Unexpected fixture SQL: ${sql.slice(0, 80)}`);
  }
}

function assertReadOnlyQueries(client) {
  const forbidden = /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|CALL|PERFORM|COMMIT|pg_advisory_lock|baseline|apply|Ark)\b/i;
  for (const { sql } of client.queries) {
    const allowed = sql === 'BEGIN READ ONLY'
      || sql === 'ROLLBACK'
      || /^SET LOCAL statement_timeout = '\d+ms'$/.test(sql)
      || /^\/\*[\s\S]*?\*\/\s*SELECT\b/i.test(sql);
    assert.equal(allowed, true, `unexpected SQL outside the read-only allowlist: ${sql}`);
    if (sql !== 'BEGIN READ ONLY' && sql !== 'ROLLBACK') {
      assert.equal(forbidden.test(sql), false, `write-like SQL token found: ${sql}`);
    }
  }
}

const descriptor = readAiosMigrationDescriptor();
const records = discoverAiosMigrations({ descriptor });
assert.equal(
  records.length,
  EXPECTED_MIGRATION_INVENTORY,
  `the production reconciliation inventory ratchet should cover ${EXPECTED_MIGRATION_INVENTORY} migrations`,
);

const staticAnalyses = analyzeAiosMigrationStaticEvidence(records);
assert.equal(staticAnalyses.length, records.length, 'static analysis must emit exactly one record per migration');
const taobaoSchemaContractStatic = staticAnalyses.find((entry) => (
  entry.namespace === 'warehouse' && entry.version === '20260806_1900'
));
assert.equal(
  taobaoSchemaContractStatic?.checksum,
  '91d6677a9e46edf28c47babaeaa343b943dca39a6e6e5f591d87c63cf96809ad',
  'the Taobao runtime schema contract migration must remain checksum-pinned in reconciliation',
);
assert.deepEqual(
  taobaoSchemaContractStatic.catalogEffects.map((effect) => effect.key),
  [
    'routine:function:ads.assert_taobao_trade_sale_goods_daily_schema_contract()',
    'routine:procedure:ads.refresh_taobao_trade_sale_goods_daily(date,date)',
    'routine:procedure:ads.refresh_taobao_trade_sale_goods_daily_incremental(integer,boolean)',
  ],
  'reconciliation must inventory the public Taobao schema assertion and guarded wrappers',
);
const reportOverviewDependencyStatic = staticAnalyses.find((entry) => (
  entry.namespace === 'warehouse' && entry.version === '20260807_1330'
));
assert.equal(
  reportOverviewDependencyStatic?.checksum,
  '9ed3d5c74acbca946d536253378a7331ce149c0a18ac12083be2f3389d746c04',
  'the report overview dependency migration must remain checksum-pinned in reconciliation',
);
assert.deepEqual(
  reportOverviewDependencyStatic.catalogEffects.map((effect) => effect.key),
  [
    'routine:function:etl.assert_all_trade_overview_source_ready(character varying,timestamp without time zone)',
    'column:etl.report_all_trade_week_platform_metrics_refresh_state.last_trade_updated_at',
    'column:etl.report_all_trade_week_platform_metrics_refresh_state.last_cost_updated_at',
    'column:etl.report_all_trade_week_platform_metrics_refresh_state.last_platform_updated_at',
    'routine:procedure:ads.refresh_report_all_trade_week_platform_metrics_incremental(integer,boolean)',
    'routine:procedure:ads.refresh_report_douyin_trade_sale_metrics_week_incremental(integer,boolean)',
  ],
  'reconciliation must inventory the report readiness function, checkpoints, and guarded procedures',
);
const targetStatic = staticAnalyses.find((entry) => (
  entry.namespace === 'warehouse' && entry.version === '20260618_1430'
));
assert.ok(targetStatic, 'target migration should be present in the static inventory');
const reportRebuildStatic = staticAnalyses.find((entry) => (
  entry.namespace === 'warehouse' && entry.version === '20260430_1200'
));
assert.deepEqual(
  reportRebuildStatic.catalogEffects
    .filter((effect) => [
      'build_all_trade_month',
      'build_all_trade_month_platform',
    ].includes(effect.name))
    .map((effect) => effect.key),
  [
    'routine:procedure:ads.build_all_trade_month(date,date)',
    'routine:procedure:ads.build_all_trade_month_platform(date,date)',
  ],
  'the report rebuild migration must identify the dropped DATE overloads exactly',
);
assert.equal(
  staticAnalyses.flatMap((entry) => entry.catalogEffects)
    .filter((effect) => effect.kind === 'routine')
    .every((effect) => typeof effect.identityArguments === 'string'),
  true,
  'every discovered routine effect must carry a probeable overload identity',
);
const weeklyCalibrationStatic = staticAnalyses.find((entry) => (
  entry.namespace === 'warehouse' && entry.version === '20260613_1730'
));
assert.equal(
  weeklyCalibrationStatic.catalogEffects.find((effect) => effect.kind === 'trigger')?.name,
  'trg_touch_all_trade_overview_refund_nowcast_calibration_weekly_',
  'catalog effects must use PostgreSQL 63-byte identifier truncation',
);
assert.equal(
  weeklyCalibrationStatic.catalogEffects.find((effect) => (
    effect.kind === 'routine'
    && effect.name.startsWith('fn_touch_all_trade_overview_refund_nowcast_calibration_weekly')
  ))?.name,
  'fn_touch_all_trade_overview_refund_nowcast_calibration_weekly_u',
  'routine keys must use the same truncated identifier stored by PostgreSQL',
);
assert.equal(
  staticAnalyses.flatMap((entry) => entry.catalogEffects).every((effect) => (
    ['name', 'relation', 'schema'].every((field) => (
      !effect[field] || Buffer.byteLength(effect[field], 'utf8') <= 63
    ))
  )),
  true,
  'all unquoted catalog identifiers must fit PostgreSQL storage semantics',
);

const presentNonTargetEffect = staticAnalyses
  .filter((entry) => entry !== targetStatic)
  .flatMap((entry) => entry.catalogEffects)
  .find((effect) => !effect.supersededBy);
assert.ok(presentNonTargetEffect, 'fixture needs one current non-target catalog effect');
const livePresence = new Map([
  [presentNonTargetEffect.key, true],
  ['relation:ads.marketing_content_asset_video_understanding_jobs', true],
  ['relation:ads.marketing_content_asset_video_understanding_results', true],
]);
const client = new FakeClient({ presence: livePresence });
const result = await runQianchuanProductionMigrationReconciliation({
  client,
  descriptor,
  now: () => new Date('2026-07-24T00:00:00.000Z'),
  records,
});
assert.equal(result.inventory.total, EXPECTED_MIGRATION_INVENTORY, 'manifest inventory should match discovery exactly');
assert.equal(result.entries.length, EXPECTED_MIGRATION_INVENTORY, 'manifest should contain all discovered migrations');
assert.equal(result.target.classification, 'partially_applied', 'target mixed postconditions should be classified as partial');
assert.equal(result.target.executionEvidenceState, 'unknown', 'partial live state must not claim original migration execution');
assert.equal(result.target.explicitEvidence.corePresent, 0, 'target core effects should be absent in the fixture');
assert.equal(result.target.explicitEvidence.overlappingPresent, 2, 'later-repair overlapping storage should remain visible');
const presentEntry = result.entries.find((entry) => (
  entry.catalogEffects.some((effect) => effect.key === presentNonTargetEffect.key)
));
assert.equal(presentEntry.classification, 'unknown', 'catalog presence alone must not prove migration execution');
assert.equal(presentEntry.reviewer, null, 'automated evidence must not impersonate a human reviewer');
assert.equal(result.reconciled, false, 'unknown entries should keep strict reconciliation incomplete');
assert.equal(qianchuanProductionMigrationReconciliationExitCode(result, false), 0, 'diagnostic audit should exit zero');
assert.equal(qianchuanProductionMigrationReconciliationExitCode(result, true), 1, 'strict audit should fail while unknown remains');
assertReadOnlyQueries(client);
assert.equal(client.queries.at(-1).sql, 'ROLLBACK', 'successful audits should roll back the read-only transaction');

const backendPrefix = records.filter((record) => record.namespace === 'backend').slice(0, 4);
const matchingLedgerPresence = new Map(livePresence);
for (const effect of staticAnalyses.find((entry) => (
  entry.namespace === 'backend' && entry.version === backendPrefix.at(-1).version
)).catalogEffects) {
  matchingLedgerPresence.set(effect.key, effect.expectedPresent);
}
const matchingLedgerClient = new FakeClient({
  ledgerRows: backendPrefix.map((record, index) => ({
    namespace: record.namespace,
    version: record.version,
    checksum: record.checksum,
    applied_at: `2026-01-0${index + 1}T00:00:00.000Z`,
  })),
  presence: matchingLedgerPresence,
});
const matchingLedgerResult = await runQianchuanProductionMigrationReconciliation({
  client: matchingLedgerClient,
  descriptor,
  records,
});
const matchingLedgerEntry = matchingLedgerResult.entries.find((entry) => (
  entry.namespace === 'backend' && entry.version === backendPrefix.at(-1).version
));
assert.equal(matchingLedgerEntry.ledgerEvidence.state, 'recorded_matching', 'fixture ledger should match the repository checksum');
assert.equal(matchingLedgerEntry.schemaEvidenceState, 'schema_effects_present', 'fixture catalog postconditions should be present');
assert.equal(matchingLedgerEntry.classification, 'unknown', 'ledger plus catalog presence still needs decisive runtime or data-shape proof');
assertReadOnlyQueries(matchingLedgerClient);

const syntheticRecords = [
  { namespace: 'backend', version: '001', checksum: 'a'.repeat(64), relativePath: '/fixture/001.sql' },
  { namespace: 'backend', version: '002', checksum: 'b'.repeat(64), relativePath: '/fixture/002.sql' },
  { namespace: 'backend', version: '003', checksum: 'c'.repeat(64), relativePath: '/fixture/003.sql' },
  { namespace: 'backend', version: '004', checksum: 'd'.repeat(64), relativePath: '/fixture/004.sql' },
];
const syntheticSql = new Map([
  ['/fixture/001.sql', 'CREATE TABLE ads.superseded_table (id BIGINT);'],
  ['/fixture/002.sql', "CREATE OR REPLACE FUNCTION ads.safe_probe() RETURNS VOID AS $$ BEGIN EXECUTE 'DROP TABLE ads.decoy'; END $$ LANGUAGE plpgsql;"],
  ['/fixture/003.sql', 'DROP TABLE IF EXISTS ads.superseded_table; ALTER TABLE ads.current_table RENAME TO renamed_table; WITH source AS (SELECT 1 AS id) UPDATE ads.current_table SET id = source.id FROM source;'],
  ['/fixture/004.sql', `
    DROP PROCEDURE IF EXISTS ads.build_all_trade_month(DATE, DATE);
    CREATE OR REPLACE PROCEDURE ads.build_all_trade_month(
      IN p_month_period VARCHAR(16) DEFAULT NULL
    ) LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
  `],
]);
const synthetic = analyzeAiosMigrationStaticEvidence(syntheticRecords, {
  readFile: (filePath) => syntheticSql.get(filePath),
});
assert.equal(
  synthetic[1].catalogEffects.some((effect) => effect.key.includes('decoy')),
  false,
  'dynamic SQL inside a routine body must not emit catalog effects',
);
assert.ok(synthetic[1].unsupportedSignals.includes('dynamic_sql'), 'dynamic SQL should require manual proof');
assert.ok(synthetic[2].unsupportedSignals.includes('rename'), 'rename should remain explicitly unprobeable');
assert.ok(synthetic[2].unsupportedSignals.includes('dml_or_backfill'), 'CTE backfills should require manual proof');
assert.equal(
  synthetic[0].catalogEffects.find((effect) => effect.key === 'relation:ads.superseded_table')?.supersededBy,
  '003',
  'later effects should supersede older object postconditions',
);

const dependencyRecords = [
  { namespace: 'warehouse', version: '001', checksum: '1'.repeat(64), relativePath: '/dependency/001.sql' },
  { namespace: 'warehouse', version: '002', checksum: '2'.repeat(64), relativePath: '/dependency/002.sql' },
  { namespace: 'warehouse', version: '003', checksum: '3'.repeat(64), relativePath: '/dependency/003.sql' },
  { namespace: 'warehouse', version: '004', checksum: '4'.repeat(64), relativePath: '/dependency/004.sql' },
  { namespace: 'warehouse', version: '005', checksum: '5'.repeat(64), relativePath: '/dependency/005.sql' },
  { namespace: 'warehouse', version: '006', checksum: '6'.repeat(64), relativePath: '/dependency/006.sql' },
  { namespace: 'warehouse', version: '007', checksum: '7'.repeat(64), relativePath: '/dependency/007.sql' },
];
const dependencySql = new Map([
  ['/dependency/001.sql', `
    CREATE TABLE ads.target_relation (id BIGINT);
    ALTER TABLE ads.target_relation ADD COLUMN legacy_code TEXT;
    ALTER TABLE ads.target_relation ADD CONSTRAINT target_relation_positive CHECK (id > 0);
    CREATE INDEX shared_relation_idx ON ads.target_relation(id);
    CREATE TRIGGER target_relation_touch BEFORE UPDATE ON ads.target_relation
      FOR EACH ROW EXECUTE FUNCTION ads.touch();
    CREATE TABLE reporting.other_relation (id BIGINT);
    CREATE INDEX shared_relation_idx ON reporting.other_relation(id);
    ALTER TABLE reporting.other_relation ADD COLUMN retained_code TEXT;
    CREATE TABLE ads.view_decoy_relation (id BIGINT);
    CREATE INDEX view_decoy_idx ON ads.view_decoy_relation(id);
  `],
  ['/dependency/002.sql', `
    CREATE TABLE ads.create_only_relation (id BIGINT);
    ALTER TABLE ads.create_only_relation ADD COLUMN retained_code TEXT;
    CREATE INDEX create_only_idx ON ads.create_only_relation(id);
    CREATE TRIGGER create_only_touch BEFORE UPDATE ON ads.create_only_relation
      FOR EACH ROW EXECUTE FUNCTION ads.touch();
  `],
  ['/dependency/003.sql', `
    DO $$ BEGIN EXECUTE 'DROP TABLE ads.create_only_relation'; END $$;
    SELECT 'DROP TABLE ads.create_only_relation';
    -- DROP TABLE ads.create_only_relation;
  `],
  ['/dependency/004.sql', 'DROP TABLE IF EXISTS ads.target_relation;'],
  ['/dependency/005.sql', 'DROP TABLE IF EXISTS ads.unrelated_relation;'],
  ['/dependency/006.sql', 'CREATE TABLE IF NOT EXISTS ads.create_only_relation (id BIGINT);'],
  ['/dependency/007.sql', 'DROP VIEW IF EXISTS ads.view_decoy_relation;'],
]);
const dependencyRecordsSnapshot = structuredClone(dependencyRecords);
const dependencyAnalyses = analyzeAiosMigrationStaticEvidence(dependencyRecords, {
  readFile: (filePath) => dependencySql.get(filePath),
});
const repeatedDependencyAnalyses = analyzeAiosMigrationStaticEvidence(dependencyRecords, {
  readFile: (filePath) => dependencySql.get(filePath),
});
assert.deepEqual(dependencyRecords, dependencyRecordsSnapshot, 'static analysis must not mutate source records');
assert.deepEqual(
  repeatedDependencyAnalyses,
  dependencyAnalyses,
  'static dependency supersession must remain deterministic',
);
assert.deepEqual(
  dependencyAnalyses[0].catalogEffects.map((effect) => effect.key),
  [
    'relation:ads.target_relation',
    'column:ads.target_relation.legacy_code',
    'constraint:ads.target_relation.target_relation_positive',
    'index:ads.shared_relation_idx',
    'trigger:ads.target_relation.target_relation_touch',
    'relation:reporting.other_relation',
    'index:reporting.shared_relation_idx',
    'column:reporting.other_relation.retained_code',
    'relation:ads.view_decoy_relation',
    'index:ads.view_decoy_idx',
  ],
  'catalog effects must preserve statement order while annotating supersession',
);
const targetDependentEffects = dependencyAnalyses[0].catalogEffects.filter((effect) => (
  ['column', 'constraint', 'index', 'trigger'].includes(effect.kind)
  && effect.relation === 'target_relation'
));
assert.deepEqual(
  targetDependentEffects.map((effect) => ({
    key: effect.key,
    relation: effect.relation,
    supersededBy: effect.supersededBy,
  })),
  [
    {
      key: 'column:ads.target_relation.legacy_code',
      relation: 'target_relation',
      supersededBy: '004',
    },
    {
      key: 'constraint:ads.target_relation.target_relation_positive',
      relation: 'target_relation',
      supersededBy: '004',
    },
    {
      key: 'index:ads.shared_relation_idx',
      relation: 'target_relation',
      supersededBy: '004',
    },
    {
      key: 'trigger:ads.target_relation.target_relation_touch',
      relation: 'target_relation',
      supersededBy: '004',
    },
  ],
  'an explicit later relation drop should supersede exact dependent postconditions',
);
assert.equal(
  dependencyAnalyses[0].catalogEffects.find((effect) => (
    effect.key === 'index:reporting.shared_relation_idx'
  ))?.supersededBy,
  null,
  'the same index name on another relation must not inherit an unrelated drop',
);
assert.equal(
  dependencyAnalyses[0].catalogEffects.find((effect) => (
    effect.key === 'column:reporting.other_relation.retained_code'
  ))?.supersededBy,
  null,
  'dropping another relation must not supersede unrelated dependent effects',
);
assert.equal(
  dependencyAnalyses[0].catalogEffects.find((effect) => (
    effect.key === 'index:ads.view_decoy_idx'
  ))?.supersededBy,
  null,
  'DROP VIEW must not stand in for unparsed table rename or replacement lineage',
);
assert.equal(
  dependencyAnalyses[1].catalogEffects.find((effect) => (
    effect.key === 'column:ads.create_only_relation.retained_code'
  ))?.supersededBy,
  null,
  'a later relation create must not erase older dependent postconditions',
);
assert.equal(
  dependencyAnalyses[1].catalogEffects.find((effect) => (
    effect.key === 'index:ads.create_only_idx'
  ))?.supersededBy,
  null,
  'dynamic SQL and string or comment decoys must not propagate relation supersession',
);
assert.equal(dependencyAnalyses[2].catalogEffects.length, 0, 'masked decoys must not emit catalog effects');
assert.ok(dependencyAnalyses[2].unsupportedSignals.includes('dynamic_sql'), 'dynamic SQL decoys still require manual proof');
assert.deepEqual(
  synthetic[3].catalogEffects.map((effect) => ({
    expectedPresent: effect.expectedPresent,
    identityArguments: effect.identityArguments,
    key: effect.key,
  })),
  [
    {
      expectedPresent: false,
      identityArguments: 'date,date',
      key: 'routine:procedure:ads.build_all_trade_month(date,date)',
    },
    {
      expectedPresent: true,
      identityArguments: 'character varying',
      key: 'routine:procedure:ads.build_all_trade_month(character varying)',
    },
  ],
  'routine effects must preserve overload identity and canonicalize type aliases',
);

const routineProbeClient = new FakeClient();
await runQianchuanProductionMigrationReconciliation({
  client: routineProbeClient,
  descriptor,
  readFile: (filePath) => syntheticSql.get(filePath),
  records: syntheticRecords,
}).catch(() => {});
const routineProbe = routineProbeClient.queries.find(({ sql }) => (
  sql.includes('aios_migration_reconciliation:routines')
));
assert.ok(routineProbe, 'routine catalog effects should use the exact-signature probe');
assert.match(routineProbe.sql, /to_regprocedure/, 'routine probes should resolve exact overload identities');
assert.deepEqual(
  routineProbe.params[4],
  ['', 'character varying', 'date,date'],
  'routine probes should pass canonical identity arguments separately from object names',
);

const failingClient = new FakeClient({
  failOn: 'aios_migration_reconciliation:relations',
  presence: livePresence,
});
await assert.rejects(
  runQianchuanProductionMigrationReconciliation({ client: failingClient, descriptor, records }),
  /fixture query failure/,
  'query failures should propagate',
);
assert.equal(failingClient.queries.at(-1).sql, 'ROLLBACK', 'query failures should still roll back');
assertReadOnlyQueries(failingClient);

assert.deepEqual(
  parseQianchuanProductionMigrationReconciliationArgs([
    '--json', '--output=/tmp/aios-reconciliation.json', '--require-reconciled',
  ]),
  {
    help: false,
    json: true,
    outputPath: '/tmp/aios-reconciliation.json',
    requireReconciled: true,
  },
  'CLI arguments should parse deterministically',
);
assert.throws(
  () => parseQianchuanProductionMigrationReconciliationArgs(['--apply']),
  /Unknown qianchuan migration reconciliation option/,
  'write-like CLI options should fail closed',
);
assert.throws(
  () => resolveExternalReconciliationArtifactPath('relative.json'),
  /must be absolute/,
  'artifact output should require an absolute path',
);
assert.throws(
  () => resolveExternalReconciliationArtifactPath(`${process.cwd()}/tracked.json`),
  /outside the repository/,
  'artifact output should reject repository paths',
);
let writtenArtifact;
const artifact = writeQianchuanProductionMigrationReconciliationArtifact(
  result,
  '/tmp/aios-qianchuan-reconciliation-fixture.json',
  {
    writeFile: (filePath, content, options) => {
      writtenArtifact = { content, filePath, options };
    },
  },
);
assert.equal(writtenArtifact.options.flag, 'wx', 'artifact writes must not overwrite existing files');
assert.equal(artifact.bytes, Buffer.byteLength(writtenArtifact.content), 'artifact byte count should match content');
assert.match(artifact.sha256, /^[a-f0-9]{64}$/, 'artifact should report a SHA-256');
assert.equal(JSON.stringify(result).includes('postgres://'), false, 'manifest should not contain a database URL');

console.log(`[qianchuan-production-migration-reconciliation-behavior] OK: ${EXPECTED_MIGRATION_INVENTORY} inventory, conservative classification, supersession, SQL safety, rollback, CLI, and artifact fixtures passed.`);
