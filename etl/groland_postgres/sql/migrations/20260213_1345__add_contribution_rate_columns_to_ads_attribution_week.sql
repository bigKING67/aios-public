BEGIN;

ALTER TABLE ads.taobao_alimama_goods_marketingscene_attribution_week
ADD COLUMN IF NOT EXISTS imp_contribution_rate NUMERIC(10, 4)
GENERATED ALWAYS AS (
  CASE
    WHEN ln_gmv_diff IS NOT NULL
      AND ABS(ln_gmv_diff) > 0.0000001
      AND imp_contribution IS NOT NULL
    THEN ROUND((imp_contribution / ln_gmv_diff) * 100, 4)
    ELSE NULL
  END
) STORED;

ALTER TABLE ads.taobao_alimama_goods_marketingscene_attribution_week
ADD COLUMN IF NOT EXISTS ctr_contribution_rate NUMERIC(10, 4)
GENERATED ALWAYS AS (
  CASE
    WHEN ln_gmv_diff IS NOT NULL
      AND ABS(ln_gmv_diff) > 0.0000001
      AND ctr_contribution IS NOT NULL
    THEN ROUND((ctr_contribution / ln_gmv_diff) * 100, 4)
    ELSE NULL
  END
) STORED;

ALTER TABLE ads.taobao_alimama_goods_marketingscene_attribution_week
ADD COLUMN IF NOT EXISTS cvr_contribution_rate NUMERIC(10, 4)
GENERATED ALWAYS AS (
  CASE
    WHEN ln_gmv_diff IS NOT NULL
      AND ABS(ln_gmv_diff) > 0.0000001
      AND cvr_contribution IS NOT NULL
    THEN ROUND((cvr_contribution / ln_gmv_diff) * 100, 4)
    ELSE NULL
  END
) STORED;

ALTER TABLE ads.taobao_alimama_goods_marketingscene_attribution_week
ADD COLUMN IF NOT EXISTS arpu_contribution_rate NUMERIC(10, 4)
GENERATED ALWAYS AS (
  CASE
    WHEN ln_gmv_diff IS NOT NULL
      AND ABS(ln_gmv_diff) > 0.0000001
      AND arpu_contribution IS NOT NULL
    THEN ROUND((arpu_contribution / ln_gmv_diff) * 100, 4)
    ELSE NULL
  END
) STORED;

COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.imp_contribution_rate IS '曝光贡献率(%)：imp_contribution / ln_gmv_diff * 100';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.ctr_contribution_rate IS '点击率贡献率(%)：ctr_contribution / ln_gmv_diff * 100';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.cvr_contribution_rate IS '转化率贡献率(%)：cvr_contribution / ln_gmv_diff * 100';
COMMENT ON COLUMN ads.taobao_alimama_goods_marketingscene_attribution_week.arpu_contribution_rate IS '客单价贡献率(%)：arpu_contribution / ln_gmv_diff * 100';

COMMIT;
