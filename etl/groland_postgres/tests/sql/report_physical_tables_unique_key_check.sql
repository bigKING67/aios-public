DO $$
DECLARE
  rec RECORD;
  v_duplicate_groups INTEGER;
BEGIN
  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('ads.report_all_trade_week_platform_metrics', 'week_period, platform'),
        ('ads.report_douyin_trade_sale_metrics_week', 'week_period'),
        ('ads.report_douyin_trade_sale_channel_metrics_week', 'week_period, channel_type'),
        ('ads.report_douyin_trade_sale_live_metrics_week', 'week_period, shop_id, anchor_douyin_id, live_start_time'),
        ('ads.report_douyin_trade_sale_shortvideo_metrics_week', 'week_period, video_id, author_douyin_id'),
        ('ads.report_douyin_trade_sale_card_metrics_week', 'week_period, metric_scope, product_id, source_level1'),
        ('ads.report_taobao_trade_product_metrics_week', 'week_period, platform, product_id'),
        ('ads.report_taobao_goods_traffic_channel_metrics_week', 'week_period, platform, product_id, traffic_channel'),
        ('ads.report_taobao_one_goods_traffic_channel_metric_week', 'week_period, platform, product_id, traffic_channel')
    ) AS t(table_name, key_columns)
  LOOP
    IF to_regclass(rec.table_name) IS NULL THEN
      RAISE EXCEPTION 'report physical table not found: %', rec.table_name;
    END IF;

    EXECUTE format(
      'SELECT COUNT(*) FROM (SELECT %s FROM %s GROUP BY %s HAVING COUNT(*) > 1) dup',
      rec.key_columns,
      rec.table_name,
      rec.key_columns
    )
    INTO v_duplicate_groups;

    IF v_duplicate_groups > 0 THEN
      RAISE EXCEPTION 'report physical table unique key check failed, table: %, duplicate groups: %',
        rec.table_name,
        v_duplicate_groups;
    END IF;
  END LOOP;

  RAISE NOTICE 'report physical table unique key checks passed';
END;
$$;
