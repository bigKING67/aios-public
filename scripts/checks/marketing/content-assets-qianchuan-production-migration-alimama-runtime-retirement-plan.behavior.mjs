#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ALIMAMA_RUNTIME_FIXTURE_INVENTORY,
  ALIMAMA_RUNTIME_FIXTURE_SOURCES,
  FakeAlimamaRuntimeClient,
  alimamaAuditArtifact,
  alimamaRuntimeProbeArgs,
} from './content-assets-qianchuan-production-migration-alimama-runtime-retirement-fixtures.mjs';
import {
  formatQianchuanAlimamaRuntimeReplacementReadonlyProbe,
  parseQianchuanAlimamaRuntimeReplacementReadonlyProbeArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-replacement-readonly-probe-cli.mjs';
import {
  runQianchuanAlimamaRuntimeReplacementReadonlyProbe,
  validateQianchuanAlimamaRuntimeReplacementReadonlyProbe,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-replacement-readonly-probe.mjs';
import {
  formatQianchuanAlimamaRuntimeRetirementPlan,
  parseQianchuanAlimamaRuntimeRetirementPlanArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-plan-cli.mjs';
import {
  buildQianchuanAlimamaRuntimeRetirementPlan,
  validateQianchuanAlimamaRuntimeRetirementPlan,
} from '../../lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-plan.mjs';

function assertReadOnlyQueries(client) {
  for (const { sql } of client.queries) {
    const allowed = sql === 'BEGIN READ ONLY' || sql === 'ROLLBACK'
      || /^SET LOCAL statement_timeout = '\d+ms'$/u.test(sql)
      || /^\/\*[\s\S]*?\*\/\s*(?:SELECT|WITH)\b/iu.test(sql);
    assert.equal(allowed, true, `unexpected SQL outside read-only allowlist: ${sql}`);
    assert.doesNotMatch(sql, /\b(?:COMMIT|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|CALL|COPY|MERGE)\b/iu);
  }
}

const client = new FakeAlimamaRuntimeClient();
const probe = await runQianchuanAlimamaRuntimeReplacementReadonlyProbe(
  alimamaRuntimeProbeArgs(client),
);
assert.equal(validateQianchuanAlimamaRuntimeReplacementReadonlyProbe(probe), probe);
assert.equal(probe.schemaVersion, 2);
assert.equal(probe.summary.runtimeReplacementReady, true);
assert.equal(probe.summary.legacyRelationsPresent, 0);
assert.equal(probe.summary.latestContractMismatchRows, 0);
assert.equal(probe.summary.watermarkCoversInputs, true);
assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
assertReadOnlyQueries(client);
assert.throws(() => validateQianchuanAlimamaRuntimeReplacementReadonlyProbe({
  ...probe, schemaVersion: 1,
}), /policy or target/);
const reconciliationSql = client.queries.find(({ sql }) => sql.includes('latest_reconciliation'))?.sql ?? '';
for (const field of [
  'curr_cart_count', 'curr_pay_buyer_count', 'curr_wangwang_consult_count',
  'curr_member_join_count', 'curr_new_buyer_count', 'curr_coupon_claim_count',
  'curr_total_favorite_cart_count', 'curr_click_to_cart_rate', 'curr_cart_to_pay_rate',
  'curr_avg_order_value', 'curr_roi', 'curr_avg_click_cost', 'curr_cpm',
  'curr_click_conversion_rate', 'gmv_delta_contribution_rate',
]) assert.match(reconciliationSql, new RegExp(`\\b${field}\\b`, 'u'));
assert.match(reconciliationSql, /ads\.report_all_trade_week_platform/u);

for (const blockedClient of [
  new FakeAlimamaRuntimeClient({ legacyPresent: true }),
  new FakeAlimamaRuntimeClient({ mismatchRows: 1 }),
  new FakeAlimamaRuntimeClient({ staleSourceWatermark: true }),
  new FakeAlimamaRuntimeClient({ stalePlatformWatermark: true }),
]) {
  const blockedProbe = await runQianchuanAlimamaRuntimeReplacementReadonlyProbe(
    alimamaRuntimeProbeArgs(blockedClient),
  );
  assert.equal(blockedProbe.summary.runtimeReplacementReady, false);
  assert.equal(blockedClient.queries.at(-1).sql, 'ROLLBACK');
  assertReadOnlyQueries(blockedClient);
}

const failingClient = new FakeAlimamaRuntimeClient({ failOn: 'latest_reconciliation' });
await assert.rejects(
  runQianchuanAlimamaRuntimeReplacementReadonlyProbe(alimamaRuntimeProbeArgs(failingClient)),
  /fixture query failure/,
);
assert.equal(failingClient.queries.at(-1).sql, 'ROLLBACK');

const probeText = formatQianchuanAlimamaRuntimeReplacementReadonlyProbe(probe, {
  path: '/tmp/alimama-probe.json', bytes: 2000, sha256: 'a'.repeat(64),
});
assert.match(probeText, /watermark_source\/platform\/inputs=true\/true\/true/);
assert.match(probeText, /latest_active_week=.* rows=13\/13 missing=0 extra=0 contract_mismatch=0/);
assert.doesNotMatch(probeText, /DATABASE_URL|CREATE PROCEDURE/);
assert.deepEqual(parseQianchuanAlimamaRuntimeReplacementReadonlyProbeArgs([
  '--p1', '/tmp/p1.json', `--p1-sha256=${'a'.repeat(64)}`,
  '--p1d-probe', '/tmp/p1d.json', `--p1d-probe-sha256=${'b'.repeat(64)}`,
  '--output', '/tmp/alimama-probe.json',
]), {
  help: false, outputPath: '/tmp/alimama-probe.json', p1Path: '/tmp/p1.json',
  p1Sha256: 'a'.repeat(64), p1dProbePath: '/tmp/p1d.json', p1dProbeSha256: 'b'.repeat(64),
});

const sources = ALIMAMA_RUNTIME_FIXTURE_SOURCES;
const runtimeInventory = ALIMAMA_RUNTIME_FIXTURE_INVENTORY;
assert.equal(runtimeInventory.legacyMatches.length, 0);
const probeArtifact = alimamaAuditArtifact(probe, '/tmp/alimama-runtime-replacement-probe.json');
const plan = buildQianchuanAlimamaRuntimeRetirementPlan({
  generatedAt: '2026-07-25T09:30:00.000Z', probe, probeArtifact,
  probeSha256: probeArtifact.sha256, runtimeInventory, sources,
});
assert.equal(validateQianchuanAlimamaRuntimeRetirementPlan(plan), plan);
assert.equal(plan.schemaVersion, 2);
assert.equal(plan.recommendation.recommendedOwnerDecision, 'not_applicable');
assert.equal(plan.recommendation.historicalMigrationReplayRecommended, false);
assert.equal(plan.forwardMigration.required, false);
assert.deepEqual(plan.forwardMigration.sqlStatements, []);
assert.equal(plan.recommendation.ledgerAction, 'do_not_record');

const planText = formatQianchuanAlimamaRuntimeRetirementPlan(plan, {
  path: '/tmp/alimama-plan.json', bytes: 4000, sha256: 'c'.repeat(64),
});
assert.match(planText, /owner_decision=not_applicable/);
assert.match(planText, /migration_sql=0 data_mutation_rows=0 ledger=do_not_record/);
assert.doesNotMatch(planText, /DATABASE_URL|SELECT |CREATE |DROP /);

const driftedSources = { ...sources, backendConsumer: `${sources.backendConsumer}\n// drift` };
driftedSources.backendConsumer = driftedSources.backendConsumer.replace('report_taobao_one_goods_traffic_channel_metric_week', 'missing_report_table');
assert.throws(() => buildQianchuanAlimamaRuntimeRetirementPlan({
  probe, probeArtifact, probeSha256: probeArtifact.sha256, runtimeInventory, sources: driftedSources,
}), /required contract/);
const mismatchProbe = await runQianchuanAlimamaRuntimeReplacementReadonlyProbe(
  alimamaRuntimeProbeArgs(new FakeAlimamaRuntimeClient({ mismatchRows: 1 })),
);
assert.throws(() => buildQianchuanAlimamaRuntimeRetirementPlan({
  probe: mismatchProbe,
  probeArtifact, probeSha256: probeArtifact.sha256, runtimeInventory, sources,
}), /not ready/);

assert.deepEqual(parseQianchuanAlimamaRuntimeRetirementPlanArgs([
  '--probe', '/tmp/alimama-probe.json', `--probe-sha256=${'d'.repeat(64)}`,
  '--output', '/tmp/alimama-plan.json',
]), {
  help: false, outputPath: '/tmp/alimama-plan.json',
  probePath: '/tmp/alimama-probe.json', probeSha256: 'd'.repeat(64),
});
for (const option of ['--apply', '--deploy', '--execute', '--json', '--repair', '--write-ledger']) {
  assert.throws(() => parseQianchuanAlimamaRuntimeReplacementReadonlyProbeArgs([option]), /not supported/);
  assert.throws(() => parseQianchuanAlimamaRuntimeRetirementPlanArgs([option]), /not supported/);
}

const liveCommandSource = readFileSync(new URL('./content-assets-qianchuan-production-migration-alimama-runtime-replacement-readonly-probe.mjs', import.meta.url), 'utf8');
const offlineCommandSource = readFileSync(new URL('./content-assets-qianchuan-production-migration-alimama-runtime-retirement-plan.mjs', import.meta.url), 'utf8');
assert.match(liveCommandSource, /from 'pg'|from "pg"/);
assert.match(liveCommandSource, /AIOS_QC_ALLOW_LIVE_READONLY/);
assert.doesNotMatch(offlineCommandSource, /from ['"]pg['"]|DATABASE_URL|AIOS_QC_ALLOW_LIVE_READONLY/);

console.log('[qianchuan-alimama-runtime-retirement-plan-behavior] passed');
