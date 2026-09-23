theme_term_aliases AS (
  SELECT alias, canonical_term
  FROM (
    VALUES
      ('蓬松控油'::TEXT, '控油蓬松'::TEXT),
      ('头皮护理'::TEXT, '头皮养护'::TEXT),
      ('居家浴室场景'::TEXT, '居家浴室'::TEXT)
  ) aliases(alias, canonical_term)
),
theme_candidate_terms AS (
  SELECT
    normalized.asset_id,
    normalized.source_id,
    normalized.term_group,
    normalized.source_weight,
    COALESCE(aliases.canonical_term, normalized.term) AS term
  FROM normalized_terms normalized
  LEFT JOIN theme_term_aliases aliases ON LOWER(aliases.alias) = LOWER(normalized.term)
  WHERE normalized.source_kind = 'ai'
    AND CHAR_LENGTH(normalized.term) BETWEEN 2 AND 18
    AND normalized.term !~ '^[0-9.％%+-]+$'
    AND normalized.term NOT IN ('不明确', '未知', '暂无', '无', '其他', 'null', 'undefined', '人群', '卖点', '产品')
    AND LOWER(normalized.term) !~ '(千川|云图|抖音|qianchuan|yuntu)'
    AND NOT EXISTS (
      SELECT 1
      FROM selected_brand brand
      WHERE LOWER(normalized.term) LIKE '%' || LOWER(brand.label) || '%'
         OR (
           CHAR_LENGTH(REGEXP_REPLACE(LOWER(brand.label), '[^a-z0-9]+', '', 'g')) >= 3
           AND REGEXP_REPLACE(LOWER(normalized.term), '[^a-z0-9]+', '', 'g') LIKE
             '%' || REGEXP_REPLACE(LOWER(brand.label), '[^a-z0-9]+', '', 'g') || '%'
         )
    )
),
theme_source_terms AS (
  SELECT
    asset_id,
    source_id,
    term,
    MAX(source_weight)::FLOAT8 AS semantic_source_weight
  FROM theme_candidate_terms
  GROUP BY asset_id, source_id, term
),
theme_group_scores AS (
  SELECT
    term,
    term_group,
    SUM(source_weight)::FLOAT8 AS group_weight
  FROM theme_candidate_terms
  GROUP BY term, term_group
),
theme_term_groups AS (
  SELECT DISTINCT ON (term)
    term,
    term_group
  FROM theme_group_scores
  ORDER BY
    term,
    group_weight DESC,
    CASE WHEN term_group = 'expression' THEN 0 ELSE 1 END
),
theme_eligible_materials AS (
  SELECT
    record_id::TEXT AS source_id,
    asset_id,
    metric_score
  FROM fusion_scored
  WHERE metric_score IS NOT NULL
    AND content_evidence_tier = 'structured_video_understanding'
),
theme_brand_stats AS (
  SELECT
    COUNT(DISTINCT source_id)::BIGINT AS eligible_materials,
    AVG(metric_score)::FLOAT8 AS brand_average_metric_score
  FROM theme_eligible_materials
),
theme_term_aggregates AS (
  SELECT
    sources.term,
    groups.term_group,
    COUNT(DISTINCT sources.source_id)::BIGINT AS source_count,
    ROUND((AVG(sources.semantic_source_weight) / 7.0 * 100.0)::NUMERIC, 1)::FLOAT8 AS semantic_score,
    AVG(materials.metric_score)::FLOAT8 AS raw_performance_score,
    COALESCE(
      JSONB_AGG(DISTINCT sources.asset_id::TEXT) FILTER (WHERE sources.asset_id IS NOT NULL),
      '[]'::JSONB
    ) AS evidence_asset_ids
  FROM theme_source_terms sources
  JOIN theme_eligible_materials materials ON materials.source_id = sources.source_id
  JOIN theme_term_groups groups ON groups.term = sources.term
  GROUP BY sources.term, groups.term_group
),
theme_term_components AS (
  SELECT
    aggregates.*,
    ROUND((
      100.0 * LN(1.0 + aggregates.source_count::FLOAT8)
      / NULLIF(LN(1.0 + stats.eligible_materials::FLOAT8), 0)
    )::NUMERIC, 1)::FLOAT8 AS coverage_score,
    ROUND((
      (
        aggregates.raw_performance_score * aggregates.source_count::FLOAT8
        + stats.brand_average_metric_score * 3.0
      ) / NULLIF(aggregates.source_count::FLOAT8 + 3.0, 0)
    )::NUMERIC, 1)::FLOAT8 AS performance_score
  FROM theme_term_aggregates aggregates
  CROSS JOIN theme_brand_stats stats
),
theme_term_scored AS (
  SELECT
    components.*,
    ROUND((
      components.semantic_score * 0.45
      + components.coverage_score * 0.20
      + components.performance_score * 0.35
    )::NUMERIC, 1)::FLOAT8 AS theme_score,
    CASE
      WHEN components.performance_score >= 75 THEN 'high'
      WHEN components.performance_score >= 50 THEN 'mid'
      ELSE 'low'
    END AS performance_band
  FROM theme_term_components components
  WHERE components.source_count >= 2
),
theme_term_ranked AS (
  SELECT
    scored.*,
    ROW_NUMBER() OVER (
      PARTITION BY scored.term_group
      ORDER BY scored.theme_score DESC, scored.source_count DESC, scored.term ASC
    ) AS group_rank
  FROM theme_term_scored scored
),
content_theme_ranked AS (
  SELECT *
  FROM theme_term_ranked
  WHERE (term_group = 'topic' AND group_rank <= 8)
     OR (term_group = 'expression' AND group_rank <= 6)
),
content_theme_payload AS (
  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'term', term,
        'group', term_group,
        'themeScore', theme_score,
        'semanticScore', semantic_score,
        'coverageScore', coverage_score,
        'performanceScore', performance_score,
        'performanceBand', performance_band,
        'sourceCount', source_count,
        'evidenceAssetIds', evidence_asset_ids
      )
      ORDER BY
        CASE WHEN term_group = 'topic' THEN 0 ELSE 1 END,
        theme_score DESC,
        source_count DESC,
        term ASC
    ),
    '[]'::JSONB
  ) AS content_theme_payload
  FROM content_theme_ranked
),
content_theme_summary_payload AS (
  SELECT JSONB_BUILD_OBJECT(
    'eligibleMaterials', stats.eligible_materials,
    'topicCount', COUNT(*) FILTER (WHERE ranked.term_group = 'topic'),
    'expressionCount', COUNT(*) FILTER (WHERE ranked.term_group = 'expression')
  ) AS content_theme_summary_payload
  FROM theme_brand_stats stats
  LEFT JOIN content_theme_ranked ranked ON TRUE
  GROUP BY stats.eligible_materials
),
