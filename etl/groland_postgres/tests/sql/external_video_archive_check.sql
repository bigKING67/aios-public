SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE archive_status = 'queued') AS queued_rows,
  COUNT(*) FILTER (WHERE archive_status = 'running') AS running_rows,
  COUNT(*) FILTER (WHERE archive_status = 'succeeded') AS succeeded_rows,
  COUNT(*) FILTER (WHERE archive_status = 'failed') AS failed_rows,
  COUNT(*) FILTER (WHERE archive_status = 'skipped') AS skipped_rows,
  COUNT(*) FILTER (WHERE archive_status = 'succeeded' AND asset_id IS NULL) AS succeeded_without_asset,
  COUNT(*) FILTER (WHERE archive_status = 'succeeded' AND raw_object_key IS NULL) AS succeeded_without_raw_object,
  COUNT(*) FILTER (WHERE archive_status IN ('queued', 'running') AND NULLIF(cdn_url, '') IS NULL) AS pending_without_cdn
FROM ods.external_video_archive_raw;
