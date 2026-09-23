BEGIN;

DO $$
BEGIN
  IF to_regclass('etl.douyin_live_dashboard_daily_refresh_state') IS NULL THEN
    RAISE EXCEPTION
      'table etl.douyin_live_dashboard_daily_refresh_state does not exist; apply migration 20260422_1510 first';
  END IF;
END;
$$;

COMMENT ON TABLE etl.douyin_live_dashboard_daily_refresh_state
  IS '抖音直播看板日事实增量刷新水位状态表（单行记录当前增量游标与最近刷新窗口）。';

COMMENT ON COLUMN etl.douyin_live_dashboard_daily_refresh_state.id
  IS '状态主键（固定为 1，保证全局仅一条刷新状态）。';
COMMENT ON COLUMN etl.douyin_live_dashboard_daily_refresh_state.last_source_updated_at
  IS '已处理的源表最大更新时间水位（来自 ods.douyin_trade_sale_live_raw 的 updated_at/created_at/live_start_time）。';
COMMENT ON COLUMN etl.douyin_live_dashboard_daily_refresh_state.last_refresh_at
  IS '最近一次增量刷新执行时间。';
COMMENT ON COLUMN etl.douyin_live_dashboard_daily_refresh_state.last_refresh_start_date
  IS '最近一次增量刷新覆盖窗口起始日期（含）。';
COMMENT ON COLUMN etl.douyin_live_dashboard_daily_refresh_state.last_refresh_end_date
  IS '最近一次增量刷新覆盖窗口结束日期（含）。';
COMMENT ON COLUMN etl.douyin_live_dashboard_daily_refresh_state.created_at
  IS '状态行创建时间。';
COMMENT ON COLUMN etl.douyin_live_dashboard_daily_refresh_state.updated_at
  IS '状态行最近更新时间。';

COMMIT;
