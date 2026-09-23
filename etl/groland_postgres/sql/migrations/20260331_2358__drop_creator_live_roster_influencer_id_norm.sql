BEGIN;

CREATE OR REPLACE PROCEDURE ads.refresh_creator_live_influencer_roster()
LANGUAGE plpgsql
AS $$
DECLARE
  v_latest_loaded_at TIMESTAMP WITHOUT TIME ZONE;
  v_inserted_rows INTEGER;
BEGIN
  IF to_regclass('ods.feishu_influencer_live') IS NULL THEN
    RAISE EXCEPTION 'source table ods.feishu_influencer_live does not exist';
  END IF;

  SELECT MAX(etl_loaded_at)
  INTO v_latest_loaded_at
  FROM ods.feishu_influencer_live;

  TRUNCATE TABLE ads.creator_live_influencer_roster;

  IF v_latest_loaded_at IS NULL THEN
    RAISE NOTICE 'refresh_creator_live_influencer_roster skipped, source table is empty';
    RETURN;
  END IF;

  INSERT INTO ads.creator_live_influencer_roster (
    sequence_no,
    influencer_name,
    influencer_id,
    anchor_desc,
    anchor_level,
    platform,
    main_platform_fans,
    sales_30d,
    sales_90d,
    cooperation_status,
    cooperation_status_norm,
    cooperation_desc,
    owner_name,
    source_file_name,
    source_etl_loaded_at
  )
  SELECT
    src.sequence_no,
    COALESCE(NULLIF(BTRIM(src.influencer_name), ''), '(未命名达人)') AS influencer_name,
    NULLIF(BTRIM(src.influencer_id), '') AS influencer_id,
    NULLIF(BTRIM(src.anchor_desc), '') AS anchor_desc,
    NULLIF(BTRIM(src.anchor_level), '') AS anchor_level,
    NULLIF(BTRIM(src.platform), '') AS platform,
    NULLIF(BTRIM(src.main_platform_fans), '') AS main_platform_fans,
    NULLIF(BTRIM(src.sales_30d), '') AS sales_30d,
    NULLIF(BTRIM(src.sales_90d), '') AS sales_90d,
    NULLIF(BTRIM(src.cooperation_status), '') AS cooperation_status,
    COALESCE(NULLIF(BTRIM(src.cooperation_status), ''), '未分类') AS cooperation_status_norm,
    NULLIF(BTRIM(src.cooperation_desc), '') AS cooperation_desc,
    NULLIF(BTRIM(src.owner_name), '') AS owner_name,
    src.source_file_name,
    src.etl_loaded_at
  FROM ods.feishu_influencer_live src
  WHERE src.etl_loaded_at = v_latest_loaded_at;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_creator_live_influencer_roster completed, source_etl_loaded_at: %, inserted_rows: %',
    v_latest_loaded_at,
    v_inserted_rows;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_creator_live_influencer_roster()
IS '刷新直播达人名册快照：仅保留 ods.feishu_influencer_live 最新批次。';

DROP INDEX IF EXISTS ads.idx_creator_live_influencer_roster_influencer_id_norm;

ALTER TABLE ads.creator_live_influencer_roster
  DROP COLUMN IF EXISTS influencer_id_norm;

COMMIT;
