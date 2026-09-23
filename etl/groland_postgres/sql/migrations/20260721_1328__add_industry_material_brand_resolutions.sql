CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_brand_resolutions (
  asset_id UUID NOT NULL REFERENCES ads.marketing_content_assets(asset_id) ON DELETE CASCADE,
  resolver_version TEXT NOT NULL,
  brand_name TEXT,
  status TEXT NOT NULL,
  confidence NUMERIC(5, 4) NOT NULL,
  primary_source TEXT NOT NULL,
  evidence_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  model_name TEXT,
  prompt_version TEXT,
  response_id TEXT,
  usage_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (asset_id, resolver_version),
  CONSTRAINT marketing_content_asset_brand_resolutions_version_check
    CHECK (BTRIM(resolver_version) <> '' AND CHAR_LENGTH(resolver_version) <= 128),
  CONSTRAINT marketing_content_asset_brand_resolutions_brand_check
    CHECK (
      brand_name IS NULL
      OR brand_name IN ('卡诗', '欧莱雅PRO', '韩束', 'OKCS', 'EHD', 'SPES', '馥绿德雅', 'Off&Relax')
    ),
  CONSTRAINT marketing_content_asset_brand_resolutions_status_check
    CHECK (status IN ('recognized', 'ambiguous', 'unknown')),
  CONSTRAINT marketing_content_asset_brand_resolutions_confidence_check
    CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT marketing_content_asset_brand_resolutions_source_check
    CHECK (primary_source IN ('manual', 'title', 'metadata', 'visual', 'transcript', 'multimodal')),
  CONSTRAINT marketing_content_asset_brand_resolutions_result_check
    CHECK (
      (status = 'recognized' AND brand_name IS NOT NULL)
      OR (status IN ('ambiguous', 'unknown') AND brand_name IS NULL)
    ),
  CONSTRAINT marketing_content_asset_brand_resolutions_evidence_check
    CHECK (
      JSONB_TYPEOF(evidence_json) = 'object'
      AND OCTET_LENGTH(evidence_json::TEXT) <= 16384
    ),
  CONSTRAINT marketing_content_asset_brand_resolutions_usage_check
    CHECK (JSONB_TYPEOF(usage_json) = 'object' AND OCTET_LENGTH(usage_json::TEXT) <= 8192),
  CONSTRAINT marketing_content_asset_brand_resolutions_manual_source_check
    CHECK (is_manual_override = (primary_source = 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_marketing_content_asset_brand_resolutions_latest
  ON ads.marketing_content_asset_brand_resolutions (
    asset_id,
    is_manual_override DESC,
    resolved_at DESC,
    updated_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_marketing_content_asset_brand_resolutions_status
  ON ads.marketing_content_asset_brand_resolutions (status, brand_name, resolved_at DESC);

COMMENT ON TABLE ads.marketing_content_asset_brand_resolutions IS
  '内容资产品牌解析结果；按 resolver_version 保留可审计历史，人工结果优先于自动结果。';

COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.asset_id IS
  '内容资产 ID。';
COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.resolver_version IS
  '品牌解析器版本；同一资产与版本幂等。';
COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.brand_name IS
  '确认的固定八品牌之一；ambiguous/unknown 时为空。';
COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.status IS
  '解析状态：recognized、ambiguous、unknown。';
COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.confidence IS
  '0 到 1 的品牌解析置信度。';
COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.primary_source IS
  '主要证据来源：manual、title、metadata、visual、transcript、multimodal。';
COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.evidence_json IS
  '有界品牌证据、候选与冲突信息；不得存储视频或大段模型原文。';
COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.model_name IS
  '自动解析使用的模型名称；确定性或人工解析可为空。';
COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.prompt_version IS
  '自动解析提示词版本或确定性规则版本。';
COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.response_id IS
  '模型响应 ID；不得存储完整模型响应。';
COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.usage_json IS
  '有界模型用量元数据；非模型解析为空对象。';
COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.is_manual_override IS
  '是否为人工确认；人工确认在有效品牌查询中绝对优先。';
COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.resolved_at IS
  '本解析结果的业务解析时间。';
COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.created_at IS
  '解析记录创建时间。';
COMMENT ON COLUMN ads.marketing_content_asset_brand_resolutions.updated_at IS
  '解析记录最后更新时间。';

CREATE OR REPLACE FUNCTION ads.extract_douyin_qianchuan_industry_material_brand_from_evidence(
  p_texts TEXT[]
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  WITH evidence AS (
    SELECT
      NULLIF(BTRIM(item.evidence_text), '') AS evidence_text,
      item.ordinality
    FROM UNNEST(COALESCE(p_texts, ARRAY[]::TEXT[])) WITH ORDINALITY AS item(evidence_text, ordinality)
  ),
  matches AS (
    SELECT DISTINCT
      evidence.ordinality,
      rules.brand_name
    FROM evidence
    CROSS JOIN LATERAL (
      VALUES
        ('卡诗'::TEXT, '卡诗|(^|[^[:alpha:]])k[ée]rastase([^[:alpha:]]|$)'::TEXT),
        ('欧莱雅PRO'::TEXT, '欧莱雅[[:space:]]*(pro|professionnel)|l[''’]?[[:space:]]*or[ée]al[[:space:]]*(pro|professionnel)'::TEXT),
        ('韩束'::TEXT, '韩束|(^|[^[:alpha:]])kans([^[:alpha:]]|$)'::TEXT),
        ('OKCS'::TEXT, '(^|[^[:alpha:]])okcs([^[:alpha:]]|$)'::TEXT),
        ('EHD'::TEXT, '(^|[^[:alpha:]])ehd([^[:alpha:]]|$)'::TEXT),
        ('SPES'::TEXT, '诗裴丝|(^|[^[:alpha:]])sp[eē]s([^[:alpha:]]|$)'::TEXT),
        ('馥绿德雅'::TEXT, '馥绿德雅|(^|[^[:alpha:]])ren[eé][[:space:]]*furterer([^[:alpha:]]|$)|(^|[^[:alpha:]])furterer([^[:alpha:]]|$)'::TEXT),
        ('Off&Relax'::TEXT, 'off[[:space:]]*(&|and)?[[:space:]]*relax|我是[[:space:]]*off([^[:alpha:]]|$)|(^|[^[:alpha:]])or[[:space:]]*(清爽|头皮|洗发|护发)'::TEXT)
    ) AS rules(brand_name, brand_pattern)
    WHERE evidence.evidence_text IS NOT NULL
      AND evidence.evidence_text ~* rules.brand_pattern
  ),
  first_matching_source AS (
    SELECT MIN(ordinality) AS ordinality
    FROM matches
  ),
  source_matches AS (
    SELECT DISTINCT matches.brand_name
    FROM matches
    JOIN first_matching_source first_source
      ON first_source.ordinality = matches.ordinality
  )
  SELECT CASE WHEN COUNT(*) = 1 THEN MIN(brand_name) ELSE NULL END
  FROM source_matches;
$$;

COMMENT ON FUNCTION ads.extract_douyin_qianchuan_industry_material_brand_from_evidence(TEXT[]) IS
  '从标题、商品、卖点或资产元数据等显式文本证据提取固定八品牌；不根据品类或功效语义猜测品牌。';

CREATE OR REPLACE FUNCTION ads.extract_douyin_qianchuan_industry_material_brand(
  p_video_title TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ads.extract_douyin_qianchuan_industry_material_brand_from_evidence(ARRAY[p_video_title]);
$$;

COMMENT ON FUNCTION ads.extract_douyin_qianchuan_industry_material_brand(TEXT) IS
  '从行业素材视频标题的显式品牌词提取固定八品牌；无法识别返回 NULL。';

UPDATE ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly target
SET
  brand_name = ads.extract_douyin_qianchuan_industry_material_brand(target.video_title),
  refreshed_at = CURRENT_TIMESTAMP
WHERE ads.extract_douyin_qianchuan_industry_material_brand(target.video_title) IS NOT NULL
  AND target.brand_name IS DISTINCT FROM ads.extract_douyin_qianchuan_industry_material_brand(target.video_title);
