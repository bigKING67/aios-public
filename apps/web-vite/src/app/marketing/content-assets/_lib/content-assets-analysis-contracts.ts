export type ContentAssetAnalysisRecord = Record<string, unknown>;

export interface ContentAssetAnalysisTimelineItem {
  startTime: string;
  endTime: string;
  visual: string;
  audioOrText: string;
  purpose: string;
  qualitySignal: string;
}

export interface ContentAssetAnalysisPlatformFitItem {
  key: string;
  label: string;
  text: string;
}

export interface ContentAssetAnalysisDiagnosis {
  diagnosisMode: string;
  finalVerdict: string;
  oneSentenceSummary: string;
  problemStage: string;
  rootCauseOwner: string;
  reasoning: string;
  nextVersionDirection: string;
  goodPoints: string[];
  badPoints: string[];
  metricEvidence: string[];
  contentEvidence: string[];
  liveAcceptanceAttribution: ContentAssetAnalysisLiveAcceptanceAttribution | null;
  contractValidation: ContentAssetFusionContractValidation | null;
}

export type ContentAssetContentUnderstandingKey =
  | 'what_it_says'
  | 'content_structure'
  | 'core_selling_points'
  | 'visual_rhythm'
  | 'speech_and_emotion'
  | 'user_comprehension_barrier'
  | 'reusable_content_assets';

export interface ContentAssetContentUnderstandingItem {
  key: ContentAssetContentUnderstandingKey;
  label: string;
  text: string;
  emptyText: string;
}

export interface ContentAssetContentUnderstanding {
  items: ContentAssetContentUnderstandingItem[];
  source: 'structured' | 'legacy' | 'empty';
}

export type ContentAssetPrimaryDecisionKey = 'scale' | 'observe' | 'recut' | 'pause' | 'insufficient';

export interface ContentAssetPrimaryDecision {
  key: ContentAssetPrimaryDecisionKey;
  label: string;
  rawValue: string;
}

export interface ContentAssetDiagnosisBoundary {
  mode: string;
  label: string;
  message: string;
  dataEvidenceSummary: string;
  dataMappingAnchor: string;
}

export interface ContentAssetCurrentAiAnalysis {
  contentUnderstanding: ContentAssetContentUnderstanding;
  primaryDecision: ContentAssetPrimaryDecision;
  finalJudgment: string;
  coreReasons: string[];
  problemStages: string[];
  nextActions: ContentAssetAnalysisNextActionItem[];
  diagnosisBoundary: ContentAssetDiagnosisBoundary;
}

export interface ContentAssetAnalysisLiveAcceptanceAttribution {
  level: string;
  confidence: string;
  source: string;
  limitation: string;
}

export interface ContentAssetAnalysisScoreItem {
  key: string;
  label: string;
  value: string;
}

export interface ContentAssetAnalysisNextActionItem {
  title: string;
  detail: string;
  owner: string;
  priority: string;
  problemStage: string;
  metricTarget: string;
  actionType: string;
  expectedMetricLift: string;
  reason: string;
  evidenceRefs: string[];
}

export interface ContentAssetFusionContractValidation {
  status: string;
  errors: string[];
  warnings: string[];
}

export interface ContentAssetAnalysisEvidenceLedgerItem {
  id: string;
  metric: string;
  value: string;
  benchmark: string;
  source: string;
  judgment: string;
  meaning: string;
}
