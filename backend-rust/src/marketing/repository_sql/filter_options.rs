pub(crate) const NORMALIZED_ANCHOR_LEVEL_SQL: &str = r#"
          CASE
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
          END
"#;

pub(crate) const QUERY_FILTER_PLATFORMS_SQL: &str = r#"
        SELECT value
        FROM (
          SELECT DISTINCT NULLIF(BTRIM(platform), '') AS value
          FROM ads.influencer_library
          WHERE is_deleted = FALSE
        ) option_values
        WHERE value IS NOT NULL
        ORDER BY value
"#;

pub(crate) const QUERY_FILTER_CATEGORIES_SQL: &str = r#"
        SELECT value
        FROM (
          SELECT DISTINCT NULLIF(BTRIM(category), '') AS value
          FROM ads.influencer_library
          WHERE is_deleted = FALSE
        ) option_values
        WHERE value IS NOT NULL
        ORDER BY value
"#;

pub(crate) const QUERY_FILTER_ANCHOR_TAGS_SQL: &str = r#"
        SELECT anchor_tag AS value
        FROM (
          SELECT DISTINCT anchor_tag
          FROM (
            SELECT CASE
              WHEN LOWER(REPLACE(REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(BTRIM(COALESCE(tag, '')), '\s+', '', 'g'), '(垂类|类)主播$', '主播'), '（', '('), '）', ')')) IN (
                '服饰',
                '服装',
                '服饰类',
                '服装类',
                '服饰主播',
                '服装主播',
                '服饰达人',
                '服装达人',
                '服饰类主播',
                '服装类主播',
                '服饰垂类主播',
                '服装垂类主播',
                '服饰类达人',
                '服装类达人',
                '服饰垂类达人',
                '服装垂类达人'
              ) THEN '服饰主播'
              ELSE NULLIF(REGEXP_REPLACE(REGEXP_REPLACE(BTRIM(COALESCE(tag, '')), '\s+', '', 'g'), '(垂类|类)主播$', '主播'), '')
            END AS anchor_tag
            FROM ads.influencer_library, LATERAL unnest(tags) AS tag
            WHERE is_deleted = FALSE
            UNION ALL
            SELECT CASE
              WHEN LOWER(REPLACE(REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(BTRIM(COALESCE(tag, '')), '\s+', '', 'g'), '(垂类|类)主播$', '主播'), '（', '('), '）', ')')) IN (
                '服饰',
                '服装',
                '服饰类',
                '服装类',
                '服饰主播',
                '服装主播',
                '服饰达人',
                '服装达人',
                '服饰类主播',
                '服装类主播',
                '服饰垂类主播',
                '服装垂类主播',
                '服饰类达人',
                '服装类达人',
                '服饰垂类达人',
                '服装垂类达人'
              ) THEN '服饰主播'
              ELSE NULLIF(REGEXP_REPLACE(REGEXP_REPLACE(BTRIM(COALESCE(tag, '')), '\s+', '', 'g'), '(垂类|类)主播$', '主播'), '')
            END AS anchor_tag
            FROM ads.influencer_library,
              LATERAL regexp_split_to_table(COALESCE(anchor_desc, ''), '[，,、/;；]+') AS tag
            WHERE is_deleted = FALSE
          ) normalized_tags
          WHERE anchor_tag IS NOT NULL
        ) option_values
        ORDER BY anchor_tag
"#;

pub(crate) const QUERY_FILTER_ANCHOR_LEVELS_SQL: &str = r#"
        SELECT normalized_anchor_level AS value
        FROM (
          SELECT DISTINCT
            normalized_anchor_level,
            CASE normalized_anchor_level
              WHEN 'S-超头部' THEN 1
              WHEN 'A-头部' THEN 2
              WHEN 'B-肩部' THEN 3
              WHEN 'C-中腰部' THEN 4
              WHEN 'D-尾部' THEN 5
              ELSE 99
            END AS sort_order
          FROM (
            SELECT
              CASE
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
              END AS normalized_anchor_level
            FROM ads.influencer_library
            WHERE is_deleted = FALSE
          ) normalized
          WHERE normalized_anchor_level IS NOT NULL
        ) option_values
        ORDER BY sort_order, normalized_anchor_level
"#;

pub(crate) const QUERY_FILTER_COOPERATION_STATUSES_SQL: &str = r#"
        SELECT value
        FROM (
          SELECT DISTINCT NULLIF(BTRIM(cooperation_status_norm), '') AS value
          FROM ads.influencer_library
          WHERE is_deleted = FALSE
        ) option_values
        WHERE value IS NOT NULL
        ORDER BY value
"#;

pub(crate) const QUERY_FILTER_OWNERS_SQL: &str = r#"
        SELECT value
        FROM (
          SELECT DISTINCT NULLIF(BTRIM(owner_name), '') AS value
          FROM ads.influencer_library
          WHERE is_deleted = FALSE
        ) option_values
        WHERE value IS NOT NULL
        ORDER BY value
"#;

pub(crate) const QUERY_FILTER_SOURCE_TYPES_SQL: &str = r#"
        SELECT value
        FROM (
          SELECT DISTINCT NULLIF(BTRIM(source_type), '') AS value
          FROM ads.influencer_library
          WHERE is_deleted = FALSE
        ) option_values
        WHERE value IS NOT NULL
        ORDER BY value
"#;
