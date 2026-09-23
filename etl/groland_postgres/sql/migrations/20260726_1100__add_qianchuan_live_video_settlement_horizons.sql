-- The production live-video ODS table historically shipped only the 7-day
-- boost settlement horizon. Keep the longer horizons nullable so the canonical
-- refresh can consume both legacy and future source exports without fabricating
-- zero-valued metrics.
ALTER TABLE ods.douyin_qianchuan_live_video_raw
  ADD COLUMN IF NOT EXISTS boost_settlement_roi_14d NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS boost_settlement_amount_14d NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS boost_settlement_order_count_14d INTEGER,
  ADD COLUMN IF NOT EXISTS boost_settlement_order_cost_14d NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS boost_gmv_settlement_rate_14d NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS boost_order_settlement_rate_14d NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS boost_settlement_roi_30d NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS boost_settlement_amount_30d NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS boost_settlement_order_count_30d INTEGER,
  ADD COLUMN IF NOT EXISTS boost_settlement_order_cost_30d NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS boost_gmv_settlement_rate_30d NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS boost_order_settlement_rate_30d NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS boost_settlement_roi_90d NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS boost_settlement_amount_90d NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS boost_settlement_order_count_90d INTEGER,
  ADD COLUMN IF NOT EXISTS boost_settlement_order_cost_90d NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS boost_gmv_settlement_rate_90d NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS boost_order_settlement_rate_90d NUMERIC(18, 6);
