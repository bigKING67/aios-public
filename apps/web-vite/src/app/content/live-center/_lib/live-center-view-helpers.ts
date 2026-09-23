import type { LineChartData } from '@/components/organisms/line-chart';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { formatBusinessClockMinute, formatInteger } from './live-center-formatters';
import {
  isLiveCenterRecordingSegmentPlayable,
  isLiveCenterRecordingSegmentVisibleForReview,
} from './live-center-recording-segment-helpers';
import type {
  LiveCenterAnalysisJob,
  LiveCenterJsonValue,
  LiveCenterMinuteMetric,
  LiveCenterRecording,
  LiveCenterRecordingSegment,
  LiveCenterSession,
} from './live-center-types';

export * from './live-center-recording-view-helpers';
const ACTIVE_ANALYSIS_STATUSES = new Set(['pending', 'queued', 'running', 'processing']);
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const SUCCESSFUL_ANALYSIS_STATUSES = new Set(['succeeded', 'completed', 'complete', 'success']);
const ANALYSIS_FIELD_LABELS: Record<string, string> = {
  analysisProfile: 'Profile',
  analysis_profile: 'Profile',
  actionPlan: '行动计划',
  action_plan: '行动计划',
  asrTranscripts: 'ASR 转写',
  asr_transcripts: 'ASR 转写',
  completionTokens: 'completion tokens',
  completion_tokens: 'completion tokens',
  confidence: '置信度',
  confidenceScore: '置信度',
  confidence_score: '置信度',
  conversionDiagnosis: '转化诊断',
  conversion_diagnosis: '转化诊断',
  executiveReview: '经营结论',
  executive_review: '经营结论',
  derivedInputs: '衍生输入',
  derived_inputs: '衍生输入',
  generatedAt: '生成时间',
  generated_at: '生成时间',
  inputTokens: 'input tokens',
  input_tokens: 'input tokens',
  limitations: '限制',
  missingEvidence: '缺失证据',
  missing_evidence: '缺失证据',
  model: '模型',
  promptTokens: 'prompt tokens',
  prompt_tokens: 'prompt tokens',
  promptVersion: 'Prompt',
  prompt_version: 'Prompt',
  provider: 'Provider',
  responseId: 'Response ID',
  response_id: 'Response ID',
  riskFlags: '风险标记',
  risk_flags: '风险标记',
  risks: '风险',
  score: '分数',
  scriptAnalysis: '话术分析',
  script_analysis: '话术分析',
  scriptReview: '话术复盘',
  script_review: '话术复盘',
  segmentCount: '录屏段数',
  segment_count: '录屏段数',
  speechScript: '话术脚本',
  speech_script: '话术脚本',
  strengths: '优势',
  totalTokens: 'total tokens',
  total_tokens: 'total tokens',
};
const HIDDEN_ANALYSIS_FIELD_KEY_PARTS = [
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'headers',
  'password',
  'secret',
  'signature',
  'signedurl',
  'signed_url',
  'token',
  'uploadurl',
  'upload_url',
  'url',
] as const;
const URL_LIKE_TEXT_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const ANALYSIS_BUSINESS_DATETIME_PATTERN =
  /^\s*(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:\s*(?:Z|[+-]\d{2}(?::?\d{2})?))?\s*$/;
const MINUTE_OFFSET_RANGE_PATTERN =
  /(?:minute\s*offset|minuteOffset|minute_offset|分钟偏移)?\s*(\d+(?:\.\d+)?)\s*(?:-|–|—|~|至|到)\s*(\d+(?:\.\d+)?)\s*(?:分钟|min|m)?/i;
const ORDINAL_MINUTE_RANGE_PATTERN =
  /第\s*(\d+(?:\.\d+)?)\s*(?:-|–|—|~|至|到)?\s*(\d+(?:\.\d+)?)?\s*分钟/;
const OFFSET_CLOCK_RANGE_PATTERN =
  /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:-|–|—|~|至|到)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\b/;
const ANALYSIS_RECORDING_LABEL_PATTERN = /录屏\s*#?\s*(\d+)(?:\s*\/\s*slice\s*[:#-]?\s*\d+)?/gi;
const ANALYSIS_SEGMENT_LABEL_PATTERN = /\bsegment\s*[:#-]?\s*(\d+)(?:\s*\/\s*slice\s*[:#-]?\s*\d+)?\b/gi;
const ANALYSIS_SLICE_LABEL_PATTERN = /(?:\s*\/\s*)?\bslice\s*[:#-]?\s*\d+\b/gi;

export function buildMinuteOrderLineChartData(metrics: LiveCenterMinuteMetric[]): LineChartData {
  const sortedMetrics = [...metrics]
    .filter((metric) => typeof metric.orderCount === 'number' && Number.isFinite(metric.orderCount))
    .sort((left, right) => (left.minuteOffset ?? 0) - (right.minuteOffset ?? 0));

  return {
    series: [
      {
        data: sortedMetrics.map((metric) => metric.orderCount ?? 0),
        name: '分钟订单数',
      },
    ],
    xAxis: sortedMetrics.map((metric) => formatMinuteMetricLabel(metric)),
  };
}

export function hasActiveAnalysis(analyses: LiveCenterAnalysisJob[]): boolean {
  return analyses.some((analysis) => isActiveAnalysisStatus(analysis.status));
}

export function isActiveAnalysisStatus(status?: string | null): boolean {
  const normalized = status?.trim().toLowerCase();
  return normalized ? ACTIVE_ANALYSIS_STATUSES.has(normalized) : false;
}

export function isSuccessfulAnalysisStatus(status?: string | null): boolean {
  const normalized = status?.trim().toLowerCase();
  return normalized ? SUCCESSFUL_ANALYSIS_STATUSES.has(normalized) : false;
}

export function buildLiveCenterAnalysisResultPath(sessionId: string, analysisId: string): string {
  return `${ROUTE_PATHS.contentLiveCenter}/${encodeURIComponent(sessionId)}/analysis/${encodeURIComponent(analysisId)}`;
}

export function resolveAnalysisDisplayId(analysis?: LiveCenterAnalysisJob | null): string | null {
  const displayId = analysis?.analysisId || analysis?.jobId || null;
  return displayId && displayId !== NIL_UUID ? displayId : null;
}

export function resolveAnalysisMessage(analysis: LiveCenterAnalysisJob): string {
  if (analysis.errorMessage) {
    return analysis.errorMessage;
  }
  const directSummary = firstNonEmptyText([analysis.summary, analysis.resultSummary]);
  if (directSummary) {
    return directSummary;
  }
  const analysisJsonSummary = resolveAnalysisJsonSummary(analysis);
  if (analysisJsonSummary) {
    return analysisJsonSummary;
  }

  const status = analysis.status?.trim().toLowerCase();
  if (status === 'queued' || status === 'pending') {
    return '任务已排队。';
  }
  if (status === 'running' || status === 'processing') {
    return '任务运行中。';
  }
  if (isSuccessfulAnalysisStatus(status)) {
    return '任务已完成，暂无摘要。';
  }
  if (status === 'failed' || status === 'error') {
    return '任务失败，暂无详情。';
  }
  return '等待分析产物。';
}

export type LiveCenterAnalysisResultBadge = 'success' | 'warning' | 'error' | 'danger' | 'info' | 'neutral';

export interface LiveCenterAnalysisResultViewModel {
  actionItems: LiveCenterAnalysisReviewTaskItem[];
  analysisProfile: string | null;
  conversionDiagnosisItems: LiveCenterAnalysisDiagnosisItem[];
  decision: {
    confidence: string | null;
    detail: string;
    evidenceRefs: string | null;
    title: string;
  };
  evidenceItems: LiveCenterAnalysisEvidenceItem[];
  executiveReview: LiveCenterAnalysisExecutiveReview;
  generatedAt: string | null;
  hasStructuredV4Payload: boolean;
  inputItems: LiveCenterAnalysisKeyValueItem[];
  metricItems: LiveCenterAnalysisKeyValueItem[];
  model: string | null;
  momentReviewItems: LiveCenterAnalysisMomentReviewItem[];
  outputExcerpt: string | null;
  operatorScorecardItems: LiveCenterAnalysisScorecardItem[];
  payloadStatus: LiveCenterAnalysisPayloadStatus;
  processingStage: string | null;
  progressPercent: string | null;
  provider: string | null;
  qualityGate: LiveCenterAnalysisQualityGate | null;
  promptVersion: string | null;
  recordingItems: LiveCenterAnalysisKeyValueItem[];
  responseId: string | null;
  reviewTasks: LiveCenterAnalysisReviewTaskItem[];
  scriptReviewItems: LiveCenterAnalysisScriptReviewItem[];
  selfEvalItems: LiveCenterAnalysisKeyValueItem[];
  speechScriptItems: LiveCenterAnalysisSpeechScriptItem[];
  summary: string;
  timelineItems: LiveCenterAnalysisTimelineItem[];
  usageItems: LiveCenterAnalysisKeyValueItem[];
}

export interface LiveCenterAnalysisResultBuildContext {
  recording?: LiveCenterRecording | null;
  session?: Pick<LiveCenterSession, 'liveStartTime'> | null;
}

export interface LiveCenterAnalysisPayloadStatus {
  description: string;
  kind: 'not_ready' | 'structured_v4' | 'v4_incomplete' | 'legacy_complete' | 'empty_complete';
  label: string;
  missingFields: string[];
}

export interface LiveCenterAnalysisTimelineItem {
  confidence: string | null;
  detail: string;
  evidenceRefs: string | null;
  tag: string | null;
  time: string | null;
  title: string;
}

export interface LiveCenterAnalysisTimeAnchor {
  clockTimeRange: string | null;
  displayTimeRange: string | null;
  displaySegmentIndex: number | null;
  minuteRangeLabel: string | null;
  offsetEndSeconds: number | null;
  offsetRange: string | null;
  offsetStartSeconds: number | null;
  segmentIndex: number | null;
  segmentLabel: string | null;
  sliceIndex: number | null;
}

export interface LiveCenterAnalysisExecutiveReview {
  confidence: string | null;
  evidenceRefs: string | null;
  oneSentenceConclusion: string;
  verdict: string;
  whyNow: string;
}

export interface LiveCenterAnalysisMomentReviewItem {
  confidence: string | null;
  evidenceRefs: string | null;
  metricSignal: string;
  operatorRead: string;
  recommendedAction: string;
  scriptQuote: string | null;
  timeAnchor: LiveCenterAnalysisTimeAnchor;
  title: string;
  visualSignal: string;
  whatHappened: string;
}

export interface LiveCenterAnalysisScriptReviewItem {
  confidence: string | null;
  evidenceRefs: string | null;
  intent: string;
  operatorComment: string;
  quote: string;
  rewriteSuggestion: string;
  riskFlags: string[];
  timeAnchor: LiveCenterAnalysisTimeAnchor;
}

export interface LiveCenterAnalysisScorecardItem {
  diagnosis: string;
  dimension: string;
  evidenceRefs: string | null;
  fix: string;
  score: string | null;
  status: string | null;
}

export interface LiveCenterAnalysisEvidenceItem {
  claim: string;
  confidence: string | null;
  evidence: string;
  id: string | null;
  source: string | null;
  time: string | null;
  timeAnchor: LiveCenterAnalysisTimeAnchor;
}

export type LiveCenterAnalysisQualityGateStatus = 'pass' | 'review' | 'blocked';

export interface LiveCenterAnalysisQualityGate {
  blockingIssues: LiveCenterAnalysisQualityGateIssue[];
  evidenceHealthItems: LiveCenterAnalysisQualityGateHealthItem[];
  finalReviewLabel: string;
  score: string | null;
  status: LiveCenterAnalysisQualityGateStatus;
  summary: string;
  warningIssues: LiveCenterAnalysisQualityGateIssue[];
}

export interface LiveCenterAnalysisQualityGateIssue {
  detail: string | null;
  evidenceRefs: string | null;
  title: string;
}

export interface LiveCenterAnalysisQualityGateHealthItem {
  detail: string | null;
  label: string;
  status: LiveCenterAnalysisResultBadge;
  value: string;
}

export interface LiveCenterAnalysisReviewTaskItem {
  detail: string;
  due: string | null;
  evidenceRefs: string | null;
  owner: string | null;
  priority: string | null;
  status: string | null;
  taskId: string | null;
  title: string;
}

export interface LiveCenterAnalysisDiagnosisItem {
  confidence: string | null;
  detail: string;
  evidenceRefs: string | null;
  stage: string | null;
  status: string | null;
  title: string;
}

export interface LiveCenterAnalysisSpeechScriptItem {
  evidenceRefs: string | null;
  meta: string | null;
  source: string;
  status: string | null;
  text: string;
  time: string | null;
  title: string;
}

export interface LiveCenterAnalysisKeyValueItem {
  label: string;
  value: string;
}

type AnalysisJsonRecord = Record<string, LiveCenterJsonValue>;

interface AnalysisTimeAnchorContext {
  liveStartTime: string | null;
  segmentAnchors: AnalysisSegmentAnchor[];
}

interface AnalysisSegmentAnchor {
  displaySegmentIndex: number;
  endOffsetSeconds: number | null;
  ordinal: number;
  segmentIndex: number;
  startOffsetSeconds: number | null;
}

interface AnalysisOffsetRangeParts {
  endOffsetSeconds: number | null;
  startOffsetSeconds: number | null;
}

export function buildAnalysisResultViewModel(
  analysis: LiveCenterAnalysisJob,
  context: LiveCenterAnalysisResultBuildContext = {}
): LiveCenterAnalysisResultViewModel {
  const payload = normalizeAnalysisJsonPayload(analysis.analysisJson ?? analysis.analysis_json);
  const inputSnapshot = normalizeAnalysisJsonPayload(analysis.inputSnapshot ?? analysis.input_snapshot);
  const usageJson = normalizeAnalysisJsonPayload(analysis.usageJson ?? analysis.usage_json);
  const payloadStatus = resolveAnalysisPayloadStatus(payload, analysis);
  const timeAnchorContext = resolveAnalysisTimeAnchorContext(inputSnapshot, context);
  const summary = readAnalysisJsonText(payload, ['summary']) || resolveAnalysisMessage(analysis);
  const progressPercent = analysis.progressPercent ?? analysis.progress_percent ?? null;
  const inputItems = resolveAnalysisKeyValueItems(
    [readAnalysisJsonField(payload, ['input']), inputSnapshot ?? undefined],
    6
  );
  const usageItems = resolveAnalysisKeyValueItems(
    [readAnalysisJsonField(payload, ['usage']), usageJson ?? undefined],
    6
  );
  const speechScriptItems = normalizeAnalysisSpeechScriptItems(
    [
      readAnalysisJsonField(payload, ['speechScript', 'speech_script']),
      readAnalysisJsonField(payload, ['scriptAnalysis', 'script_analysis']),
    ],
    readAnalysisJsonField(
      asAnalysisJsonRecord(readAnalysisJsonField(inputSnapshot, ['derivedInputs', 'derived_inputs'])),
      ['asrTranscripts', 'asr_transcripts']
    ),
    timeAnchorContext
  );
  const decision = normalizeAnalysisDecision(readAnalysisJsonField(payload, ['primaryDecision', 'primary_decision']));
  const reviewTasks = normalizeAnalysisReviewTasks(readAnalysisJsonField(payload, ['reviewTasks', 'review_tasks']));
  const conversionDiagnosisItems = normalizeAnalysisDiagnosisItems(readAnalysisJsonField(payload, [
    'conversionDiagnosis',
    'conversion_diagnosis',
  ]));
  const effectiveConversionDiagnosisItems = conversionDiagnosisItems.length > 0
    ? conversionDiagnosisItems
    : resolveFallbackConversionDiagnosisItems(decision);
  const actionItems = normalizeAnalysisActionItems([
    readAnalysisJsonField(payload, ['actionPlan', 'action_plan']),
    readAnalysisJsonField(payload, ['nextActions', 'next_actions']),
  ]);
  const executiveReview = normalizeExecutiveReview(
    readAnalysisJsonField(payload, ['executiveReview', 'executive_review']),
    summary,
    decision
  );
  const momentReviewItems = normalizeMomentReviewItems(
    readAnalysisJsonField(payload, ['momentReviews', 'moment_reviews']),
    readAnalysisJsonField(payload, ['timeline']),
    timeAnchorContext
  );
  const scriptReviewItems = normalizeScriptReviewItems(
    readAnalysisJsonField(payload, ['scriptReview', 'script_review']),
    speechScriptItems,
    timeAnchorContext
  );
  const operatorScorecardItems = normalizeOperatorScorecardItems(
    readAnalysisJsonField(payload, ['operatorScorecard', 'operator_scorecard']),
    effectiveConversionDiagnosisItems
  );

  return {
    actionItems: actionItems.length > 0 ? actionItems : reviewTasks,
    analysisProfile: analysis.analysisProfile || analysis.analysis_profile || null,
    conversionDiagnosisItems: effectiveConversionDiagnosisItems,
    decision,
    evidenceItems: normalizeAnalysisEvidenceItems(
      readAnalysisJsonField(payload, ['evidenceLedger', 'evidence_ledger']),
      timeAnchorContext
    ),
    executiveReview,
    generatedAt:
      readAnalysisJsonText(payload, ['generatedAt', 'generated_at']) ||
      analysis.generatedAt ||
      analysis.generated_at ||
      null,
    hasStructuredV4Payload: payloadStatus.kind === 'structured_v4',
    inputItems,
    metricItems: normalizeAnalysisKeyValueItems(readAnalysisJsonField(payload, ['metrics']), 8),
    model: readAnalysisJsonText(payload, ['model']) || analysis.model || null,
    momentReviewItems,
    outputExcerpt: clipAnalysisText(readAnalysisJsonText(payload, ['outputText', 'output_text']), 700),
    operatorScorecardItems,
    payloadStatus,
    processingStage: analysis.processingStage || analysis.processing_stage || null,
    progressPercent: typeof progressPercent === 'number' && Number.isFinite(progressPercent)
      ? `${Math.round(progressPercent)}%`
      : null,
    provider: readAnalysisJsonText(payload, ['provider']) || analysis.provider || null,
    qualityGate: normalizeAnalysisQualityGate(readAnalysisJsonField(payload, [
      'analysisQualityGate',
      'analysis_quality_gate',
    ])),
    promptVersion:
      readAnalysisJsonText(payload, ['promptVersion', 'prompt_version']) ||
      analysis.promptVersion ||
      analysis.prompt_version ||
      null,
    recordingItems: normalizeAnalysisKeyValueItems(readAnalysisJsonField(payload, ['recording']), 6),
    responseId:
      readAnalysisJsonText(payload, ['responseId', 'response_id']) ||
      analysis.responseId ||
      analysis.response_id ||
      null,
    reviewTasks,
    scriptReviewItems,
    selfEvalItems: normalizeAnalysisSelfEvalItems(readAnalysisJsonField(payload, ['analysisSelfEval', 'analysis_self_eval'])),
    speechScriptItems,
    summary,
    timelineItems: normalizeAnalysisTimelineItems(readAnalysisJsonField(payload, ['timeline']), timeAnchorContext),
    usageItems,
  };
}

export function resolveAnalysisConfidenceBadge(value: string): LiveCenterAnalysisResultBadge {
  const numeric = Number(value.replace('%', ''));
  if (!Number.isFinite(numeric)) {
    return 'neutral';
  }
  if (numeric >= 80) {
    return 'success';
  }
  if (numeric >= 60) {
    return 'info';
  }
  if (numeric >= 40) {
    return 'warning';
  }
  return 'danger';
}

export function resolveAnalysisQualityGateBadge(
  status: LiveCenterAnalysisQualityGateStatus
): LiveCenterAnalysisResultBadge {
  if (status === 'pass') {
    return 'success';
  }
  if (status === 'blocked') {
    return 'danger';
  }
  return 'warning';
}

function resolveAnalysisPayloadStatus(
  payload: AnalysisJsonRecord | null,
  analysis: LiveCenterAnalysisJob
): LiveCenterAnalysisPayloadStatus {
  if (!isSuccessfulAnalysisStatus(analysis.status)) {
    return {
      description: '该任务尚未生成可用结果，完成后刷新即可查看结构化产物。',
      kind: 'not_ready',
      label: '当前仅展示任务状态',
      missingFields: [],
    };
  }

  if (!payload || Object.keys(payload).length === 0) {
    return {
      description: '任务已完成，但当前记录没有返回结构化 analysisJson；页面仅展示任务状态和可用元信息。',
      kind: 'empty_complete',
      label: '任务完成，结构化产物为空',
      missingFields: ['analysisJson'],
    };
  }

  const promptVersion = (
    readAnalysisJsonText(payload, ['promptVersion', 'prompt_version']) ||
    analysis.promptVersion ||
    analysis.prompt_version ||
    ''
  ).trim().toLowerCase();
  const model = (readAnalysisJsonText(payload, ['model']) || analysis.model || '').trim().toLowerCase();
  const hasAnyV4Field = [
    'executiveReview',
    'executive_review',
    'primaryDecision',
    'primary_decision',
    'momentReviews',
    'moment_reviews',
    'evidenceLedger',
    'evidence_ledger',
    'scriptReview',
    'script_review',
    'operatorScorecard',
    'operator_scorecard',
    'reviewTasks',
    'review_tasks',
    'analysisSelfEval',
    'analysis_self_eval',
  ].some((key) => payload[key] !== undefined && payload[key] !== null);
  const looksLikeV4 = promptVersion.startsWith('v4') || model.includes('live-recording-v4') || hasAnyV4Field;
  const missingFields = resolveMissingStructuredV4Fields(payload);

  if (missingFields.length === 0) {
    return {
      description: '以下按 V4 结构化产物展示摘要、决策、证据、复核任务和模型元信息。',
      kind: 'structured_v4',
      label: 'V4 结果可用',
      missingFields: [],
    };
  }

  if (looksLikeV4) {
    return {
      description: '任务已完成，但 V4 结构化字段不完整；页面会展示可解析字段，并标注缺失项。',
      kind: 'v4_incomplete',
      label: 'V4 结果不完整',
      missingFields,
    };
  }

  return {
    description: '这是历史完成记录或非 V4 产物；页面会兼容展示可解析字段，但不标记为 V4 结果可用。',
    kind: 'legacy_complete',
    label: '历史结果，字段不完整',
    missingFields,
  };
}

function resolveMissingStructuredV4Fields(payload: AnalysisJsonRecord): string[] {
  const requiredFields: Array<{ label: string; valid: boolean }> = [
    { label: 'summary', valid: Boolean(readAnalysisJsonText(payload, ['summary'])) },
    {
      label: 'executiveReview',
      valid: Boolean(asAnalysisJsonRecord(readAnalysisJsonField(payload, ['executiveReview', 'executive_review']))),
    },
    { label: 'primaryDecision', valid: readAnalysisJsonField(payload, ['primaryDecision', 'primary_decision']) !== undefined },
    {
      label: 'momentReviews',
      valid: Array.isArray(readAnalysisJsonField(payload, ['momentReviews', 'moment_reviews'])),
    },
    { label: 'timeline', valid: Array.isArray(readAnalysisJsonField(payload, ['timeline'])) },
    {
      label: 'evidenceLedger',
      valid: Array.isArray(readAnalysisJsonField(payload, ['evidenceLedger', 'evidence_ledger'])),
    },
    {
      label: 'speechScript',
      valid: Array.isArray(readAnalysisJsonField(payload, ['speechScript', 'speech_script', 'scriptAnalysis', 'script_analysis'])),
    },
    {
      label: 'scriptReview',
      valid: Array.isArray(readAnalysisJsonField(payload, ['scriptReview', 'script_review'])),
    },
    {
      label: 'conversionDiagnosis',
      valid: Boolean(asAnalysisJsonRecord(readAnalysisJsonField(payload, ['conversionDiagnosis', 'conversion_diagnosis']))),
    },
    {
      label: 'operatorScorecard',
      valid: Array.isArray(readAnalysisJsonField(payload, ['operatorScorecard', 'operator_scorecard'])),
    },
    {
      label: 'actionPlan',
      valid: Array.isArray(readAnalysisJsonField(payload, ['actionPlan', 'action_plan', 'nextActions', 'next_actions'])),
    },
    {
      label: 'reviewTasks',
      valid: Array.isArray(readAnalysisJsonField(payload, ['reviewTasks', 'review_tasks'])),
    },
    {
      label: 'analysisSelfEval',
      valid: Boolean(asAnalysisJsonRecord(readAnalysisJsonField(payload, ['analysisSelfEval', 'analysis_self_eval']))),
    },
    { label: 'metrics', valid: Boolean(asAnalysisJsonRecord(readAnalysisJsonField(payload, ['metrics']))) },
    { label: 'recording', valid: Boolean(asAnalysisJsonRecord(readAnalysisJsonField(payload, ['recording']))) },
    { label: 'input', valid: Boolean(asAnalysisJsonRecord(readAnalysisJsonField(payload, ['input']))) },
  ];
  return requiredFields.filter((field) => !field.valid).map((field) => field.label);
}

function normalizeExecutiveReview(
  value: LiveCenterJsonValue | undefined,
  summary: string,
  decision: LiveCenterAnalysisResultViewModel['decision']
): LiveCenterAnalysisExecutiveReview {
  const record = asAnalysisJsonRecord(value);
  if (!record) {
    const text = analysisJsonValueToText(value);
    return {
      confidence: decision.confidence,
      evidenceRefs: decision.evidenceRefs,
      oneSentenceConclusion: text || summary || decision.title,
      verdict: decision.title || 'review',
      whyNow: decision.detail || '当前结果缺少完整经营结论，已按可解析摘要和核心决策兼容展示。',
    };
  }

  const verdict = readAnalysisJsonText(record, [
    'verdict',
    'decision',
    'recommendation',
    'status',
    'state',
  ]);
  const conclusion = readAnalysisJsonText(record, [
    'oneSentenceConclusion',
    'one_sentence_conclusion',
    'conclusion',
    'summary',
    'answer',
    'title',
  ]);
  const whyNow = readAnalysisJsonText(record, [
    'whyNow',
    'why_now',
    'reason',
    'rationale',
    'operatorRead',
    'operator_read',
    'detail',
    'description',
  ]);

  return {
    confidence: formatAnalysisConfidence(readAnalysisJsonField(record, [
      'confidence',
      'confidenceScore',
      'confidence_score',
      'score',
    ])) || decision.confidence,
    evidenceRefs: formatAnalysisEvidenceRefs(readAnalysisJsonField(record, [
      'evidenceIds',
      'evidence_ids',
      'evidenceId',
      'evidence_id',
      'refs',
      'references',
    ])) || decision.evidenceRefs,
    oneSentenceConclusion: conclusion || summary || decision.title,
    verdict: verdict || decision.title || 'review',
    whyNow: whyNow || decision.detail || '未返回经营判断理由。',
  };
}

function normalizeMomentReviewItems(
  value: LiveCenterJsonValue | undefined,
  fallbackTimeline: LiveCenterJsonValue | undefined,
  timeAnchorContext: AnalysisTimeAnchorContext
): LiveCenterAnalysisMomentReviewItem[] {
  const items = toAnalysisJsonItemArray(value, ['items', 'moments', 'momentReviews', 'moment_reviews', 'reviews']);
  const normalizedItems = items
    .map((item, index) => normalizeMomentReviewItem(item, index, timeAnchorContext))
    .filter((item): item is LiveCenterAnalysisMomentReviewItem => item !== null);
  if (normalizedItems.length > 0) {
    return normalizedItems;
  }

  return normalizeAnalysisTimelineItems(fallbackTimeline, timeAnchorContext).map((item, index) => ({
    confidence: item.confidence,
    evidenceRefs: item.evidenceRefs,
    metricSignal: '历史 timeline 未拆分指标信号；请结合分钟成交图复核。',
    operatorRead: item.detail,
    recommendedAction: '复核该时间点的话术、商品卡和成交变化，沉淀为主播/场控动作。',
    scriptQuote: null,
    timeAnchor: normalizeAnalysisTimeAnchor(undefined, {
      timeRange: item.time ?? null,
      title: item.title,
    }, timeAnchorContext),
    title: item.title || `关键片段 ${formatInteger(index + 1)}`,
    visualSignal: '历史 timeline 未返回画面信号。',
    whatHappened: item.detail,
  }));
}

function normalizeMomentReviewItem(
  value: LiveCenterJsonValue | undefined,
  index: number,
  timeAnchorContext: AnalysisTimeAnchorContext
): LiveCenterAnalysisMomentReviewItem | null {
  const record = asAnalysisJsonRecord(value);
  if (!record) {
    const text = analysisJsonValueToText(value);
    if (!text) {
      return null;
    }
    return {
      confidence: null,
      evidenceRefs: null,
      metricSignal: '未返回指标信号。',
      operatorRead: text,
      recommendedAction: '复核该片段对应的主播话术、商品卡和成交表现。',
      scriptQuote: null,
      timeAnchor: normalizeAnalysisTimeAnchor(undefined, null, timeAnchorContext),
      title: `关键片段 ${formatInteger(index + 1)}`,
      visualSignal: '未返回画面信号。',
      whatHappened: text,
    };
  }

  const title = readAnalysisJsonText(record, ['title', 'moment', 'scene', 'event', 'phase', 'label']);
  const whatHappened = readAnalysisJsonText(record, [
    'whatHappened',
    'what_happened',
    'observation',
    'detail',
    'description',
    'content',
    'summary',
  ]);
  const operatorRead = readAnalysisJsonText(record, [
    'operatorRead',
    'operator_read',
    'businessMeaning',
    'business_meaning',
    'diagnosis',
    'rationale',
    'reason',
  ]);
  const metricSignal = readAnalysisJsonText(record, [
    'metricSignal',
    'metric_signal',
    'metrics',
    'dataSignal',
    'data_signal',
  ]);
  const visualSignal = readAnalysisJsonText(record, [
    'visualSignal',
    'visual_signal',
    'frameSignal',
    'frame_signal',
    'videoSignal',
    'video_signal',
  ]);
  const recommendedAction = readAnalysisJsonText(record, [
    'recommendedAction',
    'recommended_action',
    'action',
    'nextAction',
    'next_action',
    'recommendation',
  ]);

  return {
    confidence: formatAnalysisConfidence(readAnalysisJsonField(record, ['confidence', 'confidenceScore', 'confidence_score', 'score'])),
    evidenceRefs: formatAnalysisEvidenceRefs(readAnalysisJsonField(record, [
      'evidenceIds',
      'evidence_ids',
      'evidenceId',
      'evidence_id',
      'refs',
      'references',
    ])),
    metricSignal: metricSignal || '未返回指标信号。',
    operatorRead: operatorRead || whatHappened || '未返回运营判断。',
    recommendedAction: recommendedAction || '复核该片段并沉淀主播/场控改法。',
    scriptQuote: readAnalysisJsonText(record, ['scriptQuote', 'script_quote', 'quote']),
    timeAnchor: normalizeAnalysisTimeAnchor(readAnalysisJsonField(record, ['timeAnchor', 'time_anchor']), record, timeAnchorContext),
    title: title || `关键片段 ${formatInteger(index + 1)}`,
    visualSignal: visualSignal || '画面/商品承接证据不足。',
    whatHappened: whatHappened || operatorRead || '-',
  };
}

function normalizeScriptReviewItems(
  value: LiveCenterJsonValue | undefined,
  fallbackSpeechScriptItems: LiveCenterAnalysisSpeechScriptItem[],
  timeAnchorContext: AnalysisTimeAnchorContext
): LiveCenterAnalysisScriptReviewItem[] {
  const items = toAnalysisJsonItemArray(value, ['items', 'reviews', 'scriptReview', 'script_review']);
  const normalizedItems = items
    .map((item, index) => normalizeScriptReviewItem(item, index, timeAnchorContext))
    .filter((item): item is LiveCenterAnalysisScriptReviewItem => item !== null);
  if (normalizedItems.length > 0) {
    return normalizedItems;
  }

  return fallbackSpeechScriptItems
    .filter((item) => item.text && !item.text.startsWith('ASR 转写失败') && /asr|转写/i.test(`${item.source} ${item.title}`))
    .slice(0, 6)
    .map((item) => ({
      confidence: null,
      evidenceRefs: item.evidenceRefs,
      intent: '原话短摘',
      operatorComment: '已拿到原话底稿，但这条仅作为代表性短摘；需继续按“原话-意图-问题-改写方向”补完整运营点评。',
      quote: summarizeAnalysisScriptQuote(item.text),
      rewriteSuggestion: '人工复核后补齐痛点、利益点、价格福利、信任背书和明确 CTA。',
      riskFlags: item.status && item.status !== 'succeeded' ? [item.status] : [],
      timeAnchor: normalizeAnalysisTimeAnchor(undefined, {
        evidenceRefs: item.evidenceRefs,
        timeRange: isAnalysisRecordingOnlyTimeText(item.time) ? null : item.time ?? null,
        title: item.title,
      }, timeAnchorContext),
    }));
}

function normalizeScriptReviewItem(
  value: LiveCenterJsonValue | undefined,
  index: number,
  timeAnchorContext: AnalysisTimeAnchorContext
): LiveCenterAnalysisScriptReviewItem | null {
  const record = asAnalysisJsonRecord(value);
  if (!record) {
    const text = analysisJsonValueToText(value);
    if (!text) {
      return null;
    }
    return {
      confidence: null,
      evidenceRefs: null,
      intent: '待人工标注',
      operatorComment: '模型返回了文本型话术复盘，无法拆分意图/建议。',
      quote: text,
      rewriteSuggestion: '请人工复核后改写为可直接给主播使用的话术。',
      riskFlags: [],
      timeAnchor: normalizeAnalysisTimeAnchor(undefined, null, timeAnchorContext),
    };
  }

  const quote = readAnalysisJsonText(record, [
    'quote',
    'scriptQuote',
    'script_quote',
    'scriptText',
    'script_text',
    'transcriptText',
    'transcript_text',
    'text',
  ]);
  if (!quote) {
    return null;
  }

  return {
    confidence: formatAnalysisConfidence(readAnalysisJsonField(record, ['confidence', 'confidenceScore', 'confidence_score', 'score'])),
    evidenceRefs: formatAnalysisEvidenceRefs(readAnalysisJsonField(record, [
      'evidenceIds',
      'evidence_ids',
      'evidenceId',
      'evidence_id',
      'refs',
      'references',
    ])),
    intent: readAnalysisJsonText(record, ['intent', 'speakerIntent', 'speaker_intent', 'purpose', 'phase']) || `话术 ${formatInteger(index + 1)}`,
    operatorComment:
      readAnalysisJsonText(record, [
        'operatorComment',
        'operator_comment',
        'comment',
        'diagnosis',
        'review',
        'analysis',
        'detail',
      ]) || '未返回运营点评。',
    quote,
    rewriteSuggestion:
      readAnalysisJsonText(record, [
        'rewriteSuggestion',
        'rewrite_suggestion',
        'suggestion',
        'rewrite',
        'recommendedScript',
        'recommended_script',
      ]) || '未返回改写建议。',
    riskFlags: normalizeTextList(readAnalysisJsonField(record, ['riskFlags', 'risk_flags', 'risks'])).slice(0, 8),
    timeAnchor: normalizeAnalysisTimeAnchor(readAnalysisJsonField(record, ['timeAnchor', 'time_anchor']), record, timeAnchorContext),
  };
}

function summarizeAnalysisScriptQuote(value: string): string {
  const compacted = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' / ');
  return clipAnalysisText(compacted || value, 96) || value;
}

function normalizeOperatorScorecardItems(
  value: LiveCenterJsonValue | undefined,
  fallbackDiagnosisItems: LiveCenterAnalysisDiagnosisItem[]
): LiveCenterAnalysisScorecardItem[] {
  const items = toAnalysisJsonItemArray(value, ['items', 'scorecard', 'operatorScorecard', 'operator_scorecard', 'dimensions']);
  const normalizedItems = items
    .map((item, index) => normalizeOperatorScorecardItem(item, index))
    .filter((item): item is LiveCenterAnalysisScorecardItem => item !== null);
  if (normalizedItems.length > 0) {
    return normalizedItems;
  }

  return fallbackDiagnosisItems.slice(0, 6).map((item) => ({
    diagnosis: item.detail,
    dimension: item.stage || item.title,
    evidenceRefs: item.evidenceRefs,
    fix: '当前只有总判断，暂不能拆到话术、商品、福利、CTA、互动、画面六项；请按六项补证据后复核。',
    score: item.confidence,
    status: item.status,
  }));
}

function normalizeOperatorScorecardItem(
  value: LiveCenterJsonValue | undefined,
  index: number
): LiveCenterAnalysisScorecardItem | null {
  const record = asAnalysisJsonRecord(value);
  if (!record) {
    const text = analysisJsonValueToText(value);
    if (!text) {
      return null;
    }
    return {
      diagnosis: text,
      dimension: `维度 ${formatInteger(index + 1)}`,
      evidenceRefs: null,
      fix: '待人工拆解改法。',
      score: null,
      status: null,
    };
  }

  return {
    diagnosis:
      readAnalysisJsonText(record, ['diagnosis', 'comment', 'detail', 'description', 'reason', 'summary']) ||
      '未返回诊断。',
    dimension:
      readAnalysisJsonText(record, ['dimension', 'name', 'title', 'stage', 'label']) ||
      `维度 ${formatInteger(index + 1)}`,
    evidenceRefs: formatAnalysisEvidenceRefs(readAnalysisJsonField(record, [
      'evidenceIds',
      'evidence_ids',
      'evidenceId',
      'evidence_id',
      'refs',
      'references',
    ])),
    fix:
      readAnalysisJsonText(record, ['fix', 'action', 'recommendation', 'suggestion', 'nextAction', 'next_action']) ||
      '未返回改法。',
    score: formatAnalysisScore(readAnalysisJsonField(record, ['score', 'value', 'confidence'])),
    status: readAnalysisJsonText(record, ['status', 'state', 'verdict', 'level']),
  };
}

function normalizeAnalysisDecision(
  value: LiveCenterJsonValue | undefined
): LiveCenterAnalysisResultViewModel['decision'] {
  const record = asAnalysisJsonRecord(value);
  if (!record) {
    const title = analysisJsonValueToText(value);
    return {
      confidence: null,
      detail: title
        ? '当前返回的是简版核心决策，需结合时间复盘和证据追溯复核。'
        : '当前未形成明确核心决策，需结合时间复盘和证据追溯人工复核。',
      evidenceRefs: null,
      title: title || '暂无明确决策',
    };
  }

  return {
    confidence: formatAnalysisConfidence(readAnalysisJsonField(record, ['confidence', 'confidenceScore', 'confidence_score', 'score'])),
    detail:
      readAnalysisJsonText(record, ['rationale', 'reason', 'reasoning', 'why', 'summary', 'detail', 'description']) ||
      '未返回决策理由。',
    evidenceRefs: formatAnalysisEvidenceRefs(readAnalysisJsonField(record, [
      'evidenceIds',
      'evidence_ids',
      'evidenceId',
      'evidence_id',
      'refs',
      'references',
    ])),
    title:
      readAnalysisJsonText(record, [
        'decision',
        'primaryDecision',
        'primary_decision',
        'verdict',
        'recommendation',
        'action',
        'answer',
      ]) || '暂无明确决策',
  };
}

function normalizeAnalysisDiagnosisItems(value: LiveCenterJsonValue | undefined): LiveCenterAnalysisDiagnosisItem[] {
  return toAnalysisJsonItemArray(value, ['items', 'diagnoses', 'diagnosis', 'findings', 'issues', 'problems'])
    .map((item, index) => normalizeAnalysisDiagnosisItem(item, index));
}

function resolveFallbackConversionDiagnosisItems(
  decision: LiveCenterAnalysisResultViewModel['decision']
): LiveCenterAnalysisDiagnosisItem[] {
  const hasDecision = decision.title !== '暂无明确决策' || !decision.detail.startsWith('未返回');
  if (!hasDecision) {
    return [];
  }
  return [{
    confidence: decision.confidence,
    detail: decision.detail,
    evidenceRefs: decision.evidenceRefs,
    stage: '总判断',
    status: decision.title,
    title: '当前运营判断',
  }];
}

function normalizeAnalysisDiagnosisItem(
  value: LiveCenterJsonValue | undefined,
  index: number
): LiveCenterAnalysisDiagnosisItem {
  const record = asAnalysisJsonRecord(value);
  if (!record) {
    return {
      confidence: null,
      detail: analysisJsonValueToText(value) || '-',
      evidenceRefs: null,
      stage: null,
      status: null,
      title: `诊断 ${index + 1}`,
    };
  }
  const mainIssue = readAnalysisJsonText(record, ['mainIssue', 'main_issue']);
  const metricSignal = readAnalysisJsonText(record, ['metricSignal', 'metric_signal']);
  const talkScriptSignal = readAnalysisJsonText(record, ['talkScriptSignal', 'talk_script_signal']);
  const visualSignal = readAnalysisJsonText(record, ['visualSignal', 'visual_signal']);
  const fallbackDetail = readAnalysisJsonText(record, [
    'detail',
    'description',
    'reason',
    'reasoning',
    'rationale',
    'evidence',
    'observation',
    'summary',
    'content',
  ]);

  return {
    confidence: formatAnalysisConfidence(readAnalysisJsonField(record, ['confidence', 'confidenceScore', 'confidence_score', 'score'])),
    detail: compactAnalysisTextParts([
      mainIssue,
      metricSignal ? `指标：${metricSignal}` : null,
      talkScriptSignal ? `话术：${talkScriptSignal}` : null,
      visualSignal ? `画面：${visualSignal}` : null,
      fallbackDetail,
    ], '；') || '-',
    evidenceRefs: formatAnalysisEvidenceRefs(readAnalysisJsonField(record, [
      'evidenceIds',
      'evidence_ids',
      'evidenceId',
      'evidence_id',
      'refs',
      'references',
    ])),
    stage: readAnalysisJsonText(record, ['stage', 'problemStage', 'problem_stage', 'funnelStage', 'funnel_stage']),
    status: readAnalysisJsonText(record, ['status', 'state', 'severity', 'priority', 'verdict']),
    title:
      readAnalysisJsonText(record, [
        'title',
        'mainIssue',
        'main_issue',
        'diagnosis',
        'issue',
        'finding',
        'problem',
        'verdict',
        'dimension',
        'label',
        'name',
      ]) || `诊断 ${index + 1}`,
  };
}

function normalizeAnalysisActionItems(values: Array<LiveCenterJsonValue | undefined>): LiveCenterAnalysisReviewTaskItem[] {
  return values.flatMap((value) => normalizeAnalysisActionItemsFromValue(value));
}

function normalizeAnalysisActionItemsFromValue(value: LiveCenterJsonValue | undefined): LiveCenterAnalysisReviewTaskItem[] {
  const actionItems = toAnalysisJsonItemArray(value, [
    'actions',
    'actionItems',
    'action_items',
    'items',
    'nextActions',
    'next_actions',
    'tasks',
    'steps',
  ]);
  return actionItems.map((item, index) => normalizeAnalysisActionItem(item, index));
}

function normalizeAnalysisActionItem(
  value: LiveCenterJsonValue | undefined,
  index: number
): LiveCenterAnalysisReviewTaskItem {
  const record = asAnalysisJsonRecord(value);
  if (!record) {
    return {
      detail: analysisJsonValueToText(value) || '-',
      due: null,
      evidenceRefs: null,
      owner: null,
      priority: null,
      status: null,
      taskId: null,
      title: `行动 ${index + 1}`,
    };
  }

  const expectedImpact = readAnalysisJsonText(record, ['expectedImpact', 'expected_impact', 'impact']);
  const detail = readAnalysisJsonText(record, [
    'detail',
    'description',
    'reason',
    'rationale',
    'how',
    'method',
    'note',
    'summary',
  ]);

  return {
    detail: compactAnalysisTextParts([
      detail,
      expectedImpact ? `预期影响：${expectedImpact}` : null,
    ], '；') || '-',
    due: readAnalysisJsonText(record, ['due', 'dueAt', 'due_at', 'deadline']),
    evidenceRefs: formatAnalysisEvidenceRefs(readAnalysisJsonField(record, [
      'evidenceIds',
      'evidence_ids',
      'evidenceId',
      'evidence_id',
      'refs',
      'references',
    ])),
    owner: readAnalysisJsonText(record, ['owner', 'ownerRole', 'owner_role', 'assignee', 'role', 'team']),
    priority: readAnalysisJsonText(record, ['priority', 'severity']),
    status: readAnalysisJsonText(record, ['status', 'state']),
    taskId: readAnalysisJsonText(record, ['taskId', 'task_id', 'id']),
    title:
      readAnalysisJsonText(record, [
        'action',
        'title',
        'task',
        'nextStep',
        'next_step',
        'recommendation',
        'name',
      ]) || `行动 ${index + 1}`,
  };
}

function normalizeAnalysisSpeechScriptItems(
  modelValues: Array<LiveCenterJsonValue | undefined>,
  asrTranscripts: LiveCenterJsonValue | undefined,
  timeAnchorContext: AnalysisTimeAnchorContext
): LiveCenterAnalysisSpeechScriptItem[] {
  return [
    ...modelValues.flatMap((value) => normalizeAnalysisSpeechScriptItemsFromValue(value, '模型话术分析', timeAnchorContext)),
    ...normalizeAsrTranscriptItems(asrTranscripts, timeAnchorContext),
  ];
}

function normalizeAnalysisSpeechScriptItemsFromValue(
  value: LiveCenterJsonValue | undefined,
  defaultSource: string,
  timeAnchorContext: AnalysisTimeAnchorContext
): LiveCenterAnalysisSpeechScriptItem[] {
  const items = toAnalysisJsonItemArray(value, [
    'items',
    'scripts',
    'scriptItems',
    'script_items',
    'scriptSegments',
    'script_segments',
    'highlights',
    'findings',
  ]);
  return items.map((item, index) => normalizeAnalysisSpeechScriptItem(item, index, defaultSource, timeAnchorContext));
}

function normalizeAsrTranscriptItems(
  value: LiveCenterJsonValue | undefined,
  timeAnchorContext: AnalysisTimeAnchorContext
): LiveCenterAnalysisSpeechScriptItem[] {
  return toAnalysisJsonItemArray(value, ['items', 'transcripts', 'asrTranscripts', 'asr_transcripts'])
    .map((item, index) => normalizeAnalysisSpeechScriptItem(item, index, 'ASR 转写', timeAnchorContext));
}

function normalizeAnalysisSpeechScriptItem(
  value: LiveCenterJsonValue | undefined,
  index: number,
  defaultSource: string,
  timeAnchorContext: AnalysisTimeAnchorContext
): LiveCenterAnalysisSpeechScriptItem {
  const record = asAnalysisJsonRecord(value);
  if (!record) {
    return {
      evidenceRefs: null,
      meta: null,
      source: defaultSource,
      status: null,
      text: analysisJsonValueToText(value) || '-',
      time: null,
      title: `${defaultSource} ${index + 1}`,
    };
  }

  const status = readAnalysisJsonText(record, ['status', 'state']);
  const error = readAnalysisJsonText(record, ['error', 'errorMessage', 'error_message']);
  const scriptText =
    readAnalysisJsonText(record, [
      'scriptText',
      'script_text',
      'speechScript',
      'speech_script',
      'text',
      'content',
      'quote',
    ]) ||
    readAnalysisJsonText(record, ['transcriptText', 'transcript_text']);
  const analysisText = readAnalysisJsonText(record, [
    'analysis',
    'scriptAnalysis',
    'script_analysis',
    'summary',
    'detail',
    'description',
    'observation',
  ]);
  const segmentIndex = readAnalysisJsonText(record, ['segmentIndex', 'segment_index', 'segment']);
  const timeAnchorText = readAnalysisTimeAnchorText(readAnalysisJsonField(record, ['timeAnchor', 'time_anchor']), record, timeAnchorContext);
  const provider = readAnalysisJsonText(record, ['provider']);
  const model = readAnalysisJsonText(record, ['model']);
  const language = readAnalysisJsonText(record, ['language']);
  const confidence = formatAnalysisConfidence(readAnalysisJsonField(record, ['confidence', 'score']));

  return {
    evidenceRefs: formatAnalysisEvidenceRefs(readAnalysisJsonField(record, [
      'evidenceIds',
      'evidence_ids',
      'evidenceId',
      'evidence_id',
      'refs',
      'references',
    ])),
    meta: compactAnalysisTextParts([
      segmentIndex ? `segment ${segmentIndex}` : null,
      compactAnalysisTextParts([provider, model], '/') || null,
      language,
      confidence ? `confidence ${confidence}` : null,
    ], ' · '),
    source: readAnalysisJsonText(record, ['source', 'sourceType', 'source_type']) || defaultSource,
    status,
    text: scriptText || analysisText || (error ? `ASR 转写失败：${error}` : '-'),
    time: timeAnchorText || readAnalysisJsonText(record, [
      'timeRange',
      'time_range',
      'time',
      'timestamp',
      'startTime',
      'start_time',
      'start',
      'offset',
    ]),
    title:
      readAnalysisJsonText(record, ['title', 'phase', 'scene', 'label', 'name']) ||
      (segmentIndex ? `${defaultSource} segment ${segmentIndex}` : `${defaultSource} ${index + 1}`),
  };
}

function normalizeAnalysisTimelineItems(
  value: LiveCenterJsonValue | undefined,
  timeAnchorContext?: AnalysisTimeAnchorContext
): LiveCenterAnalysisTimelineItem[] {
  return toAnalysisJsonItemArray(value, ['items', 'events', 'timeline'])
    .map((item, index) => {
      const record = asAnalysisJsonRecord(item);
      if (!record) {
        return {
          confidence: null,
          detail: analysisJsonValueToText(item) || '-',
          evidenceRefs: null,
          tag: null,
          time: null,
          title: `片段 ${index + 1}`,
        };
      }
      const observation = readAnalysisJsonText(record, [
        'observation',
        'detail',
        'description',
        'evidence',
        'reason',
        'rationale',
        'note',
        'summary',
        'content',
      ]);
      const businessMeaning = readAnalysisJsonText(record, ['businessMeaning', 'business_meaning']);
      const timeAnchorText = readAnalysisTimeAnchorText(
        readAnalysisJsonField(record, ['timeAnchor', 'time_anchor']),
        record,
        timeAnchorContext
      );
      const detailParts = [
        observation,
        businessMeaning ? `经营含义：${businessMeaning}` : null,
      ].filter(Boolean);
      return {
        confidence: formatAnalysisConfidence(readAnalysisJsonField(record, ['confidence', 'score'])),
        detail: detailParts.length > 0 ? detailParts.join('；') : '-',
        evidenceRefs: formatAnalysisEvidenceRefs(readAnalysisJsonField(record, [
          'evidenceIds',
          'evidence_ids',
          'evidenceId',
          'evidence_id',
          'refs',
          'references',
        ])),
        tag: readAnalysisJsonText(record, ['type', 'status', 'category', 'label']),
        time: timeAnchorText || readAnalysisJsonText(record, [
          'timeRange',
          'time_range',
          'time',
          'timestamp',
          'at',
          'startTime',
          'start_time',
          'start',
          'offset',
          'minute',
          'minuteOffset',
          'minute_offset',
        ]),
        title:
          readAnalysisJsonText(record, ['title', 'event', 'moment', 'scene', 'phase', 'decision', 'observation']) ||
          `片段 ${index + 1}`,
      };
    });
}

function normalizeAnalysisEvidenceItems(
  value: LiveCenterJsonValue | undefined,
  timeAnchorContext?: AnalysisTimeAnchorContext
): LiveCenterAnalysisEvidenceItem[] {
  return toAnalysisJsonItemArray(value, ['items', 'entries', 'evidence', 'ledger'])
    .map((item, index) => {
      const record = asAnalysisJsonRecord(item);
      if (!record) {
        return {
          claim: `证据 ${index + 1}`,
          confidence: null,
          evidence: analysisJsonValueToText(item) || '-',
          id: null,
          source: null,
          time: null,
          timeAnchor: normalizeAnalysisTimeAnchor(undefined, null, timeAnchorContext),
        };
      }
      const sourceType = readAnalysisJsonText(record, ['type']);
      const sourceText = readAnalysisJsonText(record, ['source', 'sourceType', 'source_type', 'recording', 'transcript', 'frame']);
      const timeAnchor = normalizeAnalysisTimeAnchor(readAnalysisJsonField(record, ['timeAnchor', 'time_anchor']), record, timeAnchorContext);
      const timeAnchorText = firstNonEmptyText([
        timeAnchor.displayTimeRange,
        timeAnchor.clockTimeRange,
        timeAnchor.offsetRange,
        compactAnalysisTextParts([timeAnchor.minuteRangeLabel, timeAnchor.segmentLabel], '｜'),
      ]);
      return {
        claim:
          readAnalysisJsonText(record, ['supports', 'support', 'claim', 'title', 'finding', 'assertion', 'question', 'type']) ||
          `证据 ${index + 1}`,
        confidence: formatAnalysisConfidence(readAnalysisJsonField(record, ['confidence', 'score'])),
        evidence:
          readAnalysisJsonText(record, ['evidence', 'detail', 'description', 'quote', 'observation', 'content']) ||
          '-',
        id: readAnalysisJsonText(record, ['id', 'evidenceId', 'evidence_id', 'ref', 'sourceId', 'source_id']),
        source: compactAnalysisTextParts([sourceType, sourceText], ' / '),
        time: timeAnchorText || readAnalysisJsonText(record, [
          'timeRange',
          'time_range',
          'time',
          'timestamp',
          'at',
          'startTime',
          'start_time',
          'start',
          'offset',
          'minute',
          'minuteOffset',
          'minute_offset',
        ]),
        timeAnchor,
      };
    });
}

function normalizeAnalysisQualityGate(value: LiveCenterJsonValue | undefined): LiveCenterAnalysisQualityGate | null {
  const record = asAnalysisJsonRecord(value);
  if (!record) {
    return null;
  }

  const blockingIssues = normalizeAnalysisQualityGateIssues([
    readAnalysisJsonField(record, ['blockingIssues', 'blocking_issues']),
    readAnalysisJsonField(record, ['blockers']),
    readAnalysisJsonField(record, ['failedChecks', 'failed_checks']),
    readAnalysisJsonField(record, ['criticalIssues', 'critical_issues']),
    readAnalysisJsonField(record, ['errors']),
  ]);
  const warningIssues = normalizeAnalysisQualityGateIssues([
    readAnalysisJsonField(record, ['warnings']),
    readAnalysisJsonField(record, ['warningIssues', 'warning_issues']),
    readAnalysisJsonField(record, ['softWarnings', 'soft_warnings']),
    readAnalysisJsonField(record, ['notes']),
  ]);
  const score = formatAnalysisQualityGateScore(readAnalysisJsonField(record, [
    'qualityScore',
    'quality_score',
    'score',
    'overallScore',
    'overall_score',
    'finalScore',
    'final_score',
  ]));
  const finalReady = parseAnalysisQualityGateBoolean(readAnalysisJsonField(record, [
    'safeToUseAsFinalReview',
    'safe_to_use_as_final_review',
    'canUseAsFinalReview',
    'can_use_as_final_review',
    'finalReviewReady',
    'final_review_ready',
    'readyForFinalReview',
    'ready_for_final_review',
    'passed',
    'pass',
    'isPassed',
    'is_passed',
  ]));
  const status = resolveAnalysisQualityGateStatus(
    readAnalysisJsonText(record, ['grade', 'status', 'verdict', 'gateStatus', 'gate_status', 'result']),
    finalReady,
    blockingIssues.length
  );
  const evidenceHealthItems = normalizeAnalysisQualityGateEvidenceHealth(
    readAnalysisJsonField(record, [
      'evidenceHealth',
      'evidence_health',
      'evidenceHealthSummary',
      'evidence_health_summary',
      'evidenceCoverage',
      'evidence_coverage',
    ])
  );
  const derivedHealthItems = evidenceHealthItems.length > 0
    ? evidenceHealthItems
    : normalizeAnalysisQualityGateEvidenceHealthFromRecord(record);
  const summary = formatAnalysisQualityGateText(firstNonEmptyText([
    readAnalysisJsonText(record, ['summary', 'finalReviewSummary', 'final_review_summary']),
    readAnalysisJsonText(record, ['recommendation', 'decision', 'note']),
    resolveAnalysisQualityGateDefaultSummary(status, blockingIssues.length, warningIssues.length),
  ]) || '已返回复盘质量门，建议按阻断项、警告和证据健康一起复核。') ||
    '已返回复盘质量门，建议按阻断项、警告和证据健康一起复核。';

  return {
    blockingIssues,
    evidenceHealthItems: derivedHealthItems,
    finalReviewLabel: resolveAnalysisQualityGateFinalReviewLabel(status, warningIssues.length),
    score,
    status,
    summary,
    warningIssues,
  };
}

function normalizeAnalysisQualityGateIssues(
  values: Array<LiveCenterJsonValue | undefined>
): LiveCenterAnalysisQualityGateIssue[] {
  const items: LiveCenterAnalysisQualityGateIssue[] = [];
  values.forEach((value) => {
    toAnalysisJsonItemArray(value, ['items', 'issues', 'checks', 'problems'])
      .forEach((item, index) => {
        const record = asAnalysisJsonRecord(item);
        if (!record) {
          const text = formatAnalysisQualityGateText(analysisJsonValueToText(item));
          if (text) {
            items.push({
              detail: null,
              evidenceRefs: null,
              title: text,
            });
          }
          return;
        }
        const title = formatAnalysisQualityGateText(firstNonEmptyText([
          readAnalysisJsonText(record, ['title', 'issue', 'problem', 'check', 'name', 'reason', 'message']),
          `复核项 ${formatInteger(index + 1)}`,
        ]));
        const detail = formatAnalysisQualityGateText(firstNonEmptyText([
          readAnalysisJsonText(record, ['detail', 'description', 'fix', 'recommendation', 'requiredAction', 'required_action', 'note']),
          readAnalysisJsonText(record, ['value', 'status']),
        ]));
        items.push({
          detail: detail && title && normalizeAnalysisComparableText(detail) !== normalizeAnalysisComparableText(title)
            ? detail
            : null,
          evidenceRefs: formatAnalysisEvidenceRefs(readAnalysisJsonField(record, [
            'evidenceIds',
            'evidence_ids',
            'evidenceId',
            'evidence_id',
            'refs',
            'references',
          ])),
          title: title || `复核项 ${formatInteger(index + 1)}`,
        });
      });
  });
  return dedupeAnalysisQualityGateIssues(items).slice(0, 6);
}

function normalizeAnalysisQualityGateEvidenceHealth(
  value: LiveCenterJsonValue | undefined
): LiveCenterAnalysisQualityGateHealthItem[] {
  if (value === undefined || value === null) {
    return [];
  }

  const arrayItems = toAnalysisJsonItemArray(value, ['items', 'checks', 'health', 'coverage', 'metrics']);
  if (!(arrayItems.length === 1 && arrayItems[0] === value)) {
    return arrayItems
      .map((item, index) => normalizeAnalysisQualityGateEvidenceHealthItem(item, `证据项 ${formatInteger(index + 1)}`))
      .filter((item): item is LiveCenterAnalysisQualityGateHealthItem => item !== null)
      .slice(0, 6);
  }

  const record = asAnalysisJsonRecord(value);
  if (!record) {
    const text = formatAnalysisQualityGateText(analysisJsonValueToText(value));
    return text ? [{
      detail: null,
      label: '证据健康',
      status: resolveAnalysisQualityGateHealthBadge(text),
      value: text,
    }] : [];
  }

  return Object.entries(record)
    .filter(([key]) => isAnalysisQualityGateEvidenceHealthKey(key))
    .map(([key, itemValue]) => normalizeAnalysisQualityGateEvidenceHealthEntry(key, itemValue))
    .filter((item): item is LiveCenterAnalysisQualityGateHealthItem => item !== null)
    .slice(0, 6);
}

function normalizeAnalysisQualityGateEvidenceHealthFromRecord(
  record: AnalysisJsonRecord
): LiveCenterAnalysisQualityGateHealthItem[] {
  return Object.entries(record)
    .filter(([key]) => isAnalysisQualityGateEvidenceHealthKey(key))
    .map(([key, itemValue]) => normalizeAnalysisQualityGateEvidenceHealthEntry(key, itemValue))
    .filter((item): item is LiveCenterAnalysisQualityGateHealthItem => item !== null)
    .slice(0, 6);
}

function normalizeAnalysisQualityGateEvidenceHealthItem(
  value: LiveCenterJsonValue,
  fallbackLabel: string
): LiveCenterAnalysisQualityGateHealthItem | null {
  const record = asAnalysisJsonRecord(value);
  if (!record) {
    const text = formatAnalysisQualityGateText(analysisJsonValueToText(value));
    return text ? {
      detail: null,
      label: fallbackLabel,
      status: resolveAnalysisQualityGateHealthBadge(text),
      value: text,
    } : null;
  }

  const label = formatAnalysisQualityGateHealthLabel(firstNonEmptyText([
    readAnalysisJsonText(record, ['label', 'name', 'title', 'check', 'metric']),
    fallbackLabel,
  ]) || fallbackLabel);
  const valueText = formatAnalysisQualityGateText(firstNonEmptyText([
    formatAnalysisQualityGateScore(readAnalysisJsonField(record, ['score'])),
    formatAnalysisConfidence(readAnalysisJsonField(record, ['coverage', 'rate', 'ratio'])),
    readAnalysisJsonText(record, ['value', 'status', 'result', 'summary']),
  ]));
  const detail = formatAnalysisQualityGateText(readAnalysisJsonText(record, ['detail', 'description', 'note', 'reason']));
  const badgeSource = readAnalysisJsonText(record, ['status', 'result', 'verdict']) || valueText || detail;

  return valueText || detail ? {
    detail,
    label,
    status: resolveAnalysisQualityGateHealthBadge(badgeSource),
    value: valueText || detail || '-',
  } : null;
}

function normalizeAnalysisQualityGateEvidenceHealthEntry(
  key: string,
  value: LiveCenterJsonValue | undefined
): LiveCenterAnalysisQualityGateHealthItem | null {
  const record = asAnalysisJsonRecord(value);
  if (record) {
    return normalizeAnalysisQualityGateEvidenceHealthItem({
      ...record,
      label: record.label ?? formatAnalysisQualityGateHealthLabel(key),
    }, formatAnalysisQualityGateHealthLabel(key));
  }

  const valueText = key.toLowerCase().includes('coverage') || key.toLowerCase().includes('rate')
    ? formatAnalysisConfidence(value)
    : formatAnalysisQualityGateText(analysisJsonValueToText(value));
  if (!valueText) {
    return null;
  }
  return {
    detail: null,
    label: formatAnalysisQualityGateHealthLabel(key),
    status: resolveAnalysisQualityGateHealthBadge(valueText),
    value: valueText,
  };
}

function resolveAnalysisQualityGateStatus(
  statusText: string | null,
  finalReady: boolean | null,
  blockingIssueCount: number
): LiveCenterAnalysisQualityGateStatus {
  const normalizedStatus = normalizeAnalysisComparableText(statusText || '');
  if (
    finalReady === false ||
    blockingIssueCount > 0 ||
    /blocked|block|fail|failed|error|critical|insufficient|notready|reject|stop|阻断|失败|不可|不足|驳回/.test(normalizedStatus)
  ) {
    return 'blocked';
  }
  if (
    finalReady === true ||
    /pass|passed|ok|ready|approved|success|usable|final|通过|可用|定稿|完成/.test(normalizedStatus)
  ) {
    return 'pass';
  }
  return 'review';
}

function resolveAnalysisQualityGateFinalReviewLabel(
  status: LiveCenterAnalysisQualityGateStatus,
  warningIssueCount: number
): string {
  if (status === 'blocked') {
    return '暂不能作为最终复盘';
  }
  if (status === 'pass' && warningIssueCount > 0) {
    return '可定稿，需留意警告';
  }
  if (status === 'pass') {
    return '可作为最终复盘';
  }
  return '需人工复核后再定稿';
}

function resolveAnalysisQualityGateDefaultSummary(
  status: LiveCenterAnalysisQualityGateStatus,
  blockingIssueCount: number,
  warningIssueCount: number
): string {
  if (status === 'blocked') {
    return `质量门发现 ${formatInteger(blockingIssueCount)} 个阻断问题，暂不建议直接作为最终复盘。`;
  }
  if (warningIssueCount > 0) {
    return `质量门未发现阻断问题，但还有 ${formatInteger(warningIssueCount)} 个警告需要运营复核。`;
  }
  return '质量门未发现阻断问题，证据健康可支撑本次运营复盘。';
}

function formatAnalysisQualityGateScore(value: LiveCenterJsonValue | undefined): string | null {
  const numeric = parseAnalysisNumberLike(value);
  if (numeric !== null) {
    const score = numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric;
    return `${formatAnalysisNumberValue(Math.max(0, Math.min(score, 100)))} 分`;
  }
  return formatAnalysisQualityGateText(analysisJsonValueToText(value));
}

function parseAnalysisQualityGateBoolean(value: LiveCenterJsonValue | undefined): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0;
  }
  if (typeof value === 'string') {
    const normalized = normalizeAnalysisComparableText(value);
    if (/^(true|yes|y|pass|passed|ok|ready|success|1|通过|可用|定稿)$/.test(normalized)) {
      return true;
    }
    if (/^(false|no|n|fail|failed|blocked|0|失败|阻断|不可用)$/.test(normalized)) {
      return false;
    }
  }
  return null;
}

function resolveAnalysisQualityGateHealthBadge(value: string | null): LiveCenterAnalysisResultBadge {
  const normalized = normalizeAnalysisComparableText(value || '');
  if (/blocked|fail|failed|error|critical|insufficient|missing|low|bad|阻断|失败|缺少|不足|偏低|异常/.test(normalized)) {
    return 'danger';
  }
  if (/warn|warning|partial|review|medium|注意|警告|部分|复核|待确认/.test(normalized)) {
    return 'warning';
  }
  if (/pass|passed|ok|ready|healthy|good|success|complete|通过|健康|完整|可用|已满足/.test(normalized)) {
    return 'success';
  }
  const numeric = Number((value || '').replace('%', '').replace('分', '').trim());
  if (Number.isFinite(numeric)) {
    if (numeric >= 80) return 'success';
    if (numeric >= 60) return 'warning';
    return 'danger';
  }
  return 'neutral';
}

function isAnalysisQualityGateEvidenceHealthKey(key: string): boolean {
  const normalizedKey = key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  if (
    normalizedKey.includes('blocking') ||
    normalizedKey.includes('blocker') ||
    normalizedKey.includes('warning') ||
    normalizedKey.includes('issue') ||
    normalizedKey.includes('score') ||
    normalizedKey.includes('status') ||
    normalizedKey.includes('verdict') ||
    normalizedKey.includes('summary') ||
    normalizedKey.includes('recommendation') ||
    normalizedKey.includes('ready')
  ) {
    return false;
  }
  return [
    'asr',
    'transcript',
    'speech',
    'evidence',
    'ledger',
    'coverage',
    'health',
    'frame',
    'visual',
    'metric',
    'minute',
    'recording',
    'segment',
    'playback',
    'timeanchor',
    'time_anchor',
    'scorecard',
    'action',
    'quote',
  ].some((part) => normalizedKey.includes(part));
}

function formatAnalysisQualityGateHealthLabel(key: string): string {
  const normalizedKey = key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  if (normalizedKey.includes('referencedevidencecount')) return '已引用证据';
  if (normalizedKey.includes('ledgerevidencecount')) return '台账证据';
  if (normalizedKey.includes('unresolvedevidencecount')) return '待补证据';
  if (normalizedKey.includes('asrevidencecount')) return '口播证据';
  if (normalizedKey.includes('metricevidencecount')) return '成交证据';
  if (normalizedKey.includes('visualevidencecount')) return '画面证据';
  if (normalizedKey.includes('reviewevidencecount')) return '复核证据';
  if (normalizedKey.includes('momentwithtimeanchorcount')) return '可定位片段';
  if (normalizedKey.includes('scriptreviewwithquotecount')) return '带原话话术';
  if (normalizedKey.includes('scorecarddimensioncount')) return '六维评分覆盖';
  if (normalizedKey.includes('actionitemcount')) return '行动项数量';
  if (normalizedKey.includes('timeanchor') || normalizedKey.includes('time_anchor')) return '时间锚点可定位';
  if (normalizedKey.includes('playback')) return '录屏回放可定位';
  if (normalizedKey.includes('transcript') || normalizedKey.includes('speech') || normalizedKey.includes('asr')) return '口播底稿覆盖';
  if (normalizedKey.includes('frame') || normalizedKey.includes('visual')) return '画面证据覆盖';
  if (normalizedKey.includes('minute') || normalizedKey.includes('metric')) return '成交指标覆盖';
  if (normalizedKey.includes('ledger') || normalizedKey.includes('evidence')) return '证据台账完整度';
  if (normalizedKey.includes('recording') || normalizedKey.includes('segment')) return '录屏材料完整度';
  return formatAnalysisFieldLabel(key);
}

function formatAnalysisQualityGateText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const exactLabels: Record<string, string> = {
    missing_evidence_ledger: '缺少可复核证据台账',
    missing_time_anchor: '关键片段缺少时间定位',
    low_transcript_coverage: '口播底稿覆盖不足',
    low_evidence_coverage: '证据覆盖不足',
    missing_recording_segment: '缺少可播放录屏分段',
    missing_operator_scorecard: '缺少六维运营评分',
    final_review_ready: '可作为最终复盘',
    needs_human_review: '需要人工复核',
  };
  const normalizedKey = trimmed.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
  if (exactLabels[normalizedKey]) {
    return exactLabels[normalizedKey];
  }
  return trimmed
    .replace(/analysisQualityGate|analysis_quality_gate/gi, '复盘质量门')
    .replace(/evidenceLedger|evidence_ledger/gi, '证据台账')
    .replace(/momentReviews|moment_reviews/gi, '时间复盘')
    .replace(/timeAnchor|time_anchor/gi, '时间锚点')
    .replace(/speechScript|speech_script|asrTranscripts|asr_transcripts/gi, '口播底稿')
    .replace(/operatorScorecard|operator_scorecard/gi, '六维运营评分')
    .replace(/actionPlan|action_plan/gi, '行动计划')
    .replace(/blockingIssues|blocking_issues/gi, '阻断问题')
    .replace(/qualityScore|quality_score/gi, '质量分');
}

function dedupeAnalysisQualityGateIssues(
  items: LiveCenterAnalysisQualityGateIssue[]
): LiveCenterAnalysisQualityGateIssue[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [
      normalizeAnalysisComparableText(item.title),
      normalizeAnalysisComparableText(item.detail || ''),
      item.evidenceRefs || '',
    ].join('::');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeAnalysisReviewTasks(value: LiveCenterJsonValue | undefined): LiveCenterAnalysisReviewTaskItem[] {
  return toAnalysisJsonItemArray(value, ['items', 'tasks', 'reviewTasks', 'review_tasks'])
    .map((item, index) => {
      const record = asAnalysisJsonRecord(item);
      if (!record) {
        return {
          detail: analysisJsonValueToText(item) || '-',
          due: null,
          evidenceRefs: null,
          owner: null,
          priority: null,
          status: null,
          taskId: null,
          title: `复核任务 ${index + 1}`,
        };
      }
      return {
        detail:
          readAnalysisJsonText(record, ['detail', 'description', 'reason', 'evidenceRequired', 'evidence_required', 'note']) ||
          '-',
        due: readAnalysisJsonText(record, ['due', 'dueAt', 'due_at', 'deadline']),
        evidenceRefs: formatAnalysisEvidenceRefs(readAnalysisJsonField(record, [
          'evidenceIds',
          'evidence_ids',
          'evidenceId',
          'evidence_id',
          'refs',
          'references',
        ])),
        owner: readAnalysisJsonText(record, ['owner', 'assignee', 'role']),
        priority: readAnalysisJsonText(record, ['priority', 'severity']),
        status: readAnalysisJsonText(record, ['status', 'state']),
        taskId: readAnalysisJsonText(record, ['taskId', 'task_id', 'id']),
        title:
          readAnalysisJsonText(record, ['task', 'title', 'action', 'review', 'question', 'name']) ||
          `复核任务 ${index + 1}`,
      };
    });
}

function normalizeAnalysisSelfEvalItems(value: LiveCenterJsonValue | undefined): LiveCenterAnalysisKeyValueItem[] {
  const record = asAnalysisJsonRecord(value);
  if (!record) {
    const text = analysisJsonValueToText(value);
    return text ? [{ label: '自评', value: clipAnalysisText(text, 180) || text }] : [];
  }

  const preferredKeys = [
    'confidence',
    'confidenceScore',
    'confidence_score',
    'score',
    'completeness',
    'strengths',
    'limitations',
    'risks',
    'riskFlags',
    'risk_flags',
    'missingEvidence',
    'missing_evidence',
    'notes',
    'caveats',
  ];
  const items = preferredKeys
    .map((key) => {
      const valueText = key.toLowerCase().includes('confidence') || key === 'score'
        ? formatAnalysisConfidence(record[key])
        : analysisJsonValueToText(record[key]);
      return valueText ? { label: formatAnalysisFieldLabel(key), value: clipAnalysisText(valueText, 180) || valueText } : null;
    })
    .filter((item): item is LiveCenterAnalysisKeyValueItem => item !== null);

  return items.length > 0 ? items.slice(0, 8) : normalizeAnalysisKeyValueItems(record, 8);
}

function normalizeAnalysisKeyValueItems(value: LiveCenterJsonValue | undefined, limit: number): LiveCenterAnalysisKeyValueItem[] {
  if (Array.isArray(value)) {
    return value
      .map((itemValue, index) => {
        const text = analysisJsonValueToText(itemValue);
        return text ? { label: `项目 ${formatInteger(index + 1)}`, value: clipAnalysisText(text, 120) || text } : null;
      })
      .filter((item): item is LiveCenterAnalysisKeyValueItem => item !== null)
      .slice(0, limit);
  }

  const record = asAnalysisJsonRecord(value);
  if (!record) {
    const text = analysisJsonValueToText(value);
    return text ? [{ label: '值', value: clipAnalysisText(text, 120) || text }] : [];
  }

  return Object.entries(record)
    .filter(([key]) => !isHiddenAnalysisFieldKey(key))
    .map(([key, itemValue]) => {
      const lowerKey = key.toLowerCase();
      const text = lowerKey.includes('confidence') || lowerKey.includes('rate')
        ? formatAnalysisConfidence(itemValue) || analysisJsonValueToText(itemValue)
        : analysisJsonValueToText(itemValue);
      return text ? { label: formatAnalysisFieldLabel(key), value: clipAnalysisText(text, 120) || text } : null;
    })
    .filter((item): item is LiveCenterAnalysisKeyValueItem => item !== null)
    .slice(0, limit);
}

function resolveAnalysisKeyValueItems(
  candidates: Array<LiveCenterJsonValue | undefined>,
  limit: number
): LiveCenterAnalysisKeyValueItem[] {
  for (const candidate of candidates) {
    const items = normalizeAnalysisKeyValueItems(candidate, limit);
    if (items.length > 0) {
      return items;
    }
  }
  return [];
}

function resolveAnalysisTimeAnchorContext(
  inputSnapshot: AnalysisJsonRecord | null,
  context: LiveCenterAnalysisResultBuildContext
): AnalysisTimeAnchorContext {
  const snapshotSession = asAnalysisJsonRecord(readAnalysisJsonField(inputSnapshot, ['session']));
  const snapshotRecording = coerceAnalysisSnapshotRecording(
    asAnalysisJsonRecord(readAnalysisJsonField(inputSnapshot, ['recording']))
  );
  return {
    liveStartTime:
      context.session?.liveStartTime ||
      readAnalysisJsonText(snapshotSession, ['liveStartTime', 'live_start_time']) ||
      readAnalysisJsonText(inputSnapshot, ['liveStartTime', 'live_start_time']) ||
      null,
    segmentAnchors: buildAnalysisSegmentAnchors(context.recording ?? snapshotRecording),
  };
}

function coerceAnalysisSnapshotRecording(record: AnalysisJsonRecord | null): LiveCenterRecording | null {
  const rawSegments = readAnalysisJsonField(record, ['segments']);
  if (!Array.isArray(rawSegments)) {
    return null;
  }
  const segments = rawSegments
    .map((item): LiveCenterRecordingSegment | null => {
      const segment = asAnalysisJsonRecord(item);
      const segmentIndex = parseAnalysisNumberLike(readAnalysisJsonField(segment, ['segmentIndex', 'segment_index']));
      if (segmentIndex === null) {
        return null;
      }
      return {
        durationSeconds: parseAnalysisNumberLike(readAnalysisJsonField(segment, ['durationSeconds', 'duration_seconds'])),
        displaySegmentIndex: parseAnalysisNumberLike(readAnalysisJsonField(segment, [
          'displaySegmentIndex',
          'display_segment_index',
        ])),
        endOffsetSeconds: parseAnalysisNumberLike(readAnalysisJsonField(segment, ['endOffsetSeconds', 'end_offset_seconds'])),
        fileName: readAnalysisJsonText(segment, ['fileName', 'file_name']),
        fileSizeBytes: parseAnalysisNumberLike(readAnalysisJsonField(segment, ['fileSizeBytes', 'file_size_bytes'])),
        mimeType: readAnalysisJsonText(segment, ['mimeType', 'mime_type']),
        processingStatus: readAnalysisJsonText(segment, ['processingStatus', 'processing_status']),
        recordingId: readAnalysisJsonText(segment, ['recordingId', 'recording_id']),
        segmentId: readAnalysisJsonText(segment, ['segmentId', 'segment_id']) || `snapshot-segment-${segmentIndex}`,
        segmentIndex,
        startOffsetSeconds: parseAnalysisNumberLike(readAnalysisJsonField(segment, [
          'startOffsetSeconds',
          'start_offset_seconds',
        ])),
        uploadedAt: readAnalysisJsonText(segment, ['uploadedAt', 'uploaded_at']),
        uploadStatus: readAnalysisJsonText(segment, ['uploadStatus', 'upload_status']) || 'uploaded',
      };
    })
    .filter((segment): segment is LiveCenterRecordingSegment => segment !== null);
  if (segments.length === 0) {
    return null;
  }
  return {
    recordingId: readAnalysisJsonText(record, ['recordingId', 'recording_id']) || 'snapshot-recording',
    segments,
    status: readAnalysisJsonText(record, ['status']) || null,
  };
}

function buildAnalysisSegmentAnchors(recording: LiveCenterRecording | null): AnalysisSegmentAnchor[] {
  const rawSegments = recording?.segments ?? [];
  const uploadedSegments = rawSegments.filter(isUploadedAnalysisSegment);
  const visibleSegments = uploadedSegments.length > 0
    ? uploadedSegments
    : rawSegments.filter(isVisibleAnalysisSegment);
  const segments = [...visibleSegments]
    .sort((left, right) => left.segmentIndex - right.segmentIndex);
  let rollingOffsetSeconds = 0;
  let canInferFromDuration = true;

  return segments.map((segment, index) => {
    const ordinal = index + 1;
    const durationSeconds = parseAnalysisNumberLike(segment.durationSeconds);
    const explicitStart = parseAnalysisNumberLike(segment.startOffsetSeconds);
    const explicitEnd = parseAnalysisNumberLike(segment.endOffsetSeconds);
    const inferredStartFromEnd = explicitEnd !== null && durationSeconds !== null
      ? Math.max(0, explicitEnd - durationSeconds)
      : null;
    const startOffsetSeconds =
      explicitStart ??
      inferredStartFromEnd ??
      (canInferFromDuration && durationSeconds !== null ? rollingOffsetSeconds : null);
    const endOffsetSeconds =
      explicitEnd ??
      (startOffsetSeconds !== null && durationSeconds !== null ? startOffsetSeconds + durationSeconds : null);
    const displaySegmentIndex = parseAnalysisNumberLike(segment.displaySegmentIndex) ?? ordinal;

    if (endOffsetSeconds !== null) {
      rollingOffsetSeconds = endOffsetSeconds;
    } else {
      canInferFromDuration = false;
    }

    return {
      displaySegmentIndex,
      endOffsetSeconds,
      ordinal,
      segmentIndex: segment.segmentIndex,
      startOffsetSeconds,
    };
  });
}

function isUploadedAnalysisSegment(segment: LiveCenterRecordingSegment): boolean {
  return isLiveCenterRecordingSegmentPlayable(segment);
}

function isVisibleAnalysisSegment(segment: LiveCenterRecordingSegment): boolean {
  return isLiveCenterRecordingSegmentVisibleForReview(segment);
}

function normalizeAnalysisTimeAnchor(
  anchorValue: LiveCenterJsonValue | undefined,
  fallbackRecord?: AnalysisJsonRecord | null,
  context?: AnalysisTimeAnchorContext
): LiveCenterAnalysisTimeAnchor {
  const directAnchor = asAnalysisJsonRecord(anchorValue);
  const nestedAnchor = directAnchor ?? asAnalysisJsonRecord(readAnalysisJsonField(fallbackRecord ?? null, ['timeAnchor', 'time_anchor']));
  const source = nestedAnchor ?? fallbackRecord ?? null;
  const rawDisplaySegmentIndex = parseAnalysisNumberLike(readAnalysisJsonField(source, [
    'displaySegmentIndex',
    'display_segment_index',
  ]));
  const explicitOrTextSegmentIndex =
    parseAnalysisNumberLike(readAnalysisJsonField(source, ['segmentIndex', 'segment_index', 'segment'])) ??
    resolveKnownAnalysisDisplaySegmentIndex(rawDisplaySegmentIndex, context) ??
    inferAnalysisSegmentIndexFromEvidenceRefs(compactAnalysisTextParts([
      formatAnalysisEvidenceRefs(readAnalysisJsonField(source, [
        'evidenceRefs',
        'evidence_refs',
        'evidenceIds',
        'evidence_ids',
        'evidenceId',
        'evidence_id',
        'refs',
        'references',
      ])),
      readAnalysisJsonText(source, ['title', 'event', 'moment', 'scene', 'phase', 'label']),
      readAnalysisJsonText(source, ['segmentLabel', 'segment_label', 'recordingLabel', 'recording_label']),
    ], ' '), context);
  const sliceIndex = parseAnalysisNumberLike(readAnalysisJsonField(source, ['sliceIndex', 'slice_index', 'slice']));
  const rawDisplayTimeRange = readAnalysisJsonText(source, [
    'displayTimeRange',
    'display_time_range',
    'timeRange',
    'time_range',
    'time',
    'timestamp',
    'at',
  ]);
  const offsetRangeParts = resolveAnalysisOffsetRangeParts(source);
  const clockRangeOffsetParts =
    offsetRangeParts.startOffsetSeconds === null && offsetRangeParts.endOffsetSeconds === null
      ? parseBusinessClockOffsetRangeText(rawDisplayTimeRange, context?.liveStartTime ?? null)
      : { endOffsetSeconds: null, startOffsetSeconds: null };
  const startOffsetSeconds = offsetRangeParts.startOffsetSeconds ?? clockRangeOffsetParts.startOffsetSeconds;
  const endOffsetSeconds = offsetRangeParts.endOffsetSeconds ?? clockRangeOffsetParts.endOffsetSeconds;
  const segmentProbeOffset = startOffsetSeconds ?? (
    endOffsetSeconds !== null ? Math.max(0, endOffsetSeconds - 0.001) : null
  );
  const offsetSegmentAnchor = resolveAnalysisSegmentAnchorByOffset(context, segmentProbeOffset);
  const inferredSegmentIndex = offsetSegmentAnchor?.segmentIndex ?? explicitOrTextSegmentIndex;
  const displaySegmentIndex =
    offsetSegmentAnchor?.displaySegmentIndex ??
    rawDisplaySegmentIndex ??
    resolveAnalysisDisplaySegmentIndex(context, inferredSegmentIndex);
  const rawSegmentLabel = readAnalysisJsonText(source, ['segmentLabel', 'segment_label', 'recordingLabel', 'recording_label']);
  const segmentLabel =
    normalizeAnalysisSegmentLabel(rawSegmentLabel, displaySegmentIndex) ||
    formatAnalysisSegmentLabel(inferredSegmentIndex, sliceIndex, context);
  const clockTimeRange =
    readAnalysisJsonText(source, ['clockTimeRange', 'clock_time_range', 'clockRange', 'clock_range']) ||
    formatAnalysisClockTimeRange(context?.liveStartTime ?? null, startOffsetSeconds, endOffsetSeconds);
  const offsetRange =
    readAnalysisJsonText(source, ['offsetRange', 'offset_range']) ||
    formatAnalysisOffsetRange(startOffsetSeconds, endOffsetSeconds);
  const minuteRangeLabel =
    readAnalysisJsonText(source, ['minuteRangeLabel', 'minute_range_label', 'minuteRange', 'minute_range']) ||
    formatAnalysisMinuteRange(startOffsetSeconds, endOffsetSeconds);
  const derivedDisplayTimeRange = compactAnalysisTextParts([
    clockTimeRange,
    minuteRangeLabel,
    segmentLabel,
  ], '｜') || compactAnalysisTextParts([offsetRange, minuteRangeLabel, segmentLabel], '｜');
  const displayTimeRange =
    rawDisplayTimeRange && !isGenericAnalysisTimeText(rawDisplayTimeRange)
      ? appendAnalysisSegmentLabel(rawDisplayTimeRange, segmentLabel)
      : derivedDisplayTimeRange || rawDisplayTimeRange;

  return {
    clockTimeRange,
    displayTimeRange,
    displaySegmentIndex,
    minuteRangeLabel,
    offsetEndSeconds: endOffsetSeconds,
    offsetRange,
    offsetStartSeconds: startOffsetSeconds,
    segmentIndex: inferredSegmentIndex,
    segmentLabel,
    sliceIndex,
  };
}

function readAnalysisTimeAnchorText(
  anchorValue: LiveCenterJsonValue | undefined,
  fallbackRecord?: AnalysisJsonRecord | null,
  context?: AnalysisTimeAnchorContext
): string | null {
  const anchor = normalizeAnalysisTimeAnchor(anchorValue, fallbackRecord, context);
  return firstNonEmptyText([
    anchor.displayTimeRange,
    anchor.clockTimeRange,
    anchor.offsetRange,
    compactAnalysisTextParts([anchor.minuteRangeLabel, anchor.segmentLabel], '｜'),
  ]);
}

function resolveAnalysisOffsetRangeParts(source: AnalysisJsonRecord | null): AnalysisOffsetRangeParts {
  const explicitStart = firstFiniteNumber([
    readAnalysisJsonField(source, ['offsetStartSeconds', 'offset_start_seconds', 'startOffsetSeconds', 'start_offset_seconds']),
    readAnalysisJsonField(source, ['startSecond', 'start_second', 'startSeconds', 'start_seconds']),
  ]);
  const explicitEnd = firstFiniteNumber([
    readAnalysisJsonField(source, ['offsetEndSeconds', 'offset_end_seconds', 'endOffsetSeconds', 'end_offset_seconds']),
    readAnalysisJsonField(source, ['endSecond', 'end_second', 'endSeconds', 'end_seconds']),
  ]);
  if (explicitStart !== null || explicitEnd !== null) {
    return {
      endOffsetSeconds: explicitEnd,
      startOffsetSeconds: explicitStart,
    };
  }

  const minuteStart = firstFiniteNumber([
    readAnalysisJsonField(source, ['minuteOffset', 'minute_offset', 'minuteStart', 'minute_start', 'startMinute', 'start_minute']),
  ]);
  const minuteEnd = firstFiniteNumber([
    readAnalysisJsonField(source, ['minuteEnd', 'minute_end', 'endMinute', 'end_minute']),
  ]);
  if (minuteStart !== null || minuteEnd !== null) {
    return {
      endOffsetSeconds: minuteEnd !== null ? minuteEnd * 60 : null,
      startOffsetSeconds: minuteStart !== null ? minuteStart * 60 : null,
    };
  }

  return parseAnalysisOffsetRangeText(firstNonEmptyText([
    readAnalysisJsonText(source, ['displayTimeRange', 'display_time_range']),
    readAnalysisJsonText(source, ['timeRange', 'time_range']),
    readAnalysisJsonText(source, ['minuteRangeLabel', 'minute_range_label', 'minuteRange', 'minute_range']),
    readAnalysisJsonText(source, ['time', 'timestamp', 'at', 'startTime', 'start_time', 'start', 'offset']),
    readAnalysisJsonText(source, ['title', 'event', 'moment', 'scene', 'phase', 'label']),
  ]));
}

function parseAnalysisOffsetRangeText(value: string | null): AnalysisOffsetRangeParts {
  const text = value?.trim();
  if (!text) {
    return { endOffsetSeconds: null, startOffsetSeconds: null };
  }

  const ordinalMinuteMatch = ORDINAL_MINUTE_RANGE_PATTERN.exec(text);
  if (ordinalMinuteMatch) {
    const startOrdinal = Number(ordinalMinuteMatch[1]);
    const endOrdinal = ordinalMinuteMatch[2] ? Number(ordinalMinuteMatch[2]) : startOrdinal;
    if (Number.isFinite(startOrdinal) && Number.isFinite(endOrdinal)) {
      return {
        endOffsetSeconds: Math.max(startOrdinal, endOrdinal) * 60,
        startOffsetSeconds: Math.max(0, (Math.min(startOrdinal, endOrdinal) - 1) * 60),
      };
    }
  }

  const offsetClockMatch = OFFSET_CLOCK_RANGE_PATTERN.exec(text);
  if (offsetClockMatch) {
    const startSeconds = parseOffsetClockParts(offsetClockMatch[1], offsetClockMatch[2], offsetClockMatch[3]);
    const endSeconds = parseOffsetClockParts(offsetClockMatch[4], offsetClockMatch[5], offsetClockMatch[6]);
    if (startSeconds !== null && endSeconds !== null && (startSeconds < 3600 || text.startsWith('00:'))) {
      return {
        endOffsetSeconds: endSeconds,
        startOffsetSeconds: startSeconds,
      };
    }
    return { endOffsetSeconds: null, startOffsetSeconds: null };
  }

  const minuteOffsetMatch = MINUTE_OFFSET_RANGE_PATTERN.exec(text);
  if (minuteOffsetMatch) {
    const startMinute = Number(minuteOffsetMatch[1]);
    const endMinute = Number(minuteOffsetMatch[2]);
    if (Number.isFinite(startMinute) && Number.isFinite(endMinute)) {
      return {
        endOffsetSeconds: Math.max(startMinute, endMinute) * 60,
        startOffsetSeconds: Math.min(startMinute, endMinute) * 60,
      };
    }
  }

  const singleMinuteMatch = /(?:minute\s*offset|minuteOffset|minute_offset|第)?\s*(\d+(?:\.\d+)?)\s*(?:分钟|min|m)\b/i.exec(text);
  if (singleMinuteMatch) {
    const minute = Number(singleMinuteMatch[1]);
    if (Number.isFinite(minute)) {
      return {
        endOffsetSeconds: (minute + 1) * 60,
        startOffsetSeconds: minute * 60,
      };
    }
  }

  return { endOffsetSeconds: null, startOffsetSeconds: null };
}

function parseBusinessClockOffsetRangeText(
  value: string | null,
  liveStartTime: string | null
): AnalysisOffsetRangeParts {
  const text = value?.trim();
  if (!text || !liveStartTime) {
    return { endOffsetSeconds: null, startOffsetSeconds: null };
  }
  const liveStartParts = ANALYSIS_BUSINESS_DATETIME_PATTERN.exec(liveStartTime);
  const clockRangeMatch = OFFSET_CLOCK_RANGE_PATTERN.exec(text);
  if (!liveStartParts || !clockRangeMatch) {
    return { endOffsetSeconds: null, startOffsetSeconds: null };
  }

  const [, , , , startHour, startMinute, startSecond = '00'] = liveStartParts;
  const liveStartSeconds = parseOffsetClockParts(startHour, startMinute, startSecond);
  const rawStartSeconds = parseOffsetClockParts(clockRangeMatch[1], clockRangeMatch[2], clockRangeMatch[3]);
  const rawEndSeconds = parseOffsetClockParts(clockRangeMatch[4], clockRangeMatch[5], clockRangeMatch[6]);
  if (liveStartSeconds === null || rawStartSeconds === null || rawEndSeconds === null) {
    return { endOffsetSeconds: null, startOffsetSeconds: null };
  }

  let startOffsetSeconds = rawStartSeconds - liveStartSeconds;
  while (startOffsetSeconds < 0) {
    startOffsetSeconds += 24 * 60 * 60;
  }
  let endOffsetSeconds = rawEndSeconds - liveStartSeconds;
  while (endOffsetSeconds < startOffsetSeconds) {
    endOffsetSeconds += 24 * 60 * 60;
  }

  return {
    endOffsetSeconds,
    startOffsetSeconds,
  };
}

function parseOffsetClockParts(hourOrMinute: string, minute: string, second?: string): number | null {
  const left = Number(hourOrMinute);
  const middle = Number(minute);
  const right = second ? Number(second) : 0;
  if (!Number.isFinite(left) || !Number.isFinite(middle) || !Number.isFinite(right)) {
    return null;
  }
  if (second) {
    return left * 3600 + middle * 60 + right;
  }
  return left * 60 + middle;
}

function resolveAnalysisSegmentAnchorByOffset(
  context: AnalysisTimeAnchorContext | undefined,
  offsetSeconds: number | null
): AnalysisSegmentAnchor | null {
  if (!context || offsetSeconds === null) {
    return null;
  }
  return context.segmentAnchors.find((segment) => {
    if (segment.startOffsetSeconds === null || segment.endOffsetSeconds === null) {
      return false;
    }
    return offsetSeconds >= segment.startOffsetSeconds && offsetSeconds < segment.endOffsetSeconds;
  }) ?? null;
}

function resolveAnalysisDisplaySegmentIndex(
  context: AnalysisTimeAnchorContext | undefined,
  segmentIndex: number | null
): number | null {
  if (segmentIndex === null || !Number.isFinite(segmentIndex)) {
    return null;
  }
  if (!context || context.segmentAnchors.length === 0) {
    return segmentIndex;
  }
  return context.segmentAnchors.find((segment) => segment.segmentIndex === segmentIndex)?.displaySegmentIndex ?? segmentIndex;
}

function resolveKnownAnalysisDisplaySegmentIndex(
  displaySegmentIndex: number | null,
  context: AnalysisTimeAnchorContext | undefined
): number | null {
  if (displaySegmentIndex === null || !Number.isFinite(displaySegmentIndex) || !context) {
    return null;
  }
  return context.segmentAnchors.find((segment) => segment.displaySegmentIndex === displaySegmentIndex)?.segmentIndex ?? null;
}

function formatAnalysisClockTimeRange(
  liveStartTime: string | null,
  startOffsetSeconds: number | null,
  endOffsetSeconds: number | null
): string | null {
  const startClock = offsetSecondsToBusinessClock(liveStartTime, startOffsetSeconds);
  const endClock = offsetSecondsToBusinessClock(liveStartTime, endOffsetSeconds);
  return compactAnalysisRange(startClock, endClock);
}

function offsetSecondsToBusinessClock(liveStartTime: string | null, offsetSeconds: number | null): string | null {
  if (!liveStartTime || offsetSeconds === null) {
    return null;
  }
  const matched = ANALYSIS_BUSINESS_DATETIME_PATTERN.exec(liveStartTime);
  if (!matched) {
    return null;
  }
  const [, year, month, day, hour, minute, second = '00'] = matched;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setSeconds(date.getSeconds() + Math.round(offsetSeconds));
  return [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join(':');
}

function formatAnalysisOffsetRange(startOffsetSeconds: number | null, endOffsetSeconds: number | null): string | null {
  return compactAnalysisRange(formatOffsetSeconds(startOffsetSeconds), formatOffsetSeconds(endOffsetSeconds));
}

function formatOffsetSeconds(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  const totalSeconds = Math.max(0, Math.round(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':');
}

function formatAnalysisMinuteRange(startOffsetSeconds: number | null, endOffsetSeconds: number | null): string | null {
  if (startOffsetSeconds === null && endOffsetSeconds === null) {
    return null;
  }
  const safeStart = Math.max(0, Math.floor((startOffsetSeconds ?? endOffsetSeconds ?? 0) / 60)) + 1;
  if (endOffsetSeconds === null || endOffsetSeconds <= (startOffsetSeconds ?? 0)) {
    return `第 ${formatInteger(safeStart)} 分钟`;
  }
  const safeEnd = Math.max(safeStart, Math.ceil(endOffsetSeconds / 60));
  return safeEnd === safeStart
    ? `第 ${formatInteger(safeStart)} 分钟`
    : `第 ${formatInteger(safeStart)}-${formatInteger(safeEnd)} 分钟`;
}

function compactAnalysisRange(start: string | null, end: string | null): string | null {
  if (start && end && start !== end) {
    return `${start}-${end}`;
  }
  return start || end || null;
}

function isGenericAnalysisTimeText(value: string): boolean {
  const normalized = value.trim();
  return (
    /待定位|未定位|待确认|unknown|pending|to\s*be\s*located/i.test(normalized) ||
    /minute\s*offset|minuteOffset|minute_offset|分钟偏移/i.test(normalized) ||
    /^第\s*\d+(?:\s*(?:-|–|—|~|至|到)\s*\d+)?\s*分钟$/.test(normalized) ||
    /^\d+(?:\.\d+)?\s*(?:-|–|—|~|至|到)\s*\d+(?:\.\d+)?\s*(?:分钟|min|m)?$/i.test(normalized) ||
    /^\d+(?:\.\d+)?\s*(?:分钟|min|m)$/i.test(normalized) ||
    /^0\d?:\d{2}(?::\d{2})?\s*(?:-|–|—|~|至|到)\s*\d{1,2}:\d{2}(?::\d{2})?$/.test(normalized)
  );
}

function isAnalysisRecordingOnlyTimeText(value: string | null): boolean {
  return Boolean(value?.trim().match(/^录屏\s*#?\d+(?:\s*\/\s*slice\s*\d+)?$/i));
}

function appendAnalysisSegmentLabel(value: string, segmentLabel: string | null): string {
  const normalized = normalizeAnalysisDisplayTimeRangeText(value, segmentLabel);
  if (!segmentLabel || normalized.includes(segmentLabel)) {
    return normalized;
  }
  return compactAnalysisTextParts([normalized, segmentLabel], '｜') || normalized;
}

function normalizeAnalysisDisplayTimeRangeText(value: string, segmentLabel: string | null): string {
  const normalized = normalizeAnalysisSegmentReferenceText(value, segmentLabel)
    .replace(ANALYSIS_SLICE_LABEL_PATTERN, '');
  return cleanAnalysisTimeLabelText(normalized);
}

function normalizeAnalysisSegmentLabel(value: string | null, displaySegmentIndex: number | null): string | null {
  const displayLabel = formatAnalysisDisplaySegmentLabel(displaySegmentIndex);
  if (displayLabel) {
    return displayLabel;
  }
  if (!value) {
    return null;
  }
  const normalized = normalizeAnalysisSegmentReferenceText(value, null)
    .replace(ANALYSIS_SLICE_LABEL_PATTERN, '');
  return cleanAnalysisTimeLabelText(normalized) || null;
}

function normalizeAnalysisSegmentReferenceText(value: string, segmentLabel: string | null): string {
  return value
    .replace(ANALYSIS_RECORDING_LABEL_PATTERN, (_match, rawIndex: string) => {
      return segmentLabel || `录屏 #${formatInteger(Number(rawIndex))}`;
    })
    .replace(ANALYSIS_SEGMENT_LABEL_PATTERN, (_match, rawIndex: string) => {
      return segmentLabel || `录屏 #${formatInteger(Number(rawIndex))}`;
    });
}

function cleanAnalysisTimeLabelText(value: string): string {
  const parts = value
    .replace(/\s*｜\s*/g, '｜')
    .replace(/\s+/g, ' ')
    .trim()
    .split('｜')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.filter((part, index) => index === 0 || part !== parts[index - 1]).join('｜');
}

function inferAnalysisSegmentIndexFromEvidenceRefs(
  value: string | null,
  context: AnalysisTimeAnchorContext | undefined
): number | null {
  if (!value) {
    return null;
  }
  const segmentMatch = /\bsegment\s*[:#-]?\s*(\d+)\b/i.exec(value);
  if (segmentMatch) {
    const segmentIndex = Number(segmentMatch[1]);
    return resolveKnownAnalysisSegmentIndex(segmentIndex, context, true);
  }
  const asrMatch = /\basr\s*[:#-]?\s*(\d+)\b/i.exec(value);
  if (asrMatch) {
    const segmentIndex = Number(asrMatch[1]);
    return resolveKnownAnalysisSegmentIndex(segmentIndex, context, false);
  }
  const recordingMatch = /录屏\s*#?\s*(\d+)/i.exec(value);
  if (recordingMatch) {
    const segmentIndex = Number(recordingMatch[1]);
    return resolveKnownAnalysisSegmentIndex(segmentIndex, context, true, true);
  }
  return null;
}

function resolveKnownAnalysisSegmentIndex(
  segmentIndex: number,
  context: AnalysisTimeAnchorContext | undefined,
  trustWithoutContext: boolean,
  allowDisplayOrdinal = false
): number | null {
  if (!Number.isFinite(segmentIndex)) {
    return null;
  }
  if (!context || context.segmentAnchors.length === 0) {
    return trustWithoutContext ? segmentIndex : null;
  }
  const rawMatch = context.segmentAnchors.find((segment) => segment.segmentIndex === segmentIndex);
  if (rawMatch) {
    return rawMatch.segmentIndex;
  }
  if (!allowDisplayOrdinal) {
    return null;
  }
  return context.segmentAnchors.find((segment) => segment.displaySegmentIndex === segmentIndex)?.segmentIndex ?? null;
}

function formatAnalysisSegmentLabel(
  segmentIndex: number | null,
  _sliceIndex: number | null,
  context?: AnalysisTimeAnchorContext
): string | null {
  return formatAnalysisDisplaySegmentLabel(resolveAnalysisDisplaySegmentIndex(context, segmentIndex));
}

function formatAnalysisDisplaySegmentLabel(displaySegmentIndex: number | null): string | null {
  if (displaySegmentIndex === null || !Number.isFinite(displaySegmentIndex)) {
    return null;
  }
  return `录屏 #${formatInteger(displaySegmentIndex)}`;
}

function normalizeTextList(value: LiveCenterJsonValue | undefined): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => analysisJsonValueToText(item))
      .filter((item): item is string => Boolean(item));
  }
  const record = asAnalysisJsonRecord(value);
  if (record) {
    return Object.values(record)
      .map((item) => analysisJsonValueToText(item))
      .filter((item): item is string => Boolean(item));
  }
  const text = analysisJsonValueToText(value);
  if (!text) {
    return [];
  }
  return text
    .split(/[，,、;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstFiniteNumber(values: Array<LiveCenterJsonValue | undefined>): number | null {
  for (const value of values) {
    const numberValue = parseAnalysisNumberLike(value);
    if (numberValue !== null) {
      return numberValue;
    }
  }
  return null;
}

function parseAnalysisNumberLike(value: LiveCenterJsonValue | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').replace('%', '').trim();
    if (!normalized) {
      return null;
    }
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function normalizeAnalysisComparableText(value: string): string {
  return value
    .replace(/\s+/g, '')
    .replace(/[。；;,.，、:：_-]/g, '')
    .toLowerCase();
}

function readAnalysisJsonField(record: AnalysisJsonRecord | null, keys: string[]): LiveCenterJsonValue | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function readAnalysisJsonText(record: AnalysisJsonRecord | null, keys: string[]): string | null {
  return analysisJsonValueToText(readAnalysisJsonField(record, keys));
}

function toAnalysisJsonItemArray(value: LiveCenterJsonValue | undefined, arrayKeys: string[]): LiveCenterJsonValue[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is LiveCenterJsonValue => item !== undefined);
  }
  const record = asAnalysisJsonRecord(value);
  if (!record) {
    return value === undefined || value === null ? [] : [value];
  }
  for (const key of arrayKeys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is LiveCenterJsonValue => item !== undefined);
    }
  }
  return [record];
}

function analysisJsonValueToText(value: LiveCenterJsonValue | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = polishAnalysisReaderText(redactSensitiveAnalysisText(value)).trim();
    return trimmed || null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? formatAnalysisNumberValue(value) : null;
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }
  if (Array.isArray(value)) {
    const parts = value.map((item) => analysisJsonValueToText(item)).filter(Boolean);
    return parts.length > 0 ? parts.join('；') : null;
  }
  const record = asAnalysisJsonRecord(value);
  if (!record) {
    return null;
  }
  const preferred = readAnalysisJsonText(record, ['text', 'summary', 'content', 'value', 'description', 'label', 'name']);
  if (preferred) {
    return preferred;
  }
  const parts = Object.entries(record)
    .filter(([key]) => !isHiddenAnalysisFieldKey(key))
    .slice(0, 3)
    .map(([key, itemValue]) => {
      const text = analysisJsonValueToText(itemValue);
      return text ? `${formatAnalysisFieldLabel(key)} ${text}` : null;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join('；') : null;
}

function polishAnalysisReaderText(value: string): string {
  return value
    .replace(/分钟指标显示/g, '成交曲线显示')
    .replace(/分钟指标/g, '成交曲线')
    .replace(/ASR\s*转写/g, '口播转写')
    .replace(/ASR/g, '口播')
    .replace(/录屏段数/g, '录屏材料')
    .replace(/抽帧/g, '画面证据')
    .replace(/处理链路/g, '证据链路');
}

function formatAnalysisConfidence(value: LiveCenterJsonValue | undefined): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value <= 1) {
      return `${Math.round(value * 100)}%`;
    }
    if (value >= 0 && value <= 100) {
      return `${Math.round(value)}%`;
    }
    return formatAnalysisNumberValue(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.endsWith('%')) {
      return trimmed;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return formatAnalysisConfidence(numeric);
    }
  }
  return analysisJsonValueToText(value);
}

function formatAnalysisScore(value: LiveCenterJsonValue | undefined): string | null {
  const numberValue = parseAnalysisNumberLike(value);
  if (numberValue === null) {
    return analysisJsonValueToText(value);
  }
  if (numberValue >= 0 && numberValue <= 1) {
    return `${Math.round(numberValue * 100)} 分`;
  }
  return `${formatAnalysisNumberValue(numberValue)} 分`;
}

function formatAnalysisEvidenceRefs(value: LiveCenterJsonValue | undefined): string | null {
  if (Array.isArray(value)) {
    const refs = value
      .map((item) => analysisJsonValueToText(item))
      .filter((item): item is string => Boolean(item));
    return refs.length > 0 ? clipAnalysisText(refs.join(', '), 180) : null;
  }

  const record = asAnalysisJsonRecord(value);
  if (record) {
    const nested = readAnalysisJsonField(record, [
      'evidenceIds',
      'evidence_ids',
      'evidenceId',
      'evidence_id',
      'id',
      'ref',
      'refs',
    ]);
    if (nested !== value) {
      return formatAnalysisEvidenceRefs(nested);
    }
  }

  return clipAnalysisText(analysisJsonValueToText(value), 180);
}

function compactAnalysisTextParts(parts: Array<string | null>, separator: string): string | null {
  const uniqueParts = Array.from(new Set(parts.filter((part): part is string => Boolean(part))));
  return uniqueParts.length > 0 ? uniqueParts.join(separator) : null;
}

function redactSensitiveAnalysisText(value: string): string {
  return value.replace(URL_LIKE_TEXT_PATTERN, '[已隐藏链接]');
}

function isHiddenAnalysisFieldKey(key: string): boolean {
  const normalizedKey = key.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  return HIDDEN_ANALYSIS_FIELD_KEY_PARTS.some((part) => normalizedKey.includes(part));
}

function formatAnalysisFieldLabel(key: string): string {
  const normalizedKey = key.trim();
  const label = ANALYSIS_FIELD_LABELS[normalizedKey];
  if (label) {
    return label;
  }
  return normalizedKey
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

function formatAnalysisNumberValue(value: number): string {
  return Number.isInteger(value) ? formatInteger(value) : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function clipAnalysisText(value: string | null, maxLength: number): string | null {
  if (!value) {
    return null;
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function firstNonEmptyText(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function asAnalysisJsonRecord(value: LiveCenterJsonValue | undefined): AnalysisJsonRecord | null {
  return isJsonRecord(value) ? value : null;
}

function resolveAnalysisJsonSummary(analysis: LiveCenterAnalysisJob): string | null {
  const payload = normalizeAnalysisJsonPayload(analysis.analysisJson ?? analysis.analysis_json);
  if (!payload) {
    return null;
  }
  return stringifyAnalysisJsonValue(payload.summary);
}

function normalizeAnalysisJsonPayload(value: unknown): Record<string, LiveCenterJsonValue> | null {
  if (isJsonRecord(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return isJsonRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringifyAnalysisJsonValue(value: LiveCenterJsonValue | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = redactSensitiveAnalysisText(value).trim();
    return trimmed || null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const lines = value.map((item) => stringifyAnalysisJsonValue(item)).filter(Boolean);
    return lines.length > 0 ? lines.join('；') : null;
  }
  if (isJsonRecord(value)) {
    const candidates = ['text', 'summary', 'content', 'value', 'description'];
    for (const key of candidates) {
      const candidate = stringifyAnalysisJsonValue(value[key]);
      if (candidate) {
        return candidate;
      }
    }
  }
  return null;
}

function isJsonRecord(value: unknown): value is Record<string, LiveCenterJsonValue> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function findLatestAnalysis(analyses: LiveCenterAnalysisJob[]): LiveCenterAnalysisJob | null {
  return analyses.reduce<LiveCenterAnalysisJob | null>((latest, analysis) => {
    if (!latest) return analysis;
    return resolveAnalysisTimestamp(analysis) >= resolveAnalysisTimestamp(latest) ? analysis : latest;
  }, null);
}

export function findLatestSuccessfulAnalysis(analyses: LiveCenterAnalysisJob[]): LiveCenterAnalysisJob | null {
  return findLatestAnalysis(analyses.filter((analysis) => isSuccessfulAnalysisStatus(analysis.status)));
}

export function summarizeMinuteMetrics(metrics: LiveCenterMinuteMetric[]): {
  peakLabel: string;
  pointCount: number;
  totalOrders: number;
} {
  const validMetrics = metrics.filter(
    (metric) => typeof metric.orderCount === 'number' && Number.isFinite(metric.orderCount)
  );
  const pointCount = validMetrics.length;
  if (pointCount === 0) {
    return {
      peakLabel: '-',
      pointCount: 0,
      totalOrders: 0,
    };
  }

  let peakMetric = validMetrics[0];
  let totalOrders = 0;
  for (const metric of validMetrics) {
    totalOrders += metric.orderCount ?? 0;
    if ((metric.orderCount ?? 0) > (peakMetric.orderCount ?? 0)) {
      peakMetric = metric;
    }
  }

  return {
    peakLabel: `${formatInteger(peakMetric.orderCount)} / ${formatMinuteMetricLabel(peakMetric)}`,
    pointCount,
    totalOrders,
  };
}

function formatMinuteMetricLabel(metric: LiveCenterMinuteMetric): string {
  const formattedMinute = formatBusinessClockMinute(metric.liveMinuteTime, '');
  if (formattedMinute) {
    return formattedMinute;
  }
  if (typeof metric.minuteOffset === 'number' && Number.isFinite(metric.minuteOffset)) {
    return `${metric.minuteOffset} 分钟`;
  }
  return '-';
}

function resolveAnalysisTimestamp(analysis: LiveCenterAnalysisJob): number {
  const candidates = [
    analysis.completedAt,
    analysis.finishedAt,
    analysis.updatedAt,
    analysis.startedAt,
    analysis.createdAt,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const timestamp = Date.parse(candidate);
    if (Number.isFinite(timestamp)) return timestamp;
  }

  return 0;
}
