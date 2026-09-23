import { asRecord, type UnknownRecord } from '@/lib/unknown-data';
import {
  localizeIndustryMaterialUiText,
  normalizeIndustryMaterialEvidenceSummary,
} from './industry-material-inspiration-formatters';
import type {
  IndustryMaterialBrandAiBackfillResponse,
  IndustryMaterialBrandContentThemeGroup,
  IndustryMaterialBrandContentThemePerformanceBand,
  IndustryMaterialBrandContentThemeSummary,
  IndustryMaterialBrandContentThemeTerm,
  IndustryMaterialBrandInsight,
  IndustryMaterialBrandInsightAnalysisProfile,
  IndustryMaterialBrandInsightBoundary,
  IndustryMaterialBrandInsightCoverage,
  IndustryMaterialBrandInsightEvidenceMaterial,
  IndustryMaterialBrandInsightNextAction,
  IndustryMaterialBrandInsightProfileMetric,
  IndustryMaterialBrandInsightStrategyCard,
  IndustryMaterialBrandInsightTerm,
  IndustryMaterialBrandOption,
  IndustryMaterialBrandResolutionEvidence,
  IndustryMaterialBrandResolutionSource,
  IndustryMaterialBrandResolutionStatus,
  IndustryMaterialEmptyState,
  IndustryMaterialFusionAlignment,
  IndustryMaterialFusionConfidence,
  IndustryMaterialFusionContentEvidenceTier,
  IndustryMaterialFusionContentLevel,
  IndustryMaterialFusionContentSignal,
  IndustryMaterialFusionDiagnosis,
  IndustryMaterialFusionDiagnosisMode,
  IndustryMaterialFusionMetricBand,
  IndustryMaterialFusionMetricSignal,
  IndustryMaterialFusionSummary,
  IndustryMaterialMetricValue,
  IndustryMaterialResponse,
  IndustryMaterialRow,
  IndustryMaterialSelectedBrand,
  IndustryMaterialTab,
} from './industry-material-inspiration-types';

const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const INDUSTRY_ANALYSIS_BOUNDARY_MODE = 'industry_visible_metrics_content_fusion' as const;
const INDUSTRY_FUSION_SCORE_BASIS = 'industry_month_type_relative' as const;
const INDUSTRY_ACTION_OVERCLAIM_PATTERNS: RegExp[] = [
  /(?:提升|优化|拉升|改善)\s*ROI/iu,
  /ROI\s*(?:优化|提升|改善|判断)/iu,
  /(?:单素材|素材).*?(?:成交|GMV|ROI).*?(?:归因|判断|优化)?/iu,
  /(?:直播间|商品卡|商品页)(?:点击|转化|成交|承接)(?:好坏|诊断|风险|假设|边界|归因)?/iu,
  /(?:成交|转化)归因/iu,
  /下游承接/iu,
];
const DEFAULT_INDUSTRY_ANALYSIS_BOUNDARY: IndustryMaterialBrandInsightBoundary = {
  mode: INDUSTRY_ANALYSIS_BOUNDARY_MODE,
  visibleSignals: [
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
    'videoUnderstanding',
  ],
  unavailableSignals: [
    'liveRoomAcceptance',
    'productCardAcceptance',
    'productPageAcceptance',
    'adSpend',
    'roi',
    'refund',
    'settlement',
    'singleMaterialTransactionAttribution',
  ],
  conclusionPolicy:
    '只输出行业可见指标与视频内容支持的打法启发；不输出对方承接诊断、ROI 判断、放量或暂停决策。',
};

function createDefaultAnalysisProfile(tab: IndustryMaterialTab): IndustryMaterialBrandInsightAnalysisProfile {
  if (tab === 'douyin_goods_short_video') {
    return {
      key: 'goods_cart_industry_visible',
      title: '挂车带货视频行业可见分析',
      primaryQuestion: '视频内容是否在可见曝光内形成内容点击兴趣和购买意向线索？',
      decisionLens:
        '先看 CTR 确认首屏卖点与内容点击线索，再结合 CVR、PVR、完播与互动判断卖点表达和可见转化倾向；不评价商品卡、商品页或成交承接。',
      metricPriority: [
        { key: 'ctr', label: 'CTR', role: '判断首屏卖点和内容点击线索' },
        { key: 'cvr', label: 'CVR', role: '判断可见转化倾向，不等于商品页承接' },
        { key: 'pvr', label: 'PVR', role: '判断购买/进店意图的可见强度' },
        { key: 'completionRate', label: '完播率', role: '判断卖点讲透和信任铺垫' },
        { key: 'interactionRate', label: '互动率', role: '判断内容讨论和种草反馈' },
        { key: 'play5sRate', label: '5S 留存', role: '辅助判断卖点前置是否有效' },
      ],
      videoContentFocus: ['首屏商品利益点', '问题-解决方案演示', '价格/权益/赠品提示', '信任背书与使用证据', '点击商品/下单 CTA'],
      forbiddenConclusions: ['不判断对方商品卡或商品页承接好坏', '不判断实际 ROI、退款或结算', '不做单素材成交归因'],
    };
  }

  return {
    key: 'live_lead_industry_visible',
    title: '直播引流视频行业可见分析',
    primaryQuestion: '视频内容是否在可见曝光内把用户有效带向直播间？',
    decisionLens:
      '先看 3S/5S 留存和完播确认钩子被看见，再用 PVR、互动与 CTR 判断进房意图；只形成短视频内容表达假设，不评价直播间承接。',
    metricPriority: [
      { key: 'play3sRate', label: '3S 留存', role: '判断首屏钩子是否让用户停留' },
      { key: 'play5sRate', label: '5S 留存', role: '判断利益点/直播信号是否被看见' },
      { key: 'completionRate', label: '完播率', role: '判断内容节奏和信息密度' },
      { key: 'pvr', label: 'PVR', role: '判断可见进房意图强弱' },
      { key: 'interactionRate', label: '互动率', role: '判断话题/福利是否激发反馈' },
      { key: 'ctr', label: 'CTR', role: '仅作为引流兴趣辅助信号' },
    ],
    videoContentFocus: ['前三秒进房理由', '直播福利/限时利益信号', '主播或直播场景可见信任', '互动话术和评论引导', '进入直播间 CTA'],
    forbiddenConclusions: ['不判断对方直播间承接好坏', '不判断直播成交、ROI 或预算扩量', '不做单素材成交归因'],
  };
}

const ROW_ID_KEYS = ['id', 'recordId', 'record_id'] as const;
const RECORD_ID_KEYS = ['recordId', 'record_id'] as const;
const STAT_MONTH_KEYS = ['statMonth', 'stat_month', 'month'] as const;
const BRAND_KEYS = ['brandName', 'brand_name', 'brand'] as const;
const BRAND_RESOLUTION_STATUS_KEYS = ['brandResolutionStatus', 'brand_resolution_status'] as const;
const BRAND_RESOLUTION_SOURCE_KEYS = ['brandResolutionSource', 'brand_resolution_source'] as const;
const BRAND_RESOLUTION_CONFIDENCE_KEYS = ['brandResolutionConfidence', 'brand_resolution_confidence'] as const;
const BRAND_RESOLUTION_EVIDENCE_KEYS = ['brandResolutionEvidence', 'brand_resolution_evidence'] as const;
const VIDEO_TYPE_KEYS = ['videoType', 'video_type'] as const;
const VIDEO_TYPE_NAME_KEYS = ['videoTypeName', 'video_type_name'] as const;
const QIANCHUAN_SCENE_KEYS = ['qianchuanScene', 'qianchuan_scene', 'scene'] as const;
const QIANCHUAN_SCENE_NAME_KEYS = ['qianchuanSceneName', 'qianchuan_scene_name', 'sceneName'] as const;
const RANK_KEYS = ['rank', 'sourceRank', 'source_rank'] as const;
const PRODUCT_KEYS = ['product', 'productName', 'product_name', 'relatedProduct', 'related_product'] as const;
const TITLE_KEYS = ['title', 'videoTitle', 'video_title'] as const;
const AUDIENCE_KEYS = ['audience', 'coreAudience', 'core_audience'] as const;
const SELLING_POINT_KEYS = ['sellingPoint', 'marketingSellingPoint', 'marketing_selling_point'] as const;
const PUBLISH_TIME_KEYS = ['publishTime', 'firstPublishDateText', 'first_publish_date_text'] as const;
const ASSET_ID_KEYS = ['assetId', 'asset_id', 'contentAssetId', 'content_asset_id'] as const;
const EXPOSURE_KEYS = ['exposure', 'exposureCount', 'exposure_count', 'impressionCount', 'impression_count'] as const;
const RAW_EXPOSURE_KEYS = [
  'rawExposureCount',
  'raw_exposure_count',
  'exposureRange',
  'exposure_range',
  'rawExposure',
  'raw_exposure',
] as const;
const COMPLETION_RATE_KEYS = ['completionRate', 'completion_rate', 'completeRate', 'complete_rate'] as const;
const CTR_KEYS = ['ctr', 'clickThroughRate', 'click_through_rate'] as const;
const CVR_KEYS = ['cvr', 'conversionRate', 'conversion_rate'] as const;
const PLAY_3S_RATE_KEYS = ['play3sRate', 'play_3s_rate', 'threeSecondPlayRate', 'three_second_play_rate'] as const;
const PLAY_5S_RATE_KEYS = ['play5sRate', 'play_5s_rate', 'fiveSecondPlayRate', 'five_second_play_rate'] as const;
const INTERACTION_RATE_KEYS = ['interactionRate', 'interaction_rate', 'engagementRate', 'engagement_rate'] as const;
const PVR_KEYS = ['pvr', 'payViewRate', 'pay_view_rate'] as const;

export function normalizeIndustryMaterialMonth(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && MONTH_PATTERN.test(normalized) ? normalized : null;
}

function readField(record: UnknownRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
}

function readText(record: UnknownRecord, keys: readonly string[]): string | null {
  const value = readField(record, keys);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function readKey(record: UnknownRecord, keys: readonly string[]): string | number | null {
  const value = readField(record, keys);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function readMetric(record: UnknownRecord, keys: readonly string[]): IndustryMaterialMetricValue {
  const value = readField(record, keys);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
}

function readNumber(record: UnknownRecord, keys: readonly string[]): number | null {
  const value = readField(record, keys);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, '').replace(/%$/, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(record: UnknownRecord, keys: readonly string[]): boolean {
  const value = readField(record, keys);
  return value === true || value === 'true' || value === 1;
}

function readStringList(record: UnknownRecord, keys: readonly string[]): string[] {
  const value = readField(record, keys);
  if (!Array.isArray(value)) {
    return [];
  }
  const values: string[] = [];
  for (const item of value) {
    const normalized = typeof item === 'string' ? item.trim() : '';
    if (normalized) {
      values.push(normalized);
    }
  }
  return values;
}

const BRAND_RESOLUTION_STATUSES = new Set<IndustryMaterialBrandResolutionStatus>([
  'recognized',
  'ambiguous',
  'unknown',
]);
const BRAND_RESOLUTION_SOURCES = new Set<IndustryMaterialBrandResolutionSource>([
  'manual',
  'title',
  'metadata',
  'visual',
  'transcript',
  'multimodal',
]);

function normalizeBrandResolutionStatus(value: string | null): IndustryMaterialBrandResolutionStatus | null {
  return value && BRAND_RESOLUTION_STATUSES.has(value as IndustryMaterialBrandResolutionStatus)
    ? (value as IndustryMaterialBrandResolutionStatus)
    : null;
}

function normalizeBrandResolutionSource(value: string | null): IndustryMaterialBrandResolutionSource | null {
  return value && BRAND_RESOLUTION_SOURCES.has(value as IndustryMaterialBrandResolutionSource)
    ? (value as IndustryMaterialBrandResolutionSource)
    : null;
}

function normalizeBrandResolutionConfidence(value: number | null): number | null {
  return value !== null && value >= 0 && value <= 1 ? value : null;
}

function normalizeBrandResolutionEvidence(value: unknown): IndustryMaterialBrandResolutionEvidence | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const rawEvidence = readField(record, ['evidence']);
  const evidence = Array.isArray(rawEvidence)
    ? rawEvidence.slice(0, 8).flatMap((item): IndustryMaterialBrandResolutionEvidence['evidence'] => {
        const evidenceRecord = asRecord(item);
        const source = evidenceRecord ? readText(evidenceRecord, ['source']) : null;
        const kind = evidenceRecord ? readText(evidenceRecord, ['kind']) : null;
        const text = evidenceRecord ? readText(evidenceRecord, ['text']) : null;
        if (!evidenceRecord || !source || !kind || !text) {
          return [];
        }
        return [{
          source: source.slice(0, 40),
          kind: kind.slice(0, 40),
          text: text.slice(0, 160),
          timeRange: (readText(evidenceRecord, ['timeRange', 'time_range']) ?? '').slice(0, 40),
        }];
      })
    : [];
  return {
    evidence,
    alternatives: readStringList(record, ['alternatives']).slice(0, 3),
  };
}

function normalizeIndustryMaterialActionText(value: string, fallback: string): string {
  const normalized = normalizeIndustryMaterialEvidenceSummary(value);
  if (!normalized) {
    return '';
  }
  return INDUSTRY_ACTION_OVERCLAIM_PATTERNS.some((pattern) => pattern.test(normalized)) ? fallback : normalized;
}

function normalizeTab(value: unknown): IndustryMaterialTab {
  if (
    value === 'douyin_live_lead_short_video' ||
    value === 'douyin_goods_short_video' ||
    value === 'xhs_note'
  ) {
    return value;
  }
  return 'douyin_live_lead_short_video';
}

function normalizeRows(value: unknown): IndustryMaterialRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): IndustryMaterialRow[] => {
    const record = asRecord(item);
    if (!record) {
      return [];
    }
    return [
      {
        id: readKey(record, ROW_ID_KEYS),
        recordId: readKey(record, RECORD_ID_KEYS),
        statMonth: readText(record, STAT_MONTH_KEYS),
        month: readText(record, STAT_MONTH_KEYS),
        brand: readText(record, BRAND_KEYS),
        brandName: readText(record, BRAND_KEYS),
        brandResolutionStatus: normalizeBrandResolutionStatus(readText(record, BRAND_RESOLUTION_STATUS_KEYS)),
        brandResolutionSource: normalizeBrandResolutionSource(readText(record, BRAND_RESOLUTION_SOURCE_KEYS)),
        brandResolutionConfidence: normalizeBrandResolutionConfidence(
          readNumber(record, BRAND_RESOLUTION_CONFIDENCE_KEYS)
        ),
        brandResolutionEvidence: normalizeBrandResolutionEvidence(
          readField(record, BRAND_RESOLUTION_EVIDENCE_KEYS)
        ),
        videoType: readText(record, VIDEO_TYPE_KEYS),
        videoTypeName: readText(record, VIDEO_TYPE_NAME_KEYS),
        qianchuanScene: readText(record, QIANCHUAN_SCENE_KEYS),
        qianchuanSceneName: readText(record, QIANCHUAN_SCENE_NAME_KEYS),
        rank: readMetric(record, RANK_KEYS),
        product: readText(record, PRODUCT_KEYS),
        productName: readText(record, PRODUCT_KEYS),
        title: readText(record, TITLE_KEYS),
        videoTitle: readText(record, TITLE_KEYS),
        audience: readText(record, AUDIENCE_KEYS),
        sellingPoint: readText(record, SELLING_POINT_KEYS),
        publishTime: readText(record, PUBLISH_TIME_KEYS),
        assetId: readKey(record, ASSET_ID_KEYS),
        rawExposureCount: readText(record, RAW_EXPOSURE_KEYS),
        exposureRange: readText(record, RAW_EXPOSURE_KEYS),
        exposure: readMetric(record, EXPOSURE_KEYS),
        completionRate: readMetric(record, COMPLETION_RATE_KEYS),
        ctr: readMetric(record, CTR_KEYS),
        cvr: readMetric(record, CVR_KEYS),
        play3sRate: readMetric(record, PLAY_3S_RATE_KEYS),
        play5sRate: readMetric(record, PLAY_5S_RATE_KEYS),
        interactionRate: readMetric(record, INTERACTION_RATE_KEYS),
        pvr: readMetric(record, PVR_KEYS),
      },
    ];
  });
}

function normalizeSummary(value: unknown) {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    totalCount: readNumber(record, ['totalCount', 'total_count', 'rowCount', 'row_count']),
    brandCount: readNumber(record, ['brandCount', 'brand_count']),
    archivedCount: readNumber(record, ['archivedCount', 'archived_count']),
    unarchivedCount: readNumber(record, ['unarchivedCount', 'unarchived_count']),
    totalExposure: readNumber(record, ['totalExposure', 'total_exposure', 'exposure']),
    avgCompletionRate: readNumber(record, ['avgCompletionRate', 'avg_completion_rate']),
    avgCtr: readNumber(record, ['avgCtr', 'avg_ctr']),
    avgCvr: readNumber(record, ['avgCvr', 'avg_cvr']),
    avgPlay3sRate: readNumber(record, ['avgPlay3sRate', 'avg_play_3s_rate']),
    avgPlay5sRate: readNumber(record, ['avgPlay5sRate', 'avg_play_5s_rate']),
    avgInteractionRate: readNumber(record, ['avgInteractionRate', 'avg_interaction_rate']),
    avgPvr: readNumber(record, ['avgPvr', 'avg_pvr']),
    updatedAt: readText(record, ['updatedAt', 'updated_at']),
  };
}

function normalizeAvailableMonths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): string[] => {
    if (typeof item !== 'string') {
      return [];
    }
    const normalized = normalizeIndustryMaterialMonth(item);
    return normalized ? [normalized] : [];
  });
}

function normalizeEmptyState(value: unknown): IndustryMaterialEmptyState | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    title: readText(record, ['title']),
    description: readText(record, ['description']),
  };
}

function normalizeBrandOptions(value: unknown): IndustryMaterialBrandOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): IndustryMaterialBrandOption[] => {
    const record = asRecord(item);
    if (!record) {
      return [];
    }
    const key = readText(record, ['key', 'value', 'brandKey', 'brand_key']);
    const label = readText(record, ['label', 'name', 'brand', 'brandName', 'brand_name']);
    if (!key || !label) {
      return [];
    }
    return [
      {
        key,
        label,
        materialCount: readNumber(record, ['materialCount', 'material_count', 'totalCount', 'total_count']),
        linkedAssetCount: readNumber(record, ['linkedAssetCount', 'linked_asset_count', 'linkedAssets']),
        analyzedAssetCount: readNumber(record, ['analyzedAssetCount', 'analyzed_asset_count', 'analyzedAssets']),
        structuredVideoUnderstandingAssetCount: readNumber(record, [
          'structuredVideoUnderstandingAssetCount',
          'structured_video_understanding_asset_count',
        ]),
      },
    ];
  });
}

function normalizeSelectedBrand(value: unknown): IndustryMaterialSelectedBrand | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const key = readText(record, ['key', 'value', 'brandKey', 'brand_key']);
  const label = readText(record, ['label', 'name', 'brand', 'brandName', 'brand_name']);
  return key && label ? { key, label } : null;
}

function normalizeInsightCoverage(value: unknown): IndustryMaterialBrandInsightCoverage {
  const record = asRecord(value) ?? {};
  return {
    totalMaterials: readNumber(record, ['totalMaterials', 'total_materials', 'totalCount', 'total_count']),
    linkedAssets: readNumber(record, ['linkedAssets', 'linked_assets', 'linkedAssetCount', 'linked_asset_count']),
    analyzedAssets: readNumber(record, ['analyzedAssets', 'analyzed_assets', 'analyzedAssetCount', 'analyzed_asset_count']),
    anyAiContentAssets: readNumber(record, [
      'anyAiContentAssets',
      'any_ai_content_assets',
      'analyzedAssets',
      'analyzed_assets',
    ]),
    structuredVideoUnderstandingAssets: readNumber(record, [
      'structuredVideoUnderstandingAssets',
      'structured_video_understanding_assets',
    ]),
    analysisArtifactAssets: readNumber(record, ['analysisArtifactAssets', 'analysis_artifact_assets']),
    missingAnalysis: readNumber(record, ['missingAnalysis', 'missing_analysis']),
    missingStructuredVideoUnderstanding: readNumber(record, [
      'missingStructuredVideoUnderstanding',
      'missing_structured_video_understanding',
      'missingAnalysis',
      'missing_analysis',
    ]),
    queuedStructuredVideoUnderstanding: readNumber(record, [
      'queuedStructuredVideoUnderstanding',
      'queued_structured_video_understanding',
    ]),
    runningStructuredVideoUnderstanding: readNumber(record, [
      'runningStructuredVideoUnderstanding',
      'running_structured_video_understanding',
    ]),
    structuredVideoUnderstandingTableAvailable: readBoolean(record, [
      'structuredVideoUnderstandingTableAvailable',
      'structured_video_understanding_table_available',
    ]),
    structuredVideoUnderstandingReady: readBoolean(record, [
      'structuredVideoUnderstandingReady',
      'structured_video_understanding_ready',
    ]),
    rowsWithPerformance: readNumber(record, ['rowsWithPerformance', 'rows_with_performance']),
  };
}

function normalizeInsightTerms(value: unknown): IndustryMaterialBrandInsightTerm[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): IndustryMaterialBrandInsightTerm[] => {
    const record = asRecord(item);
    const term = record ? readText(record, ['term', 'label']) : null;
    if (!record || !term) {
      return [];
    }
    return [
      {
        term: localizeIndustryMaterialUiText(term),
        weight: readNumber(record, ['weight', 'score']),
        sourceCount: readNumber(record, ['sourceCount', 'source_count', 'count']),
        evidenceAssetIds: readStringList(record, ['evidenceAssetIds', 'evidence_asset_ids', 'assetIds']),
      },
    ];
  });
}

const CONTENT_THEME_GROUPS = new Set<IndustryMaterialBrandContentThemeGroup>([
  'topic',
  'expression',
]);
const CONTENT_THEME_PERFORMANCE_BANDS =
  new Set<IndustryMaterialBrandContentThemePerformanceBand>(['high', 'mid', 'low']);

function normalizeContentThemeSummary(value: unknown): IndustryMaterialBrandContentThemeSummary {
  const record = asRecord(value);
  return {
    eligibleMaterials: Math.max(
      readNumber(record ?? {}, ['eligibleMaterials', 'eligible_materials']) ?? 0,
      0
    ),
    topicCount: Math.max(readNumber(record ?? {}, ['topicCount', 'topic_count']) ?? 0, 0),
    expressionCount: Math.max(
      readNumber(record ?? {}, ['expressionCount', 'expression_count']) ?? 0,
      0
    ),
  };
}

function normalizeContentThemeTerms(value: unknown): IndustryMaterialBrandContentThemeTerm[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): IndustryMaterialBrandContentThemeTerm[] => {
    const record = asRecord(item);
    const term = record ? readText(record, ['term', 'label']) : null;
    const group = record ? readText(record, ['group', 'termGroup', 'term_group']) : null;
    const performanceBand = record
      ? readText(record, ['performanceBand', 'performance_band'])
      : null;
    const themeScore = record ? readNumber(record, ['themeScore', 'theme_score']) : null;
    const semanticScore = record ? readNumber(record, ['semanticScore', 'semantic_score']) : null;
    const coverageScore = record ? readNumber(record, ['coverageScore', 'coverage_score']) : null;
    const performanceScore = record
      ? readNumber(record, ['performanceScore', 'performance_score'])
      : null;
    const sourceCount = record ? readNumber(record, ['sourceCount', 'source_count', 'count']) : null;
    if (
      !record ||
      !term ||
      !group ||
      !CONTENT_THEME_GROUPS.has(group as IndustryMaterialBrandContentThemeGroup) ||
      !performanceBand ||
      !CONTENT_THEME_PERFORMANCE_BANDS.has(
        performanceBand as IndustryMaterialBrandContentThemePerformanceBand
      ) ||
      themeScore === null ||
      semanticScore === null ||
      coverageScore === null ||
      performanceScore === null ||
      sourceCount === null
    ) {
      return [];
    }
    return [
      {
        term: localizeIndustryMaterialUiText(term),
        group: group as IndustryMaterialBrandContentThemeGroup,
        themeScore,
        semanticScore,
        coverageScore,
        performanceScore,
        performanceBand: performanceBand as IndustryMaterialBrandContentThemePerformanceBand,
        sourceCount: Math.max(sourceCount, 0),
        evidenceAssetIds: Array.from(
          new Set(
            readStringList(record, ['evidenceAssetIds', 'evidence_asset_ids', 'assetIds'])
          )
        ),
      },
    ];
  });
}

function normalizeStrategyCards(value: unknown): IndustryMaterialBrandInsightStrategyCard[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): IndustryMaterialBrandInsightStrategyCard[] => {
    const record = asRecord(item);
    if (!record) {
      return [];
    }
    const key = readText(record, ['key']);
    const title = readText(record, ['title', 'label']);
    const cardValue = readText(record, ['value']);
    if (!key || !title) {
      return [];
    }
    return [
      {
        key,
        title: localizeIndustryMaterialUiText(title),
        value: cardValue ? localizeIndustryMaterialUiText(cardValue) : '',
        helper: localizeIndustryMaterialUiText(readText(record, ['helper', 'description']) ?? ''),
        evidenceCount: readNumber(record, ['evidenceCount', 'evidence_count', 'count']),
      },
    ];
  });
}

function normalizeProfileMetrics(value: unknown): IndustryMaterialBrandInsightProfileMetric[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): IndustryMaterialBrandInsightProfileMetric[] => {
    const record = asRecord(item);
    if (!record) {
      return [];
    }
    const key = readText(record, ['key', 'metricKey', 'metric_key']);
    const label = readText(record, ['label', 'name']);
    const role = readText(record, ['role', 'description', 'helper']);
    if (!key || !label) {
      return [];
    }
    return [
      {
        key,
        label: localizeIndustryMaterialUiText(label),
        role: localizeIndustryMaterialUiText(role ?? ''),
      },
    ];
  });
}

function normalizeAnalysisProfile(
  value: unknown,
  tab: IndustryMaterialTab
): IndustryMaterialBrandInsightAnalysisProfile {
  const fallback = createDefaultAnalysisProfile(tab);
  const record = asRecord(value);
  if (!record) {
    return fallback;
  }

  const metricPriority = normalizeProfileMetrics(readField(record, ['metricPriority', 'metric_priority']));
  const videoContentFocus = readStringList(record, ['videoContentFocus', 'video_content_focus']).map(
    localizeIndustryMaterialUiText
  );
  const forbiddenConclusions = readStringList(record, ['forbiddenConclusions', 'forbidden_conclusions']).map(
    localizeIndustryMaterialUiText
  );

  return {
    key: readText(record, ['key', 'profileKey', 'profile_key']) ?? fallback.key,
    title: localizeIndustryMaterialUiText(readText(record, ['title', 'name']) ?? fallback.title),
    primaryQuestion: localizeIndustryMaterialUiText(
      readText(record, ['primaryQuestion', 'primary_question']) ?? fallback.primaryQuestion
    ),
    decisionLens: localizeIndustryMaterialUiText(
      readText(record, ['decisionLens', 'decision_lens']) ?? fallback.decisionLens
    ),
    metricPriority: metricPriority.length ? metricPriority : fallback.metricPriority,
    videoContentFocus: videoContentFocus.length ? videoContentFocus : fallback.videoContentFocus,
    forbiddenConclusions: forbiddenConclusions.length ? forbiddenConclusions : fallback.forbiddenConclusions,
  };
}

function normalizeFusionScore(value: number | null): number | null {
  return value === null ? null : Math.min(100, Math.max(0, value));
}

function normalizeFusionDiagnosisMode(value: string | null): IndustryMaterialFusionDiagnosisMode {
  if (value === 'data_content_fusion' || value === 'data_only' || value === 'content_only') {
    return value;
  }
  return 'insufficient_data';
}

function normalizeFusionConfidence(value: string | null): IndustryMaterialFusionConfidence {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }
  return 'insufficient';
}

function normalizeFusionAlignment(value: string | null): IndustryMaterialFusionAlignment {
  if (
    value === 'reinforced' ||
    value === 'content_leads' ||
    value === 'performance_leads' ||
    value === 'mixed' ||
    value === 'data_only' ||
    value === 'content_only'
  ) {
    return value;
  }
  return 'insufficient';
}

function normalizeFusionMetricBand(value: string | null): IndustryMaterialFusionMetricBand {
  if (value === 'high' || value === 'mid' || value === 'low') {
    return value;
  }
  return 'missing';
}

function normalizeFusionContentLevel(value: string | null): IndustryMaterialFusionContentLevel {
  if (value === 'strong' || value === 'medium' || value === 'weak' || value === 'none' || value === 'observed') {
    return value;
  }
  if (value === '强') {
    return 'strong';
  }
  if (value === '中') {
    return 'medium';
  }
  if (value === '弱') {
    return 'weak';
  }
  if (value === '无') {
    return 'none';
  }
  return 'unknown';
}

function normalizeFusionContentEvidenceTier(value: string | null): IndustryMaterialFusionContentEvidenceTier {
  if (value === 'structured_video_understanding' || value === 'legacy_ai_summary') {
    return value;
  }
  return 'none';
}

function normalizeFusionMetricSignals(value: unknown): IndustryMaterialFusionMetricSignal[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): IndustryMaterialFusionMetricSignal[] => {
    const record = asRecord(item);
    const key = record ? readText(record, ['key', 'metricKey', 'metric_key']) : null;
    const label = record ? readText(record, ['label', 'name']) : null;
    if (!record || !key || !label) {
      return [];
    }
    return [
      {
        key,
        label: localizeIndustryMaterialUiText(label),
        value: readNumber(record, ['value', 'metricValue', 'metric_value']),
        band: normalizeFusionMetricBand(readText(record, ['band', 'relativeBand', 'relative_band'])),
      },
    ];
  });
}

function normalizeFusionContentSignals(value: unknown): IndustryMaterialFusionContentSignal[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): IndustryMaterialFusionContentSignal[] => {
    const record = asRecord(item);
    const key = record ? readText(record, ['key', 'signalKey', 'signal_key']) : null;
    const label = record ? readText(record, ['label', 'name']) : null;
    if (!record || !key || !label) {
      return [];
    }
    return [
      {
        key,
        label: localizeIndustryMaterialUiText(label),
        value: normalizeIndustryMaterialEvidenceSummary(readText(record, ['value', 'description']) ?? ''),
        level: normalizeFusionContentLevel(readText(record, ['level', 'strength'])),
      },
    ];
  });
}

function normalizeFusionSummary(value: unknown): IndustryMaterialFusionSummary | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    scoreBasis: INDUSTRY_FUSION_SCORE_BASIS,
    benchmarkLabel: localizeIndustryMaterialUiText(
      readText(record, ['benchmarkLabel', 'benchmark_label']) ?? '当前月份同视频类型行业样本'
    ),
    benchmarkSampleSize: readNumber(record, ['benchmarkSampleSize', 'benchmark_sample_size']),
    scoredMaterials: readNumber(record, ['scoredMaterials', 'scored_materials']),
    dataContentFusionMaterials: readNumber(record, [
      'dataContentFusionMaterials',
      'data_content_fusion_materials',
    ]),
    structuredVideoMaterials: readNumber(record, ['structuredVideoMaterials', 'structured_video_materials']),
    legacyContentMaterials: readNumber(record, ['legacyContentMaterials', 'legacy_content_materials']),
    highConfidenceMaterials: readNumber(record, ['highConfidenceMaterials', 'high_confidence_materials']),
    reinforcedMaterials: readNumber(record, ['reinforcedMaterials', 'reinforced_materials']),
    averageScore: normalizeFusionScore(readNumber(record, ['averageScore', 'average_score'])),
    methodNote: normalizeIndustryMaterialEvidenceSummary(
      readText(record, ['methodNote', 'method_note']) ??
        '融合分仅表示当前月份同视频类型行业样本中的相对证据强度。'
    ),
  };
}

function normalizeFusionDiagnosis(value: unknown): IndustryMaterialFusionDiagnosis | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    scoreBasis: INDUSTRY_FUSION_SCORE_BASIS,
    benchmarkLabel: localizeIndustryMaterialUiText(
      readText(record, ['benchmarkLabel', 'benchmark_label']) ?? '当前月份同视频类型行业样本'
    ),
    benchmarkSampleSize: readNumber(record, ['benchmarkSampleSize', 'benchmark_sample_size']),
    score: normalizeFusionScore(readNumber(record, ['score', 'fusionScore', 'fusion_score'])),
    metricScore: normalizeFusionScore(readNumber(record, ['metricScore', 'metric_score'])),
    contentScore: normalizeFusionScore(readNumber(record, ['contentScore', 'content_score'])),
    diagnosisMode: normalizeFusionDiagnosisMode(readText(record, ['diagnosisMode', 'diagnosis_mode'])),
    contentEvidenceTier: normalizeFusionContentEvidenceTier(
      readText(record, ['contentEvidenceTier', 'content_evidence_tier'])
    ),
    confidence: normalizeFusionConfidence(readText(record, ['confidence'])),
    alignment: normalizeFusionAlignment(readText(record, ['alignment'])),
    headline: localizeIndustryMaterialUiText(readText(record, ['headline']) ?? '融合证据不足'),
    diagnosis: normalizeIndustryMaterialEvidenceSummary(readText(record, ['diagnosis']) ?? ''),
    nextStep: normalizeIndustryMaterialActionText(
      readText(record, ['nextStep', 'next_step']) ?? '',
      '基于行业可见指标继续验证内容表达，不判断下游承接或 ROI。'
    ),
    contentPattern: normalizeIndustryMaterialEvidenceSummary(
      readText(record, ['contentPattern', 'content_pattern']) ?? '内容结构未识别'
    ),
    metricSignals: normalizeFusionMetricSignals(readField(record, ['metricSignals', 'metric_signals'])),
    contentSignals: normalizeFusionContentSignals(readField(record, ['contentSignals', 'content_signals'])),
  };
}

function normalizeEvidenceMaterials(value: unknown): IndustryMaterialBrandInsightEvidenceMaterial[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): IndustryMaterialBrandInsightEvidenceMaterial[] => {
    const record = asRecord(item);
    if (!record) {
      return [];
    }
    const title = readText(record, ['title', 'videoTitle', 'video_title']) ?? '未命名素材';
    return [
      {
        assetId: readText(record, ['assetId', 'asset_id']),
        title,
        rank: readNumber(record, ['rank']),
        exposure: readMetric(record, EXPOSURE_KEYS),
        completionRate: readNumber(record, ['completionRate', 'completion_rate']),
        ctr: readNumber(record, ['ctr']),
        cvr: readNumber(record, ['cvr']),
        play3sRate: readNumber(record, ['play3sRate', 'play_3s_rate']),
        play5sRate: readNumber(record, ['play5sRate', 'play_5s_rate']),
        interactionRate: readNumber(record, ['interactionRate', 'interaction_rate']),
        pvr: readNumber(record, ['pvr']),
        summary: normalizeIndustryMaterialEvidenceSummary(readText(record, ['summary']) ?? ''),
        reason: localizeIndustryMaterialUiText(readText(record, ['reason']) ?? ''),
        fusionDiagnosis: normalizeFusionDiagnosis(readField(record, ['fusionDiagnosis', 'fusion_diagnosis'])),
      },
    ];
  });
}

function normalizeNextActions(value: unknown): IndustryMaterialBrandInsightNextAction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): IndustryMaterialBrandInsightNextAction[] => {
    const record = asRecord(item);
    const title = record ? readText(record, ['title', 'action']) : null;
    if (!record || !title) {
      return [];
    }
    return [
      {
        title: normalizeIndustryMaterialActionText(title, '观察可见内容表达'),
        detail: normalizeIndustryMaterialActionText(
          readText(record, ['detail', 'description']) ?? '',
          '基于行业可见指标继续观察内容表达，不判断下游承接或 ROI。'
        ),
        owner: localizeIndustryMaterialUiText(readText(record, ['owner']) ?? ''),
        priority: localizeIndustryMaterialUiText(readText(record, ['priority']) ?? ''),
        actionType: readText(record, ['actionType', 'action_type']) ?? '',
        metricTarget: normalizeIndustryMaterialActionText(
          readText(record, ['metricTarget', 'metric_target', 'expectedMetricLift']) ?? '',
          '继续观察可见指标变化'
        ),
        evidenceCount: readNumber(record, ['evidenceCount', 'evidence_count', 'count']),
      },
    ];
  });
}

function normalizeAnalysisBoundary(value: unknown): IndustryMaterialBrandInsightBoundary {
  const record = asRecord(value);
  if (!record) {
    return DEFAULT_INDUSTRY_ANALYSIS_BOUNDARY;
  }

  const visibleSignals = readStringList(record, ['visibleSignals', 'visible_signals']);
  const unavailableSignals = readStringList(record, ['unavailableSignals', 'unavailable_signals']);
  const conclusionPolicy = readText(record, ['conclusionPolicy', 'conclusion_policy']);

  return {
    mode: INDUSTRY_ANALYSIS_BOUNDARY_MODE,
    visibleSignals: visibleSignals.length ? visibleSignals : [...DEFAULT_INDUSTRY_ANALYSIS_BOUNDARY.visibleSignals],
    unavailableSignals: unavailableSignals.length
      ? unavailableSignals
      : [...DEFAULT_INDUSTRY_ANALYSIS_BOUNDARY.unavailableSignals],
    conclusionPolicy: conclusionPolicy ?? DEFAULT_INDUSTRY_ANALYSIS_BOUNDARY.conclusionPolicy,
  };
}

function normalizeBrandInsight(
  value: unknown,
  fallbackBrand: IndustryMaterialSelectedBrand | null = null,
  fallbackTab: IndustryMaterialTab = 'douyin_live_lead_short_video'
): IndustryMaterialBrandInsight | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const brand = normalizeSelectedBrand(readField(record, ['brand', 'selectedBrand', 'selected_brand'])) ?? fallbackBrand;
  if (!brand) {
    return null;
  }
  const tab = readField(record, ['tab']) === undefined ? fallbackTab : normalizeTab(readField(record, ['tab']));
  return {
    brand,
    tab,
    month: normalizeIndustryMaterialMonth(readText(record, ['month', 'selectedMonth', 'statMonth', 'stat_month'])),
    objective: readText(record, ['objective']) ?? '',
    coverage: normalizeInsightCoverage(readField(record, ['coverage'])),
    fusionSummary: normalizeFusionSummary(readField(record, ['fusionSummary', 'fusion_summary'])),
    analysisProfile: normalizeAnalysisProfile(readField(record, ['analysisProfile', 'analysis_profile']), tab),
    analysisBoundary: normalizeAnalysisBoundary(readField(record, ['analysisBoundary', 'analysis_boundary'])),
    contentThemeSummary: normalizeContentThemeSummary(
      readField(record, ['contentThemeSummary', 'content_theme_summary'])
    ),
    contentThemeTerms: normalizeContentThemeTerms(
      readField(record, ['contentThemeTerms', 'content_theme_terms'])
    ),
    wordCloudTerms: normalizeInsightTerms(readField(record, ['wordCloudTerms', 'word_cloud_terms', 'themeTerms', 'theme_terms', 'terms'])),
    strategyCards: normalizeStrategyCards(readField(record, ['strategyCards', 'strategy_cards', 'cards'])),
    evidenceMaterials: normalizeEvidenceMaterials(readField(record, ['evidenceMaterials', 'evidence_materials'])),
    nextActions: normalizeNextActions(readField(record, ['nextActions', 'next_actions'])),
    gaps: readStringList(record, ['gaps']).map(localizeIndustryMaterialUiText),
  };
}

export function normalizeIndustryMaterialResponse(value: unknown): IndustryMaterialResponse {
  const root = asRecord(value);
  const payload = asRecord(root?.data) ?? root ?? {};
  const rows = normalizeRows(readField(payload, ['rows', 'items']));
  const month = normalizeIndustryMaterialMonth(readText(payload, ['month', 'selectedMonth', 'statMonth', 'stat_month']));
  const selectedBrand = normalizeSelectedBrand(readField(payload, ['selectedBrand', 'selected_brand']));
  const tab = normalizeTab(readField(payload, ['tab']));

  return {
    tab,
    month,
    availableMonths: normalizeAvailableMonths(readField(payload, ['availableMonths', 'available_months'])),
    summary: normalizeSummary(readField(payload, ['summary'])),
    rows,
    brandOptions: normalizeBrandOptions(readField(payload, ['brandOptions', 'brand_options'])),
    selectedBrand,
    brandInsight: normalizeBrandInsight(readField(payload, ['brandInsight', 'brand_insight']), selectedBrand, tab),
    emptyState: normalizeEmptyState(readField(payload, ['emptyState', 'empty_state'])),
  };
}

export function normalizeIndustryMaterialBrandAiBackfillResponse(
  value: unknown
): IndustryMaterialBrandAiBackfillResponse {
  const root = asRecord(value);
  const payload = asRecord(root?.data) ?? root ?? {};
  const message = readText(payload, ['message', 'detail', 'statusMessage', 'status_message']);
  const skippedExisting = readNumber(payload, [
    'skippedExisting',
    'skipped_existing',
    'existingJobs',
    'existing_jobs',
  ]);
  const skippedReadyAssets = readNumber(payload, ['skippedReadyAssets', 'skipped_ready_assets']);
  const skippedExistingJobs = readNumber(payload, ['skippedExistingJobs', 'skipped_existing_jobs']);
  const limitReachedValue = readField(payload, ['limitReached', 'limit_reached']);
  const summedSkippedExisting =
    skippedExisting ??
    (skippedReadyAssets === null && skippedExistingJobs === null
      ? null
      : (skippedReadyAssets ?? 0) + (skippedExistingJobs ?? 0));
  const workerTriggerRecord = asRecord(readField(payload, ['workerTrigger', 'worker_trigger']));
  const rawWorkerTriggerStatus = readText(workerTriggerRecord ?? {}, ['status']);
  const workerTriggerStatus =
    rawWorkerTriggerStatus === 'created' || rawWorkerTriggerStatus === 'failed'
      ? rawWorkerTriggerStatus
      : 'not_requested';
  const workerTriggerMessage = readText(workerTriggerRecord ?? {}, ['message']);

  return {
    queuedJobs: readNumber(payload, [
      'queuedJobs',
      'queued_jobs',
      'createdJobs',
      'created_jobs',
      'jobCount',
      'job_count',
    ]),
    queuedCacheHydrationJobs: readNumber(payload, [
      'queuedCacheHydrationJobs',
      'queued_cache_hydration_jobs',
    ]),
    queuedModelAnalysisJobs: readNumber(payload, [
      'queuedModelAnalysisJobs',
      'queued_model_analysis_jobs',
    ]),
    existingAnyAiAssets: readNumber(payload, ['existingAnyAiAssets', 'existing_any_ai_assets']),
    existingAiArtifactAssets: readNumber(payload, [
      'existingAiArtifactAssets',
      'existing_ai_artifact_assets',
    ]),
    structuredStorageReady: readBoolean(payload, ['structuredStorageReady', 'structured_storage_ready']),
    skippedExisting: summedSkippedExisting,
    skippedReady: skippedReadyAssets,
    skippedExistingJobs: skippedExistingJobs,
    skippedRunning: readNumber(payload, [
      'skippedRunning',
      'skipped_running',
      'runningJobs',
      'running_jobs',
      'skippedRunningJobs',
      'skipped_running_jobs',
    ]),
    skippedNoInput: readNumber(payload, [
      'skippedNoInput',
      'skipped_no_input',
      'noInputAssets',
      'no_input_assets',
      'skippedNoInputAssets',
      'skipped_no_input_assets',
    ]),
    eligibleAssets: readNumber(payload, [
      'eligibleAssets',
      'eligible_assets',
      'eligibleCount',
      'eligible_count',
      'candidateAssets',
      'candidate_assets',
    ]),
    linkedAssets: readNumber(payload, [
      'linkedAssets',
      'linked_assets',
      'linkedAssetCount',
      'linked_asset_count',
      'scannedAssets',
      'scanned_assets',
    ]),
    missingAnalysis: readNumber(payload, [
      'missingAnalysis',
      'missing_analysis',
      'missingCount',
      'missing_count',
      'missingAnalysisBefore',
      'missing_analysis_before',
    ]),
    remainingMissingAfterClick: readNumber(payload, [
      'remainingMissingAfterClick',
      'remaining_missing_after_click',
      'remainingMissing',
      'remaining_missing',
    ]),
    limit: readNumber(payload, ['limit', 'backfillLimit', 'backfill_limit']),
    limitReached: limitReachedValue === true || limitReachedValue === 'true',
    workerTrigger: {
      status: workerTriggerStatus,
      queuedJobs: readNumber(workerTriggerRecord ?? {}, ['queuedJobs', 'queued_jobs']) ?? 0,
      immediateLimit: readNumber(workerTriggerRecord ?? {}, ['immediateLimit', 'immediate_limit']) ?? 10,
      flowRunId: readText(workerTriggerRecord ?? {}, ['flowRunId', 'flow_run_id']),
      flowRunName: readText(workerTriggerRecord ?? {}, ['flowRunName', 'flow_run_name']),
      fallback: 'scheduled',
      message: workerTriggerMessage ? localizeIndustryMaterialUiText(workerTriggerMessage) : '',
    },
    message: message ? localizeIndustryMaterialUiText(message) : null,
  };
}
