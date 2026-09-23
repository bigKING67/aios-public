use super::{brand_resolution_sql, VideoUnderstandingStorageReadiness};

pub(super) const LATEST_ANALYSIS_CTE_MARKER: &str = "__LATEST_ANALYSIS_CTE__";
pub(super) const VIDEO_UNDERSTANDING_RESULTS_AVAILABLE_MARKER: &str =
    "__VIDEO_UNDERSTANDING_RESULTS_AVAILABLE__";
pub(super) const VIDEO_UNDERSTANDING_STORAGE_READY_MARKER: &str =
    "__VIDEO_UNDERSTANDING_STORAGE_READY__";

pub(super) const VIDEO_UNDERSTANDING_STORAGE_READINESS_SQL: &str =
    include_str!("video_understanding_storage_readiness.sql");

pub(super) const AVAILABLE_MONTHS_SQL: &str = r#"
SELECT COALESCE(JSONB_AGG(month_label ORDER BY stat_month DESC), '[]'::JSONB) AS available_months
FROM (
  SELECT DISTINCT
    stat_month,
    TO_CHAR(stat_month, 'YYYY-MM') AS month_label
  FROM ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly
  WHERE video_type = $1
) months
"#;

pub(super) const LATEST_MONTH_SQL: &str = r#"
SELECT TO_CHAR(MAX(stat_month), 'YYYY-MM') AS latest_month
FROM ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly
WHERE video_type = $1
"#;

pub(super) const LATEST_ANALYSIS_SOURCE_CTE: &str = r#"latest_analysis AS (
  SELECT DISTINCT ON (result.asset_id)
    result.asset_id,
    result.result_json->'analysis' AS analysis,
    result.updated_at
  FROM ads.marketing_content_asset_video_understanding_results result
  JOIN base_asset_ids ids ON ids.asset_id = result.asset_id
  ORDER BY result.asset_id, result.updated_at DESC, result.created_at DESC
)"#;

pub(super) const LATEST_ANALYSIS_EMPTY_CTE: &str = r#"latest_analysis AS (
  SELECT
    NULL::UUID AS asset_id,
    NULL::JSONB AS analysis,
    NULL::TIMESTAMPTZ AS updated_at
  WHERE FALSE
)"#;

pub(super) const BRAND_AI_BACKFILL_SCOPE_SQL: &str = include_str!("brand_ai_backfill_scope.sql");
pub(super) const BRAND_AI_BACKFILL_ASSETS_SQL_TEMPLATE: &str =
    include_str!("brand_ai_backfill_assets.sql");

pub(super) const DOUYIN_PAYLOAD_SQL_TEMPLATE: &str = concat!(
    r#"
WITH params AS (
  SELECT
    $1::DATE AS stat_month,
    $2::TEXT AS video_type,
    NULLIF(BTRIM($3::TEXT), '') AS requested_brand
),
__BRAND_RESOLUTION_CTE__,
base_all AS (
  SELECT
    material.*,
    effective_brand.brand_name AS effective_brand_name,
    effective_brand.status AS brand_resolution_status,
    effective_brand.source AS brand_resolution_source,
    effective_brand.confidence AS brand_resolution_confidence,
    effective_brand.evidence AS brand_resolution_evidence,
    CASE
      WHEN effective_brand.brand_name IS NULL THEN '__unknown'
      ELSE effective_brand.brand_name
    END AS brand_key,
    COALESCE(effective_brand.brand_name, '待识别') AS brand_label
  FROM ads.douyin_qianchuan_industry_brand_short_video_material_inspiration_monthly material
  JOIN params p
    ON material.stat_month = p.stat_month
   AND material.video_type = p.video_type
  __BRAND_RESOLUTION_JOIN__
),
base_asset_ids AS (
  SELECT DISTINCT asset_id
  FROM base_all
  WHERE asset_id IS NOT NULL
),
__LATEST_ANALYSIS_CTE__,
brand_option_rows AS (
  SELECT
    base_all.brand_key AS key,
    base_all.brand_label AS label,
    COUNT(*)::BIGINT AS material_count,
    COUNT(DISTINCT base_all.asset_id) FILTER (WHERE base_all.asset_id IS NOT NULL)::BIGINT AS linked_asset_count,
    COUNT(DISTINCT base_all.asset_id) FILTER (
      WHERE base_all.asset_id IS NOT NULL
        AND (
          latest_analysis.analysis IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(asset.analysis_object_key, '')), '') IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(asset.ai_summary, '')), '') IS NOT NULL
          OR CARDINALITY(COALESCE(asset.ai_suggested_tags, '{}'::TEXT[])) > 0
          OR asset.ai_analyzed_at IS NOT NULL
        )
    )::BIGINT AS analyzed_asset_count,
    COUNT(DISTINCT base_all.asset_id) FILTER (
      WHERE base_all.asset_id IS NOT NULL
        AND JSONB_TYPEOF(latest_analysis.analysis->'video_understanding') = 'object'
    )::BIGINT AS structured_video_understanding_asset_count
  FROM base_all
  LEFT JOIN ads.marketing_content_assets asset ON asset.asset_id = base_all.asset_id AND asset.is_deleted = FALSE
  LEFT JOIN latest_analysis ON latest_analysis.asset_id = base_all.asset_id
  GROUP BY base_all.brand_key, base_all.brand_label
),
brand_options_payload AS (
  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'key', key,
        'label', label,
        'materialCount', material_count,
        'linkedAssetCount', linked_asset_count,
        'analyzedAssetCount', analyzed_asset_count,
        'structuredVideoUnderstandingAssetCount', structured_video_understanding_asset_count
      )
      ORDER BY
        CASE WHEN key = '__unknown' THEN 1 ELSE 0 END,
        material_count DESC,
        label ASC
    ),
    '[]'::JSONB
  ) AS brand_options_payload
  FROM brand_option_rows
),
selected_brand AS (
  SELECT
    brand_option_rows.key,
    brand_option_rows.label
  FROM brand_option_rows
  CROSS JOIN params
  WHERE params.requested_brand IS NOT NULL
    AND params.requested_brand <> 'all'
    AND (
      brand_option_rows.key = params.requested_brand
      OR LOWER(brand_option_rows.label) = LOWER(params.requested_brand)
    )
  ORDER BY
    CASE WHEN brand_option_rows.key = params.requested_brand THEN 0 ELSE 1 END,
    brand_option_rows.material_count DESC,
    brand_option_rows.label ASC
  LIMIT 1
),
selected_brand_payload AS (
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM selected_brand) THEN (
      SELECT JSONB_BUILD_OBJECT('key', key, 'label', label)
      FROM selected_brand
      LIMIT 1
    )
    ELSE NULL
  END AS selected_brand_payload
),
base AS (
  SELECT base_all.*
  FROM base_all
  WHERE NOT EXISTS (SELECT 1 FROM selected_brand)
     OR base_all.brand_key = (SELECT key FROM selected_brand LIMIT 1)
),
summary AS (
  SELECT JSONB_BUILD_OBJECT(
    'totalCount', COUNT(*)::BIGINT,
    'brandCount', COUNT(DISTINCT effective_brand_name)::BIGINT,
    'archivedCount', COUNT(*) FILTER (WHERE asset_id IS NOT NULL)::BIGINT,
    'unarchivedCount', COUNT(*) FILTER (WHERE asset_id IS NULL)::BIGINT,
    'totalExposure', COALESCE(SUM(exposure_count), 0)::BIGINT,
    'avgCompletionRate', AVG(completion_rate),
    'avgCtr', AVG(ctr),
    'avgCvr', AVG(cvr),
    'avgPlay3sRate', AVG(play_3s_rate),
    'avgPlay5sRate', AVG(play_5s_rate),
    'avgInteractionRate', AVG(interaction_rate),
    'avgPvr', AVG(pvr),
    'updatedAt', TO_CHAR(MAX(refreshed_at), 'YYYY-MM-DD"T"HH24:MI:SSOF')
  ) AS summary_payload
  FROM base
),
rows_payload AS (
  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'recordId', record_id::TEXT,
        'month', TO_CHAR(stat_month, 'YYYY-MM'),
        'statMonth', TO_CHAR(stat_month, 'YYYY-MM'),
        'brand', effective_brand_name,
        'brandName', effective_brand_name,
        'brandResolutionStatus', brand_resolution_status,
        'brandResolutionSource', brand_resolution_source,
        'brandResolutionConfidence', brand_resolution_confidence,
        'brandResolutionEvidence', brand_resolution_evidence,
        'videoType', video_type,
        'videoTypeName', video_type_name,
        'qianchuanScene', qianchuan_scene,
        'qianchuanSceneName', qianchuan_scene_name,
        'rank', source_rank,
        'product', related_product,
        'productName', related_product,
        'title', video_title,
        'videoTitle', video_title,
        'audience', core_audience,
        'sellingPoint', marketing_selling_point,
        'publishTime', first_publish_date_text,
        'rawExposureCount', raw_exposure_count,
        'exposureRange', raw_exposure_count,
        'exposure', exposure_count,
        'exposureCount', exposure_count,
        'completionRate', completion_rate,
        'ctr', ctr,
        'cvr', cvr,
        'play3sRate', play_3s_rate,
        'play5sRate', play_5s_rate,
        'interactionRate', interaction_rate,
        'pvr', pvr,
        'assetId', asset_id::TEXT
      )
      ORDER BY source_rank ASC NULLS LAST, effective_brand_name ASC NULLS LAST, record_id ASC
    ),
    '[]'::JSONB
  ) AS rows_payload
  FROM base
),
enriched AS (
  SELECT
    base.*,
    asset.title AS asset_title,
    asset.tags AS asset_tags,
    asset.ai_suggested_tags,
    asset.ai_summary,
    asset.ai_analyzed_at,
    asset.analysis_object_key,
    latest_analysis.analysis
  FROM base
  LEFT JOIN ads.marketing_content_assets asset
    ON asset.asset_id = base.asset_id
   AND asset.is_deleted = FALSE
  LEFT JOIN latest_analysis ON latest_analysis.asset_id = base.asset_id
),
coverage AS (
  SELECT
    COUNT(*)::BIGINT AS total_materials,
    COUNT(DISTINCT asset_id) FILTER (WHERE asset_id IS NOT NULL)::BIGINT AS linked_assets,
    COUNT(DISTINCT asset_id) FILTER (
      WHERE asset_id IS NOT NULL
        AND (
          analysis IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(analysis_object_key, '')), '') IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(ai_summary, '')), '') IS NOT NULL
          OR CARDINALITY(COALESCE(ai_suggested_tags, '{}'::TEXT[])) > 0
          OR ai_analyzed_at IS NOT NULL
        )
    )::BIGINT AS analyzed_assets,
    COUNT(DISTINCT asset_id) FILTER (
      WHERE asset_id IS NOT NULL
        AND JSONB_TYPEOF(analysis->'video_understanding') = 'object'
    )::BIGINT AS structured_video_understanding_assets,
    COUNT(DISTINCT asset_id) FILTER (
      WHERE asset_id IS NOT NULL
        AND NULLIF(BTRIM(COALESCE(analysis_object_key, '')), '') IS NOT NULL
    )::BIGINT AS analysis_artifact_assets,
    COUNT(*) FILTER (
      WHERE exposure_count IS NOT NULL
         OR completion_rate IS NOT NULL
         OR ctr IS NOT NULL
         OR cvr IS NOT NULL
         OR play_3s_rate IS NOT NULL
         OR play_5s_rate IS NOT NULL
         OR interaction_rate IS NOT NULL
         OR pvr IS NOT NULL
    )::BIGINT AS rows_with_performance
  FROM enriched
),
missing_structured_asset_ids AS (
  SELECT DISTINCT asset_id
  FROM enriched
  WHERE asset_id IS NOT NULL
    AND COALESCE(JSONB_TYPEOF(analysis->'video_understanding'), '') <> 'object'
),
active_analysis_jobs AS (
  SELECT DISTINCT ON (job.asset_id)
    job.asset_id,
    job.status
  FROM ads.marketing_content_asset_processing_jobs job
  JOIN missing_structured_asset_ids missing
    ON missing.asset_id = job.asset_id
  WHERE job.job_type = 'analysis'
    AND job.status IN ('queued', 'running')
  ORDER BY
    job.asset_id,
    CASE job.status WHEN 'running' THEN 0 ELSE 1 END,
    job.started_at DESC NULLS LAST,
    job.queued_at ASC,
    job.created_at ASC
),
active_analysis_job_coverage AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'queued')::BIGINT AS queued_structured_video_understanding,
    COUNT(*) FILTER (WHERE status = 'running')::BIGINT AS running_structured_video_understanding
  FROM active_analysis_jobs
),
"#,
    include_str!("theme_source_ctes.sql"),
    r#"
"#,
    include_str!("fusion_score_ctes.sql"),
    r#"
"#,
    include_str!("content_theme_scoring_ctes.sql"),
    r#"
action_candidates AS (
  SELECT action
  FROM enriched
  CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
    CASE
      WHEN JSONB_TYPEOF(enriched.analysis#>'{current_ai_analysis,next_actions}') = 'array'
      THEN enriched.analysis#>'{current_ai_analysis,next_actions}'
      ELSE '[]'::JSONB
    END
  ) AS action
  UNION ALL
  SELECT action
  FROM enriched
  CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
    CASE
      WHEN JSONB_TYPEOF(enriched.analysis->'next_actions') = 'array' THEN enriched.analysis->'next_actions'
      ELSE '[]'::JSONB
    END
  ) AS action
),
action_normalized AS (
  SELECT
    COALESCE(NULLIF(BTRIM(action->>'title'), ''), NULLIF(BTRIM(action->>'action'), '')) AS title,
    COALESCE(NULLIF(BTRIM(action->>'detail'), ''), NULLIF(BTRIM(action->>'description'), '')) AS detail,
    COALESCE(NULLIF(BTRIM(action->>'owner'), ''), 'unknown') AS owner,
    COALESCE(NULLIF(BTRIM(action->>'priority'), ''), 'medium') AS priority,
    COALESCE(NULLIF(BTRIM(action->>'action_type'), ''), NULLIF(BTRIM(action->>'actionType'), '')) AS action_type,
    COALESCE(
      NULLIF(BTRIM(action->>'metric_target'), ''),
      NULLIF(BTRIM(action->>'metricTarget'), ''),
      NULLIF(BTRIM(action->>'expected_metric_lift'), ''),
      NULLIF(BTRIM(action->>'expectedMetricLift'), '')
    ) AS metric_target,
    CASE COALESCE(NULLIF(BTRIM(action->>'priority'), ''), 'medium')
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 3
      ELSE 4
    END AS priority_rank
  FROM action_candidates
),
action_ranked AS (
  SELECT
    title,
    detail,
    owner,
    priority,
    action_type,
    metric_target,
    COUNT(*)::BIGINT AS evidence_count,
    MIN(priority_rank) AS priority_rank
  FROM action_normalized
  WHERE title IS NOT NULL
  GROUP BY title, detail, owner, priority, action_type, metric_target
  ORDER BY MIN(priority_rank), COUNT(*) DESC, title ASC
  LIMIT 4
),
fallback_actions AS (
  SELECT *
  FROM (
    VALUES
      (
        '补齐品牌素材视频理解覆盖'::TEXT,
        '优先处理已归档但缺少视频理解结果的素材，避免词云和策略只依赖标题/卖点兜底。'::TEXT,
        'data_linkage'::TEXT,
        'high'::TEXT,
        'complete_ai_analysis'::TEXT,
        '提升视频理解覆盖率'::TEXT,
        0::BIGINT,
        1::INTEGER
      ),
      (
        CASE
          WHEN (SELECT video_type FROM params LIMIT 1) = 'live_lead_short_video'
          THEN '围绕高留存素材复剪进房钩子'
          ELSE '围绕高 CTR/CVR 素材复剪商品点击钩子'
        END,
        CASE
          WHEN (SELECT video_type FROM params LIMIT 1) = 'live_lead_short_video'
          THEN '把高表现素材的前三秒利益点、直播福利和进房理由拆成 A/B 版本。'
          ELSE '把高表现素材的首屏卖点、信任背书、价格/权益和 CTA 拆成 A/B 版本。'
        END,
        'creative'::TEXT,
        'medium'::TEXT,
        'rewrite_hook'::TEXT,
        CASE
          WHEN (SELECT video_type FROM params LIMIT 1) = 'live_lead_short_video' THEN '提升 5S 留存、完播与 PVR'
          ELSE '提升 CTR、CVR 与 PVR'
        END,
        (SELECT total_materials FROM coverage LIMIT 1),
        2::INTEGER
      )
  ) AS actions(title, detail, owner, priority, action_type, metric_target, evidence_count, priority_rank)
),
next_action_rows AS (
  SELECT *
  FROM action_ranked
  UNION ALL
  SELECT *
  FROM fallback_actions
  WHERE NOT EXISTS (SELECT 1 FROM action_ranked)
  ORDER BY priority_rank ASC, evidence_count DESC, title ASC
  LIMIT 4
),
next_actions_payload AS (
  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'title', title,
        'detail', COALESCE(detail, ''),
        'owner', owner,
        'priority', priority,
        'actionType', COALESCE(action_type, ''),
        'metricTarget', COALESCE(metric_target, ''),
        'evidenceCount', evidence_count
      )
      ORDER BY priority_rank ASC, evidence_count DESC, title ASC
    ),
    '[]'::JSONB
  ) AS next_actions_payload
  FROM next_action_rows
),
analysis_boundary_payload AS (
  SELECT JSONB_BUILD_OBJECT(
    'mode', 'industry_visible_metrics_content_fusion',
    'visibleSignals', JSONB_BUILD_ARRAY(
      'rank',
      'brand',
      'product',
      'audience',
      'sellingPoint',
      'exposure',
      'completionRate',
      'ctr',
      'cvr',
      'play3sRate',
      'play5sRate',
      'interactionRate',
      'pvr',
      'videoUnderstanding'
    ),
    'unavailableSignals', JSONB_BUILD_ARRAY(
      'liveRoomAcceptance',
      'productCardAcceptance',
      'productPageAcceptance',
      'adSpend',
      'roi',
      'refund',
      'settlement',
      'singleMaterialTransactionAttribution'
    ),
    'conclusionPolicy', '只输出行业可见指标与视频内容支持的打法启发；不输出对方承接诊断、ROI 判断、放量或暂停决策。'
  ) AS analysis_boundary_payload
),
analysis_profile_payload AS (
  SELECT JSONB_BUILD_OBJECT(
    'key', CASE
      WHEN params.video_type = 'live_lead_short_video' THEN 'live_lead_industry_visible'
      ELSE 'goods_cart_industry_visible'
    END,
    'title', CASE
      WHEN params.video_type = 'live_lead_short_video' THEN '直播引流视频行业可见分析'
      ELSE '挂车带货视频行业可见分析'
    END,
    'primaryQuestion', CASE
      WHEN params.video_type = 'live_lead_short_video'
      THEN '视频内容是否在可见曝光内把用户有效带向直播间？'
      ELSE '视频内容是否在可见曝光内形成内容点击兴趣和购买意向线索？'
    END,
    'decisionLens', CASE
      WHEN params.video_type = 'live_lead_short_video'
      THEN '先看 3S/5S 留存和完播确认钩子被看见，再用 PVR、互动与 CTR 判断进房意图；只形成短视频内容表达假设，不评价直播间承接。'
      ELSE '先看 CTR 确认首屏卖点与内容点击线索，再结合 CVR、PVR、完播与互动判断卖点表达和可见转化倾向；不评价商品卡、商品页或成交承接。'
    END,
    'metricPriority', CASE
      WHEN params.video_type = 'live_lead_short_video' THEN JSONB_BUILD_ARRAY(
        JSONB_BUILD_OBJECT('key', 'play3sRate', 'label', '3S 留存', 'role', '判断首屏钩子是否让用户停留'),
        JSONB_BUILD_OBJECT('key', 'play5sRate', 'label', '5S 留存', 'role', '判断利益点/直播信号是否被看见'),
        JSONB_BUILD_OBJECT('key', 'completionRate', 'label', '完播率', 'role', '判断内容节奏和信息密度'),
        JSONB_BUILD_OBJECT('key', 'pvr', 'label', 'PVR', 'role', '判断可见进房意图强弱'),
        JSONB_BUILD_OBJECT('key', 'interactionRate', 'label', '互动率', 'role', '判断话题/福利是否激发反馈'),
        JSONB_BUILD_OBJECT('key', 'ctr', 'label', 'CTR', 'role', '仅作为引流兴趣辅助信号')
      )
      ELSE JSONB_BUILD_ARRAY(
        JSONB_BUILD_OBJECT('key', 'ctr', 'label', 'CTR', 'role', '判断首屏卖点和内容点击线索'),
        JSONB_BUILD_OBJECT('key', 'cvr', 'label', 'CVR', 'role', '判断可见转化倾向，不等于商品页承接'),
        JSONB_BUILD_OBJECT('key', 'pvr', 'label', 'PVR', 'role', '判断购买/进店意图的可见强度'),
        JSONB_BUILD_OBJECT('key', 'completionRate', 'label', '完播率', 'role', '判断卖点讲透和信任铺垫'),
        JSONB_BUILD_OBJECT('key', 'interactionRate', 'label', '互动率', 'role', '判断内容讨论和种草反馈'),
        JSONB_BUILD_OBJECT('key', 'play5sRate', 'label', '5S 留存', 'role', '辅助判断卖点前置是否有效')
      )
    END,
    'videoContentFocus', CASE
      WHEN params.video_type = 'live_lead_short_video' THEN JSONB_BUILD_ARRAY(
        '前三秒进房理由',
        '直播福利/限时利益信号',
        '主播或直播场景可见信任',
        '互动话术和评论引导',
        '进入直播间 CTA'
      )
      ELSE JSONB_BUILD_ARRAY(
        '首屏商品利益点',
        '问题-解决方案演示',
        '价格/权益/赠品提示',
        '信任背书与使用证据',
        '点击商品/下单 CTA'
      )
    END,
    'forbiddenConclusions', CASE
      WHEN params.video_type = 'live_lead_short_video' THEN JSONB_BUILD_ARRAY(
        '不判断对方直播间承接好坏',
        '不判断直播成交、ROI 或预算扩量',
        '不做单素材成交归因'
      )
      ELSE JSONB_BUILD_ARRAY(
        '不判断对方商品卡或商品页承接好坏',
        '不判断实际 ROI、退款或结算',
        '不做单素材成交归因'
      )
    END
  ) AS analysis_profile_payload
  FROM params
),
strategy_payload AS (
  SELECT JSONB_BUILD_ARRAY(
    JSONB_BUILD_OBJECT(
      'key', 'material_scale',
      'title', '素材规模',
      'value', FORMAT('%s 条素材', coverage.total_materials),
      'helper', FORMAT(
        '归档 %s 条，AI 内容 %s 条，结构化视频理解 %s 条，表现可读 %s 条。',
        coverage.linked_assets,
        coverage.analyzed_assets,
        coverage.structured_video_understanding_assets,
        coverage.rows_with_performance
      ),
      'evidenceCount', coverage.total_materials
    ),
    JSONB_BUILD_OBJECT(
      'key', 'objective',
      'title', '内容目标',
      'value', CASE
        WHEN (SELECT video_type FROM params LIMIT 1) = 'live_lead_short_video' THEN '直播短视频引流'
        ELSE '挂车带货短视频'
      END,
      'helper', CASE
        WHEN (SELECT video_type FROM params LIMIT 1) = 'live_lead_short_video'
        THEN '优先判断前三秒进房理由、直播福利信号和 PVR 支持的内容表达假设；不判断对方下游承接。'
        ELSE '优先判断内容点击线索、卖点前置、信任背书和转化 CTA；不判断商品卡或商品页承接。'
      END,
      'evidenceCount', coverage.total_materials
    ),
    JSONB_BUILD_OBJECT(
      'key', 'core_strategy',
      'title', '核心策略',
      'value', COALESCE((SELECT term FROM term_ranked ORDER BY weight DESC, source_count DESC, term ASC LIMIT 1), '暂无稳定主题'),
      'helper', '来自视频理解标签、素材标签、标题、人群和营销卖点的稳定聚合。',
      'evidenceCount', COALESCE((SELECT source_count FROM term_ranked ORDER BY weight DESC, source_count DESC, term ASC LIMIT 1), 0)
    ),
    JSONB_BUILD_OBJECT(
      'key', 'hook',
      'title', '钩子打法',
      'value', COALESCE((SELECT term FROM hook_terms LIMIT 1), '钩子未结构化'),
      'helper', '优先读取视频理解 hook_type；缺失时在覆盖缺口中提示补齐视频理解。',
      'evidenceCount', COALESCE((SELECT source_count FROM hook_terms LIMIT 1), 0)
    ),
    JSONB_BUILD_OBJECT(
      'key', 'conversion',
      'title', '可见转化信号',
      'value', CASE
        WHEN (SELECT video_type FROM params LIMIT 1) = 'live_lead_short_video' THEN '进房理由与内容表达假设'
        ELSE '内容点击线索与转化倾向'
      END,
      'helper', CASE
        WHEN (SELECT video_type FROM params LIMIT 1) = 'live_lead_short_video'
        THEN '只基于行业可见指标和视频内容生成内容表达假设，不判断对方下游承接。'
        ELSE '把价格/权益/信任背书和 CTA 放在可点击前的有效时间窗；不判断商品卡或商品页承接。'
      END,
      'evidenceCount', coverage.rows_with_performance
    )
  ) AS strategy_payload
  FROM coverage
),
gaps_payload AS (
  SELECT COALESCE(JSONB_AGG(gap), '[]'::JSONB) AS gaps_payload
  FROM coverage
  CROSS JOIN LATERAL (
    VALUES
      (CASE WHEN coverage.total_materials = 0 THEN '该品牌当前月份无素材行，无法生成品牌策略。' END),
      (CASE WHEN coverage.linked_assets = 0 AND coverage.total_materials > 0 THEN '该品牌素材尚未归档到内容资产库，视频理解证据只能依赖榜单字段。' END),
      (CASE WHEN NOT __VIDEO_UNDERSTANDING_STORAGE_READY__ THEN '结构化视频理解存储未就绪，需先应用独立 migration 后才能回填。' END),
      (CASE WHEN coverage.linked_assets > coverage.structured_video_understanding_assets THEN FORMAT('%s 个已归档素材缺少结构化视频理解结果。', coverage.linked_assets - coverage.structured_video_understanding_assets) END),
      (CASE WHEN coverage.rows_with_performance < coverage.total_materials THEN '部分素材缺少曝光或效率指标，策略卡已忽略缺失指标。' END),
      (CASE
        WHEN (SELECT COUNT(*) FROM term_ranked WHERE has_ai_source) = 0
          AND (SELECT COUNT(*) FROM term_ranked WHERE has_fallback_source) > 0
        THEN '视频理解标签不足，词云包含标题、人群、产品或营销卖点兜底。'
      END)
  ) AS gap_values(gap)
  WHERE gap IS NOT NULL
),
brand_insight_payload AS (
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM selected_brand) THEN JSONB_BUILD_OBJECT(
      'brand', (SELECT JSONB_BUILD_OBJECT('key', key, 'label', label) FROM selected_brand LIMIT 1),
      'tab', CASE
        WHEN params.video_type = 'goods_short_video' THEN 'douyin_goods_short_video'
        ELSE 'douyin_live_lead_short_video'
      END,
      'month', TO_CHAR(params.stat_month, 'YYYY-MM'),
      'objective', CASE
        WHEN params.video_type = 'live_lead_short_video' THEN 'live_lead'
        ELSE 'goods_cart'
      END,
      'coverage', (
        SELECT JSONB_BUILD_OBJECT(
          'totalMaterials', total_materials,
          'linkedAssets', linked_assets,
          'analyzedAssets', analyzed_assets,
          'anyAiContentAssets', analyzed_assets,
          'structuredVideoUnderstandingAssets', structured_video_understanding_assets,
          'analysisArtifactAssets', analysis_artifact_assets,
          'missingAnalysis', GREATEST(linked_assets - structured_video_understanding_assets, 0),
          'missingStructuredVideoUnderstanding', GREATEST(linked_assets - structured_video_understanding_assets, 0),
          'queuedStructuredVideoUnderstanding', (SELECT queued_structured_video_understanding FROM active_analysis_job_coverage),
          'runningStructuredVideoUnderstanding', (SELECT running_structured_video_understanding FROM active_analysis_job_coverage),
          'structuredVideoUnderstandingTableAvailable', __VIDEO_UNDERSTANDING_RESULTS_AVAILABLE__,
          'structuredVideoUnderstandingReady', __VIDEO_UNDERSTANDING_STORAGE_READY__,
          'rowsWithPerformance', rows_with_performance
        )
        FROM coverage
      ),
      'fusionSummary', (SELECT fusion_summary_payload FROM fusion_summary_payload),
      'analysisProfile', (SELECT analysis_profile_payload FROM analysis_profile_payload),
      'analysisBoundary', (SELECT analysis_boundary_payload FROM analysis_boundary_payload),
      'contentThemeSummary', (SELECT content_theme_summary_payload FROM content_theme_summary_payload),
      'contentThemeTerms', (SELECT content_theme_payload FROM content_theme_payload),
      'wordCloudTerms', (SELECT word_cloud_payload FROM word_cloud_payload),
      'strategyCards', (SELECT strategy_payload FROM strategy_payload),
      'evidenceMaterials', (SELECT evidence_payload FROM evidence_payload),
      'nextActions', (SELECT next_actions_payload FROM next_actions_payload),
      'gaps', (SELECT gaps_payload FROM gaps_payload)
    )
    ELSE NULL
  END AS brand_insight_payload
  FROM params
)
SELECT
  summary.summary_payload,
  rows_payload.rows_payload,
  brand_options_payload.brand_options_payload,
  selected_brand_payload.selected_brand_payload,
  brand_insight_payload.brand_insight_payload
FROM summary
CROSS JOIN rows_payload
CROSS JOIN brand_options_payload
CROSS JOIN selected_brand_payload
CROSS JOIN brand_insight_payload
CROSS JOIN analysis_boundary_payload
CROSS JOIN analysis_profile_payload
"#
);
pub(super) fn build_brand_ai_backfill_assets_sql(
    has_video_understanding_results: bool,
    has_brand_resolutions: bool,
) -> String {
    let latest_analysis_cte = if has_video_understanding_results {
        LATEST_ANALYSIS_SOURCE_CTE
    } else {
        LATEST_ANALYSIS_EMPTY_CTE
    };
    let sql = BRAND_AI_BACKFILL_ASSETS_SQL_TEMPLATE
        .replace(LATEST_ANALYSIS_CTE_MARKER, latest_analysis_cte);
    brand_resolution_sql::inject(sql.as_str(), has_brand_resolutions)
}
pub(super) fn build_douyin_payload_sql(readiness: VideoUnderstandingStorageReadiness) -> String {
    let latest_analysis_cte = if readiness.results_table_available {
        LATEST_ANALYSIS_SOURCE_CTE
    } else {
        LATEST_ANALYSIS_EMPTY_CTE
    };
    let sql = DOUYIN_PAYLOAD_SQL_TEMPLATE
        .replace(LATEST_ANALYSIS_CTE_MARKER, latest_analysis_cte)
        .replace(
            VIDEO_UNDERSTANDING_RESULTS_AVAILABLE_MARKER,
            if readiness.results_table_available {
                "TRUE"
            } else {
                "FALSE"
            },
        )
        .replace(
            VIDEO_UNDERSTANDING_STORAGE_READY_MARKER,
            if readiness.storage_ready() {
                "TRUE"
            } else {
                "FALSE"
            },
        );
    brand_resolution_sql::inject(sql.as_str(), readiness.brand_resolution_table_available)
}
