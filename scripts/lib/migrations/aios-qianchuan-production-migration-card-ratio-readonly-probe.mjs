import { createHash } from 'node:crypto';

import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import { validateQianchuanProductionMigrationP1dReadonlyProbe } from './aios-qianchuan-production-migration-p1d-readonly-probe.mjs';
import { withAiosReadOnlyTransaction } from './aios-readonly-audit.mjs';

const TARGET_IDENTITY = 'warehouse/20260609_2045';
const TARGET_CHECKSUM = '18842495be93a8865fdcb051b0f9c6f1959b05f27c17b777e60373e897159290';

const RELATIONS = Object.freeze([
  'ads.douyin_trade_sale_card',
  'ads.douyin_trade_sale_card_detail',
  'ods.douyin_trade_sale_card_raw',
  'ods.douyin_trade_sale_card_detail_raw',
]);

const ROUTINES = Object.freeze([
  'ads.refresh_douyin_trade_sale_card(date,date)',
  'ads.refresh_douyin_trade_sale_card_detail(date,date)',
  'ads.refresh_douyin_trade_sale_card_dashboard_incremental(integer,boolean)',
  'ads.fn_recompute_douyin_trade_sale_card_ratio_fields()',
  'ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()',
]);

const EXPECTED_PRIMARY_KEYS = Object.freeze([
  Object.freeze({
    definition: 'primary key (shop_name, shop_id, date, product_id)',
    tableName: 'ads.douyin_trade_sale_card',
  }),
  Object.freeze({
    definition: 'primary key (shop_id, stat_date, product_id, source_level1)',
    tableName: 'ads.douyin_trade_sale_card_detail',
  }),
]);

const TABLE_STATS_SQL = `/* aios_qianchuan_card_ratio:table_stats */
SELECT
  requested.qualified_name,
  relation.oid::TEXT AS oid,
  relation.relkind::TEXT AS relation_kind,
  CASE WHEN relation.oid IS NULL THEN NULL ELSE pg_relation_size(relation.oid)::TEXT END AS heap_bytes,
  CASE WHEN relation.oid IS NULL THEN NULL ELSE pg_indexes_size(relation.oid)::TEXT END AS index_bytes,
  CASE WHEN relation.oid IS NULL THEN NULL ELSE pg_total_relation_size(relation.oid)::TEXT END AS total_bytes,
  stats.n_live_tup::TEXT AS estimated_live_rows,
  stats.n_dead_tup::TEXT AS estimated_dead_rows,
  stats.last_vacuum::TEXT,
  stats.last_autovacuum::TEXT,
  stats.last_analyze::TEXT,
  stats.last_autoanalyze::TEXT,
  COALESCE(locks.granted_locks, 0)::TEXT AS granted_locks,
  COALESCE(locks.waiting_locks, 0)::TEXT AS waiting_locks
FROM unnest($1::TEXT[]) WITH ORDINALITY AS requested(qualified_name, position)
LEFT JOIN pg_class relation ON relation.oid = to_regclass(requested.qualified_name)
LEFT JOIN pg_stat_user_tables stats ON stats.relid = relation.oid
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE lock.granted)::BIGINT AS granted_locks,
    COUNT(*) FILTER (WHERE NOT lock.granted)::BIGINT AS waiting_locks
  FROM pg_locks lock
  WHERE lock.relation = relation.oid
) locks ON TRUE
ORDER BY requested.position`;

const PRIMARY_KEYS_SQL = `/* aios_qianchuan_card_ratio:primary_keys */
SELECT
  namespace.nspname || '.' || relation.relname AS table_name,
  constraint_record.conname AS constraint_name,
  pg_get_constraintdef(constraint_record.oid, TRUE) AS definition
FROM pg_constraint constraint_record
JOIN pg_class relation ON relation.oid = constraint_record.conrelid
JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
WHERE constraint_record.contype = 'p'
  AND namespace.nspname || '.' || relation.relname = ANY($1::TEXT[])
ORDER BY table_name`;

const INDEXES_SQL = `/* aios_qianchuan_card_ratio:indexes */
SELECT
  table_namespace.nspname || '.' || table_relation.relname AS table_name,
  index_namespace.nspname || '.' || index_relation.relname AS index_name,
  index_record.indisunique AS is_unique,
  index_record.indisprimary AS is_primary,
  pg_relation_size(index_relation.oid)::TEXT AS index_bytes,
  pg_get_indexdef(index_relation.oid) AS definition
FROM pg_index index_record
JOIN pg_class table_relation ON table_relation.oid = index_record.indrelid
JOIN pg_namespace table_namespace ON table_namespace.oid = table_relation.relnamespace
JOIN pg_class index_relation ON index_relation.oid = index_record.indexrelid
JOIN pg_namespace index_namespace ON index_namespace.oid = index_relation.relnamespace
WHERE table_namespace.nspname || '.' || table_relation.relname = ANY($1::TEXT[])
ORDER BY table_name, index_name`;

const ROUTINES_SQL = `/* aios_qianchuan_card_ratio:routines */
SELECT
  requested.signature,
  routine.oid::TEXT AS oid,
  routine.prokind::TEXT AS routine_kind,
  CASE WHEN routine.oid IS NULL THEN NULL ELSE pg_get_functiondef(routine.oid) END AS definition
FROM unnest($1::TEXT[]) WITH ORDINALITY AS requested(signature, position)
LEFT JOIN pg_proc routine ON routine.oid = to_regprocedure(requested.signature)
ORDER BY requested.position`;

const TRIGGERS_SQL = `/* aios_qianchuan_card_ratio:triggers */
SELECT
  namespace.nspname || '.' || relation.relname AS table_name,
  trigger_record.tgname AS trigger_name,
  trigger_record.tgenabled::TEXT AS enabled,
  pg_get_triggerdef(trigger_record.oid, TRUE) AS definition
FROM pg_trigger trigger_record
JOIN pg_class relation ON relation.oid = trigger_record.tgrelid
JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
WHERE NOT trigger_record.tgisinternal
  AND namespace.nspname || '.' || relation.relname = ANY($1::TEXT[])
ORDER BY table_name, trigger_name`;

const IMPACT_SQL = `/* aios_qianchuan_card_ratio:impact */
WITH ratio_rows AS (
  SELECT
    'ads.douyin_trade_sale_card'::TEXT AS table_name,
    "date" AS stat_date,
    shop_id::TEXT,
    product_id::TEXT,
    jsonb_build_array(shop_name, shop_id, "date", product_id) AS row_key,
    jsonb_build_object(
      'card_click_rate_user', card_click_rate_user,
      'card_avg_click_per_user', card_avg_click_per_user,
      'new_customer_click_rate', new_customer_click_rate,
      'old_customer_click_rate', old_customer_click_rate,
      'card_avg_order_value', card_avg_order_value,
      'card_click_to_pay_rate_user', card_click_to_pay_rate_user,
      'first_buy_new_rate', first_buy_new_rate,
      'rebuy_old_rate', rebuy_old_rate,
      'card_exposure_to_pay_rate_user', card_exposure_to_pay_rate_user,
      'card_exposure_to_pay_rate_count', card_exposure_to_pay_rate_count,
      'card_gpm', card_gpm,
      'card_click_rate_count', card_click_rate_count,
      'card_click_to_pay_rate_count', card_click_to_pay_rate_count
    ) AS actual,
    jsonb_build_object(
      'card_click_rate_user', CASE WHEN COALESCE(card_exposure_user_count,0)>0 THEN ROUND(COALESCE(card_click_user_count,0)::NUMERIC/card_exposure_user_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_avg_click_per_user', CASE WHEN COALESCE(card_click_user_count,0)>0 THEN ROUND(COALESCE(card_click_count,0)::NUMERIC/card_click_user_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'new_customer_click_rate', CASE WHEN COALESCE(card_click_count,0)>0 THEN ROUND(COALESCE(new_customer_click_count,0)::NUMERIC/card_click_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'old_customer_click_rate', CASE WHEN COALESCE(card_click_count,0)>0 THEN ROUND(COALESCE(old_customer_click_count,0)::NUMERIC/card_click_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_avg_order_value', CASE WHEN COALESCE(card_buyer_count,0)>0 THEN ROUND(COALESCE(card_user_pay_amount,0)::NUMERIC/card_buyer_count::NUMERIC,2) ELSE NULL::NUMERIC END,
      'card_click_to_pay_rate_user', CASE WHEN COALESCE(card_click_user_count,0)>0 THEN ROUND(COALESCE(card_buyer_count,0)::NUMERIC/card_click_user_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'first_buy_new_rate', CASE WHEN COALESCE(card_buyer_count,0)>0 THEN ROUND(COALESCE(first_buy_user_count,0)::NUMERIC/card_buyer_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'rebuy_old_rate', CASE WHEN COALESCE(card_buyer_count,0)>0 THEN ROUND(COALESCE(rebuy_user_count,0)::NUMERIC/card_buyer_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_exposure_to_pay_rate_user', CASE WHEN COALESCE(card_exposure_user_count,0)>0 THEN ROUND(COALESCE(card_buyer_count,0)::NUMERIC/card_exposure_user_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_exposure_to_pay_rate_count', CASE WHEN COALESCE(card_exposure_count,0)>0 THEN ROUND(COALESCE(card_order_count,0)::NUMERIC/card_exposure_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_gpm', CASE WHEN COALESCE(card_exposure_count,0)>0 THEN ROUND(COALESCE(card_user_pay_amount,0)::NUMERIC/card_exposure_count::NUMERIC*1000,6) ELSE NULL::NUMERIC END,
      'card_click_rate_count', CASE WHEN COALESCE(card_exposure_count,0)>0 THEN ROUND(COALESCE(card_click_count,0)::NUMERIC/card_exposure_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_click_to_pay_rate_count', CASE WHEN COALESCE(card_click_count,0)>0 THEN ROUND(COALESCE(card_order_count,0)::NUMERIC/card_click_count::NUMERIC,6) ELSE NULL::NUMERIC END
    ) AS expected
  FROM ads.douyin_trade_sale_card
  UNION ALL
  SELECT
    'ods.douyin_trade_sale_card_raw', "date", shop_id::TEXT, product_id::TEXT,
    jsonb_build_array(shop_name, shop_id, "date", product_id),
    jsonb_build_object(
      'card_click_rate_user', card_click_rate_user, 'card_avg_click_per_user', card_avg_click_per_user,
      'new_customer_click_rate', new_customer_click_rate, 'old_customer_click_rate', old_customer_click_rate,
      'card_avg_order_value', card_avg_order_value, 'card_click_to_pay_rate_user', card_click_to_pay_rate_user,
      'first_buy_new_rate', first_buy_new_rate, 'rebuy_old_rate', rebuy_old_rate,
      'card_exposure_to_pay_rate_user', card_exposure_to_pay_rate_user,
      'card_exposure_to_pay_rate_count', card_exposure_to_pay_rate_count, 'card_gpm', card_gpm,
      'card_click_rate_count', card_click_rate_count, 'card_click_to_pay_rate_count', card_click_to_pay_rate_count
    ),
    jsonb_build_object(
      'card_click_rate_user', CASE WHEN COALESCE(card_exposure_user_count,0)>0 THEN ROUND(COALESCE(card_click_user_count,0)::NUMERIC/card_exposure_user_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_avg_click_per_user', CASE WHEN COALESCE(card_click_user_count,0)>0 THEN ROUND(COALESCE(card_click_count,0)::NUMERIC/card_click_user_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'new_customer_click_rate', CASE WHEN COALESCE(card_click_count,0)>0 THEN ROUND(COALESCE(new_customer_click_count,0)::NUMERIC/card_click_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'old_customer_click_rate', CASE WHEN COALESCE(card_click_count,0)>0 THEN ROUND(COALESCE(old_customer_click_count,0)::NUMERIC/card_click_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_avg_order_value', CASE WHEN COALESCE(card_buyer_count,0)>0 THEN ROUND(COALESCE(card_user_pay_amount,0)::NUMERIC/card_buyer_count::NUMERIC,2) ELSE NULL::NUMERIC END,
      'card_click_to_pay_rate_user', CASE WHEN COALESCE(card_click_user_count,0)>0 THEN ROUND(COALESCE(card_buyer_count,0)::NUMERIC/card_click_user_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'first_buy_new_rate', CASE WHEN COALESCE(card_buyer_count,0)>0 THEN ROUND(COALESCE(first_buy_user_count,0)::NUMERIC/card_buyer_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'rebuy_old_rate', CASE WHEN COALESCE(card_buyer_count,0)>0 THEN ROUND(COALESCE(rebuy_user_count,0)::NUMERIC/card_buyer_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_exposure_to_pay_rate_user', CASE WHEN COALESCE(card_exposure_user_count,0)>0 THEN ROUND(COALESCE(card_buyer_count,0)::NUMERIC/card_exposure_user_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_exposure_to_pay_rate_count', CASE WHEN COALESCE(card_exposure_count,0)>0 THEN ROUND(COALESCE(card_order_count,0)::NUMERIC/card_exposure_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_gpm', CASE WHEN COALESCE(card_exposure_count,0)>0 THEN ROUND(COALESCE(card_user_pay_amount,0)::NUMERIC/card_exposure_count::NUMERIC*1000,6) ELSE NULL::NUMERIC END,
      'card_click_rate_count', CASE WHEN COALESCE(card_exposure_count,0)>0 THEN ROUND(COALESCE(card_click_count,0)::NUMERIC/card_exposure_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_click_to_pay_rate_count', CASE WHEN COALESCE(card_click_count,0)>0 THEN ROUND(COALESCE(card_order_count,0)::NUMERIC/card_click_count::NUMERIC,6) ELSE NULL::NUMERIC END
    )
  FROM ods.douyin_trade_sale_card_raw
  UNION ALL
  SELECT
    'ads.douyin_trade_sale_card_detail', stat_date, shop_id::TEXT, product_id::TEXT,
    jsonb_build_array(shop_id, stat_date, product_id, source_level1),
    jsonb_build_object(
      'card_exposure_to_pay_rate_user', card_exposure_to_pay_rate_user,
      'card_click_rate_user', card_click_rate_user,
      'card_click_to_pay_rate_user', card_click_to_pay_rate_user
    ),
    jsonb_build_object(
      'card_exposure_to_pay_rate_user', CASE WHEN COALESCE(card_exposure_user_count,0)>0 THEN ROUND(COALESCE(card_buyer_count,0)::NUMERIC/card_exposure_user_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_click_rate_user', CASE WHEN COALESCE(card_exposure_user_count,0)>0 THEN ROUND(COALESCE(card_click_user_count,0)::NUMERIC/card_exposure_user_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_click_to_pay_rate_user', CASE WHEN COALESCE(card_click_user_count,0)>0 THEN ROUND(COALESCE(card_buyer_count,0)::NUMERIC/card_click_user_count::NUMERIC,6) ELSE NULL::NUMERIC END
    )
  FROM ads.douyin_trade_sale_card_detail
  UNION ALL
  SELECT
    'ods.douyin_trade_sale_card_detail_raw', stat_date, shop_id::TEXT, product_id::TEXT,
    jsonb_build_array(shop_id, stat_date, product_id, source_level1),
    jsonb_build_object(
      'card_exposure_to_pay_rate_user', card_exposure_to_pay_rate_user,
      'card_click_rate_user', card_click_rate_user,
      'card_click_to_pay_rate_user', card_click_to_pay_rate_user
    ),
    jsonb_build_object(
      'card_exposure_to_pay_rate_user', CASE WHEN COALESCE(card_exposure_user_count,0)>0 THEN ROUND(COALESCE(card_buyer_count,0)::NUMERIC/card_exposure_user_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_click_rate_user', CASE WHEN COALESCE(card_exposure_user_count,0)>0 THEN ROUND(COALESCE(card_click_user_count,0)::NUMERIC/card_exposure_user_count::NUMERIC,6) ELSE NULL::NUMERIC END,
      'card_click_to_pay_rate_user', CASE WHEN COALESCE(card_click_user_count,0)>0 THEN ROUND(COALESCE(card_buyer_count,0)::NUMERIC/card_click_user_count::NUMERIC,6) ELSE NULL::NUMERIC END
    )
  FROM ods.douyin_trade_sale_card_detail_raw
), row_mismatches AS (
  SELECT *, pg_column_size(row_key) + pg_column_size(actual) AS backup_bytes
  FROM ratio_rows
  WHERE actual IS DISTINCT FROM expected
), field_mismatches AS (
  SELECT rows.table_name, field.key AS field_name, COUNT(*)::BIGINT AS mismatch_rows
  FROM ratio_rows rows
  CROSS JOIN LATERAL jsonb_each(rows.expected) field
  WHERE rows.actual -> field.key IS DISTINCT FROM field.value
  GROUP BY rows.table_name, field.key
), daily_mismatches AS (
  SELECT table_name, stat_date, COUNT(*)::BIGINT AS mismatch_rows
  FROM row_mismatches
  GROUP BY table_name, stat_date
)
SELECT
  rows.table_name,
  COUNT(*)::TEXT AS rows,
  COUNT(DISTINCT rows.shop_id)::TEXT AS distinct_shops,
  COUNT(DISTINCT rows.product_id)::TEXT AS distinct_products,
  MIN(rows.stat_date)::TEXT AS min_date,
  MAX(rows.stat_date)::TEXT AS max_date,
  COUNT(mismatches.row_key)::TEXT AS mismatch_rows,
  COUNT(DISTINCT mismatches.stat_date)::TEXT AS mismatch_dates,
  MIN(mismatches.stat_date)::TEXT AS min_mismatch_date,
  MAX(mismatches.stat_date)::TEXT AS max_mismatch_date,
  COALESCE(SUM(mismatches.backup_bytes), 0)::TEXT AS estimated_backup_bytes,
  COALESCE((
    SELECT jsonb_object_agg(field.field_name, field.mismatch_rows ORDER BY field.field_name)
    FROM field_mismatches field
    WHERE field.table_name = rows.table_name
  ), '{}'::JSONB) AS field_mismatches,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('date', daily.stat_date, 'mismatchRows', daily.mismatch_rows) ORDER BY daily.stat_date)
    FROM daily_mismatches daily
    WHERE daily.table_name = rows.table_name
  ), '[]'::JSONB) AS daily_mismatches
FROM ratio_rows rows
LEFT JOIN row_mismatches mismatches
  ON mismatches.table_name = rows.table_name
 AND mismatches.row_key = rows.row_key
GROUP BY rows.table_name
ORDER BY rows.table_name`;

export const QIANCHUAN_CARD_RATIO_PARITY_SQL = `/* aios_qianchuan_card_ratio:source_target_parity */
WITH main_source AS (
  SELECT source.*, TRUE AS source_present
  FROM ods.douyin_trade_sale_card_raw source
), main_target AS (
  SELECT target.*, TRUE AS target_present
  FROM ads.douyin_trade_sale_card target
), main_parity AS (
  SELECT
    (SELECT COUNT(*) FROM main_source)::BIGINT AS source_rows,
    (SELECT COUNT(*) FROM main_target)::BIGINT AS target_rows,
    COUNT(*) FILTER (WHERE ods.source_present AND NOT COALESCE(ads.target_present, FALSE))::BIGINT AS missing_target_rows,
    COUNT(*) FILTER (WHERE ads.target_present AND NOT COALESCE(ods.source_present, FALSE))::BIGINT AS extra_target_rows,
    COUNT(*) FILTER (WHERE ods.source_present AND ads.target_present AND (
      ods.card_exposure_user_count IS DISTINCT FROM ads.card_exposure_user_count OR
      ods.card_click_user_count IS DISTINCT FROM ads.card_click_user_count OR
      ods.card_buyer_count IS DISTINCT FROM ads.card_buyer_count OR
      ods.card_order_count IS DISTINCT FROM ads.card_order_count OR
      ods.card_user_pay_amount IS DISTINCT FROM ads.card_user_pay_amount
    ))::BIGINT AS base_metric_mismatch_rows
  FROM main_source ods
  FULL JOIN main_target ads
    ON ads.shop_name = ods.shop_name AND ads.shop_id = ods.shop_id
   AND ads."date" = ods."date" AND ads.product_id = ods.product_id
), detail_source AS (
  SELECT source.*, TRUE AS source_present
  FROM ods.douyin_trade_sale_card_detail_raw source
), detail_target AS (
  SELECT target.*, TRUE AS target_present
  FROM ads.douyin_trade_sale_card_detail target
), detail_parity AS (
  SELECT
    (SELECT COUNT(*) FROM detail_source)::BIGINT AS source_rows,
    (SELECT COUNT(*) FROM detail_target)::BIGINT AS target_rows,
    COUNT(*) FILTER (WHERE ods.source_present AND NOT COALESCE(ads.target_present, FALSE))::BIGINT AS missing_target_rows,
    COUNT(*) FILTER (WHERE ads.target_present AND NOT COALESCE(ods.source_present, FALSE))::BIGINT AS extra_target_rows,
    COUNT(*) FILTER (WHERE ods.source_present AND ads.target_present AND (
      ods.card_exposure_user_count IS DISTINCT FROM ads.card_exposure_user_count OR
      ods.card_click_user_count IS DISTINCT FROM ads.card_click_user_count OR
      ods.card_buyer_count IS DISTINCT FROM ads.card_buyer_count OR
      ods.card_order_count IS DISTINCT FROM ads.card_order_count OR
      ods.card_user_pay_amount IS DISTINCT FROM ads.card_user_pay_amount
    ))::BIGINT AS base_metric_mismatch_rows
  FROM detail_source ods
  FULL JOIN detail_target ads
    ON ads.shop_id = ods.shop_id AND ads.stat_date = ods.stat_date
   AND ads.product_id = ods.product_id AND ads.source_level1 = ods.source_level1
)
SELECT 'main'::TEXT AS shape, source_rows::TEXT, target_rows::TEXT,
  missing_target_rows::TEXT, extra_target_rows::TEXT, base_metric_mismatch_rows::TEXT
FROM main_parity
UNION ALL
SELECT 'detail', source_rows::TEXT, target_rows::TEXT,
  missing_target_rows::TEXT, extra_target_rows::TEXT, base_metric_mismatch_rows::TEXT
FROM detail_parity
ORDER BY shape`;

function asCount(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return 0;
}

function indexBy(values, field) {
  return new Map(values.map((value) => [value[field], value]));
}

function normalizePrimaryKeyDefinition(value) {
  return String(value ?? '')
    .replaceAll('"', '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function countExpectedPrimaryKeys(primaryKeys) {
  const primaryKeyByTable = indexBy(primaryKeys, 'table_name');
  return EXPECTED_PRIMARY_KEYS.filter(({ definition, tableName }) => (
    normalizePrimaryKeyDefinition(primaryKeyByTable.get(tableName)?.definition) === definition
  )).length;
}

function definitionEvidence(row, identityField) {
  const definition = row.definition ?? null;
  return {
    ...row,
    present: row.oid != null,
    definitionBytes: definition == null ? null : Buffer.byteLength(definition),
    definitionSha256: definition == null
      ? null
      : createHash('sha256').update(definition).digest('hex'),
    [identityField]: row[identityField],
  };
}

function validateSources(p1Packet, p1Artifact, p1Sha256, p1dProbe, p1dProbeArtifact, p1dProbeSha256) {
  assertPinnedMigrationReviewArtifact(p1Artifact, p1Sha256, 'Reviewed P1 overlay');
  assertPinnedMigrationReviewArtifact(p1dProbeArtifact, p1dProbeSha256, 'P1D read-only probe');
  validateQianchuanProductionMigrationP1dReadonlyProbe(p1dProbe);
  if (p1Packet?.mode !== 'offline_readonly_reviewed_p1_overlay'
    || p1Packet.policy?.productionWritesAuthorized !== false
    || p1Packet.policy?.ledgerWritesAuthorized !== false
    || p1Packet.summary?.byWave?.P1D !== 5) {
    throw new Error('Card-ratio probe requires the reviewed P1 overlay with exact P1D=5 boundary.');
  }
  const entry = p1Packet.entries?.find((value) => `${value.namespace}/${value.version}` === TARGET_IDENTITY);
  if (!entry || entry.checksum !== TARGET_CHECKSUM
    || entry.authoritativeClassification !== 'unknown'
    || entry.reviewWaveLabel !== 'P1D'
    || entry.review?.decision !== null
    || entry.effects?.unsatisfied !== 4) {
    throw new Error(`${TARGET_IDENTITY} no longer matches the unresolved card-ratio repair boundary.`);
  }
  const probeEntry = p1dProbe.entryEvidence.find((value) => value.family === 'card_ratio_enforcement');
  if (!probeEntry || probeEntry.evidenceState !== 'missing_runtime_contract_with_data_drift'
    || probeEntry.decision !== null || probeEntry.reviewer !== null
    || asCount(p1dProbe.dataShapes?.cardRatio?.card?.mismatchRows) < 1
    || asCount(p1dProbe.dataShapes?.cardRatio?.cardDetail?.mismatchRows) < 1) {
    throw new Error('Pinned P1D probe no longer proves unresolved card-ratio data drift.');
  }
  return entry;
}

export async function runQianchuanCardRatioReadonlyProbe({
  client,
  now = () => new Date(),
  p1Artifact,
  p1Packet,
  p1Sha256,
  p1dProbe,
  p1dProbeArtifact,
  p1dProbeSha256,
  statementTimeoutMs = 30000,
}) {
  const targetEntry = validateSources(
    p1Packet,
    p1Artifact,
    p1Sha256,
    p1dProbe,
    p1dProbeArtifact,
    p1dProbeSha256,
  );
  return withAiosReadOnlyTransaction(client, { statementTimeoutMs }, async () => {
    const tableRows = (await client.query(TABLE_STATS_SQL, [RELATIONS])).rows;
    const primaryKeys = (await client.query(PRIMARY_KEYS_SQL, [RELATIONS.slice(0, 2)])).rows;
    const indexes = (await client.query(INDEXES_SQL, [RELATIONS.slice(0, 2)])).rows;
    const routineRows = (await client.query(ROUTINES_SQL, [ROUTINES])).rows;
    const triggers = (await client.query(TRIGGERS_SQL, [RELATIONS.slice(0, 2)])).rows;
    const impact = (await client.query(IMPACT_SQL)).rows.map((row) => ({
      ...row,
      daily_mismatches: row.daily_mismatches ?? [],
      field_mismatches: row.field_mismatches ?? {},
    }));
    const parity = (await client.query(QIANCHUAN_CARD_RATIO_PARITY_SQL)).rows;
    const routines = routineRows.map((row) => definitionEvidence(row, 'signature'));
    const routineBySignature = indexBy(routines, 'signature');
    const tableByName = indexBy(tableRows, 'qualified_name');
    const impactByTable = indexBy(impact, 'table_name');
    const waitingLocks = tableRows.reduce((sum, row) => sum + asCount(row.waiting_locks), 0);
    const adsMismatchRows = asCount(impactByTable.get(RELATIONS[0])?.mismatch_rows)
      + asCount(impactByTable.get(RELATIONS[1])?.mismatch_rows);
    const odsMismatchRows = asCount(impactByTable.get(RELATIONS[2])?.mismatch_rows)
      + asCount(impactByTable.get(RELATIONS[3])?.mismatch_rows);
    return {
      schemaVersion: 1,
      generatedAt: now().toISOString(),
      mode: 'live_readonly_card_ratio_repair_readiness_probe',
      target: {
        identity: TARGET_IDENTITY,
        checksum: TARGET_CHECKSUM,
        source: targetEntry.source,
      },
      sourceArtifacts: {
        p1: p1Artifact,
        p1dProbe: p1dProbeArtifact,
      },
      policy: {
        transaction: 'BEGIN READ ONLY / ROLLBACK',
        statementTimeoutMs,
        networkAccess: true,
        productionWritesAuthorized: false,
        ledgerWritesAuthorized: false,
        repairExecutionAuthorized: false,
        backupCreated: false,
        ownerDecisionRecorded: false,
        deployAuthorized: false,
        arkInvoked: false,
      },
      summary: {
        relationsPresent: RELATIONS.filter((name) => tableByName.get(name)?.oid != null).length,
        exactPrimaryKeys: countExpectedPrimaryKeys(primaryKeys),
        refreshRoutinesPresent: ROUTINES.slice(0, 3).filter((signature) => (
          routineBySignature.get(signature)?.present
        )).length,
        recomputeFunctionsPresent: ROUTINES.slice(3).filter((signature) => (
          routineBySignature.get(signature)?.present
        )).length,
        ratioTriggersPresent: triggers.filter((trigger) => (
          trigger.trigger_name?.startsWith('trg_recompute_douyin_trade_sale_card')
        )).length,
        adsMismatchRows,
        odsMismatchRows,
        waitingLocks,
        repairPlanReady: false,
      },
      catalog: {
        tables: tableRows,
        primaryKeys,
        indexes,
        routines,
        triggers,
      },
      impact,
      parity,
    };
  });
}

function validateQianchuanCardRatioProbeEnvelope(result) {
  if (result?.schemaVersion !== 1
    || result.mode !== 'live_readonly_card_ratio_repair_readiness_probe'
    || result.target?.identity !== TARGET_IDENTITY
    || result.target?.checksum !== TARGET_CHECKSUM
    || !Array.isArray(result.impact)
    || result.impact.length !== RELATIONS.length
    || !Array.isArray(result.parity)
    || result.parity.length !== 2) {
    throw new Error('Card-ratio repair readiness probe structure is invalid.');
  }
}

function validateQianchuanCardRatioProbePolicy(result) {
  if (result.policy?.transaction !== 'BEGIN READ ONLY / ROLLBACK'
    || result.policy?.networkAccess !== true
    || !Number.isInteger(result.policy?.statementTimeoutMs)
    || result.policy.statementTimeoutMs < 1000
    || result.policy.statementTimeoutMs > 120000
    || result.policy?.productionWritesAuthorized !== false
    || result.policy?.ledgerWritesAuthorized !== false
    || result.policy?.repairExecutionAuthorized !== false
    || result.policy?.backupCreated !== false
    || result.policy?.ownerDecisionRecorded !== false
    || result.policy?.deployAuthorized !== false
    || result.policy?.arkInvoked !== false
    || result.summary?.repairPlanReady !== false) {
    throw new Error('Card-ratio repair readiness probe policy is unsafe.');
  }
}

function probeCount(value, label) {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return count;
}

export function validateQianchuanCardRatioReadonlyProbe(result) {
  validateQianchuanCardRatioProbeEnvelope(result);
  validateQianchuanCardRatioProbePolicy(result);
  if (result.summary?.relationsPresent !== 4
    || result.summary?.exactPrimaryKeys !== 2
    || result.summary?.refreshRoutinesPresent !== 3
    || result.summary?.recomputeFunctionsPresent !== 0
    || result.summary?.ratioTriggersPresent !== 0
    || result.summary?.adsMismatchRows < 1
    || result.summary?.odsMismatchRows < 1) {
    throw new Error('Card-ratio repair readiness evidence is incomplete.');
  }
  return result;
}

export function validateQianchuanCardRatioPostrepairReadonlyProbe(result) {
  validateQianchuanCardRatioProbeEnvelope(result);
  validateQianchuanCardRatioProbePolicy(result);
  if (result.summary?.relationsPresent !== 4
    || result.summary?.exactPrimaryKeys !== 2
    || result.summary?.refreshRoutinesPresent !== 3
    || result.summary?.recomputeFunctionsPresent !== 2
    || result.summary?.ratioTriggersPresent !== 2
    || probeCount(result.summary?.adsMismatchRows, 'Post-repair ADS mismatch rows') !== 0
    || probeCount(result.summary?.odsMismatchRows, 'Post-repair ODS mismatch rows') < 1
    || probeCount(result.summary?.waitingLocks, 'Post-repair waiting locks') !== 0) {
    throw new Error('Card-ratio post-repair evidence is incomplete.');
  }
  const adsImpact = new Map(result.impact
    .filter((entry) => entry.table_name?.startsWith('ads.'))
    .map((entry) => [entry.table_name, entry]));
  for (const table of RELATIONS.slice(0, 2)) {
    const row = adsImpact.get(table);
    if (!row
      || probeCount(row.rows, `${table} rows`) < 1
      || probeCount(row.mismatch_rows, `${table} mismatch rows`) !== 0) {
      throw new Error(`Card-ratio post-repair impact is incomplete for ${table}.`);
    }
  }
  const parity = new Map(result.parity.map((entry) => [entry.shape, entry]));
  for (const shape of ['main', 'detail']) {
    const row = parity.get(shape);
    const sourceRows = probeCount(row?.source_rows, `${shape} source rows`);
    if (!row
      || sourceRows < 1
      || probeCount(row.target_rows, `${shape} target rows`) !== sourceRows
      || probeCount(row.missing_target_rows, `${shape} missing rows`) !== 0
      || probeCount(row.extra_target_rows, `${shape} extra rows`) !== 0
      || probeCount(row.base_metric_mismatch_rows, `${shape} base mismatch rows`) !== 0) {
      throw new Error(`Card-ratio post-repair parity is incomplete for ${shape}.`);
    }
  }
  return result;
}
