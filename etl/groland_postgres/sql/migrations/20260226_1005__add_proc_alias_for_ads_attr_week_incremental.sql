BEGIN;

DO $$
BEGIN
  IF to_regprocedure('ads.refresh_taobao_alimama_goods_marketingscene_attr_week_incr(integer, boolean)') IS NULL
    AND to_regprocedure('ads.refresh_taobao_alimama_goods_marketingscene_attribution_week_incremental(integer, boolean)') IS NOT NULL THEN
    ALTER PROCEDURE ads.refresh_taobao_alimama_goods_marketingscene_attribution_week_incremental(INTEGER, BOOLEAN)
      RENAME TO refresh_taobao_alimama_goods_marketingscene_attr_week_incr;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('ads.refresh_taobao_alimama_goods_marketingscene_attr_week_incr(integer, boolean)') IS NULL THEN
    RAISE EXCEPTION
      'required procedure ads.refresh_taobao_alimama_goods_marketingscene_attr_week_incr(integer, boolean) is missing; apply migration 20260225_1110__fix_attribution_week_identifier_length.sql first';
  END IF;
END;
$$;

CREATE OR REPLACE PROCEDURE ads.refresh_taobao_alimama_goods_marketingscene_attribution_week_incremental(
  p_fallback_window_days INTEGER DEFAULT 14,
  p_init_watermark_only BOOLEAN DEFAULT FALSE
)
LANGUAGE plpgsql
AS $$
BEGIN
  CALL ads.refresh_taobao_alimama_goods_marketingscene_attr_week_incr(
    p_fallback_window_days,
    p_init_watermark_only
  );
END;
$$;

COMMENT ON PROCEDURE ads.refresh_taobao_alimama_goods_marketingscene_attribution_week_incremental(INTEGER, BOOLEAN)
IS 'Backward-compatible alias for ads.refresh_taobao_alimama_goods_marketingscene_attr_week_incr(INTEGER, BOOLEAN).';

COMMIT;
