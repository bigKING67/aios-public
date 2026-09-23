industry_metric_benchmarks AS (
  SELECT
    COUNT(*)::BIGINT AS benchmark_sample_size,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY play_3s_rate) AS play_3s_q25,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY play_3s_rate) AS play_3s_q75,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY play_5s_rate) AS play_5s_q25,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY play_5s_rate) AS play_5s_q75,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY completion_rate) AS completion_q25,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY completion_rate) AS completion_q75,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ctr) AS ctr_q25,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ctr) AS ctr_q75,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY cvr) AS cvr_q25,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY cvr) AS cvr_q75,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY interaction_rate) AS interaction_q25,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY interaction_rate) AS interaction_q75,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY pvr) AS pvr_q25,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY pvr) AS pvr_q75
  FROM base_all
),
fusion_inputs AS (
  SELECT
    enriched.*,
    benchmarks.benchmark_sample_size,
    COALESCE(
      NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,hook,type}'), ''),
      NULLIF(BTRIM(enriched.analysis->>'hook_type'), '')
    ) AS hook_type,
    COALESCE(
      NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,hook,type}'), ''),
      NULLIF(BTRIM(enriched.analysis->>'hook_type'), ''),
      NULLIF(NULLIF(BTRIM(enriched.analysis->'selling_points'->>0), ''), '-'),
      NULLIF(NULLIF(BTRIM(enriched.marketing_selling_point), ''), '-'),
      NULLIF(NULLIF(BTRIM(enriched.ai_summary), ''), '-'),
      '内容结构未识别'
    ) AS content_pattern,
    LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,hook,strength}'), '')) AS hook_strength,
    LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,visual,product_visibility}'), '')) AS product_visibility,
    LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,visual,trust_signal}'), '')) AS trust_signal,
    LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,script,selling_point_clarity}'), '')) AS selling_point_clarity,
    LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,script,price_or_offer_clarity}'), '')) AS price_offer_clarity,
    LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,script,cta_clarity}'), '')) AS cta_clarity,
    LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,product_cart_fit,product_decision_support}'), '')) AS product_decision_support,
    LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,live_room_fit,entry_reason_clarity}'), '')) AS entry_reason_clarity,
    LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,live_room_fit,live_benefit_signal}'), '')) AS live_benefit_signal,
    LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,live_room_fit,urgency_signal}'), '')) AS urgency_signal,
    CASE
      WHEN enriched.play_3s_rate IS NULL THEN NULL
      WHEN benchmarks.play_3s_q75 IS NOT NULL AND enriched.play_3s_rate >= benchmarks.play_3s_q75 THEN 90
      WHEN benchmarks.play_3s_q25 IS NOT NULL AND enriched.play_3s_rate >= benchmarks.play_3s_q25 THEN 60
      ELSE 30
    END::FLOAT8 AS play_3s_score,
    CASE
      WHEN enriched.play_5s_rate IS NULL THEN NULL
      WHEN benchmarks.play_5s_q75 IS NOT NULL AND enriched.play_5s_rate >= benchmarks.play_5s_q75 THEN 90
      WHEN benchmarks.play_5s_q25 IS NOT NULL AND enriched.play_5s_rate >= benchmarks.play_5s_q25 THEN 60
      ELSE 30
    END::FLOAT8 AS play_5s_score,
    CASE
      WHEN enriched.completion_rate IS NULL THEN NULL
      WHEN benchmarks.completion_q75 IS NOT NULL AND enriched.completion_rate >= benchmarks.completion_q75 THEN 90
      WHEN benchmarks.completion_q25 IS NOT NULL AND enriched.completion_rate >= benchmarks.completion_q25 THEN 60
      ELSE 30
    END::FLOAT8 AS completion_score,
    CASE
      WHEN enriched.ctr IS NULL THEN NULL
      WHEN benchmarks.ctr_q75 IS NOT NULL AND enriched.ctr >= benchmarks.ctr_q75 THEN 90
      WHEN benchmarks.ctr_q25 IS NOT NULL AND enriched.ctr >= benchmarks.ctr_q25 THEN 60
      ELSE 30
    END::FLOAT8 AS ctr_score,
    CASE
      WHEN enriched.cvr IS NULL THEN NULL
      WHEN benchmarks.cvr_q75 IS NOT NULL AND enriched.cvr >= benchmarks.cvr_q75 THEN 90
      WHEN benchmarks.cvr_q25 IS NOT NULL AND enriched.cvr >= benchmarks.cvr_q25 THEN 60
      ELSE 30
    END::FLOAT8 AS cvr_score,
    CASE
      WHEN enriched.interaction_rate IS NULL THEN NULL
      WHEN benchmarks.interaction_q75 IS NOT NULL AND enriched.interaction_rate >= benchmarks.interaction_q75 THEN 90
      WHEN benchmarks.interaction_q25 IS NOT NULL AND enriched.interaction_rate >= benchmarks.interaction_q25 THEN 60
      ELSE 30
    END::FLOAT8 AS interaction_score,
    CASE
      WHEN enriched.pvr IS NULL THEN NULL
      WHEN benchmarks.pvr_q75 IS NOT NULL AND enriched.pvr >= benchmarks.pvr_q75 THEN 90
      WHEN benchmarks.pvr_q25 IS NOT NULL AND enriched.pvr >= benchmarks.pvr_q25 THEN 60
      ELSE 30
    END::FLOAT8 AS pvr_score,
    CASE LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,hook,strength}'), ''))
      WHEN 'strong' THEN 90 WHEN '强' THEN 90
      WHEN 'medium' THEN 60 WHEN '中' THEN 60
      WHEN 'weak' THEN 30 WHEN '弱' THEN 30
      WHEN 'none' THEN 10 WHEN '无' THEN 10
      ELSE NULL
    END::FLOAT8 AS hook_content_score,
    CASE LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,visual,product_visibility}'), ''))
      WHEN 'strong' THEN 90 WHEN '强' THEN 90
      WHEN 'medium' THEN 60 WHEN '中' THEN 60
      WHEN 'weak' THEN 30 WHEN '弱' THEN 30
      WHEN 'none' THEN 10 WHEN '无' THEN 10
      ELSE NULL
    END::FLOAT8 AS product_visibility_score,
    CASE LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,visual,trust_signal}'), ''))
      WHEN 'strong' THEN 90 WHEN '强' THEN 90
      WHEN 'medium' THEN 60 WHEN '中' THEN 60
      WHEN 'weak' THEN 30 WHEN '弱' THEN 30
      WHEN 'none' THEN 10 WHEN '无' THEN 10
      ELSE NULL
    END::FLOAT8 AS trust_signal_score,
    CASE LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,script,selling_point_clarity}'), ''))
      WHEN 'strong' THEN 90 WHEN '强' THEN 90
      WHEN 'medium' THEN 60 WHEN '中' THEN 60
      WHEN 'weak' THEN 30 WHEN '弱' THEN 30
      WHEN 'none' THEN 10 WHEN '无' THEN 10
      ELSE NULL
    END::FLOAT8 AS selling_point_score,
    CASE LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,script,price_or_offer_clarity}'), ''))
      WHEN 'strong' THEN 90 WHEN '强' THEN 90
      WHEN 'medium' THEN 60 WHEN '中' THEN 60
      WHEN 'weak' THEN 30 WHEN '弱' THEN 30
      WHEN 'none' THEN 10 WHEN '无' THEN 10
      ELSE NULL
    END::FLOAT8 AS price_offer_score,
    CASE LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,script,cta_clarity}'), ''))
      WHEN 'strong' THEN 90 WHEN '强' THEN 90
      WHEN 'medium' THEN 60 WHEN '中' THEN 60
      WHEN 'weak' THEN 30 WHEN '弱' THEN 30
      WHEN 'none' THEN 10 WHEN '无' THEN 10
      ELSE NULL
    END::FLOAT8 AS cta_score,
    CASE LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,product_cart_fit,product_decision_support}'), ''))
      WHEN 'strong' THEN 90 WHEN '强' THEN 90
      WHEN 'medium' THEN 60 WHEN '中' THEN 60
      WHEN 'weak' THEN 30 WHEN '弱' THEN 30
      WHEN 'none' THEN 10 WHEN '无' THEN 10
      ELSE NULL
    END::FLOAT8 AS product_decision_score,
    CASE LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,live_room_fit,entry_reason_clarity}'), ''))
      WHEN 'strong' THEN 90 WHEN '强' THEN 90
      WHEN 'medium' THEN 60 WHEN '中' THEN 60
      WHEN 'weak' THEN 30 WHEN '弱' THEN 30
      WHEN 'none' THEN 10 WHEN '无' THEN 10
      ELSE NULL
    END::FLOAT8 AS entry_reason_score,
    CASE LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,live_room_fit,live_benefit_signal}'), ''))
      WHEN 'strong' THEN 90 WHEN '强' THEN 90
      WHEN 'medium' THEN 60 WHEN '中' THEN 60
      WHEN 'weak' THEN 30 WHEN '弱' THEN 30
      WHEN 'none' THEN 10 WHEN '无' THEN 10
      ELSE NULL
    END::FLOAT8 AS live_benefit_score,
    CASE LOWER(NULLIF(BTRIM(enriched.analysis#>>'{video_understanding,live_room_fit,urgency_signal}'), ''))
      WHEN 'strong' THEN 90 WHEN '强' THEN 90
      WHEN 'medium' THEN 60 WHEN '中' THEN 60
      WHEN 'weak' THEN 30 WHEN '弱' THEN 30
      WHEN 'none' THEN 10 WHEN '无' THEN 10
      ELSE NULL
    END::FLOAT8 AS urgency_score,
    CASE
      WHEN enriched.analysis IS NOT NULL
        OR NULLIF(BTRIM(COALESCE(enriched.ai_summary, '')), '') IS NOT NULL
        OR CARDINALITY(COALESCE(enriched.ai_suggested_tags, '{}'::TEXT[])) > 0
        OR CARDINALITY(COALESCE(enriched.asset_tags, '{}'::TEXT[])) > 0
        OR NULLIF(NULLIF(BTRIM(COALESCE(enriched.marketing_selling_point, '')), ''), '-') IS NOT NULL
      THEN 55
      ELSE NULL
    END::FLOAT8 AS fallback_content_score
  FROM enriched
  CROSS JOIN industry_metric_benchmarks benchmarks
),
fusion_content_inventory AS (
  SELECT
    fusion_inputs.*,
    CASE
      WHEN video_type = 'live_lead_short_video' THEN
        (CASE WHEN hook_content_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN entry_reason_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN live_benefit_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN cta_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN trust_signal_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN urgency_score IS NULL THEN 0 ELSE 1 END)
      ELSE
        (CASE WHEN hook_content_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN product_visibility_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN selling_point_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN price_offer_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN cta_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN product_decision_score IS NULL THEN 0 ELSE 1 END)
    END AS structured_content_component_count
  FROM fusion_inputs
),
fusion_component_scores AS (
  SELECT
    fusion_content_inventory.*,
    CASE
      WHEN video_type = 'live_lead_short_video' THEN
        (CASE WHEN play_3s_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN play_5s_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN completion_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN pvr_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN interaction_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN ctr_score IS NULL THEN 0 ELSE 1 END)
      ELSE
        (CASE WHEN ctr_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN cvr_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN pvr_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN completion_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN interaction_score IS NULL THEN 0 ELSE 1 END
        + CASE WHEN play_5s_score IS NULL THEN 0 ELSE 1 END)
    END AS metric_component_count,
    CASE
      WHEN structured_content_component_count > 0 THEN structured_content_component_count
      WHEN fallback_content_score IS NOT NULL THEN 1
      ELSE 0
    END AS content_component_count,
    CASE
      WHEN structured_content_component_count > 0 THEN 'structured_video_understanding'
      WHEN fallback_content_score IS NOT NULL THEN 'legacy_ai_summary'
      ELSE 'none'
    END AS content_evidence_tier,
    CASE
      WHEN video_type = 'live_lead_short_video' THEN ROUND((
        (COALESCE(play_3s_score * 0.20, 0) + COALESCE(play_5s_score * 0.22, 0) + COALESCE(completion_score * 0.18, 0) + COALESCE(pvr_score * 0.18, 0) + COALESCE(interaction_score * 0.12, 0) + COALESCE(ctr_score * 0.10, 0))
        / NULLIF((CASE WHEN play_3s_score IS NULL THEN 0 ELSE 0.20 END + CASE WHEN play_5s_score IS NULL THEN 0 ELSE 0.22 END + CASE WHEN completion_score IS NULL THEN 0 ELSE 0.18 END + CASE WHEN pvr_score IS NULL THEN 0 ELSE 0.18 END + CASE WHEN interaction_score IS NULL THEN 0 ELSE 0.12 END + CASE WHEN ctr_score IS NULL THEN 0 ELSE 0.10 END), 0)
      )::NUMERIC, 1)::FLOAT8
      ELSE ROUND((
        (COALESCE(ctr_score * 0.25, 0) + COALESCE(cvr_score * 0.22, 0) + COALESCE(pvr_score * 0.18, 0) + COALESCE(completion_score * 0.15, 0) + COALESCE(interaction_score * 0.10, 0) + COALESCE(play_5s_score * 0.10, 0))
        / NULLIF((CASE WHEN ctr_score IS NULL THEN 0 ELSE 0.25 END + CASE WHEN cvr_score IS NULL THEN 0 ELSE 0.22 END + CASE WHEN pvr_score IS NULL THEN 0 ELSE 0.18 END + CASE WHEN completion_score IS NULL THEN 0 ELSE 0.15 END + CASE WHEN interaction_score IS NULL THEN 0 ELSE 0.10 END + CASE WHEN play_5s_score IS NULL THEN 0 ELSE 0.10 END), 0)
      )::NUMERIC, 1)::FLOAT8
    END AS metric_score,
    CASE
      WHEN video_type = 'live_lead_short_video' THEN COALESCE(ROUND((
        (COALESCE(hook_content_score * 0.20, 0) + COALESCE(entry_reason_score * 0.25, 0) + COALESCE(live_benefit_score * 0.20, 0) + COALESCE(cta_score * 0.15, 0) + COALESCE(trust_signal_score * 0.10, 0) + COALESCE(urgency_score * 0.10, 0))
        / NULLIF((CASE WHEN hook_content_score IS NULL THEN 0 ELSE 0.20 END + CASE WHEN entry_reason_score IS NULL THEN 0 ELSE 0.25 END + CASE WHEN live_benefit_score IS NULL THEN 0 ELSE 0.20 END + CASE WHEN cta_score IS NULL THEN 0 ELSE 0.15 END + CASE WHEN trust_signal_score IS NULL THEN 0 ELSE 0.10 END + CASE WHEN urgency_score IS NULL THEN 0 ELSE 0.10 END), 0)
      )::NUMERIC, 1)::FLOAT8, fallback_content_score)
      ELSE COALESCE(ROUND((
        (COALESCE(hook_content_score * 0.15, 0) + COALESCE(product_visibility_score * 0.20, 0) + COALESCE(selling_point_score * 0.20, 0) + COALESCE(price_offer_score * 0.15, 0) + COALESCE(cta_score * 0.15, 0) + COALESCE(product_decision_score * 0.15, 0))
        / NULLIF((CASE WHEN hook_content_score IS NULL THEN 0 ELSE 0.15 END + CASE WHEN product_visibility_score IS NULL THEN 0 ELSE 0.20 END + CASE WHEN selling_point_score IS NULL THEN 0 ELSE 0.20 END + CASE WHEN price_offer_score IS NULL THEN 0 ELSE 0.15 END + CASE WHEN cta_score IS NULL THEN 0 ELSE 0.15 END + CASE WHEN product_decision_score IS NULL THEN 0 ELSE 0.15 END), 0)
      )::NUMERIC, 1)::FLOAT8, fallback_content_score)
    END AS content_score
  FROM fusion_content_inventory
),
fusion_scored AS (
  SELECT
    fusion_component_scores.*,
    CASE
      WHEN metric_component_count > 0 AND content_component_count > 0 THEN 'data_content_fusion'
      WHEN metric_component_count > 0 THEN 'data_only'
      WHEN content_component_count > 0 THEN 'content_only'
      ELSE 'insufficient_data'
    END AS diagnosis_mode,
    CASE
      WHEN metric_component_count >= 5 AND content_component_count >= 4 THEN 'high'
      WHEN metric_component_count >= 3 AND content_component_count >= 2 THEN 'medium'
      WHEN metric_component_count > 0 OR content_component_count > 0 THEN 'low'
      ELSE 'insufficient'
    END AS confidence,
    CASE
      WHEN metric_score IS NOT NULL AND content_score IS NOT NULL THEN ROUND((metric_score * 0.65 + content_score * 0.35)::NUMERIC, 0)::INTEGER
      WHEN metric_score IS NOT NULL THEN ROUND(metric_score::NUMERIC, 0)::INTEGER
      WHEN content_score IS NOT NULL THEN ROUND(content_score::NUMERIC, 0)::INTEGER
      ELSE NULL
    END AS fusion_score,
    CASE
      WHEN metric_score IS NULL AND content_score IS NULL THEN 'insufficient'
      WHEN metric_score IS NULL THEN 'content_only'
      WHEN content_score IS NULL THEN 'data_only'
      WHEN content_evidence_tier = 'legacy_ai_summary' AND metric_score >= 75 THEN 'performance_leads'
      WHEN content_evidence_tier = 'legacy_ai_summary' THEN 'mixed'
      WHEN metric_score >= 75 AND content_score >= 75 THEN 'reinforced'
      WHEN content_score - metric_score >= 20 THEN 'content_leads'
      WHEN metric_score - content_score >= 20 THEN 'performance_leads'
      ELSE 'mixed'
    END AS alignment
  FROM fusion_component_scores
),
fusion_diagnosed AS (
  SELECT
    fusion_scored.*,
    CASE
      WHEN video_type = 'live_lead_short_video' THEN CASE alignment
        WHEN 'reinforced' THEN '进房内容信号与行业可见表现一致'
        WHEN 'content_leads' THEN '进房内容表达清晰，但表现信号尚未同步'
        WHEN 'performance_leads' THEN '行业可见表现较强，内容信号仍需补证'
        WHEN 'mixed' THEN '钩子、留存与进房意图信号不完全一致'
        WHEN 'data_only' THEN '仅有行业可见表现，缺少视频内容判读'
        WHEN 'content_only' THEN '仅有视频内容信号，缺少行业表现验证'
        ELSE '当前证据不足，暂不形成融合判断'
      END
      ELSE CASE alignment
        WHEN 'reinforced' THEN '商品表达与行业可见点击/转化线索一致'
        WHEN 'content_leads' THEN '商品表达较清晰，但表现信号尚未同步'
        WHEN 'performance_leads' THEN '行业可见表现较强，内容信号仍需补证'
        WHEN 'mixed' THEN '卖点、点击与可见转化信号不完全一致'
        WHEN 'data_only' THEN '仅有行业可见表现，缺少视频内容判读'
        WHEN 'content_only' THEN '仅有视频内容信号，缺少行业表现验证'
        ELSE '当前证据不足，暂不形成融合判断'
      END
    END AS fusion_headline,
    CASE
      WHEN video_type = 'live_lead_short_video' THEN CASE alignment
        WHEN 'reinforced' THEN FORMAT('「%s」的钩子、直播利益信号与 3S/5S、完播、PVR 等相对表现相互支持，可作为进房内容结构证据；不代表直播间承接。', content_pattern)
        WHEN 'content_leads' THEN FORMAT('「%s」的视频内容中已出现较清晰的进房理由或直播利益信号，但同月同类型行业可见指标未形成同等强度，需要继续验证钩子节奏与 CTA。', content_pattern)
        WHEN 'performance_leads' THEN FORMAT('「%s」的行业可见表现处于较高位置，但结构化进房理由、直播利益或 CTA 信号不完整，暂不能把表现归因到具体内容结构。', content_pattern)
        WHEN 'mixed' THEN CASE
          WHEN content_evidence_tier = 'legacy_ai_summary' THEN FORMAT('「%s」来自历史 AI 摘要/标签，可用于识别内容主题，但缺少结构化画面、话术和进房信号强弱；当前先与留存、完播和 PVR 做低置信对照。', content_pattern)
          ELSE FORMAT('「%s」的留存、完播、互动与 PVR 信号存在分化，说明钩子被看见不等于进房理由被讲清，应按指标短板定位内容段落。', content_pattern)
        END
        WHEN 'data_only' THEN '当前仅能比较同月同类型行业可见指标，缺少视频理解，不能判断具体画面、话术或进房结构。'
        WHEN 'content_only' THEN FORMAT('「%s」具备可读的视频内容信号，但缺少足够行业表现指标，只能作为内容假设，不能判断实际进房效果。', content_pattern)
        ELSE '视频理解与行业可见表现均不足，暂不输出进房内容优劣。'
      END
      ELSE CASE alignment
        WHEN 'reinforced' THEN FORMAT('「%s」的商品展示、卖点/权益与 CTR、CVR、PVR 等相对表现相互支持，可作为商品表达结构证据；不代表商品卡或商品页承接。', content_pattern)
        WHEN 'content_leads' THEN FORMAT('「%s」的视频内容中商品、卖点或 CTA 较清晰，但同月同类型行业可见指标未形成同等强度，需要继续验证卖点前置与信任铺垫。', content_pattern)
        WHEN 'performance_leads' THEN FORMAT('「%s」的行业可见表现处于较高位置，但结构化商品展示、卖点、权益或 CTA 信号不完整，暂不能把表现归因到具体内容结构。', content_pattern)
        WHEN 'mixed' THEN CASE
          WHEN content_evidence_tier = 'legacy_ai_summary' THEN FORMAT('「%s」来自历史 AI 摘要/标签，可用于识别内容主题，但缺少结构化商品展示、卖点、权益和 CTA 强弱；当前先与 CTR、CVR、PVR 做低置信对照。', content_pattern)
          ELSE FORMAT('「%s」的 CTR、CVR、PVR、完播与互动信号存在分化，说明内容点击兴趣与商品理解/购买意向线索并未完全同步。', content_pattern)
        END
        WHEN 'data_only' THEN '当前仅能比较同月同类型行业可见指标，缺少视频理解，不能判断具体商品展示、卖点或 CTA 结构。'
        WHEN 'content_only' THEN FORMAT('「%s」具备可读的视频内容信号，但缺少足够行业表现指标，只能作为内容假设，不能判断实际商品承接。', content_pattern)
        ELSE '视频理解与行业可见表现均不足，暂不输出商品内容优劣。'
      END
    END AS fusion_diagnosis,
    CASE
      WHEN video_type = 'live_lead_short_video' THEN CASE alignment
        WHEN 'reinforced' THEN '复刻前三秒钩子与直播利益信号，拆成小样本 A/B，继续观察 5S、完播与 PVR。'
        WHEN 'content_leads' THEN '缩短进房理由出现时间，强化直播利益与 CTA，优先观察 3S/5S 和 PVR 是否同步改善。'
        WHEN 'performance_leads' THEN '补齐视频理解后再拆解高表现来源，避免仅凭数据复刻未知内容结构。'
        WHEN 'mixed' THEN CASE
          WHEN content_evidence_tier = 'legacy_ai_summary' THEN '先补齐结构化视频理解，再按 3S/5S、完播和 PVR 的相对位置定位钩子与进房表达。'
          ELSE '按最低位指标回看对应内容段：先钩子与 5S，再直播利益、互动话术和进房 CTA。'
        END
        WHEN 'data_only' THEN '先手动补齐当前品牌视频理解，再输出内容结构建议。'
        WHEN 'content_only' THEN '保留为内容样本，待行业表现数据补齐后再验证。'
        ELSE '先补齐素材归档、视频理解和可见表现数据。'
      END
      ELSE CASE alignment
        WHEN 'reinforced' THEN '复刻首屏商品利益点、信任背书与 CTA，拆成小样本 A/B，继续观察 CTR、CVR 与 PVR。'
        WHEN 'content_leads' THEN '前置核心卖点与产品证据，压缩铺垫，优先观察 CTR、CVR 与 PVR 是否同步改善。'
        WHEN 'performance_leads' THEN '补齐视频理解后再拆解高表现来源，避免仅凭数据复刻未知内容结构。'
        WHEN 'mixed' THEN CASE
          WHEN content_evidence_tier = 'legacy_ai_summary' THEN '先补齐结构化视频理解，再按 CTR、CVR、PVR 的相对位置定位首屏卖点、商品证据与 CTA。'
          ELSE '按最低位指标回看对应内容段：先首屏卖点与 CTR，再商品讲透、信任背书和 CTA。'
        END
        WHEN 'data_only' THEN '先手动补齐当前品牌视频理解，再输出内容结构建议。'
        WHEN 'content_only' THEN '保留为内容样本，待行业表现数据补齐后再验证。'
        ELSE '先补齐素材归档、视频理解和可见表现数据。'
      END
    END AS fusion_next_step,
    COALESCE(
      NULLIF(BTRIM(analysis#>>'{current_ai_analysis,content_understanding,what_it_says}'), ''),
      NULLIF(BTRIM(analysis->>'summary'), ''),
      NULLIF(BTRIM(ai_summary), '')
    ) AS evidence_summary
  FROM fusion_scored
),
fusion_summary_payload AS (
  SELECT JSONB_BUILD_OBJECT(
    'scoreBasis', 'industry_month_type_relative',
    'benchmarkLabel', '当前月份同视频类型行业样本四分位',
    'benchmarkSampleSize', COALESCE((SELECT benchmark_sample_size FROM industry_metric_benchmarks LIMIT 1), 0),
    'scoredMaterials', COUNT(*) FILTER (WHERE fusion_score IS NOT NULL),
    'dataContentFusionMaterials', COUNT(*) FILTER (WHERE diagnosis_mode = 'data_content_fusion'),
    'structuredVideoMaterials', COUNT(*) FILTER (WHERE content_evidence_tier = 'structured_video_understanding'),
    'legacyContentMaterials', COUNT(*) FILTER (WHERE content_evidence_tier = 'legacy_ai_summary'),
    'highConfidenceMaterials', COUNT(*) FILTER (WHERE confidence = 'high'),
    'reinforcedMaterials', COUNT(*) FILTER (WHERE alignment = 'reinforced'),
    'averageScore', ROUND(AVG(fusion_score) FILTER (WHERE fusion_score IS NOT NULL), 0),
    'methodNote', '融合分仅表示当前月份、同视频类型行业样本中的相对证据强度；不是成交、ROI、承接或投放决策分。'
  ) AS fusion_summary_payload
  FROM fusion_diagnosed
),
evidence_ranked AS (
  SELECT
    fusion_diagnosed.*,
    ROW_NUMBER() OVER (
      ORDER BY
        fusion_score DESC NULLS LAST,
        metric_score DESC NULLS LAST,
        content_score DESC NULLS LAST,
        exposure_count DESC NULLS LAST,
        source_rank ASC NULLS LAST,
        record_id ASC
    ) AS evidence_rank
  FROM fusion_diagnosed
),
evidence_payload AS (
  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'assetId', asset_id::TEXT,
        'title', COALESCE(NULLIF(BTRIM(video_title), ''), NULLIF(BTRIM(asset_title), ''), '未命名素材'),
        'rank', source_rank,
        'exposure', exposure_count,
        'completionRate', completion_rate,
        'ctr', ctr,
        'cvr', cvr,
        'play3sRate', play_3s_rate,
        'play5sRate', play_5s_rate,
        'interactionRate', interaction_rate,
        'pvr', pvr,
        'summary', COALESCE(evidence_summary, ''),
        'reason', CASE
          WHEN video_type = 'live_lead_short_video'
          THEN '按内容与 3S/5S、完播、PVR、互动、CTR 的行业相对位置综合筛选；只判断短视频进房表达，不判断直播间承接。'
          ELSE '按内容与 CTR、CVR、PVR、完播、互动、5S 的行业相对位置综合筛选；只判断商品表达线索，不判断商品卡或商品页承接。'
        END,
        'fusionDiagnosis', JSONB_BUILD_OBJECT(
          'scoreBasis', 'industry_month_type_relative',
          'benchmarkLabel', '当前月份同视频类型行业样本四分位',
          'benchmarkSampleSize', benchmark_sample_size,
          'score', fusion_score,
          'metricScore', metric_score,
          'contentScore', content_score,
          'diagnosisMode', diagnosis_mode,
          'contentEvidenceTier', content_evidence_tier,
          'confidence', confidence,
          'alignment', alignment,
          'headline', fusion_headline,
          'diagnosis', fusion_diagnosis,
          'nextStep', fusion_next_step,
          'contentPattern', content_pattern,
          'metricSignals', CASE
            WHEN video_type = 'live_lead_short_video' THEN JSONB_BUILD_ARRAY(
              JSONB_BUILD_OBJECT('key', 'play3sRate', 'label', '3S 留存', 'value', play_3s_rate, 'band', CASE WHEN play_3s_score IS NULL THEN 'missing' WHEN play_3s_score >= 90 THEN 'high' WHEN play_3s_score >= 60 THEN 'mid' ELSE 'low' END),
              JSONB_BUILD_OBJECT('key', 'play5sRate', 'label', '5S 留存', 'value', play_5s_rate, 'band', CASE WHEN play_5s_score IS NULL THEN 'missing' WHEN play_5s_score >= 90 THEN 'high' WHEN play_5s_score >= 60 THEN 'mid' ELSE 'low' END),
              JSONB_BUILD_OBJECT('key', 'completionRate', 'label', '完播率', 'value', completion_rate, 'band', CASE WHEN completion_score IS NULL THEN 'missing' WHEN completion_score >= 90 THEN 'high' WHEN completion_score >= 60 THEN 'mid' ELSE 'low' END),
              JSONB_BUILD_OBJECT('key', 'pvr', 'label', 'PVR', 'value', pvr, 'band', CASE WHEN pvr_score IS NULL THEN 'missing' WHEN pvr_score >= 90 THEN 'high' WHEN pvr_score >= 60 THEN 'mid' ELSE 'low' END),
              JSONB_BUILD_OBJECT('key', 'interactionRate', 'label', '互动率', 'value', interaction_rate, 'band', CASE WHEN interaction_score IS NULL THEN 'missing' WHEN interaction_score >= 90 THEN 'high' WHEN interaction_score >= 60 THEN 'mid' ELSE 'low' END),
              JSONB_BUILD_OBJECT('key', 'ctr', 'label', 'CTR', 'value', ctr, 'band', CASE WHEN ctr_score IS NULL THEN 'missing' WHEN ctr_score >= 90 THEN 'high' WHEN ctr_score >= 60 THEN 'mid' ELSE 'low' END)
            )
            ELSE JSONB_BUILD_ARRAY(
              JSONB_BUILD_OBJECT('key', 'ctr', 'label', 'CTR', 'value', ctr, 'band', CASE WHEN ctr_score IS NULL THEN 'missing' WHEN ctr_score >= 90 THEN 'high' WHEN ctr_score >= 60 THEN 'mid' ELSE 'low' END),
              JSONB_BUILD_OBJECT('key', 'cvr', 'label', 'CVR', 'value', cvr, 'band', CASE WHEN cvr_score IS NULL THEN 'missing' WHEN cvr_score >= 90 THEN 'high' WHEN cvr_score >= 60 THEN 'mid' ELSE 'low' END),
              JSONB_BUILD_OBJECT('key', 'pvr', 'label', 'PVR', 'value', pvr, 'band', CASE WHEN pvr_score IS NULL THEN 'missing' WHEN pvr_score >= 90 THEN 'high' WHEN pvr_score >= 60 THEN 'mid' ELSE 'low' END),
              JSONB_BUILD_OBJECT('key', 'completionRate', 'label', '完播率', 'value', completion_rate, 'band', CASE WHEN completion_score IS NULL THEN 'missing' WHEN completion_score >= 90 THEN 'high' WHEN completion_score >= 60 THEN 'mid' ELSE 'low' END),
              JSONB_BUILD_OBJECT('key', 'interactionRate', 'label', '互动率', 'value', interaction_rate, 'band', CASE WHEN interaction_score IS NULL THEN 'missing' WHEN interaction_score >= 90 THEN 'high' WHEN interaction_score >= 60 THEN 'mid' ELSE 'low' END),
              JSONB_BUILD_OBJECT('key', 'play5sRate', 'label', '5S 留存', 'value', play_5s_rate, 'band', CASE WHEN play_5s_score IS NULL THEN 'missing' WHEN play_5s_score >= 90 THEN 'high' WHEN play_5s_score >= 60 THEN 'mid' ELSE 'low' END)
            )
          END,
          'contentSignals', CASE
            WHEN video_type = 'live_lead_short_video' THEN JSONB_BUILD_ARRAY(
              JSONB_BUILD_OBJECT('key', 'contentPattern', 'label', '内容主题', 'value', content_pattern, 'level', COALESCE(hook_strength, CASE WHEN content_evidence_tier = 'legacy_ai_summary' THEN 'observed' ELSE 'unknown' END)),
              JSONB_BUILD_OBJECT('key', 'entryReason', 'label', '进房理由', 'value', COALESCE(entry_reason_clarity, 'unknown'), 'level', COALESCE(entry_reason_clarity, 'unknown')),
              JSONB_BUILD_OBJECT('key', 'liveBenefit', 'label', '直播利益信号', 'value', COALESCE(live_benefit_signal, 'unknown'), 'level', COALESCE(live_benefit_signal, 'unknown')),
              JSONB_BUILD_OBJECT('key', 'cta', 'label', '进房 CTA', 'value', COALESCE(cta_clarity, 'unknown'), 'level', COALESCE(cta_clarity, 'unknown')),
              JSONB_BUILD_OBJECT('key', 'trust', 'label', '可见信任', 'value', COALESCE(trust_signal, 'unknown'), 'level', COALESCE(trust_signal, 'unknown')),
              JSONB_BUILD_OBJECT('key', 'urgency', 'label', '紧迫感', 'value', COALESCE(urgency_signal, 'unknown'), 'level', COALESCE(urgency_signal, 'unknown'))
            )
            ELSE JSONB_BUILD_ARRAY(
              JSONB_BUILD_OBJECT('key', 'contentPattern', 'label', '内容主题', 'value', content_pattern, 'level', COALESCE(hook_strength, CASE WHEN content_evidence_tier = 'legacy_ai_summary' THEN 'observed' ELSE 'unknown' END)),
              JSONB_BUILD_OBJECT('key', 'productVisibility', 'label', '商品可见度', 'value', COALESCE(product_visibility, 'unknown'), 'level', COALESCE(product_visibility, 'unknown')),
              JSONB_BUILD_OBJECT('key', 'sellingPoint', 'label', '卖点清晰度', 'value', COALESCE(selling_point_clarity, 'unknown'), 'level', COALESCE(selling_point_clarity, 'unknown')),
              JSONB_BUILD_OBJECT('key', 'offer', 'label', '价格/权益', 'value', COALESCE(price_offer_clarity, 'unknown'), 'level', COALESCE(price_offer_clarity, 'unknown')),
              JSONB_BUILD_OBJECT('key', 'cta', 'label', '商品 CTA', 'value', COALESCE(cta_clarity, 'unknown'), 'level', COALESCE(cta_clarity, 'unknown')),
              JSONB_BUILD_OBJECT('key', 'productDecision', 'label', '商品决策支持', 'value', COALESCE(product_decision_support, 'unknown'), 'level', COALESCE(product_decision_support, 'unknown'))
            )
          END
        )
      )
      ORDER BY evidence_rank ASC
    ),
    '[]'::JSONB
  ) AS evidence_payload
  FROM evidence_ranked
  WHERE evidence_rank <= 5
),
