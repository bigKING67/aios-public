#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  parseQianchuanProductionMigrationP1dReadonlyProbeArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-readonly-probe-cli.mjs';
import {
  QIANCHUAN_P1D_LINEAGE_FAMILIES,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-lineage.mjs';
import {
  runQianchuanProductionMigrationP1dReadonlyProbe,
  validateQianchuanProductionMigrationP1dReadonlyProbe,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1d-readonly-probe.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const lineageEntries = QIANCHUAN_P1D_LINEAGE_FAMILIES.flatMap((family) => (
  family.entries.map((entry) => ({
    namespace: 'warehouse',
    version: entry.version,
    checksum: sha256(entry.version),
    relativePath: `etl/groland_postgres/sql/migrations/${entry.version}__fixture.sql`,
    source: { bytes: 1, path: `${entry.version}.sql`, sha256: sha256(entry.version) },
    authoritativeClassification: 'unknown',
    schemaEvidenceState: 'schema_effects_absent',
    executionEvidenceState: 'unknown',
    ledgerEvidenceState: 'ledger_missing',
    effects: { current: 1, satisfied: 0, unsatisfied: 1, superseded: 0 },
    unsupportedSignals: ['dml_or_backfill'],
    currentReviewWaveLabel: 'P1D',
    lineageFamily: family.family,
    lineageState: family.lineageState,
    requiredEvidence: [...family.requiredEvidence],
    review: {
      decision: null,
      evidenceLinks: [],
      notes: null,
      reviewedAt: null,
      reviewer: null,
    },
  }))
));
const lineage = {
  schemaVersion: 1,
  generatedAt: '2026-07-24T07:10:00.000Z',
  mode: 'offline_readonly_p1d_lineage_packet',
  sourceArtifacts: {
    manifest: { path: '/tmp/manifest.json', bytes: 1, sha256: 'a'.repeat(64) },
    p1: { path: '/tmp/p1.json', bytes: 1, sha256: 'b'.repeat(64) },
  },
  policy: {
    authoritativeClassificationUnchanged: true,
    deployAuthorized: false,
    humanReviewerRequired: true,
    ledgerWritesAuthorized: false,
    networkAccess: false,
    ownerDecisionRecorded: false,
    productionWritesAuthorized: false,
    sourceChecksumsVerified: true,
  },
  summary: {
    entries: lineageEntries.length,
    families: QIANCHUAN_P1D_LINEAGE_FAMILIES.length,
    sourceChecksumsVerified: lineageEntries.length,
    relatedMigrationChecksumsVerified: 10,
    runtimeFilesVerified: 3,
    byFamily: {},
    byLineageState: {},
    byUnsupportedSignal: {},
  },
  families: QIANCHUAN_P1D_LINEAGE_FAMILIES.map((family) => ({
    family: family.family,
    label: family.label,
    lineageState: family.lineageState,
    requiredEvidence: [...family.requiredEvidence],
    count: family.entries.length,
    entries: family.entries.map((entry) => `warehouse/${entry.version}`),
    relatedMigrations: [],
    runtimeFiles: [],
  })),
  entries: lineageEntries,
};
const lineageContent = `${JSON.stringify(lineage, null, 2)}\n`;
const lineageArtifact = {
  path: '/tmp/p1d-lineage.json',
  bytes: Buffer.byteLength(lineageContent),
  sha256: sha256(lineageContent),
};

const presentRelations = new Set([
  'ods.taobao_one_alimama_goods_marketingscenario',
  'ads.report_taobao_goods_traffic_channel_metrics_week',
  'ads.influencer_live_detail',
  'ads.douyin_shortvideo_detail',
  'etl.douyin_shortvideo_detail_refresh_state',
  'ads.influencer_library',
  'ods.qianchuan_material_daily_report_raw',
  'dwd.marketing_content_ad_material_stats_di',
  'ads.douyin_trade_sale_card',
  'ads.douyin_trade_sale_card_detail',
  'ads.marketing_content_platform_videos',
  'ads.marketing_content_ad_materials',
]);
const routineDefinitions = new Map([
  ['ads.refresh_report_taobao_goods_traffic_channel_metrics_week(date,date)', 'ads.report_taobao_goods_traffic_channel_metrics_week traffic_channel'],
  ['ads.refresh_creator_live_trade_daily(date,date)', 'ads.influencer_live_detail live_refund_order_count'],
  ['ads.refresh_douyin_shortvideo_detail(date,date)', 'ads.douyin_shortvideo_detail qianchuan_material_day'],
  ['ads.refresh_douyin_shortvideo_detail_incremental(integer,boolean)', 'refresh_douyin_shortvideo_detail'],
]);
const presentConstraints = new Set([
  'ads.report_taobao_goods_traffic_channel_metrics_week.chk_taobao_goods_traffic_channel_metrics_week_channel',
  'ads.influencer_live_detail.chk_influencer_live_detail_non_negative',
]);
const presentIndexes = new Map([
  ['ads.idx_douyin_shortvideo_detail_mapping_status', 'ads.douyin_shortvideo_detail'],
  ['ads.idx_douyin_shortvideo_detail_qianchuan_material_key', 'ads.douyin_shortvideo_detail'],
  ['ads.idx_ads_mc_platform_video_identity_active', 'ads.marketing_content_platform_videos'],
  ['ads.idx_marketing_content_platform_videos_video_active', 'ads.marketing_content_platform_videos'],
]);
const presentTriggers = new Set([
  'ads.douyin_shortvideo_detail.trg_touch_douyin_shortvideo_detail_updated_at',
]);

class FakeClient {
  constructor({ failOn = null } = {}) {
    this.failOn = failOn;
    this.queries = [];
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params });
    if (this.failOn && sql.includes(this.failOn)) throw new Error('fixture query failure');
    if (sql === 'BEGIN READ ONLY' || sql.startsWith('SET LOCAL') || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('aios_qianchuan_p1d:relations')) {
      return { rows: params[0].map((qualifiedName) => ({
        qualified_name: qualifiedName,
        oid: presentRelations.has(qualifiedName) ? '1' : null,
        relation_kind: presentRelations.has(qualifiedName) ? 'r' : null,
        total_bytes: presentRelations.has(qualifiedName) ? '8192' : null,
        estimated_rows: presentRelations.has(qualifiedName) ? '1' : null,
      })) };
    }
    if (sql.includes('aios_qianchuan_p1d:routines')) {
      return { rows: params[0].map((signature) => ({
        signature,
        oid: routineDefinitions.has(signature) ? '1' : null,
        routine_kind: routineDefinitions.has(signature) ? 'p' : null,
        definition: routineDefinitions.get(signature) ?? null,
      })) };
    }
    if (sql.includes('aios_qianchuan_p1d:constraints')) {
      return { rows: params[0].map((qualifiedName) => ({
        qualified_name: qualifiedName,
        oid: presentConstraints.has(qualifiedName) ? '1' : null,
        definition: presentConstraints.has(qualifiedName) ? 'CHECK fixture' : null,
      })) };
    }
    if (sql.includes('aios_qianchuan_p1d:indexes')) {
      return { rows: params[0].map((qualifiedName) => ({
        qualified_name: qualifiedName,
        oid: presentIndexes.has(qualifiedName) ? '1' : null,
        definition: presentIndexes.has(qualifiedName) ? `INDEX ${qualifiedName}` : null,
        table_name: presentIndexes.get(qualifiedName) ?? null,
      })) };
    }
    if (sql.includes('aios_qianchuan_p1d:triggers')) {
      return { rows: params[0].map((qualifiedName) => ({
        qualified_name: qualifiedName,
        oid: presentTriggers.has(qualifiedName) ? '1' : null,
        definition: presentTriggers.has(qualifiedName) ? `TRIGGER ${qualifiedName}` : null,
        enabled: presentTriggers.has(qualifiedName) ? 'O' : null,
      })) };
    }
    if (sql.includes('aios_qianchuan_p1d:columns')) {
      return { rows: params[0].map((qualifiedName) => ({
        qualified_name: qualifiedName,
        position: '1',
        data_type: 'text',
        not_null: true,
      })) };
    }
    if (sql.includes('aios_qianchuan_p1d:alimama_shape')) {
      return { rows: [{ source_rows: '1272', min_date: '2026-01-08', max_date: '2026-07-06', max_updated_at: '2026-07-24' }] };
    }
    if (sql.includes('aios_qianchuan_p1d:report_shape')) {
      return { rows: [{ rows: '1006', min_week: '2025/12/13', max_week: '2026/7/10', traffic_channels: ['搜索', '推荐'], invalid_channel_rows: '0' }] };
    }
    if (sql.includes('aios_qianchuan_p1d:creator_shape')) {
      return { rows: [{ rows: '44', min_date: '2026-03-02', max_date: '2026-07-18', refund_nonzero_rows: '19', refund_sum: '195' }] };
    }
    if (sql.includes('aios_qianchuan_p1d:shortvideo_shape')) {
      return { rows: [{ rows: '8045', min_date: '2026-02-07', max_date: '2026-07-23', grain_counts: { trade_video_day: '7111' }, mapping_counts: { matched: '4664' } }] };
    }
    if (sql.includes('aios_qianchuan_p1d:normalization_shape')) {
      return { rows: [{ active_rows: '285', rows_with_normalized_tags: '96', mismatch_rows: '13' }] };
    }
    if (sql.includes('aios_qianchuan_p1d:qianchuan_parse_shape')) {
      return { rows: [{ raw_rows: '0', raw_min_date: null, raw_max_date: null, dwd_rows: '0', qianchuan_dwd_rows: '0' }] };
    }
    if (sql.includes('aios_qianchuan_p1d:card_ratio_shape')) {
      return { rows: [
        { shape: 'card', rows: '4577', mismatch_rows: '4576' },
        { shape: 'card_detail', rows: '6173', mismatch_rows: '5326' },
      ] };
    }
    if (sql.includes('aios_qianchuan_p1d:platform_video_shape')) {
      return { rows: [{ rows: '39', active_rows: '37', duplicate_groups: '0', duplicate_rows: '0', max_group_size: '0', archived_duplicate_markers: '0', deduped_material_markers: '0' }] };
    }
    throw new Error(`Unexpected fixture SQL: ${sql.slice(0, 100)}`);
  }
}

function assertReadOnlyQueries(client) {
  const forbidden = /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|CALL|PERFORM|COMMIT|pg_advisory_lock|baseline|apply|Ark)\b/i;
  for (const { sql } of client.queries) {
    const allowed = sql === 'BEGIN READ ONLY'
      || sql === 'ROLLBACK'
      || /^SET LOCAL statement_timeout = '\d+ms'$/.test(sql)
      || /^\/\*[\s\S]*?\*\/\s*(?:SELECT|WITH)\b/i.test(sql);
    assert.equal(allowed, true, `unexpected SQL outside the read-only allowlist: ${sql}`);
    if (sql !== 'BEGIN READ ONLY' && sql !== 'ROLLBACK') {
      assert.equal(forbidden.test(sql), false, `write-like SQL token found: ${sql}`);
    }
  }
}

const client = new FakeClient();
const result = await runQianchuanProductionMigrationP1dReadonlyProbe({
  client,
  lineage,
  lineageArtifact,
  lineageSha256: lineageArtifact.sha256,
  now: () => new Date('2026-07-24T07:20:00.000Z'),
});
assert.equal(validateQianchuanProductionMigrationP1dReadonlyProbe(result), result);
assert.equal(result.summary.entries, 8);
assert.equal(result.summary.families, 8);
assert.equal(result.summary.ownerDecisionReady, false);
assert.deepEqual(result.summary.byEvidenceState, {
  clean_current_data_without_exact_unique_guard: 1,
  missing_runtime_contract_on_dormant_data_path: 1,
  missing_runtime_contract_with_data_drift: 2,
  replacement_catalog_and_localized_data_observed: 1,
  replacement_catalog_and_multigrain_data_observed: 1,
  replacement_catalog_and_refund_data_observed: 1,
  source_data_present_without_old_or_replacement_runtime: 1,
});
assert.equal(result.dataShapes.normalization.mismatchRows, '13');
assert.equal(result.dataShapes.cardRatio.card.mismatchRows, '4576');
assert.equal(result.dataShapes.cardRatio.cardDetail.mismatchRows, '5326');
assert.equal(result.dataShapes.platformVideo.duplicateGroups, '0');
assert.ok(result.entryEvidence.every((entry) => entry.decision === null && entry.reviewer === null));
assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
assertReadOnlyQueries(client);

await assert.rejects(
  runQianchuanProductionMigrationP1dReadonlyProbe({
    client: new FakeClient(),
    lineage,
    lineageArtifact,
    lineageSha256: '0'.repeat(64),
  }),
  /lineage packet SHA-256 differs/,
);
const failingClient = new FakeClient({ failOn: 'aios_qianchuan_p1d:card_ratio_shape' });
await assert.rejects(
  runQianchuanProductionMigrationP1dReadonlyProbe({
    client: failingClient,
    lineage,
    lineageArtifact,
    lineageSha256: lineageArtifact.sha256,
  }),
  /fixture query failure/,
);
assert.equal(failingClient.queries.at(-1).sql, 'ROLLBACK');
assertReadOnlyQueries(failingClient);

assert.deepEqual(
  parseQianchuanProductionMigrationP1dReadonlyProbeArgs([
    '--lineage', '/tmp/p1d.json',
    `--lineage-sha256=${'a'.repeat(64)}`,
    '--output', '/tmp/probe.json',
    '--json',
  ]),
  {
    help: false,
    json: true,
    lineagePath: '/tmp/p1d.json',
    lineageSha256: 'a'.repeat(64),
    outputPath: '/tmp/probe.json',
  },
);
for (const option of ['--apply', '--baseline', '--deploy', '--write-ledger', '--record-decision']) {
  assert.throws(
    () => parseQianchuanProductionMigrationP1dReadonlyProbeArgs([option]),
    /Unknown qianchuan migration P1D read-only probe option/,
  );
}

console.log('[qianchuan-production-migration-p1d-readonly-probe-behavior] OK: exact P1D topology, data-shape evidence, null decisions, transaction rollback, and write denial passed.');
