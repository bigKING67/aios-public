BEGIN;

DROP PROCEDURE IF EXISTS dwd.refresh_all_trade_sale_platform(VARCHAR, DATE, DATE);

CREATE PROCEDURE dwd.refresh_all_trade_sale_platform(
  IN p_platform VARCHAR(20),
  IN p_start_date DATE,
  IN p_end_date DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted_rows BIGINT := 0;
  v_updated_rows BIGINT := 0;
  v_deleted_rows BIGINT := 0;
  v_unchanged_rows BIGINT := 0;
  v_detail_limit INTEGER := 5;
  v_insert_detail RECORD;
  v_update_detail RECORD;
BEGIN
  IF p_platform NOT IN ('douyin', 'jd', 'taobao', 'wx', 'xhs') THEN
    RAISE EXCEPTION 'unsupported platform: %', p_platform;
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date and p_end_date must both be provided';
  END IF;
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'p_start_date (%) cannot be greater than p_end_date (%)', p_start_date, p_end_date;
  END IF;

  IF to_regclass('pg_temp.tmp_all_trade_sale_platform_new') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_all_trade_sale_platform_new';
  END IF;
  IF to_regclass('pg_temp.tmp_all_trade_sale_platform_existing') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_all_trade_sale_platform_existing';
  END IF;
  IF to_regclass('pg_temp.tmp_all_trade_sale_platform_inserted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_all_trade_sale_platform_inserted';
  END IF;
  IF to_regclass('pg_temp.tmp_all_trade_sale_platform_deleted') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_all_trade_sale_platform_deleted';
  END IF;
  IF to_regclass('pg_temp.tmp_all_trade_sale_platform_updated') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp.tmp_all_trade_sale_platform_updated';
  END IF;

  CREATE TEMP TABLE tmp_all_trade_sale_platform_new (
    platform VARCHAR(20) NOT NULL,
    shop_name VARCHAR(255) NOT NULL,
    shop_id VARCHAR(128) NOT NULL,
    "date" DATE NOT NULL,
    gmv NUMERIC(18, 2) NOT NULL,
    order_count INTEGER NOT NULL,
    buyer_count INTEGER NOT NULL,
    refund_amount NUMERIC(18, 2) NOT NULL
  ) ON COMMIT DROP;

  IF p_platform = 'douyin' THEN
    INSERT INTO tmp_all_trade_sale_platform_new
    SELECT
      'douyin',
      MIN(shop_name)::VARCHAR(255),
      shop_id,
      stat_date,
      SUM(COALESCE(user_pay_amount, 0))::NUMERIC(18, 2),
      SUM(COALESCE(order_count, 0))::INTEGER,
      SUM(COALESCE(buyer_count, 0))::INTEGER,
      SUM(COALESCE(refund_amount_refund_time, 0))::NUMERIC(18, 2)
    FROM ods.douyin_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date
    GROUP BY shop_id, stat_date;
  ELSIF p_platform = 'jd' THEN
    INSERT INTO tmp_all_trade_sale_platform_new
    SELECT
      'jd',
      MIN(shop_name)::VARCHAR(255),
      shop_id,
      stat_date,
      SUM(COALESCE(gmv, 0))::NUMERIC(18, 2),
      SUM(COALESCE(order_count, 0))::INTEGER,
      SUM(COALESCE(buyer_count, 0))::INTEGER,
      SUM(COALESCE(refund_amount, 0))::NUMERIC(18, 2)
    FROM ods.jd_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date
    GROUP BY shop_id, stat_date;
  ELSIF p_platform = 'taobao' THEN
    INSERT INTO tmp_all_trade_sale_platform_new
    SELECT
      'taobao',
      MIN(shop_name)::VARCHAR(255),
      shop_id,
      stat_date,
      SUM(COALESCE(pay_amount, 0))::NUMERIC(18, 2),
      SUM(COALESCE(pay_parent_order_count, 0))::INTEGER,
      SUM(COALESCE(pay_buyer_count, 0))::INTEGER,
      SUM(COALESCE(refund_amount, 0))::NUMERIC(18, 2)
    FROM ods.taobao_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date
    GROUP BY shop_id, stat_date;
  ELSIF p_platform = 'wx' THEN
    INSERT INTO tmp_all_trade_sale_platform_new
    SELECT
      'wx',
      MIN(shop_name)::VARCHAR(255),
      shop_id,
      stat_date,
      SUM(COALESCE(pay_amount, 0))::NUMERIC(18, 2),
      SUM(COALESCE(pay_order_count, 0))::INTEGER,
      SUM(COALESCE(pay_buyer_count, 0))::INTEGER,
      SUM(COALESCE(refund_amount, 0))::NUMERIC(18, 2)
    FROM ods.wx_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date
    GROUP BY shop_id, stat_date;
  ELSE
    INSERT INTO tmp_all_trade_sale_platform_new
    SELECT
      'xhs',
      MIN(shop_name)::VARCHAR(255),
      shop_id,
      stat_date,
      SUM(COALESCE(pay_amount, 0))::NUMERIC(18, 2),
      SUM(COALESCE(pay_order_count, 0))::INTEGER,
      SUM(COALESCE(pay_buyer_count, 0))::INTEGER,
      SUM(COALESCE(refund_amount, 0))::NUMERIC(18, 2)
    FROM ods.xhs_trade_sale_raw
    WHERE stat_date BETWEEN p_start_date AND p_end_date
    GROUP BY shop_id, stat_date;
  END IF;

  CREATE TEMP TABLE tmp_all_trade_sale_platform_existing ON COMMIT DROP AS
  SELECT platform, shop_name, shop_id, "date", gmv, order_count, buyer_count, refund_amount
  FROM dwd.all_trade_sale
  WHERE platform = p_platform
    AND "date" BETWEEN p_start_date AND p_end_date;

  CREATE TEMP TABLE tmp_all_trade_sale_platform_inserted ON COMMIT DROP AS
  SELECT n.*
  FROM tmp_all_trade_sale_platform_new n
  LEFT JOIN tmp_all_trade_sale_platform_existing e
    ON e.platform = n.platform
   AND e.shop_id = n.shop_id
   AND e."date" = n."date"
  WHERE e.platform IS NULL;

  CREATE TEMP TABLE tmp_all_trade_sale_platform_deleted ON COMMIT DROP AS
  SELECT e.platform, e.shop_id, e."date"
  FROM tmp_all_trade_sale_platform_existing e
  LEFT JOIN tmp_all_trade_sale_platform_new n
    ON n.platform = e.platform
   AND n.shop_id = e.shop_id
   AND n."date" = e."date"
  WHERE n.platform IS NULL;

  CREATE TEMP TABLE tmp_all_trade_sale_platform_updated ON COMMIT DROP AS
  SELECT
    n.platform,
    n.shop_name,
    n.shop_id,
    n."date",
    n.gmv,
    n.order_count,
    n.buyer_count,
    n.refund_amount,
    e.gmv AS old_gmv,
    e.order_count AS old_order_count,
    e.buyer_count AS old_buyer_count,
    e.refund_amount AS old_refund_amount
  FROM tmp_all_trade_sale_platform_new n
  JOIN tmp_all_trade_sale_platform_existing e
    ON e.platform = n.platform
   AND e.shop_id = n.shop_id
   AND e."date" = n."date"
  WHERE ROW(
    n.shop_name,
    n.gmv,
    n.order_count,
    n.buyer_count,
    n.refund_amount
  ) IS DISTINCT FROM ROW(
    e.shop_name,
    e.gmv,
    e.order_count,
    e.buyer_count,
    e.refund_amount
  );

  SELECT COUNT(*) INTO v_inserted_rows FROM tmp_all_trade_sale_platform_inserted;
  SELECT COUNT(*) INTO v_updated_rows FROM tmp_all_trade_sale_platform_updated;
  SELECT COUNT(*) INTO v_deleted_rows FROM tmp_all_trade_sale_platform_deleted;

  SELECT COUNT(*)
  INTO v_unchanged_rows
  FROM tmp_all_trade_sale_platform_new n
  JOIN tmp_all_trade_sale_platform_existing e
    ON e.platform = n.platform
   AND e.shop_id = n.shop_id
   AND e."date" = n."date"
  WHERE ROW(
    n.shop_name,
    n.gmv,
    n.order_count,
    n.buyer_count,
    n.refund_amount
  ) IS NOT DISTINCT FROM ROW(
    e.shop_name,
    e.gmv,
    e.order_count,
    e.buyer_count,
    e.refund_amount
  );

  DELETE FROM dwd.all_trade_sale t
  USING tmp_all_trade_sale_platform_deleted d
  WHERE t.platform = d.platform
    AND t.shop_id = d.shop_id
    AND t."date" = d."date";

  UPDATE dwd.all_trade_sale t
  SET
    shop_name = u.shop_name,
    gmv = u.gmv,
    order_count = u.order_count,
    buyer_count = u.buyer_count,
    refund_amount = u.refund_amount
  FROM tmp_all_trade_sale_platform_updated u
  WHERE t.platform = u.platform
    AND t.shop_id = u.shop_id
    AND t."date" = u."date";

  INSERT INTO dwd.all_trade_sale (
    platform,
    shop_name,
    shop_id,
    "date",
    gmv,
    order_count,
    buyer_count,
    refund_amount
  )
  SELECT
    platform,
    shop_name,
    shop_id,
    "date",
    gmv,
    order_count,
    buyer_count,
    refund_amount
  FROM tmp_all_trade_sale_platform_inserted;

  RAISE NOTICE 'platform %, window [% - %], inserted %, updated %, deleted %, unchanged %',
    p_platform, p_start_date, p_end_date, v_inserted_rows, v_updated_rows, v_deleted_rows, v_unchanged_rows;

  FOR v_insert_detail IN
    SELECT shop_id, "date", gmv, order_count
    FROM tmp_all_trade_sale_platform_inserted
    ORDER BY "date", shop_id
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'platform % insert detail: shop_id=%, date=%, gmv=%, order_count=%',
      p_platform, v_insert_detail.shop_id, v_insert_detail."date", v_insert_detail.gmv, v_insert_detail.order_count;
  END LOOP;

  FOR v_update_detail IN
    SELECT
      shop_id,
      "date",
      NULLIF(CONCAT_WS('; ',
        CASE WHEN old_gmv IS DISTINCT FROM gmv THEN format('gmv:%s->%s', old_gmv, gmv) END,
        CASE WHEN old_order_count IS DISTINCT FROM order_count THEN format('order_count:%s->%s', old_order_count, order_count) END,
        CASE WHEN old_buyer_count IS DISTINCT FROM buyer_count THEN format('buyer_count:%s->%s', old_buyer_count, buyer_count) END,
        CASE WHEN old_refund_amount IS DISTINCT FROM refund_amount THEN format('refund_amount:%s->%s', old_refund_amount, refund_amount) END
      ), '') AS change_summary
    FROM tmp_all_trade_sale_platform_updated
    ORDER BY "date", shop_id
    LIMIT v_detail_limit
  LOOP
    RAISE NOTICE 'platform % update detail: shop_id=%, date=%, changes=%',
      p_platform, v_update_detail.shop_id, v_update_detail."date", COALESCE(v_update_detail.change_summary, '(metrics changed)');
  END LOOP;
END;
$$;

COMMENT ON PROCEDURE dwd.refresh_all_trade_sale_platform(VARCHAR, DATE, DATE)
IS '按平台及日期窗口刷新dwd.all_trade_sale，仅对真实新增/更新/删除数据落表。';

DROP PROCEDURE IF EXISTS dwd.refresh_all_trade_sale(DATE, DATE);

CREATE PROCEDURE dwd.refresh_all_trade_sale(
  IN p_start_date DATE,
  IN p_end_date DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_platform VARCHAR(20);
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date and p_end_date must both be provided';
  END IF;
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'p_start_date (%) cannot be greater than p_end_date (%)', p_start_date, p_end_date;
  END IF;

  FOR v_platform IN
    SELECT unnest(ARRAY['douyin', 'jd', 'taobao', 'wx', 'xhs']::VARCHAR[])
  LOOP
    CALL dwd.refresh_all_trade_sale_platform(v_platform, p_start_date, p_end_date);
  END LOOP;

  RAISE NOTICE 'refresh_all_trade_sale completed, window: [% - %]', p_start_date, p_end_date;
END;
$$;

COMMENT ON PROCEDURE dwd.refresh_all_trade_sale(DATE, DATE)
IS '按日期窗口刷新dwd.all_trade_sale，按平台执行真实新增/更新/删除变更。';

COMMIT;
