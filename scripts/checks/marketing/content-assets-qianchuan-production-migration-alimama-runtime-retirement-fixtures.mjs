import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  ALIMAMA_INCREMENTAL_TARGET,
  ALIMAMA_LEGACY_RELATIONS,
  ALIMAMA_REPLACEMENT_RELATIONS,
  ALIMAMA_REPLACEMENT_ROUTINES,
  runQianchuanAlimamaRuntimeReplacementReadonlyProbe,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-replacement-readonly-probe.mjs';
import {
  scanQianchuanAlimamaRuntimeConsumers,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-inventory.mjs';
import {
  ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS,
  buildQianchuanAlimamaRuntimeRetirementPlan,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-plan.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function alimamaAuditArtifact(value, artifactPath) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  return { path: artifactPath, bytes: Buffer.byteLength(content), sha256: sha256(content) };
}

export const ALIMAMA_RUNTIME_FIXTURE_P1 = Object.freeze({
  mode: 'offline_readonly_reviewed_p1_overlay',
  policy: { productionWritesAuthorized: false, ledgerWritesAuthorized: false },
  summary: { byWave: { P1D: 4 } },
  entries: [{
    namespace: 'warehouse',
    version: '20260212_1600',
    relativePath: ALIMAMA_INCREMENTAL_TARGET.relativePath,
    checksum: ALIMAMA_INCREMENTAL_TARGET.checksum,
    authoritativeClassification: 'unknown',
    reviewWaveLabel: 'P1D',
    review: { decision: null, reviewer: null },
    effects: {
      satisfied: 0,
      unsatisfied: 1,
      unsatisfiedCurrentEffects: [{
        key: 'relation:etl.alimama_goods_marketing_di_refresh_state',
        present: false,
        expectedPresent: true,
      }],
    },
  }],
});
export const ALIMAMA_RUNTIME_FIXTURE_P1_ARTIFACT = alimamaAuditArtifact(
  ALIMAMA_RUNTIME_FIXTURE_P1,
  '/tmp/alimama-reviewed-p1.json',
);

export const ALIMAMA_RUNTIME_FIXTURE_P1D_PROBE = Object.freeze({
  mode: 'live_readonly_p1d_catalog_data_shape_probe',
  policy: {
    productionWritesAuthorized: false,
    ledgerWritesAuthorized: false,
    ownerDecisionRecorded: false,
    deployAuthorized: false,
    arkInvoked: false,
  },
  entryEvidence: [{
    family: 'alimama_incremental_rename',
    entries: [ALIMAMA_INCREMENTAL_TARGET.identity],
    evidenceState: 'source_data_present_without_old_or_replacement_runtime',
    decision: null,
    reviewer: null,
  }],
  dataShapes: { alimama: { sourceRows: '1272' } },
});
export const ALIMAMA_RUNTIME_FIXTURE_P1D_PROBE_ARTIFACT = alimamaAuditArtifact(
  ALIMAMA_RUNTIME_FIXTURE_P1D_PROBE,
  '/tmp/alimama-p1d-probe.json',
);

function baseDefinition() {
  return `CREATE PROCEDURE ads.refresh_report_taobao_one_goods_traffic_channel_metric_week(date,date)
  AS 'SELECT * FROM ods.taobao_one_alimama_goods_marketingscenario;
  SELECT * FROM ads.report_all_trade_week_platform;
  INSERT INTO ads.report_taobao_one_goods_traffic_channel_metric_week';`;
}

function incrementalDefinition() {
  return `CREATE PROCEDURE ads.refresh_report_taobao_one_goods_traffic_channel_metric_week_incremental(integer,boolean)
  AS 'SELECT * FROM ods.taobao_one_alimama_goods_marketingscenario;
  SELECT * FROM ads.report_all_trade_week_platform;
  SELECT * FROM etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_state;
  CALL ads.refresh_report_taobao_one_goods_traffic_channel_metric_week(NULL,NULL)';`;
}

export class FakeAlimamaRuntimeClient {
  constructor({
    failOn = null,
    legacyPresent = false,
    mismatchRows = 0,
    stalePlatformWatermark = false,
    staleSourceWatermark = false,
  } = {}) {
    Object.assign(this, {
      failOn,
      legacyPresent,
      mismatchRows,
      stalePlatformWatermark,
      staleSourceWatermark,
    });
    this.queries = [];
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params });
    if (this.failOn && sql.includes(this.failOn)) throw new Error('fixture query failure');
    if (sql === 'BEGIN READ ONLY' || sql.startsWith('SET LOCAL') || sql === 'ROLLBACK') {
      return { rows: [] };
    }
    if (sql.includes('alimama_runtime_replacement:relations')) {
      return { rows: params[0].map((identity) => {
        const present = ALIMAMA_REPLACEMENT_RELATIONS.includes(identity)
          || (this.legacyPresent && identity === ALIMAMA_LEGACY_RELATIONS[0]);
        return {
          identity,
          oid: present ? '42' : null,
          relation_kind: present ? 'r' : null,
          total_bytes: present ? '65536' : null,
          granted_locks: present ? '1' : '0',
          waiting_locks: '0',
        };
      }) };
    }
    if (sql.includes('alimama_runtime_replacement:routines')) {
      return { rows: params[0].map((signature) => {
        const present = ALIMAMA_REPLACEMENT_ROUTINES.includes(signature);
        const definition = signature === ALIMAMA_REPLACEMENT_ROUTINES[0]
          ? baseDefinition()
          : signature === ALIMAMA_REPLACEMENT_ROUTINES[1] ? incrementalDefinition() : null;
        return {
          signature,
          oid: present ? '84' : null,
          routine_kind: present ? 'p' : null,
          definition,
        };
      }) };
    }
    if (sql.includes('alimama_runtime_replacement:source_shape')) {
      return { rows: [{
        rows: '1272',
        min_date: '2026-01-08',
        max_date: '2026-07-06',
        max_updated_at: '2026-07-25 10:17:30',
      }] };
    }
    if (sql.includes('alimama_runtime_replacement:platform_shape')) {
      return { rows: [{
        rows: '28',
        weeks: '28',
        min_as_of_date: '2026-01-09',
        max_as_of_date: '2026-07-17',
        max_updated_at: '2026-07-25 10:20:00',
      }] };
    }
    if (sql.includes('alimama_runtime_replacement:report_shape')) {
      return { rows: [{
        rows: '210',
        weeks: '28',
        products: '17',
        min_as_of_date: '2026-01-09',
        max_as_of_date: '2026-07-17',
        max_updated_at: '2026-07-25 10:48:00',
      }] };
    }
    if (sql.includes('alimama_runtime_replacement:state_shape')) {
      return { rows: [{
        rows: '1',
        last_source_updated_at: '2026-07-25 10:29:59',
        last_refresh_at: '2026-07-25 10:48:00',
        last_refresh_start_date: '2026-07-04',
        last_refresh_end_date: '2026-07-17',
        updated_at: '2026-07-25 10:48:00',
        watermark_covers_source: !this.staleSourceWatermark,
        watermark_covers_platform: !this.stalePlatformWatermark,
        watermark_covers_inputs: !this.staleSourceWatermark && !this.stalePlatformWatermark,
      }] };
    }
    if (sql.includes('alimama_runtime_replacement:latest_reconciliation')) {
      return { rows: [{
        week_period: '2026/7/11~2026/7/17',
        as_of_date: '2026-07-17',
        observed_days: '7',
        platform_updated_at: '2026-07-25 10:20:00',
        expected_rows: '13',
        actual_rows: '13',
        missing_rows: '0',
        extra_rows: '0',
        contract_mismatch_rows: String(this.mismatchRows),
      }] };
    }
    throw new Error(`Unexpected fixture SQL: ${sql.slice(0, 120)}`);
  }
}

export function alimamaRuntimeProbeArgs(client, overrides = {}) {
  return {
    client,
    now: () => new Date('2026-07-25T09:00:00.000Z'),
    p1Packet: ALIMAMA_RUNTIME_FIXTURE_P1,
    p1Artifact: ALIMAMA_RUNTIME_FIXTURE_P1_ARTIFACT,
    p1Sha256: ALIMAMA_RUNTIME_FIXTURE_P1_ARTIFACT.sha256,
    p1dProbe: ALIMAMA_RUNTIME_FIXTURE_P1D_PROBE,
    p1dProbeArtifact: ALIMAMA_RUNTIME_FIXTURE_P1D_PROBE_ARTIFACT,
    p1dProbeSha256: ALIMAMA_RUNTIME_FIXTURE_P1D_PROBE_ARTIFACT.sha256,
    ...overrides,
  };
}

export const ALIMAMA_RUNTIME_FIXTURE_SOURCES = Object.freeze(Object.fromEntries(
  Object.entries(ALIMAMA_RUNTIME_RETIREMENT_SOURCE_PATHS).map(([key, sourcePath]) => [
    key,
    readFileSync(sourcePath, 'utf8'),
  ]),
));
export const ALIMAMA_RUNTIME_FIXTURE_INVENTORY = Object.freeze(
  scanQianchuanAlimamaRuntimeConsumers(),
);

export async function buildReadyAlimamaRuntimeRetirementFixture() {
  const client = new FakeAlimamaRuntimeClient();
  const probe = await runQianchuanAlimamaRuntimeReplacementReadonlyProbe(
    alimamaRuntimeProbeArgs(client),
  );
  const probeArtifact = alimamaAuditArtifact(
    probe,
    '/tmp/alimama-runtime-replacement-probe.json',
  );
  const plan = buildQianchuanAlimamaRuntimeRetirementPlan({
    generatedAt: '2026-07-25T09:30:00.000Z',
    probe,
    probeArtifact,
    probeSha256: probeArtifact.sha256,
    runtimeInventory: ALIMAMA_RUNTIME_FIXTURE_INVENTORY,
    sources: ALIMAMA_RUNTIME_FIXTURE_SOURCES,
  });
  const planArtifact = alimamaAuditArtifact(plan, '/tmp/alimama-runtime-retirement-plan.json');
  return { client, probe, probeArtifact, plan, planArtifact };
}
