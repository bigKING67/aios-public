BEGIN;

DROP PROCEDURE IF EXISTS dws.refresh_all_trade_sale_daily(DATE, DATE);

CREATE PROCEDURE dws.refresh_all_trade_sale_daily(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_inserted_rows INTEGER := 0;
  v_updated_rows INTEGER := 0;
  v_deleted_rows INTEGER := 0;
  v_unchanged_rows INTEGER := 0;
  v_detail_limit INTEGER := 5;
  v_insert_detail RECORD;
  v_update_detail RECORD;
BEGIN
  SELECT
    COALESCE(p_start_date, MIN("date")),
    COALESCE(p_end_date, MAX("date"))
  INTO v_start_date, v_end_date
  FROM dwd.all_trade_sale;

  IF v_start_date IS NULL OR v_end_date IS NULL THEN
    RAISE NOTICE 'dwd.all_trade_sale has no data, skipped';
    RETURN;
  END IF;

  IF v_start_date > v_end_date THEN
    RAISE EXCEPTION 'start_date cannot be greater than end_date (% > %)', v_start_date, v_end_date;
  END IF;

  IF to_regclass('pg_temp.tmp_dws_all_trade_sale_daily_new') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_dws_all_trade_sale_daily_new';
  END IF;
  IF to_regclass('pg_temp.tmp_dws_all_trade_sale_daily_existing') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_dws_all_trade_sale_daily_existing';
  END IF;
  IF to_regclass('pg_temp.tmp_dws_all_trade_sale_daily_inserted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_dws_all_trade_sale_daily_inserted';
  END IF;
  IF to_regclass('pg_temp.tmp_dws_all_trade_sale_daily_deleted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_dws_all_trade_sale_daily_deleted';
  END IF;
  IF to_regclass('pg_temp.tmp_dws_all_trade_sale_daily_updated') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_dws_all_trade_sale_daily_updated';
  END IF;

  CREATE TEMP TABLE tmp_dws_all_trade_sale_daily_new ON COMMIT DROP AS
  SELECT
    d."date",
    SUM(d.gmv)::NUMERIC(18, 2) AS gmv,
    SUM(d.order_count)::INTEGER AS order_count,
    SUM(d.buyer_count)::INTEGER AS buyer_count,
    SUM(d.refund_amount)::NUMERIC(18, 2) AS refund_amount
  FROM dwd.all_trade_sale d
  WHERE d."date" BETWEEN v_start_date AND v_end_date
  GROUP BY d."date";

  CREATE TEMP TABLE tmp_dws_all_trade_sale_daily_existing ON COMMIT DROP AS
  SELECT "date", gmv, order_count, buyer_count, refund_amount
  FROM dws.all_trade_sale_daily
  WHERE "date" BETWEEN v_start_date AND v_end_date;

  CREATE TEMP TABLE tmp_dws_all_trade_sale_daily_inserted ON COMMIT DROP AS
  SELECT n.*
  FROM tmp_dws_all_trade_sale_daily_new n
  LEFT JOIN tmp_dws_all_trade_sale_daily_existing e
    ON e."date" = n."date"
  WHERE e."date" IS NULL;

  CREATE TEMP TABLE tmp_dws_all_trade_sale_daily_deleted ON COMMIT DROP AS
  SELECT e."date"
  FROM tmp_dws_all_trade_sale_daily_existing e
  LEFT JOIN tmp_dws_all_trade_sale_daily_new n
    ON n."date" = e."date"
  WHERE n."date" IS NULL;

  CREATE TEMP TABLE tmp_dws_all_trade_sale_daily_updated ON COMMIT DROP AS
  SELECT
    n."date",
    n.gmv,
    n.order_count,
    n.buyer_count,
    n.refund_amount,
    e.gmv AS old_gmv,
    e.order_count AS old_order_count,
    e.buyer_count AS old_buyer_count,
    e.refund_amount AS old_refund_amount
  FROM tmp_dws_all_trade_sale_daily_new n
  JOIN tmp_dws_all_trade_sale_daily_existing e
    ON e."date" = n."date"
  WHERE ROW(
    n.gmv,
    n.order_count,
    n.buyer_count,
    n.refund_amount
  ) IS DISTINCT FROM ROW(
    e.gmv,
    e.order_count,
    e.buyer_count,
    e.refund_amount
  );

  SELECT COUNT(*) INTO v_inserted_rows FROM tmp_dws_all_trade_sale_daily_inserted;
  SELECT COUNT(*) INTO v_updated_rows FROM tmp_dws_all_trade_sale_daily_updated;
  SELECT COUNT(*) INTO v_deleted_rows FROM tmp_dws_all_trade_sale_daily_deleted;

  SELECT COUNT(*)
  INTO v_unchanged_rows
  FROM tmp_dws_all_trade_sale_daily_new n
  JOIN tmp_dws_all_trade_sale_daily_existing e
    ON e."date" = n."date"
  WHERE ROW(
    n.gmv,
    n.order_count,
    n.buyer_count,
    n.refund_amount
  ) IS NOT DISTINCT FROM ROW(
    e.gmv,
    e.order_count,
    e.buyer_count,
    e.refund_amount
  );

  DELETE FROM dws.all_trade_sale_daily t
  USING tmp_dws_all_trade_sale_daily_deleted d
  WHERE t."date" = d."date";

  UPDATE dws.all_trade_sale_daily t
  SET
    gmv = u.gmv,
    order_count = u.order_count,
    buyer_count = u.buyer_count,
    refund_amount = u.refund_amount
  FROM tmp_dws_all_trade_sale_daily_updated u
  WHERE t."date" = u."date";

  INSERT INTO dws.all_trade_sale_daily (
    "date",
    gmv,
    order_count,
    buyer_count,
    refund_amount
  )
  SELECT
    "date",
    gmv,
    order_count,
    buyer_count,
    refund_amount
  FROM tmp_dws_all_trade_sale_daily_inserted;

  RAISE NOTICE 'refresh_all_trade_sale_daily completed, inserted: %, updated: %, deleted: %, unchanged: %, window: [% - %]',
    v_inserted_rows, v_updated_rows, v_deleted_rows, v_unchanged_rows, v_start_date, v_end_date;

  FOR v_insert_detail IN
    SELECT "date", gmv, order_count
    FROM tmp_dws_all_trade_sale_daily_inserted
    ORDER BY "date"
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'insert detail: date=%, gmv=%, order_count=%',
      v_insert_detail."date",
      v_insert_detail.gmv,
      v_insert_detail.order_count;
  END LOOP;

  FOR v_update_detail IN
    SELECT
      "date",
      NULLIF(CONCAT_WS('; ',
        CASE WHEN old_gmv IS DISTINCT FROM gmv THEN format('gmv:%s->%s', old_gmv, gmv) END,
        CASE WHEN old_order_count IS DISTINCT FROM order_count THEN format('order_count:%s->%s', old_order_count, order_count) END,
        CASE WHEN old_buyer_count IS DISTINCT FROM buyer_count THEN format('buyer_count:%s->%s', old_buyer_count, buyer_count) END,
        CASE WHEN old_refund_amount IS DISTINCT FROM refund_amount THEN format('refund_amount:%s->%s', old_refund_amount, refund_amount) END
      ), '') AS change_summary
    FROM tmp_dws_all_trade_sale_daily_updated
    ORDER BY "date"
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'update detail: date=%, changes=%',
      v_update_detail."date",
      COALESCE(v_update_detail.change_summary, '(metrics changed)');
  END LOOP;
END;
$$;

COMMENT ON PROCEDURE dws.refresh_all_trade_sale_daily(DATE, DATE)
IS '按日期窗口刷新dws.all_trade_sale_daily，仅对真实新增/更新/删除数据落表。';

COMMIT;
