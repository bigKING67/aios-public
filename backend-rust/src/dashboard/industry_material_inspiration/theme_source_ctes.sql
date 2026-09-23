token_sources AS (
  SELECT
    enriched.asset_id,
    enriched.record_id::TEXT AS source_id,
    'ai' AS source_kind,
    'topic' AS term_group,
    CASE
      WHEN (SELECT video_type FROM params LIMIT 1) = 'live_lead_short_video' THEN 4
      ELSE 5
    END AS source_weight,
    term
  FROM enriched
  CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS_TEXT(
    CASE
      WHEN JSONB_TYPEOF(enriched.analysis->'suggested_tags') = 'array' THEN enriched.analysis->'suggested_tags'
      ELSE '[]'::JSONB
    END
  ) AS term
  UNION ALL
  SELECT
    enriched.asset_id,
    enriched.record_id::TEXT,
    'ai',
    'expression',
    CASE
      WHEN (SELECT video_type FROM params LIMIT 1) = 'live_lead_short_video' THEN 5
      ELSE 4
    END,
    term
  FROM enriched
  CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS_TEXT(
    CASE
      WHEN JSONB_TYPEOF(enriched.analysis->'scene_tags') = 'array' THEN enriched.analysis->'scene_tags'
      ELSE '[]'::JSONB
    END
  ) AS term
  UNION ALL
  SELECT
    enriched.asset_id,
    enriched.record_id::TEXT,
    'ai',
    'topic',
    CASE
      WHEN (SELECT video_type FROM params LIMIT 1) = 'live_lead_short_video' THEN 3
      ELSE 6
    END,
    term
  FROM enriched
  CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS_TEXT(
    CASE
      WHEN JSONB_TYPEOF(enriched.analysis->'product_tags') = 'array' THEN enriched.analysis->'product_tags'
      ELSE '[]'::JSONB
    END
  ) AS term
  UNION ALL
  SELECT
    enriched.asset_id,
    enriched.record_id::TEXT,
    'ai',
    'topic',
    CASE
      WHEN (SELECT video_type FROM params LIMIT 1) = 'live_lead_short_video' THEN 4
      ELSE 6
    END,
    term
  FROM enriched
  CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS_TEXT(
    CASE
      WHEN JSONB_TYPEOF(enriched.analysis->'selling_points') = 'array' THEN enriched.analysis->'selling_points'
      ELSE '[]'::JSONB
    END
  ) AS term
  UNION ALL
  SELECT
    enriched.asset_id,
    enriched.record_id::TEXT,
    'ai',
    'expression',
    CASE
      WHEN (SELECT video_type FROM params LIMIT 1) = 'live_lead_short_video' THEN 7
      ELSE 4
    END,
    enriched.analysis->>'hook_type'
  FROM enriched
  WHERE NULLIF(BTRIM(COALESCE(enriched.analysis->>'hook_type', '')), '') IS NOT NULL
  UNION ALL
  SELECT
    enriched.asset_id,
    enriched.record_id::TEXT,
    'ai',
    'expression',
    CASE
      WHEN (SELECT video_type FROM params LIMIT 1) = 'live_lead_short_video' THEN 7
      ELSE 4
    END,
    enriched.analysis#>>'{video_understanding,hook,type}'
  FROM enriched
  WHERE NULLIF(BTRIM(COALESCE(enriched.analysis#>>'{video_understanding,hook,type}', '')), '') IS NOT NULL
  UNION ALL
  SELECT enriched.asset_id, enriched.record_id::TEXT, 'asset', 'topic', 4, term
  FROM enriched
  CROSS JOIN LATERAL UNNEST(
    COALESCE(enriched.asset_tags, '{}'::TEXT[])
    || COALESCE(enriched.ai_suggested_tags, '{}'::TEXT[])
  ) AS term
  UNION ALL
  SELECT enriched.asset_id, enriched.record_id::TEXT, 'fallback', 'topic', 2, term
  FROM enriched
  CROSS JOIN LATERAL REGEXP_SPLIT_TO_TABLE(COALESCE(enriched.marketing_selling_point, ''), '[、,，;；/|｜[:space:]]+') AS term
  UNION ALL
  SELECT enriched.asset_id, enriched.record_id::TEXT, 'fallback', 'topic', 2, term
  FROM enriched
  CROSS JOIN LATERAL REGEXP_SPLIT_TO_TABLE(COALESCE(enriched.related_product, ''), '[、,，;；/|｜[:space:]]+') AS term
  UNION ALL
  SELECT enriched.asset_id, enriched.record_id::TEXT, 'fallback', 'topic', 1, term
  FROM enriched
  CROSS JOIN LATERAL REGEXP_SPLIT_TO_TABLE(COALESCE(enriched.core_audience, ''), '[、,，;；/|｜[:space:]]+') AS term
),
normalized_terms AS (
  SELECT
    asset_id,
    source_id,
    source_kind,
    term_group,
    source_weight,
    REGEXP_REPLACE(BTRIM(term), '^[#＃]+|[。.!！?？]+$', '', 'g') AS term
  FROM token_sources
),
term_counts AS (
  SELECT
    term,
    SUM(source_weight)::FLOAT8 AS weight,
    COUNT(DISTINCT source_id)::BIGINT AS source_count,
    COALESCE(JSONB_AGG(DISTINCT asset_id::TEXT) FILTER (WHERE asset_id IS NOT NULL), '[]'::JSONB) AS evidence_asset_ids,
    BOOL_OR(source_kind = 'ai') AS has_ai_source,
    BOOL_OR(source_kind = 'fallback') AS has_fallback_source
  FROM normalized_terms
  WHERE CHAR_LENGTH(term) BETWEEN 2 AND 18
    AND term !~ '^[0-9.％%+-]+$'
    AND term NOT IN ('不明确', '未知', '暂无', '无', '其他', 'null', 'undefined', '人群', '卖点', '产品')
  GROUP BY term
),
term_ranked AS (
  SELECT *
  FROM term_counts
  ORDER BY weight DESC, source_count DESC, term ASC
  LIMIT 20
),
word_cloud_payload AS (
  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'term', term,
        'weight', weight,
        'sourceCount', source_count,
        'evidenceAssetIds', evidence_asset_ids
      )
      ORDER BY weight DESC, source_count DESC, term ASC
    ),
    '[]'::JSONB
  ) AS word_cloud_payload
  FROM term_ranked
),
hook_terms AS (
  SELECT
    hook_type AS term,
    COUNT(*)::BIGINT AS source_count
  FROM (
    SELECT COALESCE(
      NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,hook,type}'), ''),
      NULLIF(BTRIM(enriched.analysis->>'hook_type'), '')
    ) AS hook_type
    FROM enriched
    WHERE enriched.analysis IS NOT NULL
  ) hooks
  WHERE hook_type IS NOT NULL
    AND hook_type NOT IN ('不明确', '未知', 'none')
  GROUP BY hook_type
  ORDER BY source_count DESC, hook_type ASC
  LIMIT 1
),
