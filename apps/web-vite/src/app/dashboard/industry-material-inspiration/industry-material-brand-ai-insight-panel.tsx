import { Button } from 'antd';
import type {
  IndustryMaterialBrandAiBackfillResponse,
  IndustryMaterialBrandInsight,
  IndustryMaterialTab,
} from './industry-material-inspiration-types';
import { ALL_BRANDS_KEY } from './industry-material-inspiration-client-helpers';
import { AnalysisProfileCard } from './industry-material-analysis-profile-card';
import { BrandContentThemeMap } from './industry-material-brand-content-theme-map';
import { BrandAiSummary } from './industry-material-brand-ai-summary';
import { BrandEvidenceSection } from './industry-material-brand-evidence-section';
import { FusionScorecard } from './industry-material-fusion-scorecard';
import {
  formatBackfillCompletionHint,
  formatBackfillResultSummary,
  formatBackfillSkipReasonHint,
  resolveBackfillButtonCopy,
  resolveBrandAiCoverageState,
  resolveBrandAiExecutiveSummary,
} from './industry-material-brand-ai-insight-panel-helpers';
import styles from './industry-material-brand-ai-insight-panel.module.css';

interface BrandAiInsightPanelProps {
  activeTab: IndustryMaterialTab;
  activeTabLabel: string;
  displayMonth: string;
  selectedBrandKey: string;
  selectedBrandLabel: string;
  insight: IndustryMaterialBrandInsight | null;
  isLoading: boolean;
  isBackfillPending: boolean;
  backfillResult: IndustryMaterialBrandAiBackfillResponse | null;
  backfillErrorMessage: string | null;
  onBackfillMissingAnalysis: () => void;
}

export function BrandAiInsightPanel({
  activeTab,
  activeTabLabel,
  displayMonth,
  selectedBrandKey,
  selectedBrandLabel,
  insight,
  isLoading,
  isBackfillPending,
  backfillResult,
  backfillErrorMessage,
  onBackfillMissingAnalysis,
}: BrandAiInsightPanelProps) {
  const isAllBrands = selectedBrandKey === ALL_BRANDS_KEY;

  if (isAllBrands) {
    return (
      <section className={styles.aiInsightPanel} aria-label="行业品牌内容信号诊断">
        <div className={styles.aiInsightHeader}>
          <div>
            <p className={styles.eyebrow}>行业品牌 AI 洞察</p>
            <h2>行业品牌内容信号诊断</h2>
            <p>当前为全部品牌概览。选择一个品牌后，系统会基于该品牌行业可见指标、已归档视频理解和素材表现生成打法摘要。</p>
          </div>
          <span className={styles.aiInsightStatus}>等待选择品牌</span>
        </div>
        <div className={styles.aiInsightEmpty}>
          <strong>选择品牌后查看高表现内容主题与素材策略</strong>
          <span>{displayMonth} / {activeTabLabel} 暂不输出混合品牌策略，避免多个品牌打法被错误合并。</span>
        </div>
      </section>
    );
  }

  if (isLoading && !insight) {
    return (
      <section className={styles.aiInsightPanel} aria-label="行业品牌内容信号诊断">
        <div className={styles.aiInsightHeader}>
          <div>
            <p className={styles.eyebrow}>行业品牌 AI 洞察</p>
            <h2>行业品牌内容信号诊断</h2>
          </div>
          <span className={styles.aiInsightStatus}>加载中</span>
        </div>
        <div className={styles.aiInsightEmpty}>
          <strong>正在聚合 {selectedBrandLabel} 的行业素材视频理解结果</strong>
          <span>会同时核对行业可见表现、视频理解覆盖和可用证据素材。</span>
        </div>
      </section>
    );
  }

  if (!insight) {
    return (
      <section className={styles.aiInsightPanel} aria-label="行业品牌内容信号诊断">
        <div className={styles.aiInsightHeader}>
          <div>
            <p className={styles.eyebrow}>行业品牌 AI 洞察</p>
            <h2>行业品牌内容信号诊断</h2>
            <p>{selectedBrandLabel} 暂无可聚合的行业品牌洞察，请检查该月份素材归档、视频理解和表现数据覆盖。</p>
          </div>
          <span className={styles.aiInsightStatus}>暂无洞察</span>
        </div>
      </section>
    );
  }

  const coverage = insight.coverage;
  const coverageState = resolveBrandAiCoverageState(coverage);
  const anyAiContent = coverageState.anyAiContentAssets;
  const structuredVideoUnderstanding = coverageState.structuredAssets;
  const linked = coverageState.linkedAssets;
  const missingAnalysis = coverageState.missingAssets;
  const activeStructuredVideoUnderstanding = coverageState.activeAssets;
  const activeJobsCoverMissing =
    missingAnalysis > 0 && activeStructuredVideoUnderstanding >= missingAnalysis;
  const hasAiCoverage = anyAiContent > 0;
  const hasStructuredVideoUnderstanding = structuredVideoUnderstanding > 0;
  const structuredStorageReady = coverage.structuredVideoUnderstandingReady;
  const canBackfillMissingAnalysis =
    activeTab !== 'xhs_note' &&
    missingAnalysis > 0 &&
    linked > 0 &&
    structuredStorageReady &&
    !activeJobsCoverMissing;
  const backfillButtonCopy = resolveBackfillButtonCopy(isBackfillPending);
  const panelTitle = hasAiCoverage
    ? `${selectedBrandLabel} 品牌 AI 洞察`
    : `${selectedBrandLabel} 行业内容信号诊断`;
  const backfillSkipReasonHint = backfillResult ? formatBackfillSkipReasonHint(backfillResult) : null;
  const analysisBoundary = insight.analysisBoundary;
  const analysisProfile = insight.analysisProfile;
  const executiveSummary = resolveBrandAiExecutiveSummary(insight);
  const secondaryActions = insight.nextActions.slice(1);

  return (
    <section className={styles.aiInsightPanel} aria-label={panelTitle}>
      <div className={styles.aiInsightHeader}>
        <div>
          <p className={styles.eyebrow}>{displayMonth} · {activeTabLabel}</p>
          <h2>{panelTitle}</h2>
        </div>
        <div className={styles.aiInsightActions}>
          <div className={styles.aiStatusRow} aria-label="AI 分析覆盖状态">
            <span className={styles.aiInsightStatus}>{coverageState.primaryLabel}</span>
            {coverageState.secondaryLabel ? (
              <span className={styles.aiInsightStatusSecondary}>{coverageState.secondaryLabel}</span>
            ) : null}
            {coverageState.processingLabel ? (
              <span className={styles.aiInsightStatusProcessing}>{coverageState.processingLabel}</span>
            ) : null}
          </div>
          {canBackfillMissingAnalysis ? (
            <Button
              type="primary"
              size="small"
              className={styles.aiBackfillButton}
              disabled={isBackfillPending}
              loading={isBackfillPending}
              onClick={onBackfillMissingAnalysis}
            >
              {backfillButtonCopy}
            </Button>
          ) : null}
          {coverageState.activeAssets > 0 ? (
            <p className={styles.aiBackfillHelper}>页面会自动更新处理进度，无需重复提交。</p>
          ) : null}
          {!structuredStorageReady ? (
            <p className={styles.aiBackfillHelper}>结构化视频理解暂不可用，当前仅展示已有 AI 内容与可见指标。</p>
          ) : null}
        </div>
      </div>

      {backfillResult || backfillErrorMessage || !hasStructuredVideoUnderstanding ? (
        <div className={styles.aiInsightNotices}>
          {backfillResult ? (
            <div
              className={`${styles.aiBackfillFeedback} ${
                backfillResult.workerTrigger.status === 'failed'
                  ? styles.aiBackfillFeedbackWarning
                  : styles.aiBackfillFeedbackSuccess
              }`}
              role="status"
            >
              <strong>{formatBackfillResultSummary(backfillResult)}</strong>
              <details className={styles.aiBackfillDetails}>
                <summary>查看处理详情</summary>
                <span>{formatBackfillCompletionHint(backfillResult)}</span>
                {backfillSkipReasonHint ? <span>{backfillSkipReasonHint}</span> : null}
                {backfillResult.workerTrigger.message ? <span>{backfillResult.workerTrigger.message}</span> : null}
                {backfillResult.message ? <span>{backfillResult.message}</span> : null}
              </details>
            </div>
          ) : null}

          {backfillErrorMessage ? (
            <div className={`${styles.aiBackfillFeedback} ${styles.aiBackfillFeedbackError}`} role="alert">
              <strong>视频理解排队失败</strong>
              <span>{backfillErrorMessage}。请重试，或检查权限与后端服务。</span>
            </div>
          ) : null}

          {!hasStructuredVideoUnderstanding ? (
            <div className={styles.aiCoverageNotice}>
              <strong>{hasAiCoverage ? '已有 AI 内容，但结构化视频理解覆盖为 0' : '结构化视频理解覆盖为 0'}</strong>
              <span>
                {structuredStorageReady
                  ? '高表现主题图需要结构化视频理解与可见指标共同支持；AI 摘要和验证动作仍会基于已有 AI 内容与表现数据给出保守参考。'
                  : '当前结构化存储未就绪，高表现主题图会显示证据不足；AI 摘要和验证动作仅依赖已有 AI 内容、标题、卖点与表现数据兜底。'}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <BrandAiSummary summary={executiveSummary} />

      <div className={styles.aiInsightBody}>
        <div className={styles.aiOverviewGrid}>
          <BrandContentThemeMap
            summary={insight.contentThemeSummary}
            terms={insight.contentThemeTerms}
          />
          <FusionScorecard
            brandLabel={selectedBrandLabel}
            summary={insight.fusionSummary}
          />
        </div>

        <AnalysisProfileCard profile={analysisProfile} boundary={analysisBoundary} />

        <BrandEvidenceSection
          activeTab={activeTab}
          materials={insight.evidenceMaterials}
          secondaryActions={secondaryActions}
          gaps={insight.gaps}
        />
      </div>
    </section>
  );
}
