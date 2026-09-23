import { createHash } from 'node:crypto';

import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import {
  QIANCHUAN_P1D_LINEAGE_FAMILIES,
  validateQianchuanProductionMigrationP1dLineagePacket,
} from './aios-qianchuan-production-migration-p1d-lineage.mjs';
import {
  QIANCHUAN_INFLUENCER_TAG_NORMALIZED_ROWS_CTE_SQL,
} from './aios-qianchuan-production-migration-influencer-tag-normalization-sql.mjs';
import { withAiosReadOnlyTransaction } from './aios-readonly-audit.mjs';

const RELATION_NAMES = Object.freeze([
  'etl.alimama_goods_marketing_di_refresh_state',
  'etl.taobao_alimama_goods_marketingscene_refresh_state',
  'dwd.dwd_alimama_goods_marketing_di',
  'dwd.taobao_alimama_goods_marketingscene',
  'ods.taobao_one_alimama_goods_marketingscenario',
  'ads.taobao_goods_traffic_channel_metrics_week',
  'ads.report_taobao_goods_traffic_channel_metrics_week',
  'ads.creator_live_trade_daily',
  'ads.influencer_live_detail',
  'ads.douyin_shortvideo_detail',
  'etl.douyin_shortvideo_detail_refresh_state',
  'ads.influencer_library',
  'ods.qianchuan_material_daily_report_raw',
  'dwd.marketing_content_ad_material_stats_di',
  'dwd.marketing_content_qianchuan_material_daily',
  'dws.marketing_content_qianchuan_material_summary',
  'ads.douyin_trade_sale_card',
  'ads.douyin_trade_sale_card_detail',
  'ads.marketing_content_platform_videos',
  'ads.marketing_content_ad_materials',
]);

const ROUTINE_MAPPINGS = Object.freeze([
  Object.freeze({ signature: 'dwd.refresh_dwd_alimama_goods_marketing_di_incremental(integer,boolean)', needles: Object.freeze([]) }),
  Object.freeze({ signature: 'dwd.refresh_taobao_alimama_goods_marketingscene_incremental(integer,boolean)', needles: Object.freeze(['etl.taobao_alimama_goods_marketingscene_refresh_state']) }),
  Object.freeze({ signature: 'ads.refresh_taobao_goods_traffic_channel_metrics_week(date,date)', needles: Object.freeze([]) }),
  Object.freeze({ signature: 'ads.refresh_report_taobao_goods_traffic_channel_metrics_week(date,date)', needles: Object.freeze(['ads.report_taobao_goods_traffic_channel_metrics_week', 'traffic_channel']) }),
  Object.freeze({ signature: 'ads.refresh_creator_live_trade_daily(date,date)', needles: Object.freeze(['ads.influencer_live_detail', 'live_refund_order_count']) }),
  Object.freeze({ signature: 'ads.refresh_douyin_shortvideo_detail(date,date)', needles: Object.freeze(['ads.douyin_shortvideo_detail', 'qianchuan_material_day']) }),
  Object.freeze({ signature: 'ads.refresh_douyin_shortvideo_detail_incremental(integer,boolean)', needles: Object.freeze(['refresh_douyin_shortvideo_detail']) }),
  Object.freeze({ signature: 'ads.fn_influencer_library_normalize_anchor_tag(text)', needles: Object.freeze([]) }),
  Object.freeze({ signature: 'public.marketing_content_parse_numeric(text)', needles: Object.freeze([]) }),
  Object.freeze({ signature: 'public.marketing_content_parse_bigint(text)', needles: Object.freeze([]) }),
  Object.freeze({ signature: 'public.marketing_content_parse_rate(text)', needles: Object.freeze([]) }),
  Object.freeze({ signature: 'ads.fn_recompute_douyin_trade_sale_card_ratio_fields()', needles: Object.freeze([]) }),
  Object.freeze({ signature: 'ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()', needles: Object.freeze([]) }),
]);

const CONSTRAINT_NAMES = Object.freeze([
  'ads.report_taobao_goods_traffic_channel_metrics_week.chk_taobao_goods_traffic_channel_metrics_week_channel',
  'ads.influencer_live_detail.chk_influencer_live_detail_non_negative',
]);

const INDEX_NAMES = Object.freeze([
  'ads.idx_douyin_shortvideo_detail_publish_time_desc',
  'ads.idx_douyin_shortvideo_detail_source_updated_at',
  'ads.idx_douyin_shortvideo_detail_mapping_status',
  'ads.idx_douyin_shortvideo_detail_qianchuan_material_key',
  'ads.idx_marketing_content_platform_videos_asset_video_active',
  'ads.idx_ads_mc_platform_video_identity_active',
  'ads.idx_marketing_content_platform_videos_video_active',
]);

const TRIGGER_NAMES = Object.freeze([
  'ads.douyin_shortvideo_detail.trg_touch_douyin_shortvideo_detail_updated_at',
  'ads.douyin_trade_sale_card.trg_recompute_douyin_trade_sale_card_ratio_fields',
  'ads.douyin_trade_sale_card_detail.trg_recompute_douyin_trade_sale_card_detail_ratio_fields',
]);

const COLUMN_NAMES = Object.freeze([
  'ads.influencer_live_detail.live_refund_order_count',
  'ads.douyin_shortvideo_detail.detail_grain',
  'ads.douyin_shortvideo_detail.mapping_status',
  'ads.douyin_shortvideo_detail.qianchuan_material_key',
]);

const RELATIONS_SQL = `/* aios_qianchuan_p1d:relations */
SELECT
  requested.qualified_name,
  actual.oid::TEXT AS oid,
  actual.relkind::TEXT AS relation_kind,
  CASE WHEN actual.oid IS NULL THEN NULL ELSE pg_total_relation_size(actual.oid)::TEXT END AS total_bytes,
  CASE WHEN actual.oid IS NULL THEN NULL ELSE actual.reltuples::BIGINT::TEXT END AS estimated_rows
FROM unnest($1::TEXT[]) WITH ORDINALITY AS requested(qualified_name, position)
LEFT JOIN pg_class actual
  ON actual.oid = to_regclass(requested.qualified_name)
ORDER BY requested.position`;

const ROUTINES_SQL = `/* aios_qianchuan_p1d:routines */
SELECT
  requested.signature,
  actual.oid::TEXT AS oid,
  actual.prokind::TEXT AS routine_kind,
  CASE WHEN actual.oid IS NULL THEN NULL ELSE pg_get_functiondef(actual.oid) END AS definition
FROM unnest($1::TEXT[]) WITH ORDINALITY AS requested(signature, position)
LEFT JOIN pg_proc actual
  ON actual.oid = to_regprocedure(requested.signature)
ORDER BY requested.position`;

const CONSTRAINTS_SQL = `/* aios_qianchuan_p1d:constraints */
WITH requested AS (
  SELECT
    qualified_name,
    split_part(qualified_name, '.', 1) AS schema_name,
    split_part(qualified_name, '.', 2) AS relation_name,
    split_part(qualified_name, '.', 3) AS constraint_name,
    position
  FROM unnest($1::TEXT[]) WITH ORDINALITY AS values(qualified_name, position)
)
SELECT
  requested.qualified_name,
  actual.oid::TEXT AS oid,
  CASE WHEN actual.oid IS NULL THEN NULL ELSE pg_get_constraintdef(actual.oid, TRUE) END AS definition
FROM requested
LEFT JOIN pg_namespace namespace ON namespace.nspname = requested.schema_name
LEFT JOIN pg_class relation
  ON relation.relnamespace = namespace.oid
 AND relation.relname = requested.relation_name
LEFT JOIN pg_constraint actual
  ON actual.conrelid = relation.oid
 AND actual.conname = requested.constraint_name
ORDER BY requested.position`;

const INDEXES_SQL = `/* aios_qianchuan_p1d:indexes */
WITH requested AS (
  SELECT
    qualified_name,
    split_part(qualified_name, '.', 1) AS schema_name,
    split_part(qualified_name, '.', 2) AS index_name,
    position
  FROM unnest($1::TEXT[]) WITH ORDINALITY AS values(qualified_name, position)
)
SELECT
  requested.qualified_name,
  actual.indexrelid::TEXT AS oid,
  CASE WHEN actual.indexrelid IS NULL THEN NULL ELSE pg_get_indexdef(actual.indexrelid) END AS definition,
  CASE WHEN actual.indexrelid IS NULL THEN NULL
    ELSE table_namespace.nspname || '.' || table_relation.relname END AS table_name
FROM requested
LEFT JOIN pg_namespace index_namespace ON index_namespace.nspname = requested.schema_name
LEFT JOIN pg_class index_relation
  ON index_relation.relnamespace = index_namespace.oid
 AND index_relation.relname = requested.index_name
LEFT JOIN pg_index actual ON actual.indexrelid = index_relation.oid
LEFT JOIN pg_class table_relation ON table_relation.oid = actual.indrelid
LEFT JOIN pg_namespace table_namespace ON table_namespace.oid = table_relation.relnamespace
ORDER BY requested.position`;

const TRIGGERS_SQL = `/* aios_qianchuan_p1d:triggers */
WITH requested AS (
  SELECT
    qualified_name,
    split_part(qualified_name, '.', 1) AS schema_name,
    split_part(qualified_name, '.', 2) AS relation_name,
    split_part(qualified_name, '.', 3) AS trigger_name,
    position
  FROM unnest($1::TEXT[]) WITH ORDINALITY AS values(qualified_name, position)
)
SELECT
  requested.qualified_name,
  actual.oid::TEXT AS oid,
  actual.tgenabled::TEXT AS enabled,
  CASE WHEN actual.oid IS NULL THEN NULL ELSE pg_get_triggerdef(actual.oid, TRUE) END AS definition
FROM requested
LEFT JOIN pg_namespace namespace ON namespace.nspname = requested.schema_name
LEFT JOIN pg_class relation
  ON relation.relnamespace = namespace.oid
 AND relation.relname = requested.relation_name
LEFT JOIN pg_trigger actual
  ON actual.tgrelid = relation.oid
 AND actual.tgname = requested.trigger_name
 AND NOT actual.tgisinternal
ORDER BY requested.position`;

const COLUMNS_SQL = `/* aios_qianchuan_p1d:columns */
WITH requested AS (
  SELECT
    qualified_name,
    split_part(qualified_name, '.', 1) AS schema_name,
    split_part(qualified_name, '.', 2) AS relation_name,
    split_part(qualified_name, '.', 3) AS column_name,
    position
  FROM unnest($1::TEXT[]) WITH ORDINALITY AS values(qualified_name, position)
)
SELECT
  requested.qualified_name,
  attribute.attnum::TEXT AS position,
  CASE WHEN attribute.attnum IS NULL THEN NULL ELSE format_type(attribute.atttypid, attribute.atttypmod) END AS data_type,
  attribute.attnotnull AS not_null
FROM requested
LEFT JOIN pg_namespace namespace ON namespace.nspname = requested.schema_name
LEFT JOIN pg_class relation
  ON relation.relnamespace = namespace.oid
 AND relation.relname = requested.relation_name
LEFT JOIN pg_attribute attribute
  ON attribute.attrelid = relation.oid
 AND attribute.attname = requested.column_name
 AND attribute.attnum > 0
 AND NOT attribute.attisdropped
ORDER BY requested.position`;

const ALIMAMA_SHAPE_SQL = `/* aios_qianchuan_p1d:alimama_shape */
SELECT
  COUNT(*)::TEXT AS source_rows,
  MIN(stat_date)::TEXT AS min_date,
  MAX(stat_date)::TEXT AS max_date,
  MAX(COALESCE(updated_at, created_at))::TEXT AS max_updated_at
FROM ods.taobao_one_alimama_goods_marketingscenario`;

const REPORT_SHAPE_SQL = `/* aios_qianchuan_p1d:report_shape */
SELECT
  COUNT(*)::TEXT AS rows,
  MIN(week_period)::TEXT AS min_week,
  MAX(week_period)::TEXT AS max_week,
  COALESCE(ARRAY_AGG(DISTINCT traffic_channel ORDER BY traffic_channel), '{}'::TEXT[]) AS traffic_channels,
  COUNT(*) FILTER (WHERE traffic_channel NOT IN ('搜索', '推荐', '关键词推广', '人群推广', '场景推广'))::TEXT AS invalid_channel_rows
FROM ads.report_taobao_goods_traffic_channel_metrics_week`;

const CREATOR_SHAPE_SQL = `/* aios_qianchuan_p1d:creator_shape */
SELECT
  COUNT(*)::TEXT AS rows,
  MIN(stat_date)::TEXT AS min_date,
  MAX(stat_date)::TEXT AS max_date,
  COUNT(*) FILTER (WHERE live_refund_order_count <> 0)::TEXT AS refund_nonzero_rows,
  COALESCE(SUM(live_refund_order_count), 0)::TEXT AS refund_sum
FROM ads.influencer_live_detail`;

const SHORTVIDEO_SHAPE_SQL = `/* aios_qianchuan_p1d:shortvideo_shape */
WITH grain_counts AS (
  SELECT detail_grain AS key, COUNT(*)::TEXT AS value
  FROM ads.douyin_shortvideo_detail
  GROUP BY detail_grain
), mapping_counts AS (
  SELECT mapping_status AS key, COUNT(*)::TEXT AS value
  FROM ads.douyin_shortvideo_detail
  GROUP BY mapping_status
)
SELECT
  COUNT(*)::TEXT AS rows,
  MIN(stat_date)::TEXT AS min_date,
  MAX(stat_date)::TEXT AS max_date,
  COALESCE((SELECT jsonb_object_agg(key, value) FROM grain_counts), '{}'::JSONB) AS grain_counts,
  COALESCE((SELECT jsonb_object_agg(key, value) FROM mapping_counts), '{}'::JSONB) AS mapping_counts
FROM ads.douyin_shortvideo_detail`;

const NORMALIZATION_SHAPE_SQL = `/* aios_qianchuan_p1d:normalization_shape */
WITH ${QIANCHUAN_INFLUENCER_TAG_NORMALIZED_ROWS_CTE_SQL}
SELECT
  COUNT(*)::TEXT AS active_rows,
  COUNT(*) FILTER (WHERE cardinality(normalized_tags) > 0)::TEXT AS rows_with_normalized_tags,
  COUNT(*) FILTER (WHERE
    tags IS DISTINCT FROM normalized_tags
    OR anchor_desc IS DISTINCT FROM expected_anchor_desc
  )::TEXT AS mismatch_rows
FROM normalized_rows`;

const QIANCHUAN_PARSE_SHAPE_SQL = `/* aios_qianchuan_p1d:qianchuan_parse_shape */
SELECT
  (SELECT COUNT(*)::TEXT FROM ods.qianchuan_material_daily_report_raw) AS raw_rows,
  (SELECT MIN(stat_date)::TEXT FROM ods.qianchuan_material_daily_report_raw) AS raw_min_date,
  (SELECT MAX(stat_date)::TEXT FROM ods.qianchuan_material_daily_report_raw) AS raw_max_date,
  (SELECT COUNT(*)::TEXT FROM dwd.marketing_content_ad_material_stats_di) AS dwd_rows,
  (SELECT COUNT(*) FILTER (WHERE ad_platform = 'qianchuan')::TEXT FROM dwd.marketing_content_ad_material_stats_di) AS qianchuan_dwd_rows`;

const CARD_RATIO_SHAPE_SQL = `/* aios_qianchuan_p1d:card_ratio_shape */
WITH card_expected AS (
  SELECT *,
    CASE WHEN COALESCE(card_exposure_user_count,0)>0 THEN ROUND(COALESCE(card_click_user_count,0)::NUMERIC/COALESCE(card_exposure_user_count,0)::NUMERIC,6) ELSE NULL::NUMERIC END e_card_click_rate_user,
    CASE WHEN COALESCE(card_click_user_count,0)>0 THEN ROUND(COALESCE(card_click_count,0)::NUMERIC/COALESCE(card_click_user_count,0)::NUMERIC,6) ELSE NULL::NUMERIC END e_card_avg_click_per_user,
    CASE WHEN COALESCE(card_click_count,0)>0 THEN ROUND(COALESCE(new_customer_click_count,0)::NUMERIC/COALESCE(card_click_count,0)::NUMERIC,6) ELSE NULL::NUMERIC END e_new_customer_click_rate,
    CASE WHEN COALESCE(card_click_count,0)>0 THEN ROUND(COALESCE(old_customer_click_count,0)::NUMERIC/COALESCE(card_click_count,0)::NUMERIC,6) ELSE NULL::NUMERIC END e_old_customer_click_rate,
    CASE WHEN COALESCE(card_buyer_count,0)>0 THEN ROUND(COALESCE(card_user_pay_amount,0)::NUMERIC/COALESCE(card_buyer_count,0)::NUMERIC,2) ELSE NULL::NUMERIC END e_card_avg_order_value,
    CASE WHEN COALESCE(card_click_user_count,0)>0 THEN ROUND(COALESCE(card_buyer_count,0)::NUMERIC/COALESCE(card_click_user_count,0)::NUMERIC,6) ELSE NULL::NUMERIC END e_card_click_to_pay_rate_user,
    CASE WHEN COALESCE(card_buyer_count,0)>0 THEN ROUND(COALESCE(first_buy_user_count,0)::NUMERIC/COALESCE(card_buyer_count,0)::NUMERIC,6) ELSE NULL::NUMERIC END e_first_buy_new_rate,
    CASE WHEN COALESCE(card_buyer_count,0)>0 THEN ROUND(COALESCE(rebuy_user_count,0)::NUMERIC/COALESCE(card_buyer_count,0)::NUMERIC,6) ELSE NULL::NUMERIC END e_rebuy_old_rate,
    CASE WHEN COALESCE(card_exposure_user_count,0)>0 THEN ROUND(COALESCE(card_buyer_count,0)::NUMERIC/COALESCE(card_exposure_user_count,0)::NUMERIC,6) ELSE NULL::NUMERIC END e_card_exposure_to_pay_rate_user,
    CASE WHEN COALESCE(card_exposure_count,0)>0 THEN ROUND(COALESCE(card_order_count,0)::NUMERIC/COALESCE(card_exposure_count,0)::NUMERIC,6) ELSE NULL::NUMERIC END e_card_exposure_to_pay_rate_count,
    CASE WHEN COALESCE(card_exposure_count,0)>0 THEN ROUND(COALESCE(card_user_pay_amount,0)::NUMERIC/COALESCE(card_exposure_count,0)::NUMERIC*1000,6) ELSE NULL::NUMERIC END e_card_gpm,
    CASE WHEN COALESCE(card_exposure_count,0)>0 THEN ROUND(COALESCE(card_click_count,0)::NUMERIC/COALESCE(card_exposure_count,0)::NUMERIC,6) ELSE NULL::NUMERIC END e_card_click_rate_count,
    CASE WHEN COALESCE(card_click_count,0)>0 THEN ROUND(COALESCE(card_order_count,0)::NUMERIC/COALESCE(card_click_count,0)::NUMERIC,6) ELSE NULL::NUMERIC END e_card_click_to_pay_rate_count
  FROM ads.douyin_trade_sale_card
), card_detail_expected AS (
  SELECT *,
    CASE WHEN COALESCE(card_exposure_user_count,0)>0 THEN ROUND(COALESCE(card_buyer_count,0)::NUMERIC/COALESCE(card_exposure_user_count,0)::NUMERIC,6) ELSE NULL::NUMERIC END e_card_exposure_to_pay_rate_user,
    CASE WHEN COALESCE(card_exposure_user_count,0)>0 THEN ROUND(COALESCE(card_click_user_count,0)::NUMERIC/COALESCE(card_exposure_user_count,0)::NUMERIC,6) ELSE NULL::NUMERIC END e_card_click_rate_user,
    CASE WHEN COALESCE(card_click_user_count,0)>0 THEN ROUND(COALESCE(card_buyer_count,0)::NUMERIC/COALESCE(card_click_user_count,0)::NUMERIC,6) ELSE NULL::NUMERIC END e_card_click_to_pay_rate_user
  FROM ads.douyin_trade_sale_card_detail
)
SELECT 'card' AS shape,
  COUNT(*)::TEXT AS rows,
  COUNT(*) FILTER (WHERE
    card_click_rate_user IS DISTINCT FROM e_card_click_rate_user OR
    card_avg_click_per_user IS DISTINCT FROM e_card_avg_click_per_user OR
    new_customer_click_rate IS DISTINCT FROM e_new_customer_click_rate OR
    old_customer_click_rate IS DISTINCT FROM e_old_customer_click_rate OR
    card_avg_order_value IS DISTINCT FROM e_card_avg_order_value OR
    card_click_to_pay_rate_user IS DISTINCT FROM e_card_click_to_pay_rate_user OR
    first_buy_new_rate IS DISTINCT FROM e_first_buy_new_rate OR
    rebuy_old_rate IS DISTINCT FROM e_rebuy_old_rate OR
    card_exposure_to_pay_rate_user IS DISTINCT FROM e_card_exposure_to_pay_rate_user OR
    card_exposure_to_pay_rate_count IS DISTINCT FROM e_card_exposure_to_pay_rate_count OR
    card_gpm IS DISTINCT FROM e_card_gpm OR
    card_click_rate_count IS DISTINCT FROM e_card_click_rate_count OR
    card_click_to_pay_rate_count IS DISTINCT FROM e_card_click_to_pay_rate_count
  )::TEXT AS mismatch_rows
FROM card_expected
UNION ALL
SELECT 'card_detail',
  COUNT(*)::TEXT,
  COUNT(*) FILTER (WHERE
    card_exposure_to_pay_rate_user IS DISTINCT FROM e_card_exposure_to_pay_rate_user OR
    card_click_rate_user IS DISTINCT FROM e_card_click_rate_user OR
    card_click_to_pay_rate_user IS DISTINCT FROM e_card_click_to_pay_rate_user
  )::TEXT
FROM card_detail_expected`;

const PLATFORM_VIDEO_SHAPE_SQL = `/* aios_qianchuan_p1d:platform_video_shape */
WITH duplicate_groups AS (
  SELECT asset_id, platform, NULLIF(BTRIM(external_video_id), '') AS external_video_id, COUNT(*) AS rows
  FROM ads.marketing_content_platform_videos
  WHERE relation_status = 'active'
    AND NULLIF(BTRIM(external_video_id), '') IS NOT NULL
  GROUP BY asset_id, platform, NULLIF(BTRIM(external_video_id), '')
  HAVING COUNT(*) > 1
)
SELECT
  (SELECT COUNT(*)::TEXT FROM ads.marketing_content_platform_videos) AS rows,
  (SELECT COUNT(*) FILTER (WHERE relation_status = 'active')::TEXT FROM ads.marketing_content_platform_videos) AS active_rows,
  COUNT(*)::TEXT AS duplicate_groups,
  COALESCE(SUM(rows - 1), 0)::TEXT AS duplicate_rows,
  COALESCE(MAX(rows), 0)::TEXT AS max_group_size,
  (SELECT COUNT(*) FILTER (WHERE raw_payload ? 'archived_duplicate_of')::TEXT FROM ads.marketing_content_platform_videos) AS archived_duplicate_markers,
  (SELECT COUNT(*) FILTER (WHERE raw_payload ? 'deduped_platform_video_id')::TEXT FROM ads.marketing_content_ad_materials) AS deduped_material_markers
FROM duplicate_groups`;

function indexBy(values, field) {
  return new Map(values.map((value) => [value[field], value]));
}

function catalogEvidence(rows, key, definitionFields = []) {
  const row = rows.get(key) ?? {};
  return {
    identity: key,
    present: row.oid != null,
    ...Object.fromEntries(definitionFields.map((field) => [field, row[field] ?? null])),
  };
}

function columnEvidence(rows, key) {
  const row = rows.get(key) ?? {};
  return {
    identity: key,
    present: row.position != null,
    position: row.position ?? null,
    data_type: row.data_type ?? null,
    not_null: row.not_null ?? null,
  };
}

function routineEvidence(rows, mapping) {
  const row = rows.get(mapping.signature) ?? {};
  const definition = row.definition ?? null;
  return {
    signature: mapping.signature,
    present: row.oid != null,
    routineKind: row.routine_kind ?? null,
    definitionBytes: definition == null ? null : Buffer.byteLength(definition),
    definitionSha256: definition == null ? null : createHash('sha256').update(definition).digest('hex'),
    definitionNeedles: Object.fromEntries(mapping.needles.map((needle) => (
      [needle, definition?.includes(needle) === true]
    ))),
  };
}

function asCount(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return 0;
}

function evidenceState(family, context) {
  const { relations, routines, constraints, indexes, triggers, columns, dataShapes } = context;
  if (family === 'alimama_incremental_rename') {
    const sourceRows = asCount(dataShapes.alimama.sourceRows);
    const oldAbsent = !relations.get('etl.alimama_goods_marketing_di_refresh_state')?.present
      && !routines.get('dwd.refresh_dwd_alimama_goods_marketing_di_incremental(integer,boolean)')?.present;
    const replacementAbsent = !relations.get('etl.taobao_alimama_goods_marketingscene_refresh_state')?.present
      && !relations.get('dwd.taobao_alimama_goods_marketingscene')?.present
      && !routines.get('dwd.refresh_taobao_alimama_goods_marketingscene_incremental(integer,boolean)')?.present;
    return sourceRows > 0 && oldAbsent && replacementAbsent
      ? 'source_data_present_without_old_or_replacement_runtime'
      : 'alimama_runtime_topology_requires_owner_review';
  }
  if (family === 'report_channel_localization_rename') {
    const ready = relations.get('ads.report_taobao_goods_traffic_channel_metrics_week')?.present
      && routines.get('ads.refresh_report_taobao_goods_traffic_channel_metrics_week(date,date)')?.present
      && constraints.get('ads.report_taobao_goods_traffic_channel_metrics_week.chk_taobao_goods_traffic_channel_metrics_week_channel')?.present
      && asCount(dataShapes.report.invalidChannelRows) === 0;
    return ready ? 'replacement_catalog_and_localized_data_observed' : 'report_replacement_postcondition_incomplete';
  }
  if (family === 'creator_live_refund_rename') {
    const ready = relations.get('ads.influencer_live_detail')?.present
      && routines.get('ads.refresh_creator_live_trade_daily(date,date)')?.present
      && constraints.get('ads.influencer_live_detail.chk_influencer_live_detail_non_negative')?.present
      && columns.get('ads.influencer_live_detail.live_refund_order_count')?.present;
    return ready ? 'replacement_catalog_and_refund_data_observed' : 'creator_live_replacement_postcondition_incomplete';
  }
  if (family === 'shortvideo_detail_rebuild') {
    const ready = relations.get('ads.douyin_shortvideo_detail')?.present
      && routines.get('ads.refresh_douyin_shortvideo_detail(date,date)')?.present
      && indexes.get('ads.idx_douyin_shortvideo_detail_mapping_status')?.present
      && columns.get('ads.douyin_shortvideo_detail.detail_grain')?.present;
    return ready ? 'replacement_catalog_and_multigrain_data_observed' : 'shortvideo_replacement_postcondition_incomplete';
  }
  if (family === 'influencer_tag_normalization') {
    return !routines.get('ads.fn_influencer_library_normalize_anchor_tag(text)')?.present
      && asCount(dataShapes.normalization.mismatchRows) > 0
      ? 'missing_runtime_contract_with_data_drift'
      : 'normalization_postcondition_requires_owner_review';
  }
  if (family === 'qianchuan_parse_helpers') {
    const helpersMissing = [
      'public.marketing_content_parse_numeric(text)',
      'public.marketing_content_parse_bigint(text)',
      'public.marketing_content_parse_rate(text)',
    ].every((signature) => !routines.get(signature)?.present);
    const dormant = asCount(dataShapes.qianchuanParse.rawRows) === 0
      && asCount(dataShapes.qianchuanParse.qianchuanDwdRows) === 0;
    return helpersMissing && dormant
      ? 'missing_runtime_contract_on_dormant_data_path'
      : 'parse_helper_runtime_postcondition_requires_owner_review';
  }
  if (family === 'card_ratio_enforcement') {
    const runtimeMissing = !routines.get('ads.fn_recompute_douyin_trade_sale_card_ratio_fields()')?.present
      && !routines.get('ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()')?.present
      && !triggers.get('ads.douyin_trade_sale_card.trg_recompute_douyin_trade_sale_card_ratio_fields')?.present
      && !triggers.get('ads.douyin_trade_sale_card_detail.trg_recompute_douyin_trade_sale_card_detail_ratio_fields')?.present;
    const drift = asCount(dataShapes.cardRatio.card.mismatchRows) > 0
      || asCount(dataShapes.cardRatio.cardDetail.mismatchRows) > 0;
    return runtimeMissing && drift
      ? 'missing_runtime_contract_with_data_drift'
      : 'card_ratio_postcondition_requires_owner_review';
  }
  const exactGuardMissing = !indexes.get('ads.idx_marketing_content_platform_videos_asset_video_active')?.present;
  const duplicateFree = asCount(dataShapes.platformVideo.duplicateGroups) === 0;
  return exactGuardMissing && duplicateFree
    ? 'clean_current_data_without_exact_unique_guard'
    : 'identity_dedupe_postcondition_requires_owner_review';
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function camelRows(row) {
  return Object.fromEntries(Object.entries(row ?? {}).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase()),
    value,
  ]));
}

export async function runQianchuanProductionMigrationP1dReadonlyProbe({
  client,
  lineage,
  lineageArtifact,
  lineageSha256,
  now = () => new Date(),
  statementTimeoutMs = 30000,
}) {
  validateQianchuanProductionMigrationP1dLineagePacket(lineage);
  assertPinnedMigrationReviewArtifact(lineageArtifact, lineageSha256, 'P1D lineage packet');
  const expectedFamilies = QIANCHUAN_P1D_LINEAGE_FAMILIES.map((family) => family.family);
  const actualFamilies = lineage.families.map((family) => family.family);
  if (JSON.stringify(actualFamilies) !== JSON.stringify(expectedFamilies)) {
    throw new Error('P1D lineage family order differs from the repository probe contract.');
  }

  return withAiosReadOnlyTransaction(client, { statementTimeoutMs }, async () => {
    const relationRows = (await client.query(RELATIONS_SQL, [RELATION_NAMES])).rows;
    const routineRows = (await client.query(ROUTINES_SQL, [ROUTINE_MAPPINGS.map((entry) => entry.signature)])).rows;
    const constraintRows = (await client.query(CONSTRAINTS_SQL, [CONSTRAINT_NAMES])).rows;
    const indexRows = (await client.query(INDEXES_SQL, [INDEX_NAMES])).rows;
    const triggerRows = (await client.query(TRIGGERS_SQL, [TRIGGER_NAMES])).rows;
    const columnRows = (await client.query(COLUMNS_SQL, [COLUMN_NAMES])).rows;
    const alimama = camelRows((await client.query(ALIMAMA_SHAPE_SQL)).rows[0]);
    const report = camelRows((await client.query(REPORT_SHAPE_SQL)).rows[0]);
    const creatorLive = camelRows((await client.query(CREATOR_SHAPE_SQL)).rows[0]);
    const shortvideo = camelRows((await client.query(SHORTVIDEO_SHAPE_SQL)).rows[0]);
    const normalization = camelRows((await client.query(NORMALIZATION_SHAPE_SQL)).rows[0]);
    const qianchuanParse = camelRows((await client.query(QIANCHUAN_PARSE_SHAPE_SQL)).rows[0]);
    const cardRatioRows = (await client.query(CARD_RATIO_SHAPE_SQL)).rows.map(camelRows);
    const platformVideo = camelRows((await client.query(PLATFORM_VIDEO_SHAPE_SQL)).rows[0]);

    const relations = RELATION_NAMES.map((name) => catalogEvidence(indexBy(relationRows, 'qualified_name'), name, [
      'relation_kind', 'total_bytes', 'estimated_rows',
    ]));
    const routines = ROUTINE_MAPPINGS.map((mapping) => routineEvidence(indexBy(routineRows, 'signature'), mapping));
    const constraints = CONSTRAINT_NAMES.map((name) => catalogEvidence(indexBy(constraintRows, 'qualified_name'), name, ['definition']));
    const indexes = INDEX_NAMES.map((name) => catalogEvidence(indexBy(indexRows, 'qualified_name'), name, ['definition', 'table_name']));
    const triggers = TRIGGER_NAMES.map((name) => catalogEvidence(indexBy(triggerRows, 'qualified_name'), name, ['definition', 'enabled']));
    const columns = COLUMN_NAMES.map((name) => columnEvidence(indexBy(columnRows, 'qualified_name'), name));
    const dataShapes = {
      alimama,
      report,
      creatorLive,
      shortvideo,
      normalization,
      qianchuanParse,
      cardRatio: {
        card: cardRatioRows.find((row) => row.shape === 'card') ?? {},
        cardDetail: cardRatioRows.find((row) => row.shape === 'card_detail') ?? {},
      },
      platformVideo,
    };
    const context = {
      relations: indexBy(relations, 'identity'),
      routines: indexBy(routines, 'signature'),
      constraints: indexBy(constraints, 'identity'),
      indexes: indexBy(indexes, 'identity'),
      triggers: indexBy(triggers, 'identity'),
      columns: indexBy(columns, 'identity'),
      dataShapes,
    };
    const entryEvidence = lineage.families.map((family) => ({
      family: family.family,
      entries: [...family.entries],
      evidenceState: evidenceState(family.family, context),
      decision: null,
      reviewer: null,
    }));

    return {
      schemaVersion: 1,
      generatedAt: now().toISOString(),
      mode: 'live_readonly_p1d_catalog_data_shape_probe',
      sourceArtifact: lineageArtifact,
      policy: {
        transaction: 'BEGIN READ ONLY / ROLLBACK',
        statementTimeoutMs,
        networkAccess: true,
        authoritativeClassificationChanged: false,
        reviewerChanged: false,
        ownerDecisionRecorded: false,
        productionWritesAuthorized: false,
        ledgerWritesAuthorized: false,
        deployAuthorized: false,
        arkInvoked: false,
      },
      summary: {
        entries: lineage.summary.entries,
        families: entryEvidence.length,
        ownerDecisionReady: false,
        byEvidenceState: countBy(entryEvidence, (entry) => entry.evidenceState),
      },
      entryEvidence,
      catalog: { relations, routines, constraints, indexes, triggers, columns },
      dataShapes,
    };
  });
}

export function validateQianchuanProductionMigrationP1dReadonlyProbe(result) {
  if (result?.schemaVersion !== 1 || result.mode !== 'live_readonly_p1d_catalog_data_shape_probe'
    || !Array.isArray(result.entryEvidence)
    || result.summary?.entries !== 8
    || result.summary?.families !== result.entryEvidence.length) {
    throw new Error('P1D read-only probe structure is invalid.');
  }
  if (result.policy?.transaction !== 'BEGIN READ ONLY / ROLLBACK'
    || result.policy?.productionWritesAuthorized !== false
    || result.policy?.ledgerWritesAuthorized !== false
    || result.policy?.deployAuthorized !== false
    || result.policy?.ownerDecisionRecorded !== false
    || result.policy?.arkInvoked !== false
    || result.summary?.ownerDecisionReady !== false) {
    throw new Error('P1D read-only probe policy is unsafe.');
  }
  if (result.entryEvidence.some((entry) => entry.decision !== null || entry.reviewer !== null)) {
    throw new Error('P1D read-only probe must not record owner decisions.');
  }
  return result;
}
