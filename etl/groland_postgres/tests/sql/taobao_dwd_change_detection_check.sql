BEGIN;

CREATE TEMP TABLE tmp_ods_goods_traffic_pick ON COMMIT DROP AS
SELECT
  t.ctid AS src_row_ptr,
  t.stat_date,
  t.shop_id,
  t.product_id
FROM ods.taobao_trade_sale_goods_raw t
ORDER BY t.stat_date DESC, COALESCE(t.updated_at, t.created_at) DESC
LIMIT 1;

DO $$
DECLARE
  v_rows INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_rows FROM tmp_ods_goods_traffic_pick;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ods.taobao_trade_sale_goods_raw has no data to run change detection check';
  END IF;
END;
$$;

DO $$
DECLARE
  v_date DATE;
BEGIN
  SELECT stat_date INTO v_date FROM tmp_ods_goods_traffic_pick LIMIT 1;
  CALL dwd.refresh_taobao_goods_sale_traffic(v_date, v_date);
END;
$$;

CREATE TEMP TABLE tmp_goods_traffic_before ON COMMIT DROP AS
SELECT
  d.pay_amount,
  d.refund_amount
FROM dwd.taobao_goods_sale_traffic d
JOIN tmp_ods_goods_traffic_pick p
  ON d.stat_date = p.stat_date
 AND d.shop_id = p.shop_id
 AND d.product_id = p.product_id;

DO $$
DECLARE
  v_date DATE;
BEGIN
  SELECT stat_date INTO v_date FROM tmp_ods_goods_traffic_pick LIMIT 1;
  CALL dwd.refresh_taobao_goods_sale_traffic(v_date, v_date);
END;
$$;

DO $$
DECLARE
  v_diff INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_diff
  FROM (
    SELECT
      d.pay_amount,
      d.refund_amount
    FROM dwd.taobao_goods_sale_traffic d
    JOIN tmp_ods_goods_traffic_pick p
      ON d.stat_date = p.stat_date
     AND d.shop_id = p.shop_id
     AND d.product_id = p.product_id
    EXCEPT
    SELECT pay_amount, refund_amount
    FROM tmp_goods_traffic_before
  ) s;

  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'dwd.taobao_goods_sale_traffic changed without source data changes';
  END IF;
END;
$$;

UPDATE ods.taobao_trade_sale_goods_raw t
SET
  pay_amount = COALESCE(t.pay_amount, 0) + 1,
  updated_at = NOW()
FROM tmp_ods_goods_traffic_pick p
WHERE t.ctid = p.src_row_ptr;

DO $$
DECLARE
  v_date DATE;
BEGIN
  SELECT stat_date INTO v_date FROM tmp_ods_goods_traffic_pick LIMIT 1;
  CALL dwd.refresh_taobao_goods_sale_traffic(v_date, v_date);
END;
$$;

DO $$
DECLARE
  v_old_pay_amount NUMERIC(18, 2);
  v_new_pay_amount NUMERIC(18, 2);
BEGIN
  SELECT pay_amount INTO v_old_pay_amount FROM tmp_goods_traffic_before LIMIT 1;

  SELECT d.pay_amount
  INTO v_new_pay_amount
  FROM dwd.taobao_goods_sale_traffic d
  JOIN tmp_ods_goods_traffic_pick p
    ON d.stat_date = p.stat_date
   AND d.shop_id = p.shop_id
   AND d.product_id = p.product_id
  LIMIT 1;

  IF v_new_pay_amount IS NULL THEN
    RAISE EXCEPTION 'dwd.taobao_goods_sale_traffic key row missing after source update';
  END IF;

  IF v_old_pay_amount IS NOT NULL AND v_new_pay_amount <> (v_old_pay_amount + 1) THEN
    RAISE EXCEPTION 'dwd.taobao_goods_sale_traffic pay_amount expected %, got %', (v_old_pay_amount + 1), v_new_pay_amount;
  END IF;
END;
$$;

ROLLBACK;
