BEGIN;

DROP INDEX IF EXISTS ads.idx_all_trade_week_week_period;
DROP INDEX IF EXISTS ads.idx_all_trade_week_platform_week_period;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'ads.all_trade_week'::regclass
      AND conname = 'chk_all_trade_week_sync_group_consistency'
  ) THEN
    ALTER TABLE ads.all_trade_week
    ADD CONSTRAINT chk_all_trade_week_sync_group_consistency
    CHECK (
      (
        as_of_date IS NULL
        AND observed_days IS NULL
        AND curr_gmv_sync IS NULL
        AND prev_gmv_sync IS NULL
        AND curr_order_sync IS NULL
        AND prev_order_sync IS NULL
        AND curr_buyer_sync IS NULL
        AND prev_buyer_sync IS NULL
        AND curr_refund_sync IS NULL
        AND prev_refund_sync IS NULL
      )
      OR
      (
        as_of_date IS NOT NULL
        AND observed_days IS NOT NULL
        AND curr_gmv_sync IS NOT NULL
        AND prev_gmv_sync IS NOT NULL
        AND curr_order_sync IS NOT NULL
        AND prev_order_sync IS NOT NULL
        AND curr_buyer_sync IS NOT NULL
        AND prev_buyer_sync IS NOT NULL
        AND curr_refund_sync IS NOT NULL
        AND prev_refund_sync IS NOT NULL
      )
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'ads.all_trade_week_platform'::regclass
      AND conname = 'chk_all_trade_week_platform_sync_group_consistency'
  ) THEN
    ALTER TABLE ads.all_trade_week_platform
    ADD CONSTRAINT chk_all_trade_week_platform_sync_group_consistency
    CHECK (
      (
        as_of_date IS NULL
        AND observed_days IS NULL
        AND curr_gmv_sync IS NULL
        AND prev_gmv_sync IS NULL
        AND curr_order_sync IS NULL
        AND prev_order_sync IS NULL
        AND curr_buyer_sync IS NULL
        AND prev_buyer_sync IS NULL
        AND curr_refund_sync IS NULL
        AND prev_refund_sync IS NULL
      )
      OR
      (
        as_of_date IS NOT NULL
        AND observed_days IS NOT NULL
        AND curr_gmv_sync IS NOT NULL
        AND prev_gmv_sync IS NOT NULL
        AND curr_order_sync IS NOT NULL
        AND prev_order_sync IS NOT NULL
        AND curr_buyer_sync IS NOT NULL
        AND prev_buyer_sync IS NOT NULL
        AND curr_refund_sync IS NOT NULL
        AND prev_refund_sync IS NOT NULL
      )
    );
  END IF;
END;
$$;

COMMIT;
