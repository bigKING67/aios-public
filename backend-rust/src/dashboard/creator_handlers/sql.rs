pub(super) const CREATOR_LIVE_DATE_BOUNDS_SQL: &str = r#"
WITH roster_keys AS (
  SELECT DISTINCT
    CASE
      WHEN NULLIF(BTRIM(r.platform), '') IS NULL THEN NULL::TEXT
      WHEN BTRIM(r.platform) IN ('多平台', '全平台', '全域') THEN NULL::TEXT
      WHEN BTRIM(r.platform) IN ('淘宝', '天猫') THEN '天猫'
      WHEN BTRIM(r.platform) LIKE '%淘宝%' THEN '天猫'
      WHEN BTRIM(r.platform) LIKE '%天猫%' THEN '天猫'
      WHEN BTRIM(r.platform) LIKE '%抖音%' THEN '抖音'
      WHEN BTRIM(r.platform) LIKE '%小红书%' THEN '小红书'
      ELSE BTRIM(r.platform)
    END AS platform_key,
    NULLIF(BTRIM(r.influencer_id), '') AS anchor_id_key
  FROM ads.influencer_live_roster r
),
matched_trade AS (
  SELECT
    t.stat_date
  FROM ads.influencer_live_detail t
  INNER JOIN roster_keys rk
    ON rk.platform_key = COALESCE(NULLIF(BTRIM(t.platform), ''), '抖音')
   AND rk.anchor_id_key = NULLIF(BTRIM(t.influencer_id), '')
  WHERE rk.platform_key IS NOT NULL
    AND rk.anchor_id_key IS NOT NULL
)
SELECT json_build_object(
  'minDate', MIN(mt.stat_date)::TEXT,
  'maxDate', MAX(mt.stat_date)::TEXT
)::TEXT
FROM matched_trade mt;
"#;

pub(super) const CREATOR_SHORTVIDEO_DATE_BOUNDS_SQL: &str = r#"
WITH matched_trade AS (
  SELECT t.stat_date
  FROM ads.douyin_shortvideo_detail t
  WHERE (
      t.detail_grain = 'trade_video_day'
      AND COALESCE(NULLIF(BTRIM(t.account_type), ''), '') LIKE '%合作%'
      AND COALESCE(NULLIF(BTRIM(t.account_type), ''), '') NOT LIKE '%自营%'
    )
    OR (
      t.detail_grain IN ('qianchuan_video_day', 'qianchuan_material_day')
      AND (
        COALESCE(array_length(t.qianchuan_material_ids, 1), 0) > 0
        OR NULLIF(BTRIM(t.qianchuan_material_key), '') IS NOT NULL
        OR COALESCE(t.qianchuan_metric_attributed, FALSE)
        OR COALESCE(t.qianchuan_overall_impression_count, 0) > 0
        OR COALESCE(t.qianchuan_overall_click_count, 0) > 0
        OR COALESCE(t.qianchuan_overall_click_rate, 0) > 0
        OR COALESCE(t.qianchuan_overall_conversion_rate, 0) > 0
        OR COALESCE(t.qianchuan_overall_cost, 0) > 0
        OR COALESCE(t.qianchuan_overall_order_count, 0) > 0
        OR COALESCE(t.qianchuan_overall_gmv, 0) > 0
        OR COALESCE(t.qianchuan_overall_pay_roi, 0) > 0
        OR COALESCE(t.qianchuan_overall_order_cost, 0) > 0
        OR COALESCE(t.qianchuan_user_pay_amount, 0) > 0
        OR COALESCE(t.qianchuan_overall_cpm, 0) > 0
        OR COALESCE(t.qianchuan_overall_cpc, 0) > 0
        OR COALESCE(t.qianchuan_smart_coupon_amount, 0) > 0
        OR COALESCE(t.qianchuan_platform_subsidy_amount, 0) > 0
        OR COALESCE(t.qianchuan_net_gmv_roi, 0) > 0
        OR COALESCE(t.qianchuan_net_gmv, 0) <> 0
        OR COALESCE(t.qianchuan_net_order_count, 0) > 0
        OR COALESCE(t.qianchuan_net_order_cost, 0) > 0
        OR COALESCE(t.qianchuan_net_gmv_settlement_rate, 0) > 0
        OR COALESCE(t.qianchuan_refund_rate_1h, 0) > 0
      )
    )
)
SELECT json_build_object(
  'minDate', MIN(mt.stat_date)::TEXT,
  'maxDate', MAX(mt.stat_date)::TEXT
)::TEXT
FROM matched_trade mt;
"#;

#[cfg(test)]
mod tests {
    use super::CREATOR_SHORTVIDEO_DATE_BOUNDS_SQL;

    #[test]
    fn creator_shortvideo_date_bounds_include_cooperation_and_qianchuan_material_scope() {
        assert!(
            CREATOR_SHORTVIDEO_DATE_BOUNDS_SQL.contains("LIKE '%合作%'"),
            "creator short-video date bounds must include cooperative rows"
        );
        assert!(
            CREATOR_SHORTVIDEO_DATE_BOUNDS_SQL.contains("NOT LIKE '%自营%'"),
            "creator short-video date bounds must exclude self-operated rows"
        );
        assert!(
            CREATOR_SHORTVIDEO_DATE_BOUNDS_SQL.contains("'qianchuan_video_day'"),
            "creator short-video date bounds must include Qianchuan video-grain rows"
        );
        assert!(
            CREATOR_SHORTVIDEO_DATE_BOUNDS_SQL.contains("'qianchuan_material_day'"),
            "creator short-video date bounds must include Qianchuan material-grain rows"
        );
        assert!(
            CREATOR_SHORTVIDEO_DATE_BOUNDS_SQL.contains("qianchuan_material_ids"),
            "creator short-video date bounds must keep material-id signals in scope"
        );
        assert!(
            CREATOR_SHORTVIDEO_DATE_BOUNDS_SQL.contains("qianchuan_overall_impression_count"),
            "creator short-video date bounds must keep Qianchuan exposure fact signals in scope"
        );
        assert!(
            CREATOR_SHORTVIDEO_DATE_BOUNDS_SQL.contains("qianchuan_overall_click_count"),
            "creator short-video date bounds must keep Qianchuan click fact signals in scope"
        );
        assert!(
            CREATOR_SHORTVIDEO_DATE_BOUNDS_SQL.contains("qianchuan_user_pay_amount"),
            "creator short-video date bounds must keep Qianchuan payment fact signals in scope"
        );
    }
}
