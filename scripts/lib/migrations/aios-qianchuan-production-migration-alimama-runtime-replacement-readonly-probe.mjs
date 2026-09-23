import { createHash } from 'node:crypto';

import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import { withAiosReadOnlyTransaction } from './aios-readonly-audit.mjs';

export const ALIMAMA_INCREMENTAL_TARGET = Object.freeze({
  checksum: '092938c17614ae5ac464eb77a35828714bda5440b1b46a6b38256f56994c2d9c',
  identity: 'warehouse/20260212_1600',
  relativePath: 'etl/groland_postgres/sql/migrations/20260212_1600__add_incremental_refresh_for_dwd_alimama_goods_marketing_di.sql',
});

export const ALIMAMA_LEGACY_RELATIONS = Object.freeze([
  'etl.alimama_goods_marketing_di_refresh_state',
  'etl.taobao_alimama_goods_marketingscene_refresh_state',
  'dwd.dwd_alimama_goods_marketing_di',
  'dwd.taobao_alimama_goods_marketingscene',
  'dws.taobao_alimama_goods_marketingscene_week',
  'etl.taobao_alimama_goods_marketingscene_week_refresh_state',
  'dws.taobao_alimama_goods_marketingscene_month',
  'etl.taobao_alimama_goods_marketingscene_month_refresh_state',
  'ads.taobao_alimama_goods_marketingscene_attribution_week',
  'etl.taobao_alimama_goods_marketingscene_attribution_week_refresh_state',
  'ads.taobao_alimama_goods_marketingscene_attribution_month',
  'etl.taobao_alimama_marketingscene_attr_month_refresh_state',
]);
export const ALIMAMA_REPLACEMENT_RELATIONS = Object.freeze([
  'ods.taobao_one_alimama_goods_marketingscenario',
  'ads.report_all_trade_week_platform',
  'ads.report_taobao_one_goods_traffic_channel_metric_week',
  'etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_state',
]);
export const ALIMAMA_LEGACY_ROUTINES = Object.freeze([
  'dwd.refresh_dwd_alimama_goods_marketing_di(date,date)',
  'dwd.refresh_dwd_alimama_goods_marketing_di_incremental(integer,boolean)',
  'dwd.refresh_taobao_alimama_goods_marketingscene(date,date)',
  'dwd.refresh_taobao_alimama_goods_marketingscene_incremental(integer,boolean)',
  'dws.refresh_taobao_alimama_goods_marketingscene_week(date,date)',
  'dws.refresh_taobao_alimama_goods_marketingscene_week_incremental(integer,boolean)',
  'dws.refresh_taobao_alimama_goods_marketingscene_month(date,date)',
  'dws.refresh_taobao_alimama_goods_marketingscene_month_incremental(integer,boolean)',
  'ads.refresh_taobao_alimama_goods_marketingscene_attribution_week(date,date)',
  'ads.refresh_taobao_alimama_goods_marketingscene_attribution_week_incremental(integer,boolean)',
  'ads.refresh_taobao_alimama_goods_marketingscene_attribution_month(date,date)',
  'ads.refresh_taobao_alimama_goods_marketingscene_attr_month_incr(integer,boolean)',
]);
export const ALIMAMA_REPLACEMENT_ROUTINES = Object.freeze([
  'ads.refresh_report_taobao_one_goods_traffic_channel_metric_week(date,date)',
  'ads.refresh_report_taobao_one_goods_traffic_channel_metric_week_incremental(integer,boolean)',
]);

const RELATIONS_SQL = `/* aios_qianchuan_alimama_runtime_replacement:relations */
SELECT requested.identity,
  relation.oid::TEXT AS oid,
  relation.relkind::TEXT AS relation_kind,
  CASE WHEN relation.oid IS NULL THEN NULL ELSE pg_total_relation_size(relation.oid)::TEXT END AS total_bytes,
  COALESCE(locks.granted_locks, 0)::TEXT AS granted_locks,
  COALESCE(locks.waiting_locks, 0)::TEXT AS waiting_locks
FROM unnest($1::TEXT[]) WITH ORDINALITY AS requested(identity, position)
LEFT JOIN pg_class relation ON relation.oid = to_regclass(requested.identity)
LEFT JOIN LATERAL (
  SELECT COUNT(*) FILTER (WHERE lock.granted)::BIGINT AS granted_locks,
    COUNT(*) FILTER (WHERE NOT lock.granted)::BIGINT AS waiting_locks
  FROM pg_locks lock WHERE lock.relation = relation.oid
) locks ON TRUE
ORDER BY requested.position`;

const ROUTINES_SQL = `/* aios_qianchuan_alimama_runtime_replacement:routines */
SELECT requested.signature,
  routine.oid::TEXT AS oid,
  routine.prokind::TEXT AS routine_kind,
  CASE WHEN routine.oid IS NULL THEN NULL ELSE pg_get_functiondef(routine.oid) END AS definition
FROM unnest($1::TEXT[]) WITH ORDINALITY AS requested(signature, position)
LEFT JOIN pg_proc routine ON routine.oid = to_regprocedure(requested.signature)
ORDER BY requested.position`;

const SOURCE_SQL = `/* aios_qianchuan_alimama_runtime_replacement:source_shape */
SELECT COUNT(*)::TEXT AS rows, MIN(stat_date)::TEXT AS min_date,
  MAX(stat_date)::TEXT AS max_date,
  MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01'))::TEXT AS max_updated_at
FROM ods.taobao_one_alimama_goods_marketingscenario`;

const PLATFORM_SQL = `/* aios_qianchuan_alimama_runtime_replacement:platform_shape */
SELECT COUNT(*)::TEXT AS rows, COUNT(DISTINCT week_period)::TEXT AS weeks,
  MIN(as_of_date)::TEXT AS min_as_of_date, MAX(as_of_date)::TEXT AS max_as_of_date,
  MAX(COALESCE(updated_at, TIMESTAMP '1970-01-01'))::TEXT AS max_updated_at
FROM ads.report_all_trade_week_platform
WHERE platform = 'taobao'`;

const REPORT_SQL = `/* aios_qianchuan_alimama_runtime_replacement:report_shape */
SELECT COUNT(*)::TEXT AS rows, COUNT(DISTINCT week_period)::TEXT AS weeks,
  COUNT(DISTINCT product_id)::TEXT AS products, MIN(as_of_date)::TEXT AS min_as_of_date,
  MAX(as_of_date)::TEXT AS max_as_of_date, MAX(updated_at)::TEXT AS max_updated_at
FROM ads.report_taobao_one_goods_traffic_channel_metric_week`;

const STATE_SQL = `/* aios_qianchuan_alimama_runtime_replacement:state_shape */
WITH source AS (
  SELECT MAX(COALESCE(updated_at, created_at, TIMESTAMP '1970-01-01')) AS max_updated_at
  FROM ods.taobao_one_alimama_goods_marketingscenario
), platform AS (
  SELECT MAX(COALESCE(updated_at, TIMESTAMP '1970-01-01')) AS max_updated_at
  FROM ads.report_all_trade_week_platform WHERE platform = 'taobao'
)
SELECT COUNT(*)::TEXT AS rows, MAX(last_source_updated_at)::TEXT AS last_source_updated_at,
  MAX(last_refresh_at)::TEXT AS last_refresh_at,
  MAX(last_refresh_start_date)::TEXT AS last_refresh_start_date,
  MAX(last_refresh_end_date)::TEXT AS last_refresh_end_date,
  MAX(state.updated_at)::TEXT AS updated_at,
  COALESCE(MAX(last_source_updated_at) >= MAX(source.max_updated_at), FALSE) AS watermark_covers_source,
  COALESCE(MAX(last_source_updated_at) >= MAX(platform.max_updated_at), FALSE) AS watermark_covers_platform,
  COALESCE(MAX(last_source_updated_at) >= GREATEST(
    MAX(source.max_updated_at), MAX(platform.max_updated_at)
  ), FALSE) AS watermark_covers_inputs
FROM etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_state state
CROSS JOIN source
CROSS JOIN platform`;

const RECONCILIATION_SQL = `/* aios_qianchuan_alimama_runtime_replacement:latest_reconciliation */
WITH platform_candidates AS (
  SELECT week_period, as_of_date, observed_days::INTEGER AS observed_days,
    (as_of_date - (observed_days - 1))::DATE AS week_start, updated_at
  FROM ads.report_all_trade_week_platform
  WHERE platform = 'taobao' AND as_of_date IS NOT NULL AND observed_days BETWEEN 1 AND 7
), scope AS (
  SELECT candidate.*
  FROM platform_candidates candidate
  WHERE EXISTS (
    SELECT 1 FROM ods.taobao_one_alimama_goods_marketingscenario src
    WHERE src.stat_date BETWEEN candidate.week_start - 7 AND candidate.as_of_date
      AND (COALESCE(src.total_gmv, 0) <> 0 OR COALESCE(src.cost, 0) <> 0
        OR COALESCE(src.impression_count, 0) <> 0 OR COALESCE(src.click_count, 0) <> 0)
  )
  ORDER BY candidate.as_of_date DESC, candidate.week_period DESC LIMIT 1
), source_agg AS (
  SELECT scope.week_period, scope.as_of_date, scope.observed_days, scope.updated_at AS platform_updated_at,
    src.product_id,
    COALESCE(
      MAX(CASE WHEN src.stat_date BETWEEN scope.week_start AND scope.as_of_date
        AND NULLIF(BTRIM(src.subject_name), '') IS NOT NULL THEN BTRIM(src.subject_name) END),
      MAX(CASE WHEN src.stat_date BETWEEN scope.week_start - 7 AND scope.as_of_date - 7
        AND NULLIF(BTRIM(src.subject_name), '') IS NOT NULL THEN BTRIM(src.subject_name) END),
      '(未命名商品)'
    )::VARCHAR(500) AS product_name,
    CASE WHEN src.scene ILIKE '%关键词%' THEN '关键词推广'
      WHEN src.scene ILIKE '%搜索%' THEN '搜索'
      WHEN src.scene ILIKE '%人群%' THEN '人群推广'
      WHEN src.scene ILIKE '%场景%' THEN '场景推广'
      WHEN src.scene ILIKE '%推荐%' OR src.scene ILIKE '%全站%' THEN '推荐'
      ELSE '其他' END::TEXT AS traffic_channel,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start AND scope.as_of_date THEN COALESCE(src.impression_count, 0) ELSE 0 END)::BIGINT AS curr_impression_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start - 7 AND scope.as_of_date - 7 THEN COALESCE(src.impression_count, 0) ELSE 0 END)::BIGINT AS prev_impression_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start AND scope.as_of_date THEN COALESCE(src.click_count, 0) ELSE 0 END)::BIGINT AS curr_click_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start - 7 AND scope.as_of_date - 7 THEN COALESCE(src.click_count, 0) ELSE 0 END)::BIGINT AS prev_click_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start AND scope.as_of_date THEN COALESCE(src.total_gmv, 0) ELSE 0 END)::NUMERIC(18, 2) AS curr_pay_amount,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start - 7 AND scope.as_of_date - 7 THEN COALESCE(src.total_gmv, 0) ELSE 0 END)::NUMERIC(18, 2) AS prev_pay_amount,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start AND scope.as_of_date THEN COALESCE(src.cost, 0) ELSE 0 END)::NUMERIC(18, 2) AS curr_cost,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start - 7 AND scope.as_of_date - 7 THEN COALESCE(src.cost, 0) ELSE 0 END)::NUMERIC(18, 2) AS prev_cost,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start AND scope.as_of_date THEN COALESCE(src.total_cart_count, 0) ELSE 0 END)::BIGINT AS curr_cart_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start - 7 AND scope.as_of_date - 7 THEN COALESCE(src.total_cart_count, 0) ELSE 0 END)::BIGINT AS prev_cart_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start AND scope.as_of_date THEN COALESCE(src.buyer_count, 0) ELSE 0 END)::BIGINT AS curr_pay_buyer_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start - 7 AND scope.as_of_date - 7 THEN COALESCE(src.buyer_count, 0) ELSE 0 END)::BIGINT AS prev_pay_buyer_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start AND scope.as_of_date THEN COALESCE(src.wangwang_consult_count, 0) ELSE 0 END)::BIGINT AS curr_wangwang_consult_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start - 7 AND scope.as_of_date - 7 THEN COALESCE(src.wangwang_consult_count, 0) ELSE 0 END)::BIGINT AS prev_wangwang_consult_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start AND scope.as_of_date THEN COALESCE(src.member_join_count, 0) ELSE 0 END)::BIGINT AS curr_member_join_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start - 7 AND scope.as_of_date - 7 THEN COALESCE(src.member_join_count, 0) ELSE 0 END)::BIGINT AS prev_member_join_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start AND scope.as_of_date THEN COALESCE(src.new_buyer_count, 0) ELSE 0 END)::BIGINT AS curr_new_buyer_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start - 7 AND scope.as_of_date - 7 THEN COALESCE(src.new_buyer_count, 0) ELSE 0 END)::BIGINT AS prev_new_buyer_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start AND scope.as_of_date THEN COALESCE(src.coupon_claim_count, 0) ELSE 0 END)::BIGINT AS curr_coupon_claim_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start - 7 AND scope.as_of_date - 7 THEN COALESCE(src.coupon_claim_count, 0) ELSE 0 END)::BIGINT AS prev_coupon_claim_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start AND scope.as_of_date THEN COALESCE(src.total_favorite_cart_count, 0) ELSE 0 END)::BIGINT AS curr_total_favorite_cart_count,
    SUM(CASE WHEN src.stat_date BETWEEN scope.week_start - 7 AND scope.as_of_date - 7 THEN COALESCE(src.total_favorite_cart_count, 0) ELSE 0 END)::BIGINT AS prev_total_favorite_cart_count
  FROM ods.taobao_one_alimama_goods_marketingscenario src CROSS JOIN scope
  WHERE src.stat_date BETWEEN scope.week_start - 7 AND scope.as_of_date
  GROUP BY scope.week_period, scope.as_of_date, scope.observed_days, scope.updated_at,
    src.product_id, traffic_channel
), enriched AS (
  SELECT source_agg.*,
    (curr_pay_amount - prev_pay_amount)::NUMERIC(18, 2) AS gmv_delta,
    (curr_cost - prev_cost)::NUMERIC(18, 2) AS cost_delta,
    CASE WHEN curr_impression_count > 0 THEN ROUND(curr_click_count::NUMERIC / curr_impression_count, 6) END AS curr_ctr,
    CASE WHEN prev_impression_count > 0 THEN ROUND(prev_click_count::NUMERIC / prev_impression_count, 6) END AS prev_ctr,
    CASE WHEN curr_click_count > 0 THEN ROUND(curr_cart_count::NUMERIC / curr_click_count, 6) END AS curr_click_to_cart_rate,
    CASE WHEN prev_click_count > 0 THEN ROUND(prev_cart_count::NUMERIC / prev_click_count, 6) END AS prev_click_to_cart_rate,
    CASE WHEN curr_cart_count > 0 THEN ROUND(curr_pay_buyer_count::NUMERIC / curr_cart_count, 6) END AS curr_cart_to_pay_rate,
    CASE WHEN prev_cart_count > 0 THEN ROUND(prev_pay_buyer_count::NUMERIC / prev_cart_count, 6) END AS prev_cart_to_pay_rate,
    CASE WHEN curr_pay_buyer_count > 0 THEN ROUND(curr_pay_amount / curr_pay_buyer_count, 2) END AS curr_avg_order_value,
    CASE WHEN prev_pay_buyer_count > 0 THEN ROUND(prev_pay_amount / prev_pay_buyer_count, 2) END AS prev_avg_order_value,
    CASE WHEN curr_cost > 0 THEN ROUND(curr_pay_amount / curr_cost, 6) END AS curr_roi,
    CASE WHEN prev_cost > 0 THEN ROUND(prev_pay_amount / prev_cost, 6) END AS prev_roi,
    CASE WHEN curr_click_count > 0 THEN ROUND(curr_cost / curr_click_count, 2) END AS curr_avg_click_cost,
    CASE WHEN prev_click_count > 0 THEN ROUND(prev_cost / prev_click_count, 2) END AS prev_avg_click_cost,
    CASE WHEN curr_impression_count > 0 THEN ROUND(curr_cost * 1000 / curr_impression_count, 2) END AS curr_cpm,
    CASE WHEN prev_impression_count > 0 THEN ROUND(prev_cost * 1000 / prev_impression_count, 2) END AS prev_cpm,
    CASE WHEN curr_click_count > 0 THEN ROUND(curr_pay_buyer_count::NUMERIC / curr_click_count, 6) END AS curr_click_conversion_rate,
    CASE WHEN prev_click_count > 0 THEN ROUND(prev_pay_buyer_count::NUMERIC / prev_click_count, 6) END AS prev_click_conversion_rate
  FROM source_agg
), expected_base AS (
  SELECT * FROM enriched WHERE curr_pay_amount <> 0 OR prev_pay_amount <> 0
    OR curr_cost <> 0 OR prev_cost <> 0 OR curr_impression_count <> 0
    OR prev_impression_count <> 0 OR curr_click_count <> 0 OR prev_click_count <> 0
), expected AS (
  SELECT expected_base.*,
    CASE WHEN SUM(gmv_delta) OVER (PARTITION BY week_period) <> 0
      THEN ROUND(gmv_delta / SUM(gmv_delta) OVER (PARTITION BY week_period), 4) END AS gmv_delta_contribution_rate
  FROM expected_base
), actual AS (
  SELECT report.* FROM ads.report_taobao_one_goods_traffic_channel_metric_week report
  JOIN scope ON scope.week_period = report.week_period WHERE report.platform = 'taobao'
), compared AS (
  SELECT expected.week_period IS NOT NULL AS expected_present,
    actual.week_period IS NOT NULL AS actual_present,
    expected.week_period IS NOT NULL AND actual.week_period IS NOT NULL AND ROW(
      expected.product_name, expected.as_of_date, expected.observed_days,
      expected.curr_impression_count, expected.prev_impression_count,
      expected.curr_click_count, expected.prev_click_count,
      expected.curr_cart_count, expected.prev_cart_count,
      expected.curr_pay_buyer_count, expected.prev_pay_buyer_count,
      expected.curr_pay_amount, expected.prev_pay_amount, expected.gmv_delta,
      expected.gmv_delta_contribution_rate, expected.curr_cost, expected.prev_cost,
      expected.cost_delta, expected.curr_ctr, expected.prev_ctr,
      expected.curr_click_to_cart_rate, expected.prev_click_to_cart_rate,
      expected.curr_cart_to_pay_rate, expected.prev_cart_to_pay_rate,
      expected.curr_avg_order_value, expected.prev_avg_order_value,
      expected.curr_roi, expected.prev_roi,
      expected.curr_avg_click_cost, expected.prev_avg_click_cost,
      expected.curr_cpm, expected.prev_cpm,
      expected.curr_click_conversion_rate, expected.prev_click_conversion_rate,
      expected.curr_wangwang_consult_count, expected.prev_wangwang_consult_count,
      expected.curr_member_join_count, expected.prev_member_join_count,
      expected.curr_new_buyer_count, expected.prev_new_buyer_count,
      expected.curr_coupon_claim_count, expected.prev_coupon_claim_count,
      expected.curr_total_favorite_cart_count, expected.prev_total_favorite_cart_count
    ) IS DISTINCT FROM ROW(
      actual.product_name, actual.as_of_date, actual.observed_days,
      actual.curr_impression_count, actual.prev_impression_count,
      actual.curr_click_count, actual.prev_click_count,
      actual.curr_cart_count, actual.prev_cart_count,
      actual.curr_pay_buyer_count, actual.prev_pay_buyer_count,
      actual.curr_pay_amount, actual.prev_pay_amount, actual.gmv_delta,
      actual.gmv_delta_contribution_rate, actual.curr_cost, actual.prev_cost,
      actual.cost_delta, actual.curr_ctr, actual.prev_ctr,
      actual.curr_click_to_cart_rate, actual.prev_click_to_cart_rate,
      actual.curr_cart_to_pay_rate, actual.prev_cart_to_pay_rate,
      actual.curr_avg_order_value, actual.prev_avg_order_value,
      actual.curr_roi, actual.prev_roi,
      actual.curr_avg_click_cost, actual.prev_avg_click_cost,
      actual.curr_cpm, actual.prev_cpm,
      actual.curr_click_conversion_rate, actual.prev_click_conversion_rate,
      actual.curr_wangwang_consult_count, actual.prev_wangwang_consult_count,
      actual.curr_member_join_count, actual.prev_member_join_count,
      actual.curr_new_buyer_count, actual.prev_new_buyer_count,
      actual.curr_coupon_claim_count, actual.prev_coupon_claim_count,
      actual.curr_total_favorite_cart_count, actual.prev_total_favorite_cart_count
    ) AS contract_mismatch
  FROM expected FULL OUTER JOIN actual USING (product_id, traffic_channel)
)
SELECT (SELECT week_period FROM scope) AS week_period,
  (SELECT as_of_date::TEXT FROM scope) AS as_of_date,
  (SELECT observed_days::TEXT FROM scope) AS observed_days,
  (SELECT updated_at::TEXT FROM scope) AS platform_updated_at,
  COUNT(*) FILTER (WHERE expected_present)::TEXT AS expected_rows,
  COUNT(*) FILTER (WHERE actual_present)::TEXT AS actual_rows,
  COUNT(*) FILTER (WHERE expected_present AND NOT actual_present)::TEXT AS missing_rows,
  COUNT(*) FILTER (WHERE NOT expected_present AND actual_present)::TEXT AS extra_rows,
  COUNT(*) FILTER (WHERE contract_mismatch)::TEXT AS contract_mismatch_rows
FROM compared`;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function camelRow(row) {
  return Object.fromEntries(Object.entries(row ?? {}).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase()), value,
  ]));
}

function asCount(value, label) {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${label} must be a non-negative safe integer.`);
  return count;
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO-8601 UTC timestamp.`);
}

function validateSources(p1Packet, p1Artifact, p1Sha256, p1dProbe, p1dProbeArtifact, p1dProbeSha256) {
  assertPinnedMigrationReviewArtifact(p1Artifact, p1Sha256, 'Reviewed P1 overlay');
  assertPinnedMigrationReviewArtifact(p1dProbeArtifact, p1dProbeSha256, 'P1D owner-review probe');
  const entry = p1Packet?.entries?.find((value) => `${value.namespace}/${value.version}` === ALIMAMA_INCREMENTAL_TARGET.identity);
  const missingEffect = entry?.effects?.unsatisfiedCurrentEffects?.[0];
  if (p1Packet?.mode !== 'offline_readonly_reviewed_p1_overlay'
    || p1Packet.policy?.productionWritesAuthorized !== false
    || p1Packet.policy?.ledgerWritesAuthorized !== false || p1Packet.summary?.byWave?.P1D !== 4
    || !entry || entry.checksum !== ALIMAMA_INCREMENTAL_TARGET.checksum
    || entry.relativePath !== ALIMAMA_INCREMENTAL_TARGET.relativePath
    || entry.authoritativeClassification !== 'unknown' || entry.reviewWaveLabel !== 'P1D'
    || entry.review?.decision !== null || entry.review?.reviewer !== null
    || entry.effects?.satisfied !== 0 || entry.effects?.unsatisfied !== 1
    || missingEffect?.key !== 'relation:etl.alimama_goods_marketing_di_refresh_state'
    || missingEffect?.present !== false || missingEffect?.expectedPresent !== true) {
    throw new Error('Reviewed P1 overlay no longer matches the unresolved Alimama boundary.');
  }
  const family = p1dProbe?.entryEvidence?.find((value) => value.family === 'alimama_incremental_rename');
  if ((p1dProbe?.mode !== 'live_readonly_p1d_owner_review_probe'
      && p1dProbe?.mode !== 'live_readonly_p1d_catalog_data_shape_probe')
    || p1dProbe.policy?.productionWritesAuthorized !== false
    || p1dProbe.policy?.ledgerWritesAuthorized !== false
    || p1dProbe.policy?.ownerDecisionRecorded !== false
    || p1dProbe.policy?.deployAuthorized !== false || p1dProbe.policy?.arkInvoked !== false
    || !family || family.evidenceState !== 'source_data_present_without_old_or_replacement_runtime'
    || family.decision !== null || family.reviewer !== null
    || JSON.stringify(family.entries) !== JSON.stringify([ALIMAMA_INCREMENTAL_TARGET.identity])
    || asCount(p1dProbe.dataShapes?.alimama?.sourceRows, 'Prior Alimama source rows') < 1) {
    throw new Error('Pinned P1D evidence no longer matches the unresolved Alimama runtime boundary.');
  }
}

function routineEvidence(row) {
  const definition = row?.definition ?? null;
  return {
    signature: row?.signature,
    present: row?.oid != null,
    routineKind: row?.routine_kind ?? null,
    definitionBytes: definition == null ? null : Buffer.byteLength(definition),
    definitionSha256: definition == null ? null : sha256(definition),
    definitionNeedles: definition == null ? {} : {
      source: definition.includes('ods.taobao_one_alimama_goods_marketingscenario'),
      platform: definition.includes('ads.report_all_trade_week_platform'),
      target: definition.includes('ads.report_taobao_one_goods_traffic_channel_metric_week'),
      state: definition.includes('etl.report_taobao_one_goods_traffic_channel_metric_week_refresh_state'),
      baseCall: definition.includes('refresh_report_taobao_one_goods_traffic_channel_metric_week('),
    },
  };
}

function currentRoutineContractsReady(routines) {
  const bySignature = new Map(routines.map((value) => [value.signature, value]));
  const base = bySignature.get(ALIMAMA_REPLACEMENT_ROUTINES[0]);
  const incremental = bySignature.get(ALIMAMA_REPLACEMENT_ROUTINES[1]);
  return base?.present === true && base.routineKind === 'p'
    && base.definitionNeedles?.source === true && base.definitionNeedles?.platform === true
    && base.definitionNeedles?.target === true
    && incremental?.present === true && incremental.routineKind === 'p'
    && incremental.definitionNeedles?.source === true && incremental.definitionNeedles?.platform === true
    && incremental.definitionNeedles?.state === true
    && incremental.definitionNeedles?.baseCall === true;
}

function buildSummary(catalog, dataShapes) {
  const legacyRelations = catalog.relations.filter((value) => ALIMAMA_LEGACY_RELATIONS.includes(value.identity));
  const replacementRelations = catalog.relations.filter((value) => ALIMAMA_REPLACEMENT_RELATIONS.includes(value.identity));
  const legacyRoutines = catalog.routines.filter((value) => ALIMAMA_LEGACY_ROUTINES.includes(value.signature));
  const replacementRoutines = catalog.routines.filter((value) => ALIMAMA_REPLACEMENT_ROUTINES.includes(value.signature));
  const reconciliation = dataShapes.latestReconciliation ?? {};
  const summary = {
    legacyRelationsPresent: legacyRelations.filter((value) => value.present).length,
    replacementRelationsPresent: replacementRelations.filter((value) => value.present).length,
    legacyRoutinesPresent: legacyRoutines.filter((value) => value.present).length,
    replacementRoutinesPresent: replacementRoutines.filter((value) => value.present).length,
    waitingLocks: catalog.relations.reduce((sum, value) => sum + asCount(value.waitingLocks, 'Waiting locks'), 0),
    sourceRows: asCount(dataShapes.source?.rows ?? 0, 'Source rows'),
    platformRows: asCount(dataShapes.platform?.rows ?? 0, 'Platform rows'),
    reportRows: asCount(dataShapes.report?.rows ?? 0, 'Report rows'),
    stateRows: asCount(dataShapes.state?.rows ?? 0, 'State rows'),
    latestExpectedRows: asCount(reconciliation.expectedRows ?? 0, 'Latest expected rows'),
    latestActualRows: asCount(reconciliation.actualRows ?? 0, 'Latest actual rows'),
    latestMissingRows: asCount(reconciliation.missingRows ?? 0, 'Latest missing rows'),
    latestExtraRows: asCount(reconciliation.extraRows ?? 0, 'Latest extra rows'),
    latestContractMismatchRows: asCount(reconciliation.contractMismatchRows ?? 0, 'Latest contract mismatch rows'),
    watermarkCoversSource: dataShapes.state?.watermarkCoversSource === true,
    watermarkCoversPlatform: dataShapes.state?.watermarkCoversPlatform === true,
    watermarkCoversInputs: dataShapes.state?.watermarkCoversInputs === true,
    currentRoutineContractsReady: currentRoutineContractsReady(replacementRoutines),
  };
  summary.runtimeReplacementReady = summary.legacyRelationsPresent === 0
    && summary.legacyRoutinesPresent === 0
    && summary.replacementRelationsPresent === ALIMAMA_REPLACEMENT_RELATIONS.length
    && summary.replacementRoutinesPresent === ALIMAMA_REPLACEMENT_ROUTINES.length
    && summary.waitingLocks === 0 && summary.sourceRows > 0 && summary.platformRows > 0
    && summary.reportRows > 0 && summary.stateRows === 1 && summary.watermarkCoversInputs
    && summary.currentRoutineContractsReady && summary.latestExpectedRows > 0
    && summary.latestExpectedRows === summary.latestActualRows
    && summary.latestMissingRows === 0 && summary.latestExtraRows === 0
    && summary.latestContractMismatchRows === 0;
  return summary;
}

export function validateQianchuanAlimamaRuntimeReplacementReadonlyProbe(probe) {
  assertIsoTimestamp(probe?.generatedAt, 'Alimama runtime replacement probe generatedAt');
  if (probe?.schemaVersion !== 2 || probe.mode !== 'live_readonly_alimama_runtime_replacement_probe'
    || probe.policy?.transaction !== 'BEGIN READ ONLY / ROLLBACK'
    || !Number.isSafeInteger(probe.policy?.statementTimeoutMs)
    || probe.policy.statementTimeoutMs < 1000 || probe.policy.statementTimeoutMs > 120000
    || probe.policy?.networkAccess !== true || probe.policy?.productionWritesAuthorized !== false
    || probe.policy?.ledgerWritesAuthorized !== false || probe.policy?.ownerDecisionRecorded !== false
    || probe.policy?.deployAuthorized !== false || probe.policy?.arkInvoked !== false
    || probe.target?.identity !== ALIMAMA_INCREMENTAL_TARGET.identity
    || probe.target?.checksum !== ALIMAMA_INCREMENTAL_TARGET.checksum
    || probe.target?.relativePath !== ALIMAMA_INCREMENTAL_TARGET.relativePath) {
    throw new Error('Alimama runtime replacement probe policy or target is invalid.');
  }
  for (const [label, artifact] of Object.entries(probe.sourceArtifacts ?? {})) {
    assertPinnedMigrationReviewArtifact(artifact, artifact?.sha256, `Alimama ${label} artifact`);
  }
  if (JSON.stringify(Object.keys(probe.sourceArtifacts ?? {}).sort()) !== JSON.stringify(['p1', 'p1dProbe'])) {
    throw new Error('Alimama runtime replacement probe source artifacts are incomplete.');
  }
  const expectedRelations = [...ALIMAMA_LEGACY_RELATIONS, ...ALIMAMA_REPLACEMENT_RELATIONS];
  const expectedRoutines = [...ALIMAMA_LEGACY_ROUTINES, ...ALIMAMA_REPLACEMENT_ROUTINES];
  if (JSON.stringify(probe.catalog?.relations?.map((value) => value.identity)) !== JSON.stringify(expectedRelations)
    || JSON.stringify(probe.catalog?.routines?.map((value) => value.signature)) !== JSON.stringify(expectedRoutines)) {
    throw new Error('Alimama runtime replacement catalog evidence is incomplete.');
  }
  for (const relation of probe.catalog.relations) {
    asCount(relation.waitingLocks, `${relation.identity} waiting locks`);
    if (relation.present !== (relation.oid != null)
      || (relation.present && (typeof relation.relationKind !== 'string' || !relation.relationKind))) {
      throw new Error(`Alimama relation evidence is invalid: ${relation.identity}`);
    }
  }
  for (const routine of probe.catalog.routines) {
    if (routine.present && (routine.routineKind !== 'p'
      || !Number.isSafeInteger(routine.definitionBytes) || routine.definitionBytes < 1
      || !/^[a-f0-9]{64}$/u.test(routine.definitionSha256 ?? ''))) {
      throw new Error(`Alimama routine evidence is invalid: ${routine.signature}`);
    }
    if (!routine.present && (routine.routineKind != null || routine.definitionBytes != null
      || routine.definitionSha256 != null || Object.keys(routine.definitionNeedles ?? {}).length !== 0)) {
      throw new Error(`Absent Alimama routine has unexpected evidence: ${routine.signature}`);
    }
  }
  const expectedSummary = buildSummary(probe.catalog, probe.dataShapes);
  if (JSON.stringify(probe.summary) !== JSON.stringify(expectedSummary)) {
    throw new Error('Alimama runtime replacement summary is inconsistent.');
  }
  return probe;
}

export async function runQianchuanAlimamaRuntimeReplacementReadonlyProbe({
  client,
  now = () => new Date(),
  p1Artifact,
  p1Packet,
  p1Sha256,
  p1dProbe,
  p1dProbeArtifact,
  p1dProbeSha256,
  statementTimeoutMs = 15000,
}) {
  validateSources(p1Packet, p1Artifact, p1Sha256, p1dProbe, p1dProbeArtifact, p1dProbeSha256);
  const generatedAt = now().toISOString();
  assertIsoTimestamp(generatedAt, 'Alimama runtime replacement probe generatedAt');
  const identities = [...ALIMAMA_LEGACY_RELATIONS, ...ALIMAMA_REPLACEMENT_RELATIONS];
  const signatures = [...ALIMAMA_LEGACY_ROUTINES, ...ALIMAMA_REPLACEMENT_ROUTINES];
  const evidence = await withAiosReadOnlyTransaction(client, { statementTimeoutMs }, async () => {
    const relations = (await client.query(RELATIONS_SQL, [identities])).rows.map((row) => ({
      ...camelRow(row), present: row.oid != null,
    }));
    const routines = (await client.query(ROUTINES_SQL, [signatures])).rows.map(routineEvidence);
    const present = new Set(relations.filter((value) => value.present).map((value) => value.identity));
    const source = present.has(ALIMAMA_REPLACEMENT_RELATIONS[0])
      ? camelRow((await client.query(SOURCE_SQL)).rows[0]) : null;
    const platform = present.has(ALIMAMA_REPLACEMENT_RELATIONS[1])
      ? camelRow((await client.query(PLATFORM_SQL)).rows[0]) : null;
    const report = present.has(ALIMAMA_REPLACEMENT_RELATIONS[2])
      ? camelRow((await client.query(REPORT_SQL)).rows[0]) : null;
    const state = present.has(ALIMAMA_REPLACEMENT_RELATIONS[0])
      && present.has(ALIMAMA_REPLACEMENT_RELATIONS[1]) && present.has(ALIMAMA_REPLACEMENT_RELATIONS[3])
      ? camelRow((await client.query(STATE_SQL)).rows[0]) : null;
    const latestReconciliation = ALIMAMA_REPLACEMENT_RELATIONS.slice(0, 3).every((identity) => present.has(identity))
      ? camelRow((await client.query(RECONCILIATION_SQL)).rows[0]) : null;
    return { catalog: { relations, routines }, dataShapes: { source, platform, report, state, latestReconciliation } };
  });
  const result = {
    schemaVersion: 2,
    generatedAt,
    mode: 'live_readonly_alimama_runtime_replacement_probe',
    policy: {
      transaction: 'BEGIN READ ONLY / ROLLBACK', statementTimeoutMs, networkAccess: true,
      productionWritesAuthorized: false, ledgerWritesAuthorized: false,
      ownerDecisionRecorded: false, deployAuthorized: false, arkInvoked: false,
    },
    target: { ...ALIMAMA_INCREMENTAL_TARGET },
    sourceArtifacts: { p1: p1Artifact, p1dProbe: p1dProbeArtifact },
    ...evidence,
  };
  result.summary = buildSummary(result.catalog, result.dataShapes);
  return validateQianchuanAlimamaRuntimeReplacementReadonlyProbe(result);
}
