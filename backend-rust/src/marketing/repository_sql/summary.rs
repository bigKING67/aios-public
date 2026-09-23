pub(crate) const QUERY_SUMMARY_SQL: &str = r#"
        SELECT
          COUNT(*)::BIGINT AS total_creators,
          COUNT(*) FILTER (WHERE is_cooperable)::BIGINT AS cooperable_creators,
          COUNT(*) FILTER (
            WHERE cooperation_status_norm ~ '(洽谈|沟通|寄样|建联|初联|合作中|推进)'
          )::BIGINT AS negotiating_creators,
          COUNT(*) FILTER (
            WHERE last_followed_at IS NULL OR last_followed_at < CURRENT_DATE - INTERVAL '30 days'
          )::BIGINT AS unfollowed_30d_creators,
          COUNT(*) FILTER (
            WHERE CASE
              WHEN NULLIF(BTRIM(COALESCE(anchor_level, '')), '') IS NULL THEN NULL
              WHEN anchor_level ~ '超头' THEN 'S-超头部'
              WHEN anchor_level ~ '(中腰|腰部)' THEN 'C-中腰部'
              WHEN anchor_level ~ '肩部' THEN 'B-肩部'
              WHEN anchor_level ~ '尾部' THEN 'D-尾部'
              WHEN anchor_level ~ '头部' THEN 'A-头部'
              WHEN UPPER(BTRIM(anchor_level)) = 'S' OR UPPER(BTRIM(anchor_level)) LIKE 'S-%' THEN 'S-超头部'
              WHEN UPPER(BTRIM(anchor_level)) = 'A' OR UPPER(BTRIM(anchor_level)) LIKE 'A-%' THEN 'A-头部'
              WHEN UPPER(BTRIM(anchor_level)) = 'B' OR UPPER(BTRIM(anchor_level)) LIKE 'B-%' THEN 'B-肩部'
              WHEN UPPER(BTRIM(anchor_level)) = 'C' OR UPPER(BTRIM(anchor_level)) LIKE 'C-%' THEN 'C-中腰部'
              WHEN UPPER(BTRIM(anchor_level)) = 'D' OR UPPER(BTRIM(anchor_level)) LIKE 'D-%' THEN 'D-尾部'
              ELSE anchor_level
            END = 'S-超头部'
          )::BIGINT AS s_level_creators
        FROM ads.influencer_library
        WHERE is_deleted = FALSE
"#;
