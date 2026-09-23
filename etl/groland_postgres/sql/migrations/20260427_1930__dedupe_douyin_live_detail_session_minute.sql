-- Deduplicate Douyin live sessions whose source start time only differs by seconds.
-- The ODS live feed can emit the same session multiple times with identical end time
-- and metric payload but slightly different live_start_time seconds.

DO $$
BEGIN
  IF to_regclass('ads.douyin_live_detail') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_live_detail does not exist; apply 20260423_1600 first';
  END IF;
END $$;

WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY
        shop_id,
        anchor_douyin_id,
        stat_date,
        DATE_TRUNC('minute', live_start_time),
        COALESCE(live_end_time, TIMESTAMP '1970-01-01 00:00:00')
      ORDER BY
        COALESCE(source_updated_at, updated_at, created_at, live_start_time) DESC,
        live_gmv DESC,
        created_at DESC NULLS LAST,
        live_start_time DESC,
        live_end_time DESC NULLS LAST
    ) AS rn
  FROM ads.douyin_live_detail
)
DELETE FROM ads.douyin_live_detail d
USING ranked r
WHERE d.ctid = r.ctid
  AND r.rn > 1;

CREATE OR REPLACE FUNCTION ads.fn_douyin_live_detail_dedupe_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing ads.douyin_live_detail%ROWTYPE;
  v_new_rank_ts TIMESTAMP WITHOUT TIME ZONE;
  v_existing_rank_ts TIMESTAMP WITHOUT TIME ZONE;
BEGIN
  SELECT *
  INTO v_existing
  FROM ads.douyin_live_detail d
  WHERE d.shop_id = NEW.shop_id
    AND d.anchor_douyin_id = NEW.anchor_douyin_id
    AND d.stat_date = NEW.stat_date
    AND DATE_TRUNC('minute', d.live_start_time) = DATE_TRUNC('minute', NEW.live_start_time)
    AND COALESCE(d.live_end_time, TIMESTAMP '1970-01-01 00:00:00')
      = COALESCE(NEW.live_end_time, TIMESTAMP '1970-01-01 00:00:00')
  ORDER BY
    COALESCE(d.source_updated_at, d.updated_at, d.created_at, d.live_start_time) DESC,
    d.live_gmv DESC,
    d.created_at DESC NULLS LAST,
    d.live_start_time DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_new_rank_ts := COALESCE(NEW.source_updated_at, NEW.updated_at, NEW.created_at, NEW.live_start_time);
  v_existing_rank_ts := COALESCE(
    v_existing.source_updated_at,
    v_existing.updated_at,
    v_existing.created_at,
    v_existing.live_start_time
  );

  IF v_new_rank_ts > v_existing_rank_ts
    OR (
      v_new_rank_ts = v_existing_rank_ts
      AND (
        NEW.live_gmv > v_existing.live_gmv
        OR (NEW.live_gmv = v_existing.live_gmv AND NEW.live_start_time > v_existing.live_start_time)
      )
    )
  THEN
    DELETE FROM ads.douyin_live_detail d
    WHERE d.shop_id = v_existing.shop_id
      AND d.anchor_douyin_id = v_existing.anchor_douyin_id
      AND d.live_start_time = v_existing.live_start_time;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_douyin_live_detail_dedupe_before_insert ON ads.douyin_live_detail;
CREATE TRIGGER trg_douyin_live_detail_dedupe_before_insert
BEFORE INSERT ON ads.douyin_live_detail
FOR EACH ROW
EXECUTE FUNCTION ads.fn_douyin_live_detail_dedupe_before_insert();

DROP INDEX IF EXISTS ads.idx_douyin_live_detail_session_minute_unique;
CREATE UNIQUE INDEX idx_douyin_live_detail_session_minute_unique
  ON ads.douyin_live_detail (
    shop_id,
    anchor_douyin_id,
    stat_date,
    DATE_TRUNC('minute', live_start_time),
    COALESCE(live_end_time, TIMESTAMP '1970-01-01 00:00:00')
  );

COMMENT ON FUNCTION ads.fn_douyin_live_detail_dedupe_before_insert()
  IS '直播场次写入防重：同店铺、同主播、同日期、同开始分钟、同结束时间视为同一场，保留最新源记录。';
COMMENT ON INDEX ads.idx_douyin_live_detail_session_minute_unique
  IS '直播场次业务唯一约束：消除 ODS live_start_time 秒级抖动造成的重复场次。';
