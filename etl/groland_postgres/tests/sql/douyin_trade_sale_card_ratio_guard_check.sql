DO $$
DECLARE
  v_enabled_trigger_count INTEGER;
BEGIN
  IF to_regprocedure('ads.fn_recompute_douyin_trade_sale_card_ratio_fields()') IS NULL THEN
    RAISE EXCEPTION 'missing ads.fn_recompute_douyin_trade_sale_card_ratio_fields()';
  END IF;

  IF to_regprocedure('ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()') IS NULL THEN
    RAISE EXCEPTION 'missing ads.fn_recompute_douyin_trade_sale_card_detail_ratio_fields()';
  END IF;

  SELECT COUNT(*)
  INTO v_enabled_trigger_count
  FROM pg_trigger trigger_record
  JOIN pg_class relation ON relation.oid = trigger_record.tgrelid
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE NOT trigger_record.tgisinternal
    AND trigger_record.tgenabled = 'O'
    AND namespace.nspname = 'ads'
    AND (
      (relation.relname = 'douyin_trade_sale_card'
        AND trigger_record.tgname = 'trg_recompute_douyin_trade_sale_card_ratio_fields')
      OR
      (relation.relname = 'douyin_trade_sale_card_detail'
        AND trigger_record.tgname = 'trg_recompute_douyin_trade_sale_card_detail_ratio_fields')
    );

  IF v_enabled_trigger_count <> 2 THEN
    RAISE EXCEPTION 'expected 2 enabled goods-card ratio triggers, got %', v_enabled_trigger_count;
  END IF;
END;
$$;
