import type {
  IndustryMaterialBrandAiBackfillResponse,
  IndustryMaterialBrandInsight,
  IndustryMaterialBrandInsightCoverage,
  IndustryMaterialBrandInsightEvidenceMaterial,
  IndustryMaterialTab,
} from './industry-material-inspiration-types';
import {
  formatInteger,
  formatRate,
} from './industry-material-inspiration-formatters';

function nonNegative(value: number | null | undefined): number {
  return Math.max(value ?? 0, 0);
}

export interface BrandAiCoverageState {
  totalMaterials: number;
  linkedAssets: number;
  anyAiContentAssets: number;
  structuredAssets: number;
  missingAssets: number;
  queuedAssets: number;
  runningAssets: number;
  activeAssets: number;
  primaryLabel: string;
  secondaryLabel: string | null;
  processingLabel: string | null;
  evidenceLabel: string;
}

export interface BrandAiExecutiveSummaryItem {
  key: 'content' | 'evidence' | 'action';
  label: string;
  value: string;
  detail: string;
}

export interface BrandAiExecutiveSummary {
  headline: string;
  evidenceLabel: string;
  items: BrandAiExecutiveSummaryItem[];
}

export function resolveBrandAiCoverageState(
  coverage: IndustryMaterialBrandInsightCoverage
): BrandAiCoverageState {
  const totalMaterials = nonNegative(coverage.totalMaterials);
  const linkedAssets = nonNegative(coverage.linkedAssets);
  const anyAiContentAssets = nonNegative(coverage.anyAiContentAssets ?? coverage.analyzedAssets);
  const structuredAssets = nonNegative(coverage.structuredVideoUnderstandingAssets);
  const queuedAssets = nonNegative(coverage.queuedStructuredVideoUnderstanding);
  const runningAssets = nonNegative(coverage.runningStructuredVideoUnderstanding);
  const activeAssets = queuedAssets + runningAssets;
  const missingAssets = Math.max(
    nonNegative(coverage.missingStructuredVideoUnderstanding ?? coverage.missingAnalysis),
    linkedAssets - structuredAssets,
    0
  );
  const allMaterialsCovered =
    totalMaterials > 0 &&
    linkedAssets >= totalMaterials &&
    structuredAssets >= linkedAssets &&
    activeAssets === 0;
  const linkedAssetsCovered =
    linkedAssets > 0 && structuredAssets >= linkedAssets && activeAssets === 0;

  let primaryLabel = '等待素材归档';
  if (allMaterialsCovered) {
    primaryLabel = `AI 分析完成 · ${formatInteger(structuredAssets)}/${formatInteger(totalMaterials)}`;
  } else if (linkedAssetsCovered) {
    primaryLabel = `已归档素材分析完成 · ${formatInteger(structuredAssets)}/${formatInteger(linkedAssets)}`;
  } else if (linkedAssets > 0 && missingAssets > 0 && activeAssets === 0) {
    primaryLabel = `视频理解 ${formatInteger(structuredAssets)}/${formatInteger(linkedAssets)} · 待补齐 ${formatInteger(missingAssets)}`;
  } else if (linkedAssets > 0) {
    primaryLabel = `视频理解 ${formatInteger(structuredAssets)}/${formatInteger(linkedAssets)}`;
  }

  let secondaryLabel: string | null = null;
  if (totalMaterials > linkedAssets) {
    secondaryLabel = `待归档 ${formatInteger(totalMaterials - linkedAssets)} 条`;
  } else if (anyAiContentAssets > structuredAssets) {
    secondaryLabel = `已有 AI 内容 ${formatInteger(anyAiContentAssets)} 条`;
  }

  let evidenceLabel = '当前仅基于素材标题、卖点与行业可见指标形成初步判断。';
  if (structuredAssets > 0) {
    evidenceLabel = linkedAssets > 0
      ? `基于 ${formatInteger(structuredAssets)} 条结构化视频理解，已覆盖 ${formatInteger(structuredAssets)}/${formatInteger(linkedAssets)} 条归档素材。`
      : `基于 ${formatInteger(structuredAssets)} 条结构化视频理解聚合品牌内容信号。`;
  } else if (anyAiContentAssets > 0) {
    evidenceLabel = `基于 ${formatInteger(anyAiContentAssets)} 条 AI 摘要或标签聚合，结构化视频理解尚待补齐。`;
  }

  return {
    totalMaterials,
    linkedAssets,
    anyAiContentAssets,
    structuredAssets,
    missingAssets,
    queuedAssets,
    runningAssets,
    activeAssets,
    primaryLabel,
    secondaryLabel,
    processingLabel: activeAssets > 0 ? `处理中 ${formatInteger(activeAssets)}` : null,
    evidenceLabel,
  };
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

const SUMMARY_SOURCE_TERMS = new Set(['千川', '云图', '抖音', 'qianchuan', 'yuntu']);

function meaningfulSummaryValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (
    !normalized ||
    SUMMARY_SOURCE_TERMS.has(normalized.toLowerCase()) ||
    normalized.startsWith('暂无') ||
    normalized.includes('未结构化')
  ) {
    return null;
  }
  return normalized;
}

export function resolveBrandAiExecutiveSummary(
  insight: IndustryMaterialBrandInsight
): BrandAiExecutiveSummary {
  const coverage = resolveBrandAiCoverageState(insight.coverage);
  const fusionSummary = insight.fusionSummary;
  const reinforcedMaterials = nonNegative(fusionSummary?.reinforcedMaterials);
  const highConfidenceMaterials = nonNegative(fusionSummary?.highConfidenceMaterials);
  const structuredVideoMaterials = nonNegative(
    fusionSummary?.structuredVideoMaterials ?? insight.coverage.structuredVideoUnderstandingAssets
  );
  const firstEvidence = insight.evidenceMaterials.find((material) => material.fusionDiagnosis);
  const firstDiagnosis = firstEvidence?.fusionDiagnosis ?? null;
  const coreStrategy = insight.strategyCards.find((card) => card.key === 'core_strategy');
  const hookStrategy = insight.strategyCards.find((card) => card.key === 'hook');
  const hookValue = meaningfulSummaryValue(hookStrategy?.value);
  const topTheme = insight.contentThemeTerms
    ?.filter((term) => term.group === 'topic')
    .sort((left, right) => right.themeScore - left.themeScore)
    .map((term) => meaningfulSummaryValue(term.term))
    .find((term): term is string => Boolean(term))
    ?? insight.wordCloudTerms
      .map((term) => meaningfulSummaryValue(term.term))
      .find((term): term is string => Boolean(term));
  const nextAction = insight.nextActions[0] ?? null;
  const firstGap = insight.gaps[0] ?? null;

  let headline = '当前证据不足，先补齐视频理解再形成品牌判断';
  if (reinforcedMaterials > 0) {
    headline = `已找到 ${formatInteger(reinforcedMaterials)} 条内容与表现相互支持的证据样本`;
  } else if (highConfidenceMaterials > 0) {
    headline = `已形成 ${formatInteger(highConfidenceMaterials)} 条高置信内容线索，表现信号仍需交叉验证`;
  } else if (structuredVideoMaterials > 0) {
    headline = '品牌内容打法轮廓已经形成，行业表现信号仍需继续验证';
  } else if (coverage.anyAiContentAssets > 0) {
    headline = '已形成初步品牌内容假设，当前证据置信度有限';
  }

  const contentValue = firstNonEmpty(
    meaningfulSummaryValue(coreStrategy?.value),
    meaningfulSummaryValue(firstDiagnosis?.contentPattern),
    topTheme,
    hookValue,
    '暂无稳定主题'
  ) ?? '暂无稳定主题';
  const contentDetail = hookValue && hookValue !== contentValue
    ? `常见钩子：${hookValue}`
    : meaningfulSummaryValue(coreStrategy?.value)
      ? firstNonEmpty(coreStrategy?.helper, '高表现证据主要围绕该内容结构展开。') ?? '高表现证据主要围绕该内容结构展开。'
      : '高表现证据主要围绕该内容结构展开。';
  const evidenceValue = firstNonEmpty(
    firstDiagnosis?.headline,
    structuredVideoMaterials > 0 ? '结构化内容信号已具备可审计证据' : null,
    '内容与指标尚未形成一致判断'
  ) ?? '内容与指标尚未形成一致判断';
  const evidenceDetail = firstEvidence
    ? `代表证据：${firstEvidence.title}`
    : highConfidenceMaterials > 0
      ? `${formatInteger(highConfidenceMaterials)} 条高置信样本可供复核`
      : '继续补齐内容理解与行业可见表现后再判断。';
  const actionValue = firstNonEmpty(
    nextAction?.title,
    firstGap,
    '继续补齐品牌素材证据'
  ) ?? '继续补齐品牌素材证据';
  const actionDetailParts = [nextAction?.detail, nextAction?.metricTarget]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const actionDetail = Array.from(new Set(actionDetailParts)).join(' · ') || (
    firstNonEmpty(
      firstGap ? '先解决当前覆盖缺口' : null,
      '保持素材归档、视频理解和表现数据覆盖'
    ) ?? '保持素材归档、视频理解和表现数据覆盖'
  );

  return {
    headline,
    evidenceLabel: coverage.evidenceLabel,
    items: [
      {
        key: 'content',
        label: '核心打法',
        value: contentValue,
        detail: contentDetail,
      },
      {
        key: 'evidence',
        label: '有效信号',
        value: evidenceValue,
        detail: evidenceDetail,
      },
      {
        key: 'action',
        label: '优先验证动作',
        value: actionValue,
        detail: actionDetail,
      },
    ],
  };
}

export function coverageValue(value: number | null | undefined): string {
  return formatInteger(value ?? null);
}

export function resolveAssetHref(assetId: string | null): string | null {
  return assetId ? `/marketing/content-assets/${encodeURIComponent(assetId)}` : null;
}

export function evidenceMetricItems(
  tab: IndustryMaterialTab,
  material: IndustryMaterialBrandInsightEvidenceMaterial
): Array<{ label: string; value: string }> {
  const exposure = { label: '曝光', value: formatInteger(material.exposure) };
  if (tab === 'douyin_live_lead_short_video') {
    return [
      { label: '3S', value: formatRate(material.play3sRate) },
      { label: '5S', value: formatRate(material.play5sRate) },
      { label: '完播', value: formatRate(material.completionRate) },
      { label: '互动', value: formatRate(material.interactionRate) },
      { label: 'PVR', value: formatRate(material.pvr) },
      { label: 'CTR', value: formatRate(material.ctr) },
      exposure,
    ];
  }
  return [
    { label: 'CTR', value: formatRate(material.ctr) },
    { label: 'CVR', value: formatRate(material.cvr) },
    { label: 'PVR', value: formatRate(material.pvr) },
    { label: '完播', value: formatRate(material.completionRate) },
    { label: '互动', value: formatRate(material.interactionRate) },
    exposure,
  ];
}

export function resolveBackfillButtonCopy(isPending: boolean): string {
  return isPending ? '正在提交补齐' : '补齐缺失分析';
}

export function formatBackfillResultSummary(result: IndustryMaterialBrandAiBackfillResponse): string {
  const queuedJobs = result.queuedJobs ?? 0;
  const skippedReady = result.skippedReady ?? 0;
  const skippedExistingJobs = result.skippedExistingJobs ?? Math.max((result.skippedExisting ?? 0) - skippedReady, 0);
  const skippedRunning = result.skippedRunning ?? 0;
  const skippedNoInput = result.skippedNoInput ?? 0;
  const queuedHydration = result.queuedCacheHydrationJobs ?? 0;
  const queuedModel = result.queuedModelAnalysisJobs ?? Math.max(queuedJobs - queuedHydration, 0);
  const parts = [`新增排队 ${formatInteger(queuedJobs)} 条`];
  if (queuedHydration > 0) {
    parts.push(`复用已有 AI 结果 ${formatInteger(queuedHydration)} 条（不调用模型）`);
  }
  if (queuedModel > 0) {
    parts.push(`需要模型分析 ${formatInteger(queuedModel)} 条`);
  }
  if (skippedRunning > 0) {
    parts.push(`已有排队/运行 ${formatInteger(skippedRunning)} 条`);
  }
  if (skippedReady > 0) {
    parts.push(`已覆盖 ${formatInteger(skippedReady)} 条`);
  }
  if (skippedExistingJobs > 0) {
    parts.push(`重复任务保护 ${formatInteger(skippedExistingJobs)} 条`);
  }
  if (skippedNoInput > 0) {
    parts.push(`缺少可分析输入 ${formatInteger(skippedNoInput)} 条`);
  }
  const trigger = result.workerTrigger;
  if (trigger.status === 'created') {
    parts.push(`已触发 1 个即时任务（本轮最多 ${formatInteger(trigger.immediateLimit)} 条）`);
  } else if (trigger.status === 'failed') {
    parts.push('即时触发失败，队列将等待定时调度');
  }
  return `本次补齐结果：${parts.join('，')}。`;
}

export function formatBackfillSkipReasonHint(result: IndustryMaterialBrandAiBackfillResponse): string | null {
  const skippedCount =
    (result.skippedReady ?? 0) +
    (result.skippedRunning ?? 0) +
    (result.skippedExistingJobs ?? 0) +
    (result.skippedNoInput ?? 0);
  if (skippedCount <= 0) {
    return null;
  }
  return '为什么会跳过：已覆盖、已有排队/运行或缺少可分析输入的素材不会重复排队，避免重复消耗视频理解额度。';
}

export function formatBackfillCompletionHint(result: IndustryMaterialBrandAiBackfillResponse): string {
  const limit = result.limit ?? null;
  const remainingMissing = result.remainingMissingAfterClick ?? null;
  const limitText = limit === null ? '本次已达到单次上限' : `本次已达到单次上限 ${formatInteger(limit)} 条`;
  const limitNote =
    result.limitReached && remainingMissing !== null && remainingMissing > 0
      ? `${limitText}，其余缺口可在当前任务处理后继续补齐。`
      : '已检查当前品牌可补齐范围。';
  return `处理已开始；完成数追平归档数且处理中归零后即完成。页面会自动刷新进度。${limitNote}`;
}
