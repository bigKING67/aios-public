DO $$
DECLARE
  missing_columns TEXT;
  missing_indexes TEXT;
BEGIN
  IF to_regclass('ads.marketing_content_asset_video_understanding_jobs') IS NULL THEN
    RAISE EXCEPTION 'missing ads.marketing_content_asset_video_understanding_jobs';
  END IF;

  IF to_regclass('ads.marketing_content_asset_video_understanding_results') IS NULL THEN
    RAISE EXCEPTION 'missing ads.marketing_content_asset_video_understanding_results';
  END IF;

  SELECT STRING_AGG(required.column_name, ', ' ORDER BY required.column_name)
  INTO missing_columns
  FROM (
    VALUES
      ('marketing_content_asset_video_understanding_jobs', 'analysis_schema_version'),
      ('marketing_content_asset_video_understanding_jobs', 'input_snapshot_hash'),
      ('marketing_content_asset_video_understanding_jobs', 'cache_key'),
      ('marketing_content_asset_video_understanding_results', 'analysis_schema_version'),
      ('marketing_content_asset_video_understanding_results', 'input_snapshot_hash'),
      ('marketing_content_asset_video_understanding_results', 'cache_key'),
      ('marketing_content_asset_video_understanding_results', 'result_json')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns column_info
    WHERE column_info.table_schema = 'ads'
      AND column_info.table_name = required.table_name
      AND column_info.column_name = required.column_name
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'missing video understanding columns: %', missing_columns;
  END IF;

  SELECT STRING_AGG(required.index_name, ', ' ORDER BY required.index_name)
  INTO missing_indexes
  FROM (
    VALUES
      ('idx_content_asset_video_understanding_job_cache'),
      ('idx_content_asset_video_understanding_jobs_cache_key'),
      ('idx_content_asset_video_understanding_result_cache'),
      ('idx_content_asset_video_understanding_results_cache_key')
  ) AS required(index_name)
  WHERE to_regclass('ads.' || required.index_name) IS NULL;

  IF missing_indexes IS NOT NULL THEN
    RAISE EXCEPTION 'missing video understanding indexes: %', missing_indexes;
  END IF;

  IF obj_description('ads.marketing_content_asset_video_understanding_jobs'::REGCLASS) IS NULL
     OR obj_description('ads.marketing_content_asset_video_understanding_results'::REGCLASS) IS NULL THEN
    RAISE EXCEPTION 'video understanding table comments are required';
  END IF;
END;
$$;

SELECT
  to_regclass('ads.marketing_content_asset_video_understanding_jobs') IS NOT NULL AS jobs_ready,
  to_regclass('ads.marketing_content_asset_video_understanding_results') IS NOT NULL AS results_ready;
