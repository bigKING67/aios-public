export type IndustryMaterialTab = 'douyin_live_lead_short_video' | 'douyin_goods_short_video' | 'xhs_note';
export type IndustryMaterialDouyinTab = Exclude<IndustryMaterialTab, 'xhs_note'>;

export type IndustryMaterialMetricValue = number | string | null | undefined;

export type IndustryMaterialBrandResolutionStatus = 'recognized' | 'ambiguous' | 'unknown';
export type IndustryMaterialBrandResolutionSource =
  | 'manual'
  | 'title'
  | 'metadata'
  | 'visual'
  | 'transcript'
  | 'multimodal';

export interface IndustryMaterialBrandResolutionEvidenceItem {
  source: string;
  kind: string;
  text: string;
  timeRange: string;
}

export interface IndustryMaterialBrandResolutionEvidence {
  evidence: IndustryMaterialBrandResolutionEvidenceItem[];
  alternatives: string[];
}

export interface IndustryMaterialRow {
  id: string | number | null;
  recordId: string | number | null;
  statMonth: string | null;
  month?: string | null;
  brand?: string | null;
  brandName: string | null;
  brandResolutionStatus?: IndustryMaterialBrandResolutionStatus | null;
  brandResolutionSource?: IndustryMaterialBrandResolutionSource | null;
  brandResolutionConfidence?: number | null;
  brandResolutionEvidence?: IndustryMaterialBrandResolutionEvidence | null;
  videoType?: string | null;
  videoTypeName?: string | null;
  qianchuanScene?: string | null;
  qianchuanSceneName?: string | null;
  rank?: IndustryMaterialMetricValue;
  product?: string | null;
  productName?: string | null;
  title?: string | null;
  videoTitle?: string | null;
  audience?: string | null;
  sellingPoint?: string | null;
  publishTime?: string | null;
  assetId: string | number | null;
  rawExposureCount?: string | null;
  exposureRange?: string | null;
  exposure: IndustryMaterialMetricValue;
  completionRate: IndustryMaterialMetricValue;
  ctr: IndustryMaterialMetricValue;
  cvr: IndustryMaterialMetricValue;
  play3sRate: IndustryMaterialMetricValue;
  play5sRate: IndustryMaterialMetricValue;
  interactionRate: IndustryMaterialMetricValue;
  pvr: IndustryMaterialMetricValue;
}

export interface IndustryMaterialSummary {
  totalCount: number | null;
  brandCount: number | null;
  archivedCount: number | null;
  unarchivedCount: number | null;
  totalExposure: number | null;
  avgCompletionRate: number | null;
  avgCtr: number | null;
  avgCvr: number | null;
  avgPlay3sRate: number | null;
  avgPlay5sRate: number | null;
  avgInteractionRate: number | null;
  avgPvr: number | null;
  updatedAt: string | null;
}

export interface IndustryMaterialEmptyState {
  title: string | null;
  description: string | null;
}

export interface IndustryMaterialBrandOption {
  key: string;
  label: string;
  materialCount: number | null;
  linkedAssetCount: number | null;
  analyzedAssetCount: number | null;
  structuredVideoUnderstandingAssetCount: number | null;
}

export interface IndustryMaterialSelectedBrand {
  key: string;
  label: string;
}

export interface IndustryMaterialBrandInsightCoverage {
  totalMaterials: number | null;
  linkedAssets: number | null;
  analyzedAssets: number | null;
  anyAiContentAssets: number | null;
  structuredVideoUnderstandingAssets: number | null;
  analysisArtifactAssets: number | null;
  missingAnalysis: number | null;
  missingStructuredVideoUnderstanding: number | null;
  queuedStructuredVideoUnderstanding: number | null;
  runningStructuredVideoUnderstanding: number | null;
  structuredVideoUnderstandingTableAvailable: boolean;
  structuredVideoUnderstandingReady: boolean;
  rowsWithPerformance: number | null;
}

export interface IndustryMaterialBrandInsightTerm {
  term: string;
  weight: number | null;
  sourceCount: number | null;
  evidenceAssetIds: string[];
}

export type IndustryMaterialBrandContentThemeGroup = 'topic' | 'expression';
export type IndustryMaterialBrandContentThemePerformanceBand = 'high' | 'mid' | 'low';

export interface IndustryMaterialBrandContentThemeTerm {
  term: string;
  group: IndustryMaterialBrandContentThemeGroup;
  themeScore: number;
  semanticScore: number;
  coverageScore: number;
  performanceScore: number;
  performanceBand: IndustryMaterialBrandContentThemePerformanceBand;
  sourceCount: number;
  evidenceAssetIds: string[];
}

export interface IndustryMaterialBrandContentThemeSummary {
  eligibleMaterials: number;
  topicCount: number;
  expressionCount: number;
}

export interface IndustryMaterialBrandInsightStrategyCard {
  key: string;
  title: string;
  value: string;
  helper: string;
  evidenceCount: number | null;
}

export interface IndustryMaterialBrandInsightProfileMetric {
  key: string;
  label: string;
  role: string;
}

export interface IndustryMaterialBrandInsightAnalysisProfile {
  key: string;
  title: string;
  primaryQuestion: string;
  decisionLens: string;
  metricPriority: IndustryMaterialBrandInsightProfileMetric[];
  videoContentFocus: string[];
  forbiddenConclusions: string[];
}

export type IndustryMaterialFusionScoreBasis = 'industry_month_type_relative';
export type IndustryMaterialFusionDiagnosisMode =
  | 'data_content_fusion'
  | 'data_only'
  | 'content_only'
  | 'insufficient_data';
export type IndustryMaterialFusionConfidence = 'high' | 'medium' | 'low' | 'insufficient';
export type IndustryMaterialFusionAlignment =
  | 'reinforced'
  | 'content_leads'
  | 'performance_leads'
  | 'mixed'
  | 'data_only'
  | 'content_only'
  | 'insufficient';
export type IndustryMaterialFusionMetricBand = 'high' | 'mid' | 'low' | 'missing';
export type IndustryMaterialFusionContentLevel = 'strong' | 'medium' | 'weak' | 'none' | 'observed' | 'unknown';
export type IndustryMaterialFusionContentEvidenceTier =
  | 'structured_video_understanding'
  | 'legacy_ai_summary'
  | 'none';

export interface IndustryMaterialFusionSummary {
  scoreBasis: IndustryMaterialFusionScoreBasis;
  benchmarkLabel: string;
  benchmarkSampleSize: number | null;
  scoredMaterials: number | null;
  dataContentFusionMaterials: number | null;
  structuredVideoMaterials: number | null;
  legacyContentMaterials: number | null;
  highConfidenceMaterials: number | null;
  reinforcedMaterials: number | null;
  averageScore: number | null;
  methodNote: string;
}

export interface IndustryMaterialFusionMetricSignal {
  key: string;
  label: string;
  value: number | null;
  band: IndustryMaterialFusionMetricBand;
}

export interface IndustryMaterialFusionContentSignal {
  key: string;
  label: string;
  value: string;
  level: IndustryMaterialFusionContentLevel;
}

export interface IndustryMaterialFusionDiagnosis {
  scoreBasis: IndustryMaterialFusionScoreBasis;
  benchmarkLabel: string;
  benchmarkSampleSize: number | null;
  score: number | null;
  metricScore: number | null;
  contentScore: number | null;
  diagnosisMode: IndustryMaterialFusionDiagnosisMode;
  contentEvidenceTier: IndustryMaterialFusionContentEvidenceTier;
  confidence: IndustryMaterialFusionConfidence;
  alignment: IndustryMaterialFusionAlignment;
  headline: string;
  diagnosis: string;
  nextStep: string;
  contentPattern: string;
  metricSignals: IndustryMaterialFusionMetricSignal[];
  contentSignals: IndustryMaterialFusionContentSignal[];
}

export interface IndustryMaterialBrandInsightEvidenceMaterial {
  assetId: string | null;
  title: string;
  rank: number | null;
  exposure: IndustryMaterialMetricValue;
  completionRate: number | null;
  ctr: number | null;
  cvr: number | null;
  play3sRate: number | null;
  play5sRate: number | null;
  interactionRate: number | null;
  pvr: number | null;
  summary: string;
  reason: string;
  fusionDiagnosis: IndustryMaterialFusionDiagnosis | null;
}

export interface IndustryMaterialBrandInsightNextAction {
  title: string;
  detail: string;
  owner: string;
  priority: string;
  actionType: string;
  metricTarget: string;
  evidenceCount: number | null;
}

export interface IndustryMaterialBrandInsightBoundary {
  mode: 'industry_visible_metrics_content_fusion';
  visibleSignals: string[];
  unavailableSignals: string[];
  conclusionPolicy: string;
}

export interface IndustryMaterialBrandInsight {
  brand: IndustryMaterialSelectedBrand;
  tab: IndustryMaterialTab;
  month: string | null;
  objective: string;
  coverage: IndustryMaterialBrandInsightCoverage;
  fusionSummary: IndustryMaterialFusionSummary | null;
  analysisProfile: IndustryMaterialBrandInsightAnalysisProfile;
  analysisBoundary: IndustryMaterialBrandInsightBoundary;
  contentThemeSummary: IndustryMaterialBrandContentThemeSummary;
  contentThemeTerms: IndustryMaterialBrandContentThemeTerm[];
  wordCloudTerms: IndustryMaterialBrandInsightTerm[];
  strategyCards: IndustryMaterialBrandInsightStrategyCard[];
  evidenceMaterials: IndustryMaterialBrandInsightEvidenceMaterial[];
  nextActions: IndustryMaterialBrandInsightNextAction[];
  gaps: string[];
}

export interface IndustryMaterialBrandAiBackfillPayload {
  tab: IndustryMaterialDouyinTab;
  month: string;
  brand: string;
  source: 'preview' | 'raw' | 'auto';
  profile: 'preview_fast' | 'raw_deep' | 'action_detail';
  limit: number;
}

export interface IndustryMaterialBrandAiBackfillResponse {
  queuedJobs: number | null;
  queuedCacheHydrationJobs: number | null;
  queuedModelAnalysisJobs: number | null;
  existingAnyAiAssets: number | null;
  existingAiArtifactAssets: number | null;
  structuredStorageReady: boolean;
  skippedExisting: number | null;
  skippedReady: number | null;
  skippedExistingJobs: number | null;
  skippedRunning: number | null;
  skippedNoInput: number | null;
  eligibleAssets: number | null;
  linkedAssets: number | null;
  missingAnalysis: number | null;
  remainingMissingAfterClick: number | null;
  limit: number | null;
  limitReached: boolean;
  workerTrigger: IndustryMaterialBrandAiBackfillWorkerTrigger;
  message: string | null;
}

export interface IndustryMaterialBrandAiBackfillWorkerTrigger {
  status: 'created' | 'failed' | 'not_requested';
  queuedJobs: number;
  immediateLimit: number;
  flowRunId: string | null;
  flowRunName: string | null;
  fallback: 'scheduled';
  message: string;
}

export interface IndustryMaterialResponse {
  tab: IndustryMaterialTab;
  month: string | null;
  availableMonths: string[];
  summary: IndustryMaterialSummary | null;
  rows: IndustryMaterialRow[];
  brandOptions: IndustryMaterialBrandOption[];
  selectedBrand: IndustryMaterialSelectedBrand | null;
  brandInsight: IndustryMaterialBrandInsight | null;
  emptyState: IndustryMaterialEmptyState | null;
}
