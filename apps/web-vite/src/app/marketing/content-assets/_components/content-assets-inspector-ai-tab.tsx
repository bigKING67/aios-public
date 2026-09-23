import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  ContentAssetAnalysisProfile,
  ContentAssetAnalysisSource,
  ContentAssetDetailResponse,
  ContentAssetObject,
  ContentAssetProcessingJob,
  ContentAssetSource,
} from '../_lib/content-assets-types';
import {
  resolveAnalysisNextActions,
  resolveAnalysisNumberField,
  resolveAnalysisTextField,
  resolveCurrentAiAnalysis,
  resolveContentDiagnosis,
  resolveContentAssetAnalysisPayload,
  resolveFusionDiagnosis,
  resolvePerformanceDiagnosis,
} from '../_lib/content-assets-analysis-result';
import { fetchContentAssetAnalysisResult } from '../_lib/content-assets-api';
import { resolveContentAssetTagsText } from '../_lib/content-assets-display';
import { contentAssetsQueryKeys } from '../_lib/content-assets-query-keys';
import { findActiveProcessingJob } from '../_lib/content-assets-processing-jobs';
import styles from '../content-assets.module.css';
import {
  AiHint,
  AiSummaryPanel,
  AnalysisSourceSection,
  DataContentDiagnosisSection,
  PerformanceSnapshotSection,
  SourceRecordsSection,
  TranscriptSection,
} from './content-assets-inspector-ai-sections';

export function AiTab({
  mode = 'all',
  detail,
  canWrite,
  actionLoading,
  submittingProfile,
  processingJobs,
  onCreateAnalysisJob,
  transcriptActionLoading,
  onCreateTranscriptJob,
  showPerformanceSnapshot,
  enableDailyTrend = false,
  onOpenDataMapping,
}: {
  mode?: 'all' | 'analysis' | 'script';
  detail: ContentAssetDetailResponse | null;
  canWrite: boolean;
  actionLoading: boolean;
  submittingProfile?: ContentAssetAnalysisProfile | null;
  processingJobs?: ContentAssetProcessingJob[];
  onCreateAnalysisJob: (
    source: ContentAssetAnalysisSource,
    force: boolean,
    profile?: ContentAssetAnalysisProfile
  ) => void;
  transcriptActionLoading: boolean;
  onCreateTranscriptJob: (force: boolean) => void;
  showPerformanceSnapshot?: boolean;
  enableDailyTrend?: boolean;
  onOpenDataMapping?: (anchor?: string) => void;
}) {
  const asset = detail?.asset;
  const hasAnalysisObject = Boolean(
    detail?.objects?.some((object) => object?.objectRole === 'analysis' && object.status === 'active')
  );
  const assetId = asset?.assetId || null;
  const analysisObjects = useMemo(
    () => resolveAnalysisObjects(detail?.objects || []),
    [detail?.objects]
  );
  const [selectedAnalysisObjectKey, setSelectedAnalysisObjectKey] = useState<string | null>(null);
  const selectedAnalysisObject = selectedAnalysisObjectKey
    ? analysisObjects.find((object) => object.objectKey === selectedAnalysisObjectKey) || null
    : null;
  const analysisResultObjectKey = selectedAnalysisObject?.objectKey || null;
  const {
    data: analysisResult,
    error: analysisResultError,
    isFetching: analysisResultFetching,
  } = useQuery({
    queryKey: contentAssetsQueryKeys.analysisResult(assetId, analysisResultObjectKey),
    queryFn: ({ signal }) => fetchContentAssetAnalysisResult(assetId || '', analysisResultObjectKey, { signal }),
    enabled: Boolean(assetId && hasAnalysisObject),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    setSelectedAnalysisObjectKey(null);
  }, [assetId]);

  useEffect(() => {
    if (!selectedAnalysisObjectKey) return;
    if (analysisObjects.some((object) => object.objectKey === selectedAnalysisObjectKey)) return;
    setSelectedAnalysisObjectKey(null);
  }, [analysisObjects, selectedAnalysisObjectKey]);

  if (!asset) return null;

  const hasExistingAnalysis = Boolean(asset.aiSummary || asset.aiAnalyzedAt);
  const transcript = detail?.transcript || null;
  const hasTranscript = Boolean(transcript?.scriptText || transcript?.srtText);
  const canCreateTranscript =
    canWrite && !asset.externalOnly && Boolean(asset.rawObjectKey || asset.previewObjectKey);
  const canAnalyzePreview = canWrite && !asset.externalOnly && Boolean(asset.previewObjectKey);
  const canAnalyzeRaw = canWrite && !asset.externalOnly && Boolean(asset.rawObjectKey);
  const assetTags = normalizeStringList(asset.tags);
  const aiSuggestedTags = normalizeStringList(asset.aiSuggestedTags);
  const sources = normalizeSources(detail?.sources);
  const displayAsset = {
    ...asset,
    tags: assetTags,
    aiSuggestedTags,
  };
  const sourceLabel = analysisSourceLabel(asset.aiAnalysisSource);
  const suggestedTagsText = resolveContentAssetTagsText(displayAsset, 4);
  const analysisPayload = resolveContentAssetAnalysisPayload(analysisResult?.document);
  const activeTranscriptJob = findActiveProcessingJob(processingJobs || [], 'transcript');
  const hookType = resolveAnalysisTextField(analysisPayload, ['hook_type', 'hookType']);
  const fusionDiagnosis = resolveFusionDiagnosis(analysisPayload);
  const performanceDiagnosis = resolvePerformanceDiagnosis(analysisPayload);
  const contentDiagnosis = resolveContentDiagnosis(analysisPayload);
  const analysisNextActions = resolveAnalysisNextActions(analysisPayload);
  const diagnosisMode = resolveAnalysisTextField(analysisPayload, ['diagnosis_mode', 'diagnosisMode']);
  const analysisSchemaVersion = resolveAnalysisTextField(analysisPayload, [
    'analysis_schema_version',
    'analysisSchemaVersion',
  ]);
  const diagnosisConfidenceText =
    resolveAnalysisNumberField(analysisPayload, ['diagnosis_confidence', 'diagnosisConfidence', 'confidence'])
    || resolveAnalysisTextField(analysisPayload, ['diagnosis_confidence', 'diagnosisConfidence', 'confidence']);
  const confidenceText = resolveAnalysisNumberField(analysisPayload, ['confidence']);
  const currentAiAnalysis = resolveCurrentAiAnalysis(analysisPayload, {
    fusionDiagnosis,
    performanceDiagnosis,
    contentDiagnosis,
    nextActions: analysisNextActions,
    diagnosisMode,
  });
  const analysisHint = resolveAnalysisHint({
    externalOnly: asset.externalOnly,
    hasPreview: Boolean(asset.previewObjectKey),
    hasRaw: Boolean(asset.rawObjectKey),
  });
  const showAnalysis = mode === 'all' || mode === 'analysis';
  const showScript = mode === 'all' || mode === 'script';
  const showPerformance = showPerformanceSnapshot ?? mode === 'all';
  const showSources = mode === 'all';
  const showFullSummary = mode === 'all' && showAnalysis;

  return (
    <div className={styles.detailStack}>
      {showAnalysis ? (
        <AnalysisSourceSection
          asset={asset}
          sourceLabel={sourceLabel}
          hasAnalysisObject={hasAnalysisObject}
          analysisResultFetching={analysisResultFetching}
          analysisResultError={analysisResultError}
          aiSuggestedTags={aiSuggestedTags}
          canAnalyzePreview={canAnalyzePreview}
          canAnalyzeRaw={canAnalyzeRaw}
          actionLoading={actionLoading}
          submittingProfile={submittingProfile ?? null}
          processingJobs={processingJobs || []}
          hasExistingAnalysis={hasExistingAnalysis}
          analysisObjects={analysisObjects}
          selectedAnalysisObjectKey={analysisResult?.objectKey || analysisResultObjectKey}
          onSelectAnalysisObject={setSelectedAnalysisObjectKey}
          onCreateAnalysisJob={onCreateAnalysisJob}
        />
      ) : null}
      {showFullSummary ? <AiSummaryPanel asset={asset} /> : null}
      {showAnalysis ? (
        <DataContentDiagnosisSection
          currentAiAnalysis={currentAiAnalysis}
          fusionDiagnosis={fusionDiagnosis}
          performanceDiagnosis={performanceDiagnosis}
          contentDiagnosis={contentDiagnosis}
          analysisSchemaVersion={analysisSchemaVersion}
          diagnosisConfidenceText={diagnosisConfidenceText}
          hasAnalysisObject={hasAnalysisObject}
          analysisResultFetching={analysisResultFetching}
          analysisResultError={analysisResultError}
          hookType={hookType}
          suggestedTagsText={suggestedTagsText}
          confidenceText={confidenceText}
          onOpenDataMapping={onOpenDataMapping}
        />
      ) : null}
      {showAnalysis ? <AiHint>{analysisHint}</AiHint> : null}
      {showScript ? (
        <TranscriptSection
          asset={asset}
          transcript={transcript}
          hasTranscript={hasTranscript}
          canCreateTranscript={canCreateTranscript}
          transcriptActionLoading={transcriptActionLoading}
          processingJob={activeTranscriptJob}
          transcriptSourceLabel={analysisSourceLabel(asset.transcriptSource)}
          onCreateTranscriptJob={onCreateTranscriptJob}
        />
      ) : null}
      {showPerformance ? (
        <PerformanceSnapshotSection
          asset={asset}
          performanceSnapshot={detail?.performanceSnapshot}
          shortVideoProfileHint={detail?.shortVideoProfileHint}
          enableDailyTrend={enableDailyTrend}
        />
      ) : null}
      {showSources ? <SourceRecordsSection sources={sources} /> : null}
    </div>
  );
}

function resolveAnalysisObjects(objects: ContentAssetObject[]): ContentAssetObject[] {
  return objects
    .filter((object) => object.objectRole === 'analysis' && object.status === 'active')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSources(value: unknown): ContentAssetSource[] {
  if (!Array.isArray(value)) return [];
  return value.filter((source): source is ContentAssetSource => {
    return Boolean(source) && typeof source === 'object';
  });
}

function analysisSourceLabel(source: string | null): string {
  switch (source) {
    case 'preview':
      return '快速分析 · 预览视频';
    case 'raw':
      return '原片完整分析 · 原片';
    case 'auto':
      return '自动分析';
    default:
      return '待分析';
  }
}

function resolveAnalysisHint({
  externalOnly,
  hasPreview,
  hasRaw,
}: {
  externalOnly: boolean;
  hasPreview: boolean;
  hasRaw: boolean;
}): string {
  if (externalOnly) {
    return '素材未上传到 TOS，无法视频分析。';
  }
  if (hasPreview) {
    return '默认用预览视频快速分析；需要更完整画面时可触发原片分析。';
  }
  if (hasRaw) {
    return '预览视频未生成，可等待队列完成，或直接用原片分析。';
  }
  return '当前缺少可分析视频对象。';
}
