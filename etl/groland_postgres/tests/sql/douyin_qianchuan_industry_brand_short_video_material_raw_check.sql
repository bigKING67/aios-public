SELECT
  to_regclass('ods.douyin_qianchuan_industry_brand_short_video_material_raw') IS NOT NULL AS table_exists,
  COUNT(*) FILTER (
    WHERE column_name IN (
      'record_id',
      'archive_id',
      'source_task_name',
      'stat_month',
      'qianchuan_scene',
      'video_type',
      'source_rank',
      'video_title',
      'raw_exposure_count',
      'raw_completion_rate',
      'raw_ctr',
      'raw_cvr',
      'raw_3s_completion_rate',
      'raw_5s_completion_rate',
      'raw_interaction_rate',
      'raw_pvr',
      'asset_id',
      'tos_object_key',
      'raw_sha256',
      'row_payload'
    )
  ) AS required_column_count
FROM information_schema.columns
WHERE table_schema = 'ods'
  AND table_name = 'douyin_qianchuan_industry_brand_short_video_material_raw';
