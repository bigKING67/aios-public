#!/usr/bin/env bash
set -euo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-aios}"
MAX_STALENESS_DAYS="${MAX_STALENESS_DAYS:-60}"
STATEMENT_TIMEOUT_MS="${STATEMENT_TIMEOUT_MS:-15000}"

if [[ "${AIOS_QC_ALLOW_LIVE_READONLY:-0}" != "1" ]]; then
  echo "Refusing to run live qianchuan readonly smoke without AIOS_QC_ALLOW_LIVE_READONLY=1." >&2
  echo "This check is SELECT-only, but it is intended for explicit production/VPS read verification." >&2
  exit 2
fi

PSQL=(
  psql
  -X
  -q
  -v ON_ERROR_STOP=1
  -v "max_staleness_days=${MAX_STALENESS_DAYS}"
  -v "statement_timeout_ms=${STATEMENT_TIMEOUT_MS}"
  -h "${PGHOST}"
  -p "${PGPORT}"
  -U "${PGUSER}"
  -d "${PGDATABASE}"
)

echo "==> Checking required qianchuan/content-asset tables on ${PGHOST}:${PGPORT}/${PGDATABASE}"
missing_tables="$("${PSQL[@]}" -tA <<'SQL'
SET default_transaction_read_only = on;
SET statement_timeout TO :'statement_timeout_ms';
SELECT COALESCE(string_agg(required_table, ', ' ORDER BY required_table), '')
FROM (
  VALUES
    ('dwd.marketing_content_qianchuan_material_performance_di'),
    ('dws.marketing_content_qianchuan_material_summary'),
    ('dws.marketing_content_asset_qianchuan_summary'),
    ('dws.marketing_content_qianchuan_live_room_acceptance_di'),
    ('ads.marketing_content_assets'),
    ('ads.marketing_content_asset_objects'),
    ('ads.marketing_content_ad_materials'),
    ('ads.marketing_content_asset_video_understanding_jobs'),
    ('ads.marketing_content_asset_video_understanding_results'),
    ('ods.douyin_qianchuan_shortvideo_raw'),
    ('ods.douyin_qianchuan_live_video_raw'),
    ('ods.douyin_trade_sale_live_raw')
) AS required(required_table)
WHERE to_regclass(required_table) IS NULL;
SQL
)"

if [[ -n "${missing_tables}" ]]; then
  echo "Missing required tables: ${missing_tables}" >&2
  exit 1
fi

missing_columns="$("${PSQL[@]}" -tA <<'SQL'
SET default_transaction_read_only = on;
SET statement_timeout TO :'statement_timeout_ms';
WITH required_columns AS (
  SELECT *
  FROM (
    VALUES
      ('ads', 'marketing_content_assets', 'ai_summary'),
      ('ads', 'marketing_content_assets', 'ai_score'),
      ('ads', 'marketing_content_assets', 'analysis_object_key'),
      ('ads', 'marketing_content_ad_materials', 'delivery_mode'),
      ('ads', 'marketing_content_ad_materials', 'objective'),
      ('ads', 'marketing_content_ad_materials', 'performance_source_table'),
      ('ads', 'marketing_content_ad_materials', 'data_quality_status'),
      ('ads', 'marketing_content_asset_objects', 'object_role'),
      ('ads', 'marketing_content_asset_objects', 'metadata'),
      ('ads', 'marketing_content_asset_video_understanding_jobs', 'model_name'),
      ('ads', 'marketing_content_asset_video_understanding_jobs', 'prompt_version'),
      ('ads', 'marketing_content_asset_video_understanding_jobs', 'analysis_schema_version'),
      ('ads', 'marketing_content_asset_video_understanding_jobs', 'input_snapshot_hash'),
      ('ads', 'marketing_content_asset_video_understanding_jobs', 'cache_key'),
      ('ads', 'marketing_content_asset_video_understanding_jobs', 'status'),
      ('ads', 'marketing_content_asset_video_understanding_results', 'result_json'),
      ('ads', 'marketing_content_asset_video_understanding_results', 'input_snapshot_hash'),
      ('ads', 'marketing_content_asset_video_understanding_results', 'cache_key'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'material_id'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'stat_date'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'asset_id'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'delivery_mode'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'objective'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'source_table'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'data_quality_status'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'sample_quality_status'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'overall_cost'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'overall_gmv'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'net_gmv'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'boost_cost'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'boost_gmv'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'raw_metrics'),
      ('dwd', 'marketing_content_qianchuan_material_performance_di', 'diagnosis_json'),
      ('dws', 'marketing_content_qianchuan_material_summary', 'material_id'),
      ('dws', 'marketing_content_qianchuan_material_summary', 'asset_id'),
      ('dws', 'marketing_content_qianchuan_material_summary', 'objective'),
      ('dws', 'marketing_content_qianchuan_material_summary', 'latest_live_acceptance_status'),
      ('dws', 'marketing_content_qianchuan_material_summary', 'diagnosis_json'),
      ('dws', 'marketing_content_qianchuan_material_summary', 'latest_metrics'),
      ('dws', 'marketing_content_asset_qianchuan_summary', 'asset_id'),
      ('dws', 'marketing_content_asset_qianchuan_summary', 'material_count'),
      ('dws', 'marketing_content_asset_qianchuan_summary', 'product_material_count'),
      ('dws', 'marketing_content_asset_qianchuan_summary', 'live_material_count'),
      ('dws', 'marketing_content_asset_qianchuan_summary', 'objective_breakdown'),
      ('dws', 'marketing_content_asset_qianchuan_summary', 'material_ids'),
      ('dws', 'marketing_content_qianchuan_live_room_acceptance_di', 'stat_date'),
      ('dws', 'marketing_content_qianchuan_live_room_acceptance_di', 'douyin_account_display_id'),
      ('dws', 'marketing_content_qianchuan_live_room_acceptance_di', 'live_watch_user_count'),
      ('dws', 'marketing_content_qianchuan_live_room_acceptance_di', 'live_product_click_user'),
      ('dws', 'marketing_content_qianchuan_live_room_acceptance_di', 'watch_to_pay_rate_user'),
      ('dws', 'marketing_content_qianchuan_live_room_acceptance_di', 'click_to_pay_rate_user')
  ) AS t(table_schema, table_name, column_name)
)
SELECT COALESCE(string_agg(c.table_schema || '.' || c.table_name || '.' || c.column_name, ', ' ORDER BY c.table_schema, c.table_name, c.column_name), '')
FROM required_columns c
LEFT JOIN information_schema.columns actual
  ON actual.table_schema = c.table_schema
 AND actual.table_name = c.table_name
 AND actual.column_name = c.column_name
WHERE actual.column_name IS NULL;
SQL
)"

if [[ -n "${missing_columns}" ]]; then
  echo "Missing required columns: ${missing_columns}" >&2
  exit 1
fi

echo "==> Running qianchuan/content-asset live readonly assertions"
field_separator=$'\t'
checks_output="$("${PSQL[@]}" -tA -F "${field_separator}" <<'SQL'
SET default_transaction_read_only = on;
SET statement_timeout TO :'statement_timeout_ms';

WITH metrics AS (
  SELECT
    (SELECT COUNT(*)::BIGINT
     FROM dwd.marketing_content_qianchuan_material_performance_di) AS dwd_rows,
    (SELECT COUNT(DISTINCT material_id)::BIGINT
     FROM dwd.marketing_content_qianchuan_material_performance_di) AS dwd_materials,
    (SELECT COUNT(DISTINCT material_id)::BIGINT
     FROM dwd.marketing_content_qianchuan_material_performance_di
     WHERE delivery_mode = 'qianchuan_all_domain'
       AND objective = 'product_all_domain_shortvideo'
       AND source_table = 'ods.douyin_qianchuan_shortvideo_raw') AS product_materials,
    (SELECT COUNT(DISTINCT material_id)::BIGINT
     FROM dwd.marketing_content_qianchuan_material_performance_di
     WHERE delivery_mode = 'qianchuan_all_domain'
       AND objective = 'live_all_domain_shortvideo'
       AND source_table = 'ods.douyin_qianchuan_live_video_raw') AS live_materials,
    (SELECT COUNT(*)::BIGINT
     FROM dwd.marketing_content_qianchuan_material_performance_di
     WHERE delivery_mode <> 'qianchuan_all_domain'
        OR objective NOT IN ('product_all_domain_shortvideo', 'live_all_domain_shortvideo')
        OR (
          objective = 'product_all_domain_shortvideo'
          AND source_table <> 'ods.douyin_qianchuan_shortvideo_raw'
        )
        OR (
          objective = 'live_all_domain_shortvideo'
          AND source_table <> 'ods.douyin_qianchuan_live_video_raw'
        )) AS objective_source_mismatches,
    (SELECT COUNT(DISTINCT asset_id)::BIGINT
     FROM dwd.marketing_content_qianchuan_material_performance_di
     WHERE asset_id IS NOT NULL) AS dwd_bound_assets,
    (SELECT COUNT(*)::BIGINT
     FROM (
       SELECT asset_id
       FROM dwd.marketing_content_qianchuan_material_performance_di
       WHERE asset_id IS NOT NULL
       GROUP BY asset_id
       HAVING COUNT(DISTINCT material_id) > 1
     ) multi_material_assets) AS dwd_multi_material_assets,
    (SELECT MAX(stat_date)
     FROM dwd.marketing_content_qianchuan_material_performance_di) AS latest_dwd_date,
    (SELECT COUNT(*)::BIGINT
     FROM dws.marketing_content_qianchuan_material_summary) AS summary_rows,
    (SELECT COUNT(DISTINCT asset_id)::BIGINT
     FROM dws.marketing_content_qianchuan_material_summary
     WHERE asset_id IS NOT NULL) AS summary_bound_assets,
    (SELECT MAX(last_stat_date)
     FROM dws.marketing_content_qianchuan_material_summary) AS latest_summary_date,
    (SELECT COUNT(*)::BIGINT
     FROM dws.marketing_content_asset_qianchuan_summary) AS asset_summary_rows,
    (SELECT COUNT(*)::BIGINT
     FROM dws.marketing_content_asset_qianchuan_summary
     WHERE material_count > 1) AS asset_summary_multi_material_assets,
    (SELECT COUNT(*)::BIGINT
     FROM dws.marketing_content_asset_qianchuan_summary
     WHERE product_material_count > 0
       AND live_material_count > 0) AS asset_summary_product_live_assets,
    (SELECT MAX(last_stat_date)
     FROM dws.marketing_content_asset_qianchuan_summary) AS latest_asset_summary_date,
    (SELECT COUNT(*)::BIGINT
     FROM dws.marketing_content_qianchuan_live_room_acceptance_di) AS live_acceptance_rows,
    (SELECT COALESCE(MAX(material_count), 0)::INTEGER
     FROM (
       SELECT asset_id, COUNT(DISTINCT material_id) AS material_count
       FROM dws.marketing_content_qianchuan_material_summary
       WHERE asset_id IS NOT NULL
       GROUP BY asset_id
     ) grouped) AS max_materials_per_asset,
    (SELECT COALESCE(MAX(row_count), 0)::INTEGER
     FROM (
       SELECT material_id, COUNT(*) AS row_count
       FROM dwd.marketing_content_qianchuan_material_performance_di
       GROUP BY material_id
     ) grouped) AS max_daily_rows_per_material,
    (SELECT COUNT(*)::BIGINT
     FROM dwd.marketing_content_qianchuan_material_performance_di
     WHERE data_quality_status IN ('duplicate_material_date', 'cross_source_conflict', 'missing_binding', 'duplicate_binding')) AS quality_exception_rows,
    (SELECT COUNT(*)::BIGINT
     FROM dwd.marketing_content_qianchuan_material_performance_di
     WHERE COALESCE(boost_cost, 0) <> 0
        OR COALESCE(boost_gmv, 0) <> 0
        OR COALESCE(legacy_boost_cost, 0) <> 0
        OR COALESCE(legacy_boost_gmv, 0) <> 0) AS rows_with_boost_metrics,
    (SELECT COUNT(*)::BIGINT
     FROM dwd.marketing_content_qianchuan_material_performance_di
     WHERE raw_metrics ? 'boostPolicy') AS rows_with_boost_policy,
    (SELECT COUNT(*)::BIGINT
     FROM ads.marketing_content_asset_video_understanding_jobs) AS video_jobs,
    (SELECT COUNT(*)::BIGINT
     FROM ads.marketing_content_asset_video_understanding_jobs
     WHERE status = 'succeeded') AS succeeded_video_jobs,
    (SELECT COUNT(*)::BIGINT
     FROM ads.marketing_content_asset_video_understanding_results) AS video_results,
    (SELECT COUNT(*)::BIGINT
     FROM ads.marketing_content_asset_video_understanding_results
     WHERE result_json ? 'analysis'
       AND (
         result_json->'analysis' ? 'timeline'
         OR result_json->'analysis' ? 'content_diagnosis'
         OR result_json->'analysis' ? 'contentDiagnosis'
       )) AS structured_video_results,
    (SELECT COUNT(*)::BIGINT
     FROM ads.marketing_content_asset_objects
     WHERE object_role = 'analysis') AS analysis_objects,
    (SELECT COUNT(*)::BIGINT
     FROM ads.marketing_content_asset_objects
     WHERE object_role = 'analysis'
       AND metadata->>'analysis_schema_version' = '2.1') AS v21_analysis_objects,
    (SELECT COUNT(*)::BIGINT
     FROM ads.marketing_content_asset_objects
     WHERE object_role = 'analysis'
       AND metadata->>'analysis_schema_version' = '2.1'
       AND metadata->>'delivery_mode' = 'qianchuan_all_domain'
       AND metadata->>'diagnosis_mode' IN ('data_content_fusion', 'data_only', 'content_only', 'insufficient_data')
       AND metadata ? 'primary_problem_stage'
       AND metadata ? 'final_root_cause_owner') AS v21_qianchuan_metadata_objects,
    (SELECT COUNT(*)::BIGINT
     FROM ads.marketing_content_assets
     WHERE analysis_object_key IS NOT NULL
       AND ai_summary IS NOT NULL
       AND ai_score IS NOT NULL) AS assets_with_ai_writeback
),
checks AS (
  SELECT 'dwd_has_rows' AS check_name,
         dwd_rows > 0 AS ok,
         FORMAT('rows=%s materials=%s bound_assets=%s latest=%s', dwd_rows, dwd_materials, dwd_bound_assets, latest_dwd_date) AS detail
  FROM metrics
  UNION ALL
  SELECT 'product_and_live_objectives_have_rows',
         product_materials > 0 AND live_materials > 0 AND objective_source_mismatches = 0,
         FORMAT('product_materials=%s live_materials=%s objective_source_mismatches=%s', product_materials, live_materials, objective_source_mismatches)
  FROM metrics
  UNION ALL
  SELECT 'dws_summary_has_rows',
         summary_rows > 0,
         FORMAT('rows=%s bound_assets=%s latest=%s', summary_rows, summary_bound_assets, latest_summary_date)
  FROM metrics
  UNION ALL
  SELECT 'dws_asset_summary_has_rows',
         asset_summary_rows > 0,
         FORMAT('rows=%s latest=%s', asset_summary_rows, latest_asset_summary_date)
  FROM metrics
  UNION ALL
  SELECT 'multi_material_asset_binding_exists',
         dwd_multi_material_assets > 0 OR asset_summary_multi_material_assets > 0,
         FORMAT('dwd_multi_material_assets=%s asset_summary_multi_material_assets=%s product_live_assets=%s', dwd_multi_material_assets, asset_summary_multi_material_assets, asset_summary_product_live_assets)
  FROM metrics
  UNION ALL
  SELECT 'dwd_has_asset_bindings',
         dwd_bound_assets > 0,
         FORMAT('bound_assets=%s', dwd_bound_assets)
  FROM metrics
  UNION ALL
  SELECT 'live_acceptance_has_rows',
         live_acceptance_rows > 0,
         FORMAT('rows=%s', live_acceptance_rows)
  FROM metrics
  UNION ALL
  SELECT 'freshness_within_window',
         GREATEST(COALESCE(latest_dwd_date, DATE '1900-01-01'), COALESCE(latest_summary_date, DATE '1900-01-01'))
           >= CURRENT_DATE - ((:'max_staleness_days')::INTEGER * INTERVAL '1 day'),
         FORMAT('latest_dwd=%s latest_summary=%s max_staleness_days=%s', latest_dwd_date, latest_summary_date, :'max_staleness_days')
  FROM metrics
  UNION ALL
  SELECT 'material_cardinality_measurable',
         max_materials_per_asset > 0 AND max_daily_rows_per_material > 0,
         FORMAT('max_materials_per_asset=%s max_daily_rows_per_material=%s', max_materials_per_asset, max_daily_rows_per_material)
  FROM metrics
  UNION ALL
  SELECT 'boost_metrics_are_separate_and_observable',
         rows_with_boost_metrics > 0 OR rows_with_boost_policy > 0,
         FORMAT('rows_with_boost_metrics=%s rows_with_boost_policy=%s', rows_with_boost_metrics, rows_with_boost_policy)
  FROM metrics
  UNION ALL
  SELECT 'quality_exception_state_measurable',
         quality_exception_rows >= 0,
         FORMAT('quality_exception_rows=%s', quality_exception_rows)
  FROM metrics
  UNION ALL
  SELECT 'video_understanding_artifacts_exist',
         video_jobs > 0 AND succeeded_video_jobs > 0 AND video_results > 0,
         FORMAT('jobs=%s succeeded=%s results=%s', video_jobs, succeeded_video_jobs, video_results)
  FROM metrics
  UNION ALL
  SELECT 'structured_video_results_exist',
         structured_video_results > 0,
         FORMAT('structured_results=%s', structured_video_results)
  FROM metrics
  UNION ALL
  SELECT 'v21_analysis_writeback_exists',
         analysis_objects > 0 AND v21_analysis_objects > 0 AND v21_qianchuan_metadata_objects > 0 AND assets_with_ai_writeback > 0,
         FORMAT('analysis_objects=%s v21_objects=%s v21_qianchuan_metadata=%s assets_with_ai_writeback=%s', analysis_objects, v21_analysis_objects, v21_qianchuan_metadata_objects, assets_with_ai_writeback)
  FROM metrics
)
SELECT check_name,
       CASE WHEN ok THEN 'ok' ELSE 'fail' END AS status,
       detail
FROM checks
ORDER BY check_name;
SQL
)"

printf '%-45s %-6s %s\n' "check_name" "status" "detail"
printf '%-45s %-6s %s\n' "----------" "------" "------"
printf '%s\n' "${checks_output}" | awk -F "${field_separator}" '{ printf "%-45s %-6s %s\n", $1, $2, $3 }'

failed_checks="$(
  printf '%s\n' "${checks_output}" \
    | awk -F "${field_separator}" '$2 != "ok" { print $1 ": " $3 }'
)"

if [[ -n "${failed_checks}" ]]; then
  echo "qianchuan live readonly smoke failed:" >&2
  echo "${failed_checks}" >&2
  exit 1
fi

echo "qianchuan live readonly smoke passed"
