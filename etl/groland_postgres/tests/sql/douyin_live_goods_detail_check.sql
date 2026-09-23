DO $$
DECLARE
  v_invalid INTEGER;
BEGIN
  IF to_regclass('ads.douyin_self_anchor_map') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_self_anchor_map not found';
  END IF;

  IF to_regclass('ads.douyin_live_goods_detail') IS NULL THEN
    RAISE EXCEPTION 'table ads.douyin_live_goods_detail not found';
  END IF;

  IF to_regclass('etl.douyin_live_goods_detail_refresh_state') IS NULL THEN
    RAISE EXCEPTION 'table etl.douyin_live_goods_detail_refresh_state not found';
  END IF;

  WITH required_self_anchors(anchor_douyin_id, anchor_nickname) AS (
    VALUES
      ('1075458451', 'Groland高岚个人护理直播间'),
      ('64304983942', 'Groland高岚品牌直播间'),
      ('79269712574', 'Groland个人护理直播间')
  )
  SELECT COUNT(*)
  INTO v_invalid
  FROM required_self_anchors required
  LEFT JOIN ads.douyin_self_anchor_map mapped
    ON mapped.anchor_douyin_id = required.anchor_douyin_id
  WHERE mapped.anchor_douyin_id IS NULL
     OR mapped.anchor_nickname <> required.anchor_nickname
     OR mapped.is_active IS NOT TRUE;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_self_anchor_map required Groland anchors check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_live_goods_detail
  WHERE stat_date IS NULL
     OR live_start_time IS NULL
     OR stat_date <> DATE(live_start_time)
     OR anchor_douyin_id IS NULL
     OR shop_id IS NULL
     OR live_identity_type NOT IN ('self', 'influencer', 'unclassified')
     OR anchor_type NOT IN ('自播', '达播', '未归类')
     OR NULLIF(BTRIM(product_id), '') IS NULL
     OR NULLIF(BTRIM(product_name), '') IS NULL
     OR NULLIF(BTRIM(sku_name), '') IS NULL
     OR sku_row_type NOT IN ('product_summary', 'sku')
     OR (sku_name = '汇总' AND sku_row_type <> 'product_summary')
     OR (sku_name <> '汇总' AND sku_row_type <> 'sku')
     OR live_duration_minutes < 0
     OR product_user_pay_amount < 0
     OR product_sales_volume < 0
     OR product_buyer_count < 0
     OR product_order_count < 0
     OR presale_order_count < 0
     OR presale_full_amount < 0
     OR product_exposure_user_count < 0
     OR product_click_user_count < 0
     OR product_exposure_to_click_rate_user < 0
     OR product_click_to_pay_rate_user < 0
     OR refund_user_count < 0
     OR refund_amount < 0
     OR refund_order_count < 0;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_goods_detail basic metric check failed, rows: %', v_invalid;
  END IF;

  WITH active_self_anchors AS (
    SELECT BTRIM(anchor_douyin_id) AS anchor_douyin_id
    FROM ads.douyin_self_anchor_map
    WHERE is_active IS TRUE
      AND NULLIF(BTRIM(anchor_douyin_id), '') IS NOT NULL
  )
  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_live_goods_detail detail
  JOIN active_self_anchors mapped
    ON detail.anchor_douyin_id = mapped.anchor_douyin_id
  WHERE detail.live_identity_type <> 'self'
     OR detail.anchor_type <> '自播';

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_goods_detail self anchor classification check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM ads.douyin_live_goods_detail
  WHERE ABS(
          product_exposure_to_click_rate_user
          - CASE
              WHEN product_exposure_user_count > 0
                THEN ROUND(product_click_user_count::NUMERIC / product_exposure_user_count::NUMERIC, 6)
              ELSE 0::NUMERIC(18, 6)
            END
        ) > 0.000001
     OR ABS(
          product_click_to_pay_rate_user
          - CASE
              WHEN product_click_user_count > 0
                THEN ROUND(product_buyer_count::NUMERIC / product_click_user_count::NUMERIC, 6)
              ELSE 0::NUMERIC(18, 6)
            END
        ) > 0.000001;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'douyin_live_goods_detail ratio formula check failed, rows: %', v_invalid;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid
  FROM etl.douyin_live_goods_detail_refresh_state
  WHERE id = 1;

  IF v_invalid <> 1 THEN
    RAISE EXCEPTION 'douyin_live_goods_detail_refresh_state default row check failed, rows: %', v_invalid;
  END IF;

  RAISE NOTICE 'douyin_live_goods_detail checks passed';
END;
$$;
