WITH table_state AS (
  SELECT
    to_regclass('ads.marketing_content_asset_video_understanding_jobs') IS NOT NULL AS jobs_table_available,
    to_regclass('ads.marketing_content_asset_video_understanding_results') IS NOT NULL AS results_table_available,
    to_regclass('ads.marketing_content_asset_brand_resolutions') IS NOT NULL AS brand_resolution_table_available
),
required_columns(table_name, column_name) AS (
  VALUES
    ('marketing_content_asset_video_understanding_jobs', 'job_id'),
    ('marketing_content_asset_video_understanding_jobs', 'asset_id'),
    ('marketing_content_asset_video_understanding_jobs', 'object_id'),
    ('marketing_content_asset_video_understanding_jobs', 'media_hash'),
    ('marketing_content_asset_video_understanding_jobs', 'storage_key'),
    ('marketing_content_asset_video_understanding_jobs', 'model_name'),
    ('marketing_content_asset_video_understanding_jobs', 'prompt_version'),
    ('marketing_content_asset_video_understanding_jobs', 'analysis_schema_version'),
    ('marketing_content_asset_video_understanding_jobs', 'input_snapshot_hash'),
    ('marketing_content_asset_video_understanding_jobs', 'cache_key'),
    ('marketing_content_asset_video_understanding_jobs', 'status'),
    ('marketing_content_asset_video_understanding_jobs', 'started_at'),
    ('marketing_content_asset_video_understanding_jobs', 'finished_at'),
    ('marketing_content_asset_video_understanding_jobs', 'updated_at'),
    ('marketing_content_asset_video_understanding_results', 'result_id'),
    ('marketing_content_asset_video_understanding_results', 'asset_id'),
    ('marketing_content_asset_video_understanding_results', 'object_id'),
    ('marketing_content_asset_video_understanding_results', 'media_hash'),
    ('marketing_content_asset_video_understanding_results', 'model_name'),
    ('marketing_content_asset_video_understanding_results', 'prompt_version'),
    ('marketing_content_asset_video_understanding_results', 'analysis_schema_version'),
    ('marketing_content_asset_video_understanding_results', 'input_snapshot_hash'),
    ('marketing_content_asset_video_understanding_results', 'cache_key'),
    ('marketing_content_asset_video_understanding_results', 'result_json'),
    ('marketing_content_asset_video_understanding_results', 'confidence'),
    ('marketing_content_asset_video_understanding_results', 'updated_at')
)
SELECT
  table_state.jobs_table_available,
  table_state.results_table_available,
  table_state.brand_resolution_table_available,
  table_state.jobs_table_available
    AND table_state.results_table_available
    AND NOT EXISTS (
      SELECT 1
      FROM required_columns required
      WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns column_info
        WHERE column_info.table_schema = 'ads'
          AND column_info.table_name = required.table_name
          AND column_info.column_name = required.column_name
      )
    ) AS storage_ready
FROM table_state
