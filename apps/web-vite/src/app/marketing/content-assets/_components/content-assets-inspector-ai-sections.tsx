import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, message } from 'antd';
import {
  type ContentAssetAnalysisDiagnosis,
  type ContentAssetCurrentAiAnalysis,
  type ContentAssetAnalysisNextActionItem,
} from '../_lib/content-assets-analysis-result';
import {
  CONTENT_ASSET_LONG_VIDEO_AI_HELPER,
  isLongFormContentAssetForAi,
} from '../_lib/content-assets-ai-eligibility';
import {
  formatCompactNumber,
  formatDateTime,
  formatPercent,
  formatRatio,
  formatSrtTextForDisplay,
} from '../_lib/content-assets-formatters';
import { fetchContentAssetPerformanceDaily } from '../_lib/content-assets-api';
import { contentAssetsQueryKeys } from '../_lib/content-assets-query-keys';
import type {
  ContentAssetAnalysisProfile,
  ContentAssetAnalysisSource,
  ContentAssetDetailResponse,
  ContentAssetPerformanceDailyRow,
  ContentAssetLiveAcceptanceSnapshot,
  ContentAssetObject,
  ContentAssetPerformanceMaterial,
  ContentAssetPerformanceSnapshot,
  ContentAssetProcessingJob,
  ContentAssetShortVideoProfileHint,
  ContentAssetSource,
  ContentAssetTranscript,
} from '../_lib/content-assets-types';
import { resolveContentAssetRequestError } from '../_lib/content-assets-ui-helpers';
import styles from '../content-assets.module.css';
import aiTabStyles from './content-assets-inspector-ai-tab.module.css';
import currentAiStyles from './content-assets-inspector-current-ai-analysis.module.css';
import provenanceStyles from './content-assets-inspector-performance-provenance.module.css';
import trendStyles from './content-assets-inspector-performance-trend.module.css';
import { AnalysisOptionGrid } from './content-assets-analysis-option-cards';
import { ProcessingJobProgress } from './content-asset-detail-processing-jobs';
import { AiSectionTitle } from './content-assets-inspector-ai-section-title';
import { DetailItem } from './content-assets-inspector-detail-item';
import { ContentUnderstandingSection } from './content-assets-inspector-ai-understanding-section';

type Asset = ContentAssetDetailResponse['asset'];
type MetricItem = [label: string, value: string];

export function AiSummaryPanel({ asset }: { asset: Asset }) {
  return (
    <section className={aiTabStyles.aiScorePanel}>
      <div>
        <span>AI评分</span>
        <strong>{asset.aiScore == null ? '--' : asset.aiScore}</strong>
      </div>
      <p>{asset.aiSummary || '等待 AI 摘要。'}</p>
    </section>
  );
}

export function AnalysisSourceSection({
  asset,
  sourceLabel,
  hasAnalysisObject,
  analysisResultFetching,
  analysisResultError,
  aiSuggestedTags,
  canAnalyzePreview,
  canAnalyzeRaw,
  actionLoading,
  submittingProfile,
  processingJobs,
  hasExistingAnalysis,
  analysisObjects,
  selectedAnalysisObjectKey,
  onSelectAnalysisObject,
  onCreateAnalysisJob,
}: {
  asset: Asset;
  sourceLabel: string;
  hasAnalysisObject: boolean;
  analysisResultFetching: boolean;
  analysisResultError: unknown;
  aiSuggestedTags: string[];
  canAnalyzePreview: boolean;
  canAnalyzeRaw: boolean;
  actionLoading: boolean;
  submittingProfile: ContentAssetAnalysisProfile | null;
  processingJobs: ContentAssetProcessingJob[];
  hasExistingAnalysis: boolean;
  analysisObjects: ContentAssetObject[];
  selectedAnalysisObjectKey?: string | null;
  onSelectAnalysisObject: (objectKey: string | null) => void;
  onCreateAnalysisJob: (
    source: ContentAssetAnalysisSource,
    force: boolean,
    profile?: ContentAssetAnalysisProfile
  ) => void;
}) {
  return (
    <section className={`${styles.detailSection} ${aiTabStyles.analysisSourceSection}`}>
      <AiSectionTitle title="分析策略" />
      <div className={aiTabStyles.analysisSourcePanel}>
        <AnalysisOptionGrid
          actionLoading={actionLoading}
          canAnalyzePreview={canAnalyzePreview}
          canAnalyzeRaw={canAnalyzeRaw}
          durationSeconds={asset.durationSeconds}
          hasExistingAnalysis={hasExistingAnalysis}
          processingJobs={processingJobs}
          submittingProfile={submittingProfile}
          onCreateAnalysisJob={onCreateAnalysisJob}
        />
        <div className={aiTabStyles.analysisContentRow}>
          <div className={aiTabStyles.analysisTitleBlock}>
            <span>AI 标题</span>
            <strong>{asset.aiSuggestedTitle || '待生成'}</strong>
          </div>
          <div className={aiTabStyles.aiTagRow} aria-label="AI 标签">
            {aiSuggestedTags.length > 0 ? (
              aiSuggestedTags.slice(0, 8).map((tag) => <span key={tag}>{tag}</span>)
            ) : (
              <span>待生成</span>
            )}
          </div>
        </div>
        <div className={aiTabStyles.analysisSourceMeta}>
          <span>{sourceLabel}</span>
          <span>{asset.aiAnalysisModel || '--'}</span>
          <span>{formatDateTime(asset.aiAnalyzedAt)}</span>
          <span>{resolveAnalysisResultStatus(hasAnalysisObject, analysisResultFetching, analysisResultError)}</span>
        </div>
        <AnalysisHistoryStrip
          analysisObjects={analysisObjects}
          selectedObjectKey={selectedAnalysisObjectKey || null}
          onSelectAnalysisObject={onSelectAnalysisObject}
        />
      </div>
    </section>
  );
}

function AnalysisHistoryStrip({
  analysisObjects,
  selectedObjectKey,
  onSelectAnalysisObject,
}: {
  analysisObjects: ContentAssetObject[];
  selectedObjectKey: string | null;
  onSelectAnalysisObject: (objectKey: string | null) => void;
}) {
  if (analysisObjects.length <= 1) return null;
  return (
    <div className={aiTabStyles.analysisHistoryStrip}>
      <span>历史结果</span>
      <div>
        {analysisObjects.slice(0, 8).map((object, index) => {
          const profile = readAnalysisProfile(object.metadata);
          const isSelected = selectedObjectKey ? object.objectKey === selectedObjectKey : index === 0;
          return (
            <Button
              key={object.objectKey}
              type={isSelected ? 'primary' : 'default'}
              size="small"
              onClick={() => onSelectAnalysisObject(index === 0 ? null : object.objectKey)}
            >
              {analysisProfileLabel(profile)} · {formatDateTime(object.createdAt)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function TranscriptSection({
  asset,
  transcript,
  hasTranscript,
  canCreateTranscript,
  transcriptActionLoading,
  processingJob,
  transcriptSourceLabel,
  onCreateTranscriptJob,
}: {
  asset: Asset;
  transcript: ContentAssetTranscript | null;
  hasTranscript: boolean;
  canCreateTranscript: boolean;
  transcriptActionLoading: boolean;
  processingJob: ContentAssetProcessingJob | null;
  transcriptSourceLabel: string;
  onCreateTranscriptJob: (force: boolean) => void;
}) {
  const displaySrtText = formatSrtTextForDisplay(transcript?.srtText);
  const hasActiveTranscriptJob = Boolean(processingJob);
  const isLongFormForAi = isLongFormContentAssetForAi(asset.durationSeconds);

  return (
    <section className={styles.detailSection}>
      <AiSectionTitle title="视频脚本 / SRT" />
      <div className={aiTabStyles.transcriptMetaRow}>
        <DetailItem label="脚本来源" value={transcriptSourceLabel} />
        <DetailItem label="转写模型" value={asset.transcriptModel || transcript?.model || '--'} />
        <DetailItem label="转写时间" value={formatDateTime(asset.transcribedAt || transcript?.createdAt)} />
      </div>
      <div className={aiTabStyles.scriptActionRow}>
        <Button
          size="small"
          loading={transcriptActionLoading}
          disabled={!canCreateTranscript || isLongFormForAi || hasActiveTranscriptJob}
          onClick={() => onCreateTranscriptJob(hasTranscript)}
        >
          {hasActiveTranscriptJob ? '处理中' : isLongFormForAi ? '视频过长' : hasTranscript ? '重新抽脚本' : '生成脚本/SRT'}
        </Button>
        <Button
          size="small"
          disabled={!transcript?.scriptText}
          onClick={() => copyText(transcript?.scriptText || '', '纯脚本已复制')}
        >
          复制纯脚本
        </Button>
        <Button
          size="small"
          disabled={!transcript?.srtText}
          onClick={() => copyText(transcript?.srtText || '', 'SRT 已复制')}
        >
          复制 SRT
        </Button>
      </div>
      {processingJob ? <ProcessingJobProgress job={processingJob} /> : null}
      {hasTranscript ? (
        <div className={aiTabStyles.scriptGrid}>
          <ScriptBlock
            title="纯脚本"
            meta={transcript?.wordCount ? `${transcript.wordCount} 字` : '可复制复用文案'}
            text={transcript?.scriptText || '--'}
            variant="script"
          />
          <ScriptBlock
            title="SRT 字幕"
            meta="剪辑/字幕时间轴"
            text={displaySrtText || '--'}
            variant="srt"
          />
        </div>
      ) : (
        <p className={aiTabStyles.aiHint}>
          {isLongFormForAi ? CONTENT_ASSET_LONG_VIDEO_AI_HELPER : '未生成脚本/SRT，先抽取脚本。'}
        </p>
      )}
    </section>
  );
}

export function DataContentDiagnosisSection({
  currentAiAnalysis,
  fusionDiagnosis,
  performanceDiagnosis,
  contentDiagnosis,
  analysisSchemaVersion,
  diagnosisConfidenceText,
  hasAnalysisObject,
  analysisResultFetching,
  analysisResultError,
  hookType,
  suggestedTagsText,
  confidenceText,
  onOpenDataMapping,
}: {
  currentAiAnalysis: ContentAssetCurrentAiAnalysis;
  fusionDiagnosis: ContentAssetAnalysisDiagnosis | null;
  performanceDiagnosis: ContentAssetAnalysisDiagnosis | null;
  contentDiagnosis: ContentAssetAnalysisDiagnosis | null;
  analysisSchemaVersion: string;
  diagnosisConfidenceText: string;
  hasAnalysisObject: boolean;
  analysisResultFetching: boolean;
  analysisResultError: unknown;
  hookType: string;
  suggestedTagsText: string;
  confidenceText: string;
  onOpenDataMapping?: (anchor?: string) => void;
}) {
  const diagnoses = [fusionDiagnosis, performanceDiagnosis, contentDiagnosis].filter(
    (item): item is ContentAssetAnalysisDiagnosis => Boolean(item)
  );
  const finalVerdict = firstDiagnosisValue(diagnoses, 'finalVerdict');
  const oneSentenceSummary = firstDiagnosisValue(diagnoses, 'oneSentenceSummary');
  const reasoning = firstDiagnosisValue(diagnoses, 'reasoning');
  const nextVersionDirection = firstDiagnosisValue(diagnoses, 'nextVersionDirection');
  const rawProblemStage = firstDiagnosisValue(diagnoses, 'problemStage');
  const goodPoints = mergeDiagnosisLists(diagnoses.map((item) => item.goodPoints));
  const badPoints = mergeDiagnosisLists(diagnoses.map((item) => item.badPoints));
  const liveAcceptanceAttribution = firstLiveAcceptanceAttribution(diagnoses);
  const primaryDecision = currentAiAnalysis.primaryDecision;
  const finalJudgment =
    currentAiAnalysis.finalJudgment
    || formatVerdict(finalVerdict)
    || oneSentenceSummary
    || primaryDecision.label;
  const finalJudgmentDetail = [
    currentAiAnalysis.finalJudgment && currentAiAnalysis.finalJudgment !== primaryDecision.rawValue
      ? currentAiAnalysis.finalJudgment
      : '',
    oneSentenceSummary,
    reasoning,
    nextVersionDirection,
  ].find(Boolean) || '等待 AI 输出完整判断。';
  const coreReasons = currentAiAnalysis.coreReasons.length > 0
    ? currentAiAnalysis.coreReasons
    : mergeDiagnosisLists([goodPoints, badPoints]).slice(0, 5);
  const problemStages = currentAiAnalysis.problemStages.length > 0
    ? currentAiAnalysis.problemStages
    : rawProblemStage
      ? [rawProblemStage]
      : [];
  const nextActions = currentAiAnalysis.nextActions;
  const nextActionEmptyText = '当前 AI 分析未给出明确动作；建议先补齐数据映射或重跑 AI 分析，再制定放量、重剪或暂停策略。';
  const boundary = currentAiAnalysis.diagnosisBoundary;
  const boundaryMessage =
    boundary.message || DIAGNOSIS_BOUNDARY_RENDER_COPY[boundary.mode] || DIAGNOSIS_BOUNDARY_RENDER_COPY.data_content_fusion;
  const boundaryCanOpenData = Boolean(onOpenDataMapping);
  const handleOpenDataMapping = () => {
    onOpenDataMapping?.(boundary.dataMappingAnchor);
  };

  return (
    <section className={styles.detailSection}>
      <AiSectionTitle title="当前 AI 分析" />
      <div className={currentAiStyles.currentAiAnalysisPanel}>
        <ContentUnderstandingSection
          contentUnderstanding={currentAiAnalysis.contentUnderstanding}
          hasAnalysisObject={hasAnalysisObject}
          analysisResultFetching={analysisResultFetching}
          analysisResultError={analysisResultError}
          hookType={hookType}
          suggestedTagsText={suggestedTagsText}
          confidenceText={confidenceText}
        />

        <article className={currentAiStyles.currentAnalysisHero}>
          <div>
            <span>最终判断</span>
            <strong>{primaryDecision.label}</strong>
          </div>
          <p>{finalJudgmentDetail || finalJudgment}</p>
          <div className={currentAiStyles.currentAnalysisMetaRow}>
            {analysisSchemaVersion ? <span>schema {analysisSchemaVersion}</span> : null}
            {diagnosisConfidenceText ? <span>confidence {diagnosisConfidenceText}</span> : null}
            <span>{boundary.label}</span>
          </div>
        </article>

        <div className={styles.detailGrid}>
          <DiagnosisList title="核心原因" items={coreReasons} emptyText="等待 AI 输出核心原因" />
          <DiagnosisList
            title="问题环节"
            items={problemStages.map(stageLabel)}
            emptyText="暂无明确问题环节"
          />
        </div>

        {nextActions.length > 0 ? <ActionLibraryList actions={nextActions} /> : (
          <div className={aiTabStyles.fusionActionList}>
            <strong>下一步动作</strong>
            <p>{nextVersionDirection || nextActionEmptyText}</p>
          </div>
        )}

        <div className={currentAiStyles.diagnosisBoundaryPanel}>
          <div>
            <strong>诊断边界</strong>
            <StatusChip label="模式" value={boundary.mode} />
          </div>
          <p>{boundaryMessage}</p>
          {boundary.dataEvidenceSummary ? <small>{boundary.dataEvidenceSummary}</small> : null}
          <Button
            type="link"
            size="small"
            disabled={!boundaryCanOpenData}
            onClick={handleOpenDataMapping}
          >
            查看数据依据 →
          </Button>
        </div>

        {liveAcceptanceAttribution ? (
          <LiveAcceptanceAttributionBoundary liveAcceptanceAttribution={liveAcceptanceAttribution} />
        ) : null}
      </div>
    </section>
  );
}

const DIAGNOSIS_BOUNDARY_RENDER_COPY: Record<string, string> = {
  data_content_fusion: '已结合千川素材表现和视频内容判断。',
  content_only: '缺投放样本，仅按视频内容、画面、脚本、口播和节奏复盘。',
  data_only: '缺内容理解，仅按千川表现数据复盘。',
  insufficient_data: '数据和内容证据都不足，仅展示可确认线索。',
};

function LiveAcceptanceAttributionBoundary({
  liveAcceptanceAttribution,
}: {
  liveAcceptanceAttribution: NonNullable<ContentAssetAnalysisDiagnosis['liveAcceptanceAttribution']>;
}) {
  return (
    <div className={aiTabStyles.liveAcceptancePanel}>
      <div>
        <strong>直播承接归因边界</strong>
        <StatusChip label="层级" value={liveAcceptanceAttribution.level || 'account_date_environment'} />
      </div>
      <p>
        {liveAcceptanceAttribution.limitation || '直播承接仅代表账号日期承接环境，不作为单素材直接归因。'}
      </p>
      <MetricGrid
        items={[
          ['置信度', liveAcceptanceAttribution.confidence || '--'],
          ['来源', liveAcceptanceAttribution.source || '--'],
        ]}
      />
    </div>
  );
}

function ActionLibraryList({ actions }: { actions: ContentAssetAnalysisNextActionItem[] }) {
  return (
    <div className={aiTabStyles.fusionActionList}>
      <strong>下一步动作</strong>
      <div className={aiTabStyles.actionCardGrid}>
        {actions.map((action, index) => {
          const reason = action.reason || action.detail;
          const meta = [
            action.owner ? `归属：${ownerLabel(action.owner)}` : '',
            action.problemStage ? `环节：${stageLabel(action.problemStage)}` : '',
            action.actionType ? `动作：${actionTypeLabel(action.actionType)}` : '',
            action.priority ? `优先：${action.priority}` : '',
          ].filter(Boolean).join('｜');
          return (
            <article key={`${action.title}-${index}`} className={aiTabStyles.actionCard}>
              <span className={aiTabStyles.actionCardHeader}>{meta}</span>
              <strong>{action.title}</strong>
              <p>{reason || '暂无原因说明'}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function PerformanceSnapshotSection({
  asset,
  performanceSnapshot,
  shortVideoProfileHint,
  enableDailyTrend = false,
}: {
  asset: Asset;
  performanceSnapshot?: ContentAssetPerformanceSnapshot | null;
  shortVideoProfileHint?: ContentAssetShortVideoProfileHint | null;
  enableDailyTrend?: boolean;
}) {
  if (!performanceSnapshot) {
    const hintedMaterialIds = uniqueTextList(shortVideoProfileHint?.qianchuanMaterialIds || []);
    return (
      <section className={styles.detailSection}>
        <h3>投放表现快照</h3>
        {hintedMaterialIds.length > 0 ? (
          <ShortVideoHintMaterialPanel hint={shortVideoProfileHint} />
        ) : (
          <p className={styles.detailInlineNote}>
            暂无千川全域快照；已有 material_id 时先查 active 绑定/刷新任务。
          </p>
        )}
        <div className={styles.detailGrid}>
          <DetailItem label="ROI" value={formatRatio(asset.roi)} />
          <DetailItem label="CTR" value={formatPercent(asset.ctr)} />
          <DetailItem label="CVR" value={formatPercent(asset.cvr)} />
          <DetailItem label="消耗" value={asset.spend == null ? '--' : formatCompactNumber(asset.spend)} />
        </div>
      </section>
    );
  }

  const totals = performanceSnapshot.totals;
  const materials = Array.isArray(performanceSnapshot.materials) ? performanceSnapshot.materials : [];
  const qualityFlags = Array.isArray(performanceSnapshot.qualityFlags) ? performanceSnapshot.qualityFlags : [];

  return (
    <section className={styles.detailSection}>
      <div className={aiTabStyles.performanceSnapshotHeader}>
        <div>
          <span>投放表现快照</span>
          <strong>{deliveryModeLabel(performanceSnapshot.deliveryMode)}</strong>
          <p>
            最新统计日 {performanceSnapshot.latestStatDate || '--'}，按千川素材实例聚合。
          </p>
        </div>
        <div className={aiTabStyles.performanceMetricGrid}>
          <MiniMetric label="素材数" value={formatCompactNumber(totals.materialCount)} />
          <MiniMetric label="商品型" value={formatCompactNumber(totals.productMaterialCount)} />
          <MiniMetric label="直播型" value={formatCompactNumber(totals.liveMaterialCount)} />
        </div>
      </div>
      <p className={styles.detailInlineNote}>
        overall 为主；boost_* 不并入 overall；直播承接按账号日期展示，非单素材归因。
      </p>
      <QualityFlagRow flags={qualityFlags} hasPerformance={performanceSnapshot.hasQianchuanPerformance} />
      <PerformanceMappingPanel materials={materials} shortVideoProfileHint={shortVideoProfileHint} />
      <MetricGrid
        items={[
          ['消耗', formatCurrency(totals.totalCost)],
          ['GMV', formatCurrency(totals.totalGmv)],
          ['净 GMV', formatCurrency(totals.totalNetGmv)],
          ['ROI', formatRatio(totals.payRoi)],
          ['净 ROI', formatRatio(totals.netGmvRoi)],
          ['CTR', formatPercent(totals.ctr)],
          ['CVR', formatPercent(totals.cvr)],
          ['订单', formatCompactNumber(totals.totalOrders)],
          ['净订单', formatCompactNumber(totals.totalNetOrders)],
          ['曝光', formatCompactNumber(totals.totalImpressions)],
          ['点击', formatCompactNumber(totals.totalClicks)],
        ]}
      />
      {materials.length > 0 ? (
        materials.map((material) => (
          <PerformanceMaterialCard
            key={material.materialId}
            assetId={asset.assetId}
            material={material}
            enableDailyTrend={enableDailyTrend}
          />
        ))
      ) : (
        <p className={aiTabStyles.aiHint}>
          暂无 active 素材表现；missing_binding 先补实例绑定。
        </p>
      )}
    </section>
  );
}

export function SourceRecordsSection({ sources }: { sources: ContentAssetSource[] }) {
  return (
    <section className={styles.detailSection}>
      <h3>来源记录</h3>
      <div className={styles.sourceList}>
        {sources.map((source, index) => (
          <article
            key={source.sourceId ?? `${source.sourceKind || 'source'}-${index}`}
            className={styles.sourceItem}
          >
            <strong>{source.sourceKind || '--'}</strong>
            <span>
              {source.feishuSheetName || source.externalPlatform || '--'} {source.feishuRowIndex ? `#${source.feishuRowIndex}` : ''}
            </span>
            {source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer">打开来源</a> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export function AiHint({ children }: { children: string }) {
  return <p className={aiTabStyles.aiHint}>{children}</p>;
}

function ShortVideoHintMaterialPanel({ hint }: { hint?: ContentAssetShortVideoProfileHint | null }) {
  if (!hint) return null;
  const materialIds = uniqueTextList(hint.qianchuanMaterialIds || []);
  const videoIds = uniqueTextList(hint.videoIds || []);
  const shownMaterialIds = materialIds.slice(0, 6);
  const extraCount = materialIds.length - shownMaterialIds.length;
  return (
    <div className={provenanceStyles.mappingProvenancePanel}>
      <div className={provenanceStyles.mappingProvenanceHeader}>
        <strong>挂车短视频回流线索</strong>
        <StatusChip label="匹配" value={hint.matchStatus || 'unknown'} />
      </div>
      <p>
        已识别 {materialIds.length} 个千川素材 ID；尚未命中 active 投放快照时，需要补绑定或刷新千川全域表现。
      </p>
      <div className={provenanceStyles.mappingChipRow}>
        {shownMaterialIds.map((materialId) => <code key={materialId}>{materialId}</code>)}
        {extraCount > 0 ? <code>+{extraCount}</code> : null}
      </div>
      <div className={styles.detailGrid}>
        <MiniMetric label="抖音视频" value={summarizeList(videoIds)} />
        <MiniMetric label="达人" value={hint.creatorName || hint.creatorAccountId || '--'} />
        <MiniMetric label="产品" value={summarizeList(hint.productNames || [])} />
        <MiniMetric label="场景" value={formatHintScene(hint)} />
      </div>
    </div>
  );
}

function PerformanceMappingPanel({
  materials,
  shortVideoProfileHint,
}: {
  materials: ContentAssetPerformanceMaterial[];
  shortVideoProfileHint?: ContentAssetShortVideoProfileHint | null;
}) {
  const hintedMaterialIds = uniqueTextList(shortVideoProfileHint?.qianchuanMaterialIds || []);
  if (materials.length === 0 && hintedMaterialIds.length === 0) return null;
  const shownMaterials = materials.slice(0, 8);
  return (
    <div className={provenanceStyles.mappingProvenancePanel}>
      <div className={provenanceStyles.mappingProvenanceHeader}>
        <strong>千川实例映射</strong>
        {shortVideoProfileHint ? <StatusChip label="短视频明细" value={shortVideoProfileHint.matchStatus} /> : null}
      </div>
      <p>
        material_id 是千川素材实例唯一身份；同一内部资产可绑定多个实例，挂车成交型和直播间引流型按不同 material_id 分开复盘。
      </p>
      {hintedMaterialIds.length > 0 ? (
        <div className={provenanceStyles.mappingChipRow} aria-label="短视频回流素材 ID">
          {hintedMaterialIds.slice(0, 6).map((materialId) => <code key={materialId}>{materialId}</code>)}
          {hintedMaterialIds.length > 6 ? <code>+{hintedMaterialIds.length - 6}</code> : null}
        </div>
      ) : null}
      {shownMaterials.length > 0 ? (
        <div className={provenanceStyles.mappingProvenanceGrid}>
          {shownMaterials.map((material) => (
            <article key={material.materialId}>
              <span>{objectiveLabel(material.objective)}</span>
              <strong>{material.materialId}</strong>
              <small>{sourceTableLabel(material.sourceTable)}</small>
              <small>
                ad_material {material.adMaterialId ? shortIdentity(material.adMaterialId) : '--'}｜
                platform_video {material.platformVideoId ? shortIdentity(material.platformVideoId) : '--'}
              </small>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ScriptBlock({
  title,
  meta,
  text,
  variant,
}: {
  title: string;
  meta: string;
  text: string;
  variant: 'script' | 'srt';
}) {
  return (
    <article className={aiTabStyles.scriptBlock}>
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <pre className={variant === 'srt' ? aiTabStyles.srtText : aiTabStyles.scriptText}>{text}</pre>
    </article>
  );
}

function PerformanceMaterialCard({
  assetId,
  material,
  enableDailyTrend,
}: {
  assetId: string;
  material: ContentAssetPerformanceMaterial;
  enableDailyTrend: boolean;
}) {
  const isLiveObjective = material.objective === 'live_all_domain_shortvideo';
  const title = material.materialVideoName || material.liveRoomName || material.materialId;
  return (
    <article className={aiTabStyles.performanceMaterialCard}>
      <div className={aiTabStyles.performanceMaterialHeader}>
        <div>
          <span>{objectiveLabel(material.objective)}</span>
          <strong>{title}</strong>
          <p>
            {material.materialId}｜{formatDateRange(material.firstStatDate, material.lastStatDate)}｜{material.activeDays} 天
          </p>
          <div className={provenanceStyles.materialProvenanceRow}>
            <span>{sourceTableLabel(material.sourceTable)}</span>
            {material.adMaterialId ? <span>ad_material {shortIdentity(material.adMaterialId)}</span> : null}
            {material.platformVideoId ? <span>platform_video {shortIdentity(material.platformVideoId)}</span> : null}
          </div>
        </div>
        <div className={aiTabStyles.performanceMaterialStatusRow}>
          <StatusChip label="数据" value={material.dataQualityStatus} />
          <StatusChip label="样本" value={material.sampleQualityStatus} />
          <StatusChip label="诊断" value={material.diagnosisStatus} />
        </div>
      </div>
      {isLiveObjective ? <LiveMaterialMetrics material={material} /> : <ProductMaterialMetrics material={material} />}
      {isLiveObjective ? (
        <LiveAcceptanceBlock acceptance={material.liveAcceptance} material={material} />
      ) : null}
      {enableDailyTrend ? <PerformanceDailyTrendPanel assetId={assetId} material={material} /> : null}
    </article>
  );
}

function PerformanceDailyTrendPanel({
  assetId,
  material,
}: {
  assetId: string;
  material: ContentAssetPerformanceMaterial;
}) {
  const [expanded, setExpanded] = useState(false);
  const trendQuery = {
    materialId: material.materialId,
    ...(isKnownQianchuanObjective(material.objective) ? { objective: material.objective } : {}),
  };
  const dailyTrendQuery = useQuery({
    queryKey: contentAssetsQueryKeys.performanceDaily(assetId, trendQuery),
    queryFn: ({ signal }) => fetchContentAssetPerformanceDaily(assetId, trendQuery, { signal }),
    enabled: expanded && Boolean(assetId && material.materialId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const rows = dailyTrendQuery.data?.rows || [];

  return (
    <div className={trendStyles.trendPanel}>
      <div className={trendStyles.trendHeader}>
        <div>
          <strong>素材日趋势</strong>
          <span>
            material_id {material.materialId}，仅按 DWD 日粒度核对素材表现。
          </span>
        </div>
        <Button size="small" loading={dailyTrendQuery.isFetching} onClick={() => setExpanded((current) => !current)}>
          {expanded ? '收起日趋势' : '查看日趋势'}
        </Button>
      </div>
      {expanded ? (
        <div className={trendStyles.trendBody}>
          {dailyTrendQuery.error ? (
            <p className={trendStyles.footnote}>
              日趋势读取失败：{resolveContentAssetRequestError(dailyTrendQuery.error)}
            </p>
          ) : rows.length > 0 ? (
            <DailyTrendTable rows={rows} />
          ) : dailyTrendQuery.isFetching ? (
            <p className={trendStyles.footnote}>正在读取 DWD 日趋势...</p>
          ) : (
            <p className={trendStyles.footnote}>
              暂无日趋势行；检查 DWD 回填、material_id 绑定或 objective 过滤条件。
            </p>
          )}
          <p className={trendStyles.footnote}>
            boost_* 不并入 overall_*；追投字段只解释调控，不参与素材主口径 ROI / CTR / CVR。
          </p>
        </div>
      ) : null}
    </div>
  );
}

function DailyTrendTable({ rows }: { rows: ContentAssetPerformanceDailyRow[] }) {
  return (
    <div className={trendStyles.tableWrap}>
      <table className={trendStyles.table}>
        <thead>
          <tr>
            <th>日期</th>
            <th>消耗</th>
            <th>GMV</th>
            <th>ROI</th>
            <th>CTR</th>
            <th>CVR</th>
            <th>订单</th>
            <th>净 GMV</th>
            <th>boost 消耗</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.materialId}-${row.objective}-${row.statDate}`}>
              <td>{row.statDate}</td>
              <td>{formatCurrency(row.overallCost)}</td>
              <td>{formatCurrency(row.overallGmv)}</td>
              <td>{formatRatio(row.overallPayRoi)}</td>
              <td>{formatPercent(row.overallClickRate)}</td>
              <td>{formatPercent(row.overallConversionRate)}</td>
              <td>{formatCompactNumber(row.overallOrderCount)}</td>
              <td>{formatCurrency(row.netGmv)}</td>
              <td>{formatCurrency(row.boostCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isKnownQianchuanObjective(
  value: string
): value is 'product_all_domain_shortvideo' | 'live_all_domain_shortvideo' {
  return value === 'product_all_domain_shortvideo' || value === 'live_all_domain_shortvideo';
}

function ProductMaterialMetrics({ material }: { material: ContentAssetPerformanceMaterial }) {
  return (
    <MetricGrid
      items={[
        ['ROI', formatRatio(material.payRoi)],
        ['净 ROI', formatRatio(material.netGmvRoi)],
        ['CTR', formatPercent(material.ctr)],
        ['CVR', formatPercent(material.cvr)],
        ['消耗', formatCurrency(material.totalCost)],
        ['GMV', formatCurrency(material.totalGmv)],
        ['净 GMV/结算', formatCurrency(material.totalNetGmv)],
        ['订单', formatCompactNumber(material.totalOrders)],
        ['净订单', formatCompactNumber(material.totalNetOrders)],
        ['退款', formatPercent(material.refundRate1h)],
        ['下单成本', formatCurrency(material.orderCost)],
        ['净单成本', formatCurrency(material.netOrderCost)],
      ]}
    />
  );
}

function LiveMaterialMetrics({ material }: { material: ContentAssetPerformanceMaterial }) {
  return (
    <MetricGrid
      items={[
        ['ROI', formatRatio(material.payRoi)],
        ['CVR', formatPercent(material.cvr)],
        ['CTR', formatPercent(material.ctr)],
        ['消耗', formatCurrency(material.totalCost)],
        ['GMV', formatCurrency(material.totalGmv)],
        ['净 GMV', formatCurrency(material.totalNetGmv)],
        ['净订单', formatCompactNumber(material.totalNetOrders)],
        ['退款', formatPercent(material.refundRate1h)],
        ['播放', formatCompactNumber(material.videoPlayCount)],
        ['完播', formatPercent(material.videoCompletePlayRate)],
        ['5s', formatPercent(material.playRate5s)],
        ['10s', formatPercent(material.playRate10s)],
        ['均看时长', formatSeconds(material.avgWatchDuration)],
        ['承接状态', statusDisplay(material.latestLiveAcceptanceStatus || (material.liveAcceptance ? 'matched' : 'missing_live_acceptance'))],
      ]}
    />
  );
}

function LiveAcceptanceBlock({
  acceptance,
  material,
}: {
  acceptance: ContentAssetLiveAcceptanceSnapshot | null;
  material: ContentAssetPerformanceMaterial;
}) {
  if (!acceptance) {
    return (
      <div className={aiTabStyles.liveAcceptancePanel}>
        <div>
          <strong>直播承接环境</strong>
          <StatusChip
            label="承接"
            value={material.latestLiveAcceptanceStatus || 'missing_live_acceptance'}
          />
        </div>
        <p>缺账号日期 live acceptance，非单素材归因。</p>
      </div>
    );
  }
  return (
    <div className={aiTabStyles.liveAcceptancePanel}>
      <div>
        <strong>直播承接环境</strong>
        <StatusChip label="承接" value={acceptance.acceptanceQualityStatus} />
      </div>
      <p>
        {acceptance.anchorNickname || acceptance.douyinAccountDisplayId}｜{acceptance.statDate}，仅代表账号日期承接环境。
      </p>
      <MetricGrid
        items={[
          ['看播用户', formatCompactNumber(acceptance.liveWatchUserCount)],
          ['商品点击用户', formatCompactNumber(acceptance.liveProductClickUser)],
          ['直播订单', formatCompactNumber(acceptance.liveOrderCount)],
          ['直播 GMV', formatCurrency(acceptance.liveGmv)],
          ['商品点击率', formatPercent(acceptance.productClickRateUser)],
          ['观看成交率', formatPercent(acceptance.watchToPayRateUser)],
          ['点击成交率', formatPercent(acceptance.clickToPayRateUser)],
        ]}
      />
    </div>
  );
}

function QualityFlagRow({ flags, hasPerformance }: { flags: string[]; hasPerformance: boolean }) {
  const resolvedFlags = flags.length > 0 ? flags : [hasPerformance ? 'ok' : 'missing_binding'];
  return (
    <div className={aiTabStyles.qualityFlagRow} aria-label="投放质量状态">
      {resolvedFlags.map((flag) => (
        <StatusChip key={flag} label="状态" value={flag} />
      ))}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <DetailItem
      label={label}
      value={<code className={aiTabStyles.metricValue}>{value || '--'}</code>}
    />
  );
}

function StatusChip({ label, value }: { label: string; value: string | null | undefined }) {
  const normalized = normalizeStatus(value);
  return (
    <span className={`${aiTabStyles.statusChip} ${statusToneClass(normalized)}`}>
      {label}：{statusDisplay(normalized)}
    </span>
  );
}

function MetricGrid({ items }: { items: MetricItem[] }) {
  return (
    <div className={aiTabStyles.performanceMetricGrid}>
      {items.map(([label, value]) => (
        <MiniMetric key={label} label={label} value={value} />
      ))}
    </div>
  );
}

function DiagnosisList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <article className={styles.detailItem}>
      <span>{title}</span>
      <p className={styles.detailNote}>{items.length > 0 ? items.join('；') : emptyText}</p>
    </article>
  );
}

function mergeDiagnosisLists(lists: string[][]): string[] {
  const values: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (item && !values.includes(item)) values.push(item);
      if (values.length >= 8) return values;
    }
  }
  return values;
}

function firstDiagnosisValue(
  diagnoses: ContentAssetAnalysisDiagnosis[],
  key:
    | 'finalVerdict'
    | 'oneSentenceSummary'
    | 'problemStage'
    | 'rootCauseOwner'
    | 'reasoning'
    | 'nextVersionDirection'
): string {
  for (const diagnosis of diagnoses) {
    if (diagnosis[key]) return diagnosis[key];
  }
  return '';
}

function firstLiveAcceptanceAttribution(
  diagnoses: ContentAssetAnalysisDiagnosis[]
): NonNullable<ContentAssetAnalysisDiagnosis['liveAcceptanceAttribution']> | null {
  for (const diagnosis of diagnoses) {
    if (diagnosis.liveAcceptanceAttribution) return diagnosis.liveAcceptanceAttribution;
  }
  return null;
}

function formatCurrency(value: number | null | undefined): string {
  const formatted = formatCompactNumber(value);
  return formatted === '--' ? formatted : `¥${formatted}`;
}

function formatSeconds(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value)}s`;
}

function formatDateRange(start: string | null, end: string | null): string {
  if (start && end && start !== end) return `${start} 至 ${end}`;
  return start || end || '无日期';
}

function uniqueTextList(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  );
}

function summarizeList(values: Array<string | null | undefined>, limit = 2): string {
  const normalized = uniqueTextList(values);
  if (normalized.length === 0) return '--';
  return normalized.slice(0, limit).join(' / ') + (normalized.length > limit ? ` 等 ${normalized.length} 个` : '');
}

function formatHintScene(hint: ContentAssetShortVideoProfileHint): string {
  return summarizeList([hint.contentScene, hint.contentSceneGroup, hint.contentSceneSubtype], 3);
}

function shortIdentity(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function deliveryModeLabel(value: string): string {
  if (value === 'qianchuan_all_domain') return '千川全域';
  return value || '千川全域';
}

function sourceTableLabel(value: string): string {
  if (value.includes('douyin_qianchuan_shortvideo_raw')) return '千川短视频挂车源';
  if (value.includes('douyin_qianchuan_live_video_raw')) return '千川直播引流源';
  return value || '--';
}

function objectiveLabel(value: string): string {
  switch (value) {
    case 'product_all_domain_shortvideo':
      return '商品全域-挂车成交型';
    case 'live_all_domain_shortvideo':
      return '直播全域-直播间引流型';
    case 'unknown':
      return '未识别投放目标';
    default:
      return value || '--';
  }
}

function formatVerdict(value: string): string {
  const labels: Record<string, string> = {
    good: '可扩量',
    needs_iteration: '需迭代',
    bad: '不建议扩量',
    insufficient_data: '证据不足',
  };
  return labels[value] || value;
}

function stageLabel(value: string): string {
  const labels: Record<string, string> = {
    traffic_scale_weak: '曝光规模不足',
    creative_click_weak: '创意点击弱',
    product_conversion_weak: '商品成交弱',
    cost_efficiency_weak: '成本效率弱',
    net_settlement_weak: '结算偏弱',
    refund_risk_high: '退款风险高',
    video_hook_weak: '视频钩子/留存弱',
    live_entry_intent_weak: '进直播间意图弱',
    missing_live_acceptance: '缺直播承接数据',
    live_product_offer_weak: '直播商品点击弱',
    live_room_acceptance_weak: '直播间承接弱',
    live_refund_risk_high: '直播退款风险高',
    pricing_trust_weak: '价格/信任承接弱',
    scale_candidate: '可扩量候选',
    live_scale_candidate: '直播可扩量候选',
    insufficient_data: '样本不足',
    selling_point_timing: '卖点出现时机',
    conversion_guidance: '转化引导',
    creative_rhythm: '内容节奏',
    trust_building: '信任建立',
    hook_opening: '开头钩子',
    content_structure: '内容结构',
    content_asset_reuse: '复用资产',
    unknown: '未知',
  };
  return labels[value] || value || '--';
}

function actionTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    scale: '放量',
    observe: '观察',
    recut: '重剪',
    pause: '暂停',
    script_rewrite: '改脚本',
    hook_recut: '重剪开头',
    selling_point_reorder: '重排卖点',
    conversion_guidance: '强化转化',
  };
  return labels[value] || value;
}

function ownerLabel(value: string): string {
  const labels: Record<string, string> = {
    creative: '内容创意',
    media_buying: '投放/定向',
    product_offer: '商品/利益点',
    fulfillment_or_after_sales: '履约/售后',
    product_or_after_sales: '商品/售后',
    creative_or_targeting: '创意/定向',
    data_linkage: '数据链路',
    live_room_offer: '直播间货盘',
    live_room: '直播间承接',
    data_sample: '样本不足',
    growth: '增长扩量',
    unknown: '未知',
  };
  return labels[value] || value || '--';
}

function statusDisplay(value: string | null | undefined): string {
  const normalized = normalizeStatus(value);
  if (!normalized) return '--';
  const labels: Record<string, string> = {
    ok: '正常',
    healthy: '正常',
    matched: '已匹配',
    unique: '唯一命中',
    ambiguous: '多条候选',
    missing_binding: '缺素材绑定',
    duplicate_binding: '重复绑定',
    duplicate_material_date: '同素材同日重复',
    insufficient_sample: '样本不足',
    missing_live_acceptance: '缺直播承接',
    data_only: '仅数据',
    content_only: '仅内容',
    data_content_fusion: '数据内容融合',
    fusion: '数据内容融合',
    insufficient_data: '证据不足',
    warning: '需关注',
    error: '异常',
    failed: '失败',
    unknown: '未知',
  };
  return labels[normalized] || normalized;
}

function normalizeStatus(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function statusToneClass(value: string): string {
  if (!value || value === 'ok' || value === 'healthy' || value === 'matched') {
    return '';
  }
  if (value.includes('missing') || value.includes('duplicate') || value.includes('insufficient') || value.includes('warning') || value.includes('ambiguous')) {
    return aiTabStyles.statusChipWarning;
  }
  if (value.includes('error') || value.includes('failed')) {
    return aiTabStyles.statusChipDanger;
  }
  return aiTabStyles.statusChipInfo;
}

function resolveAnalysisResultStatus(
  hasAnalysisObject: boolean,
  isFetching: boolean,
  error: unknown
): string {
  if (!hasAnalysisObject) return '未生成 JSON';
  if (isFetching) return '读取中';
  if (error) return '读取失败';
  return '已读取';
}

function readMetadataString(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function readAnalysisProfile(metadata: unknown): string {
  const profile = readMetadataString(metadata, 'analysis_profile');
  if (profile) return profile;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const requestSettings = (metadata as Record<string, unknown>).request_settings;
  return readMetadataString(requestSettings, 'analysis_profile');
}

function analysisProfileLabel(profile: string): string {
  const labels: Record<string, string> = {
    preview_fast: '快速',
    raw_deep: '原片深度',
    action_detail: '动作细节',
  };
  return labels[profile] || '分析';
}

function copyText(value: string, successMessage: string) {
  if (!value) return;
  if (!navigator.clipboard?.writeText) {
    message.error('浏览器不支持复制，请手动选择');
    return;
  }
  void navigator.clipboard.writeText(value).then(
    () => message.success(successMessage),
    () => message.error('复制失败，请手动选择')
  );
}
