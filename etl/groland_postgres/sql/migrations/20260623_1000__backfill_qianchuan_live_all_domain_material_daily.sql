-- Backfill the qianchuan live ADS material table across all currently loaded ODS dates.
-- The dashboard date picker reads this ADS table, so historical ODS-only dates must be materialized.
DO $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  WITH source_dates AS (
    SELECT stat_date
    FROM ods.douyin_qianchuan_live_room_screen_raw
    UNION ALL
    SELECT stat_date
    FROM ods.douyin_qianchuan_live_video_raw
  )
  SELECT MIN(stat_date), MAX(stat_date)
  INTO v_start_date, v_end_date
  FROM source_dates;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RETURN;
  END IF;

  PERFORM *
  FROM ads.refresh_douyin_qianchuan_live_all_domain_material_daily(v_start_date, v_end_date);
END;
$$;
