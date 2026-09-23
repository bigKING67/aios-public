BEGIN;

DROP TRIGGER IF EXISTS trg_touch_douyin_shortvideo_detail_updated_at ON ads.douyin_shortvideo_detail;
DROP FUNCTION IF EXISTS ads.fn_touch_douyin_shortvideo_detail_updated_at();
DROP PROCEDURE IF EXISTS ads.refresh_douyin_shortvideo_detail_incremental(INTEGER, BOOLEAN);
DROP PROCEDURE IF EXISTS ads.refresh_douyin_shortvideo_detail(DATE, DATE);
DROP TABLE IF EXISTS etl.douyin_shortvideo_detail_refresh_state;
DROP TABLE IF EXISTS ads.douyin_shortvideo_detail;

CREATE TABLE ads.douyin_shortvideo_detail (
  stat_date DATE NOT NULL,
  account_type TEXT NOT NULL DEFAULT '未归类',
  video_title TEXT NOT NULL DEFAULT '(未命名短视频)',
  video_id TEXT NOT NULL DEFAULT '',
  is_promoted TEXT NOT NULL DEFAULT '',
  play_url TEXT,
  publish_time TIMESTAMP WITHOUT TIME ZONE,
  author_nickname TEXT NOT NULL DEFAULT '(未命名达人)',
  author_douyin_id TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  video_view_count BIGINT NOT NULL DEFAULT 0,
  user_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  live_room_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  search_after_view_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  shop_page_pay_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  source_updated_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_douyin_shortvideo_detail
    PRIMARY KEY (stat_date, video_id, author_douyin_id, product_id),
  CONSTRAINT chk_douyin_shortvideo_detail_non_negative
    CHECK (
      video_view_count >= 0
      AND user_pay_amount >= 0
      AND refund_amount >= 0
      AND live_room_pay_amount >= 0
      AND search_after_view_pay_amount >= 0
      AND shop_page_pay_amount >= 0
    )
);

COMMENT ON TABLE ads.douyin_shortvideo_detail IS '抖音短视频明细事实表（ODS 原字段对齐版）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.stat_date IS '日期（来自 ODS 成交日期 stat_date）。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.account_type IS '账号类型。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.video_title IS '视频标题。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.video_id IS '视频ID。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.is_promoted IS '是否投放。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.play_url IS '播放链接。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.publish_time IS '发布时间。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.author_nickname IS '达人昵称。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.author_douyin_id IS '达人抖音号。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.product_id IS '带货商品ID。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.video_view_count IS '视频观看次数。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.user_pay_amount IS '用户支付金额(元)。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.refund_amount IS '退款金额(元)。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.live_room_pay_amount IS '引流直播间用户支付金额(元)。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.search_after_view_pay_amount IS '看后搜用户支付金额(元)。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.shop_page_pay_amount IS '引流店铺页用户支付金额(元)。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.source_updated_at IS '当前明细行对应的源表更新时间。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.created_at IS '记录创建时间。';
COMMENT ON COLUMN ads.douyin_shortvideo_detail.updated_at IS '记录更新时间。';

CREATE INDEX idx_douyin_shortvideo_detail_stat_date
  ON ads.douyin_shortvideo_detail (stat_date);
CREATE INDEX idx_douyin_shortvideo_detail_account_type_stat_date
  ON ads.douyin_shortvideo_detail (account_type, stat_date);
CREATE INDEX idx_douyin_shortvideo_detail_author_stat_date
  ON ads.douyin_shortvideo_detail (author_douyin_id, stat_date DESC);
CREATE INDEX idx_douyin_shortvideo_detail_publish_time_desc
  ON ads.douyin_shortvideo_detail (publish_time DESC);
CREATE INDEX idx_douyin_shortvideo_detail_source_updated_at
  ON ads.douyin_shortvideo_detail (source_updated_at);

COMMENT ON INDEX ads.idx_douyin_shortvideo_detail_stat_date IS '按日期过滤索引。';
COMMENT ON INDEX ads.idx_douyin_shortvideo_detail_account_type_stat_date IS '按达人类型+日期过滤索引。';
COMMENT ON INDEX ads.idx_douyin_shortvideo_detail_author_stat_date IS '按达人抖音号+日期查询索引。';
COMMENT ON INDEX ads.idx_douyin_shortvideo_detail_publish_time_desc IS '按发布时间倒序索引。';
COMMENT ON INDEX ads.idx_douyin_shortvideo_detail_source_updated_at IS '按源更新时间增量查询索引。';

CREATE OR REPLACE FUNCTION ads.fn_touch_douyin_shortvideo_detail_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_douyin_shortvideo_detail_updated_at
BEFORE UPDATE ON ads.douyin_shortvideo_detail
FOR EACH ROW
EXECUTE FUNCTION ads.fn_touch_douyin_shortvideo_detail_updated_at();

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_shortvideo_detail(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_deleted_rows INTEGER := 0;
  v_inserted_rows INTEGER := 0;
BEGIN
  IF to_regclass('ods.douyin_trade_sale_shortvideo_raw') IS NULL THEN
    RAISE EXCEPTION 'source table ods.douyin_trade_sale_shortvideo_raw does not exist';
  END IF;

  IF to_regclass('ads.douyin_shortvideo_detail') IS NULL THEN
    RAISE EXCEPTION 'target table ads.douyin_shortvideo_detail does not exist';
  END IF;

  SELECT
    COALESCE(p_start_date, MIN(src.stat_date)),
    COALESCE(p_end_date, MAX(src.stat_date))
  INTO v_start_date, v_end_date
  FROM ods.douyin_trade_sale_shortvideo_raw src
  WHERE src.stat_date IS NOT NULL;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'ods.douyin_trade_sale_shortvideo_raw has no stat_date rows, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  DELETE FROM ads.douyin_shortvideo_detail
  WHERE stat_date BETWEEN v_start_date AND v_end_date;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  INSERT INTO ads.douyin_shortvideo_detail (
    stat_date,
    account_type,
    video_title,
    video_id,
    is_promoted,
    play_url,
    publish_time,
    author_nickname,
    author_douyin_id,
    product_id,
    video_view_count,
    user_pay_amount,
    refund_amount,
    live_room_pay_amount,
    search_after_view_pay_amount,
    shop_page_pay_amount,
    source_updated_at
  )
  WITH source_ranked AS (
    SELECT
      src.stat_date::DATE AS stat_date,
      COALESCE(NULLIF(BTRIM(src.account_type), ''), '未归类') AS account_type,
      COALESCE(NULLIF(BTRIM(src.video_title), ''), '(未命名短视频)') AS video_title,
      COALESCE(NULLIF(BTRIM(src.video_id), ''), '') AS video_id,
      COALESCE(NULLIF(BTRIM(src.is_promoted), ''), '') AS is_promoted,
      NULLIF(BTRIM(src.play_url), '') AS play_url,
      src.publish_time AS publish_time,
      COALESCE(NULLIF(BTRIM(src.author_nickname), ''), '(未命名达人)') AS author_nickname,
      COALESCE(NULLIF(BTRIM(src.author_douyin_id), ''), '') AS author_douyin_id,
      COALESCE(NULLIF(BTRIM(src.product_id), ''), '') AS product_id,
      COALESCE(src.video_view_count, 0)::BIGINT AS video_view_count,
      COALESCE(src.user_pay_amount, 0)::NUMERIC(18, 2) AS user_pay_amount,
      COALESCE(src.refund_amount, 0)::NUMERIC(18, 2) AS refund_amount,
      COALESCE(src.live_room_pay_amount, 0)::NUMERIC(18, 2) AS live_room_pay_amount,
      COALESCE(src.search_after_view_pay_amount, 0)::NUMERIC(18, 2) AS search_after_view_pay_amount,
      COALESCE(src.shop_page_pay_amount, 0)::NUMERIC(18, 2) AS shop_page_pay_amount,
      COALESCE(src.updated_at, src.publish_time, src.stat_date::TIMESTAMP) AS source_updated_at,
      ROW_NUMBER() OVER (
        PARTITION BY
          src.stat_date,
          COALESCE(NULLIF(BTRIM(src.video_id), ''), ''),
          COALESCE(NULLIF(BTRIM(src.author_douyin_id), ''), ''),
          COALESCE(NULLIF(BTRIM(src.product_id), ''), '')
        ORDER BY
          COALESCE(src.updated_at, src.publish_time, src.stat_date::TIMESTAMP) DESC,
          src.publish_time DESC NULLS LAST
      ) AS rn
    FROM ods.douyin_trade_sale_shortvideo_raw src
    WHERE src.stat_date BETWEEN v_start_date AND v_end_date
  )
  SELECT
    sr.stat_date,
    sr.account_type,
    sr.video_title,
    sr.video_id,
    sr.is_promoted,
    sr.play_url,
    sr.publish_time,
    sr.author_nickname,
    sr.author_douyin_id,
    sr.product_id,
    sr.video_view_count,
    sr.user_pay_amount,
    sr.refund_amount,
    sr.live_room_pay_amount,
    sr.search_after_view_pay_amount,
    sr.shop_page_pay_amount,
    sr.source_updated_at
  FROM source_ranked sr
  WHERE sr.rn = 1;

  GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

  RAISE NOTICE
    'refresh_douyin_shortvideo_detail completed, inserted_rows: %, deleted_rows: %, window: [% - %]',
    v_inserted_rows,
    v_deleted_rows,
    v_start_date,
    v_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_shortvideo_detail(DATE, DATE)
IS '按日期窗口刷新抖音短视频明细事实表（ODS 原字段对齐版）。';

CREATE TABLE etl.douyin_shortvideo_detail_refresh_state (
  id SMALLINT PRIMARY KEY,
  last_source_updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
  last_refresh_at TIMESTAMP WITHOUT TIME ZONE,
  last_refresh_start_date DATE,
  last_refresh_end_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_douyin_shortvideo_detail_refresh_state_id CHECK (id = 1)
);

COMMENT ON TABLE etl.douyin_shortvideo_detail_refresh_state IS '抖音短视频明细事实表增量刷新水位状态表。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.id IS '单行主键，固定值 1。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.last_source_updated_at IS '已处理的源表最大更新时间水位（来自 ODS updated_at/publish_time/stat_date）。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.last_refresh_at IS '最近一次增量刷新执行时间。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.last_refresh_start_date IS '最近一次刷新窗口起始日期。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.last_refresh_end_date IS '最近一次刷新窗口结束日期。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.created_at IS '记录创建时间。';
COMMENT ON COLUMN etl.douyin_shortvideo_detail_refresh_state.updated_at IS '记录更新时间。';

INSERT INTO etl.douyin_shortvideo_detail_refresh_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE PROCEDURE ads.refresh_douyin_shortvideo_detail_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_source_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_source_max_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_min_date DATE;
  v_max_date DATE;
  v_refresh_start_date DATE;
  v_refresh_end_date DATE;
  v_fallback_start_date DATE;
  v_fallback_end_date DATE;
  v_now TIMESTAMP WITHOUT TIME ZONE := NOW();
BEGIN
  IF p_fallback_window_days <= 0 THEN
    RAISE EXCEPTION 'fallback_window_days must be greater than 0';
  END IF;

  INSERT INTO etl.douyin_shortvideo_detail_refresh_state (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT last_source_updated_at
  INTO v_last_source_updated_at
  FROM etl.douyin_shortvideo_detail_refresh_state
  WHERE id = 1
  FOR UPDATE;

  SELECT
    MAX(COALESCE(src.updated_at, src.publish_time, src.stat_date::TIMESTAMP))
  INTO v_source_max_updated_at
  FROM ods.douyin_trade_sale_shortvideo_raw src;

  v_source_max_updated_at := COALESCE(v_source_max_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  IF p_init_watermark_only THEN
    UPDATE etl.douyin_shortvideo_detail_refresh_state
    SET
      last_source_updated_at = v_source_max_updated_at,
      last_refresh_at = v_now,
      updated_at = v_now
    WHERE id = 1;

    RAISE NOTICE 'init watermark completed, last_source_updated_at %', v_source_max_updated_at;
    RETURN;
  END IF;

  SELECT
    MIN(src.stat_date),
    MAX(src.stat_date)
  INTO v_min_date, v_max_date
  FROM ods.douyin_trade_sale_shortvideo_raw src
  WHERE src.stat_date IS NOT NULL
    AND COALESCE(src.updated_at, src.publish_time, src.stat_date::TIMESTAMP)
      > COALESCE(v_last_source_updated_at, TIMESTAMP '1970-01-01 00:00:00');

  SELECT MAX(src.stat_date)
  INTO v_fallback_end_date
  FROM ods.douyin_trade_sale_shortvideo_raw src
  WHERE src.stat_date IS NOT NULL;

  v_fallback_end_date := COALESCE(v_fallback_end_date, CURRENT_DATE);
  v_fallback_start_date := v_fallback_end_date - (p_fallback_window_days - 1);

  v_refresh_start_date := LEAST(
    COALESCE(v_min_date, v_fallback_start_date),
    v_fallback_start_date
  );

  v_refresh_end_date := GREATEST(
    COALESCE(v_max_date, v_fallback_end_date),
    v_fallback_end_date
  );

  IF v_refresh_start_date > v_refresh_end_date THEN
    v_refresh_start_date := v_fallback_start_date;
    v_refresh_end_date := v_fallback_end_date;
  END IF;

  CALL ads.refresh_douyin_shortvideo_detail(v_refresh_start_date, v_refresh_end_date);

  UPDATE etl.douyin_shortvideo_detail_refresh_state
  SET
    last_source_updated_at = v_source_max_updated_at,
    last_refresh_at = v_now,
    last_refresh_start_date = v_refresh_start_date,
    last_refresh_end_date = v_refresh_end_date,
    updated_at = v_now
  WHERE id = 1;

  RAISE NOTICE
    'incremental refresh completed, source watermark %, refresh window [% - %]',
    v_source_max_updated_at,
    v_refresh_start_date,
    v_refresh_end_date;
END;
$$;

COMMENT ON PROCEDURE ads.refresh_douyin_shortvideo_detail_incremental(INTEGER, BOOLEAN)
IS '按 ODS 更新时间增量刷新抖音短视频明细事实表（ODS 原字段对齐版），并固定回刷最近窗口，支持仅初始化水位。';

CALL ads.refresh_douyin_shortvideo_detail_incremental(14, TRUE);

COMMIT;
