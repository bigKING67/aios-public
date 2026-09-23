import type {
  ContentAssetAnalysisDiagnosis,
  ContentAssetAnalysisEvidenceLedgerItem,
  ContentAssetAnalysisLiveAcceptanceAttribution,
  ContentAssetAnalysisNextActionItem,
  ContentAssetAnalysisPlatformFitItem,
  ContentAssetAnalysisRecord,
  ContentAssetAnalysisScoreItem,
  ContentAssetAnalysisTimelineItem,
  ContentAssetContentUnderstanding,
  ContentAssetContentUnderstandingKey,
  ContentAssetCurrentAiAnalysis,
  ContentAssetDiagnosisBoundary,
  ContentAssetFusionContractValidation,
  ContentAssetPrimaryDecision,
  ContentAssetPrimaryDecisionKey,
} from './content-assets-analysis-contracts';

export type * from './content-assets-analysis-contracts';

export function asContentAssetAnalysisRecord(value: unknown): ContentAssetAnalysisRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as ContentAssetAnalysisRecord;
}

export function resolveContentAssetAnalysisPayload(document: unknown): ContentAssetAnalysisRecord | null {
  const root = asContentAssetAnalysisRecord(document);
  if (!root) return null;
  const analysis = asContentAssetAnalysisRecord(root.analysis);
  if (!analysis) return root;
  const mergedAnalysis: ContentAssetAnalysisRecord = { ...analysis };
  let didMerge = false;
  const rootMetadata = readFirstValue(root, ['metadata', 'meta']);
  if (rootMetadata != null && !Object.prototype.hasOwnProperty.call(mergedAnalysis, 'metadata')) {
    mergedAnalysis.metadata = rootMetadata;
    didMerge = true;
  }
  for (const key of ['fusion_contract_validation', 'fusionContractValidation']) {
    const rootValue = root[key];
    if (rootValue != null && !Object.prototype.hasOwnProperty.call(mergedAnalysis, key)) {
      mergedAnalysis[key] = rootValue;
      didMerge = true;
    }
  }
  return didMerge ? mergedAnalysis : analysis;
}

export function resolveAnalysisTextField(
  payload: ContentAssetAnalysisRecord | null,
  keys: string[]
): string {
  if (!payload) return '';
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

export function resolveAnalysisNumberField(
  payload: ContentAssetAnalysisRecord | null,
  keys: string[]
): string {
  if (!payload) return '';
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value <= 1 ? `${Math.round(value * 100)}%` : value.toFixed(2);
    }
  }
  return '';
}

export function resolveAnalysisStringListField(
  payload: ContentAssetAnalysisRecord | null,
  keys: string[],
  limit = 8
): string[] {
  if (!payload) return [];
  const values: string[] = [];
  for (const key of keys) {
    const value = payload[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item !== 'string') continue;
      const normalized = item.trim();
      if (normalized && !values.includes(normalized)) {
        values.push(normalized);
      }
      if (values.length >= limit) return values;
    }
  }
  return values;
}

export function resolveAnalysisPlatformFitItems(
  payload: ContentAssetAnalysisRecord | null
): ContentAssetAnalysisPlatformFitItem[] {
  const platformFit =
    asContentAssetAnalysisRecord(payload?.platform_fit) ||
    asContentAssetAnalysisRecord(payload?.platformFit);
  if (!platformFit) return [];
  return ['qianchuan', 'douyin', 'xiaohongshu', 'product_cart', 'live_room']
    .map<ContentAssetAnalysisPlatformFitItem | null>((key) => {
      const value = platformFit[key];
      return typeof value === 'string' && value.trim()
        ? {
            key,
            label: platformLabel(key),
            text: value.trim(),
          }
        : null;
    })
    .filter((item): item is ContentAssetAnalysisPlatformFitItem => Boolean(item));
}

export function resolveFusionDiagnosis(
  payload: ContentAssetAnalysisRecord | null
): ContentAssetAnalysisDiagnosis | null {
  const fusionPayload = readNestedRecord(payload, ['fusion_diagnosis', 'fusionDiagnosis']);
  return resolveDiagnosisBlock(
    fusionPayload,
    resolveAnalysisTextField(payload, ['diagnosis_mode', 'diagnosisMode']),
    resolveFusionContractValidation(payload, fusionPayload)
  );
}

export function resolvePerformanceDiagnosis(
  payload: ContentAssetAnalysisRecord | null
): ContentAssetAnalysisDiagnosis | null {
  return resolveDiagnosisBlock(
    readNestedRecord(payload, ['performance_diagnosis', 'performanceDiagnosis']),
    resolveAnalysisTextField(payload, ['diagnosis_mode', 'diagnosisMode'])
  );
}

export function resolveContentDiagnosis(
  payload: ContentAssetAnalysisRecord | null
): ContentAssetAnalysisDiagnosis | null {
  return resolveDiagnosisBlock(
    readNestedRecord(payload, ['content_diagnosis', 'contentDiagnosis']),
    resolveAnalysisTextField(payload, ['diagnosis_mode', 'diagnosisMode'])
  );
}

export function resolveContentUnderstanding(
  payload: ContentAssetAnalysisRecord | null
): ContentAssetContentUnderstanding {
  const currentAnalysis = readNestedRecord(payload, ['current_ai_analysis', 'currentAiAnalysis']);
  const structuredUnderstanding =
    readNestedRecord(currentAnalysis, ['content_understanding', 'contentUnderstanding'])
    || readNestedRecord(payload, ['content_understanding', 'contentUnderstanding']);
  const items = CONTENT_UNDERSTANDING_DEFINITIONS.map((definition) => {
    const structuredText = structuredUnderstanding
      ? resolveUnderstandingText(structuredUnderstanding, definition.structuredKeys)
      : '';
    const legacyText = structuredText ? '' : resolveUnderstandingText(payload, definition.legacyKeys);
    return {
      key: definition.key,
      label: definition.label,
      text: structuredText || legacyText,
      emptyText: definition.emptyText,
    };
  });
  const hasStructuredText = Boolean(structuredUnderstanding && items.some((item) => item.text));
  const hasLegacyText = !hasStructuredText && items.some((item) => item.text);
  return {
    items,
    source: hasStructuredText ? 'structured' : hasLegacyText ? 'legacy' : 'empty',
  };
}

export function resolveCurrentAiAnalysis(
  payload: ContentAssetAnalysisRecord | null,
  options: {
    fusionDiagnosis?: ContentAssetAnalysisDiagnosis | null;
    performanceDiagnosis?: ContentAssetAnalysisDiagnosis | null;
    contentDiagnosis?: ContentAssetAnalysisDiagnosis | null;
    nextActions?: ContentAssetAnalysisNextActionItem[];
    diagnosisMode?: string;
  } = {}
): ContentAssetCurrentAiAnalysis {
  const currentAnalysis = readNestedRecord(payload, ['current_ai_analysis', 'currentAiAnalysis']);
  const diagnoses = [
    options.fusionDiagnosis,
    options.performanceDiagnosis,
    options.contentDiagnosis,
  ].filter((item): item is ContentAssetAnalysisDiagnosis => Boolean(item));
  const primaryDecision = resolvePrimaryDecision(payload, diagnoses, currentAnalysis);
  const finalJudgment =
    resolveAnalysisTextField(currentAnalysis, ['final_judgment', 'finalJudgment', 'verdict', 'judgment'])
    || resolveAnalysisTextField(payload, ['final_judgment', 'finalJudgment'])
    || firstDiagnosisText(diagnoses, 'finalVerdict')
    || primaryDecision.label;
  const coreReasons = uniqueTextValues([
    ...resolveAnalysisStringListField(currentAnalysis, ['core_reasons', 'coreReasons', 'reasons'], 5),
    ...resolveAnalysisStringListField(payload, ['core_reasons', 'coreReasons'], 5),
    firstDiagnosisText(diagnoses, 'oneSentenceSummary'),
    firstDiagnosisText(diagnoses, 'reasoning'),
  ]).slice(0, 5);
  const problemStages = uniqueTextValues([
    ...resolveAnalysisStringListField(currentAnalysis, ['problem_stages', 'problemStages'], 5),
    ...resolveAnalysisStringListField(payload, ['problem_stages', 'problemStages'], 5),
    firstDiagnosisText(diagnoses, 'problemStage'),
  ]).slice(0, 5);
  const currentNextActions = normalizeNextActionItems(
    currentAnalysis?.next_actions ?? currentAnalysis?.nextActions
  );
  const nextActions = currentNextActions.length > 0
    ? currentNextActions.slice(0, 5)
    : (options.nextActions || []).slice(0, 5);
  const diagnosisMode =
    resolveAnalysisTextField(currentAnalysis, ['diagnosis_mode', 'diagnosisMode'])
    || options.diagnosisMode
    || resolveAnalysisTextField(payload, ['diagnosis_mode', 'diagnosisMode']);
  return {
    contentUnderstanding: resolveContentUnderstanding(payload),
    primaryDecision,
    finalJudgment,
    coreReasons,
    problemStages,
    nextActions,
    diagnosisBoundary: resolveDiagnosisBoundary(payload, diagnosisMode),
  };
}

export function resolveDiagnosisBoundary(
  payload: ContentAssetAnalysisRecord | null,
  diagnosisMode = ''
): ContentAssetDiagnosisBoundary {
  const boundary = readNestedRecord(payload, ['diagnosis_boundary', 'diagnosisBoundary']);
  const mode = normalizeDiagnosisBoundaryMode(
    resolveAnalysisTextField(boundary, ['mode', 'diagnosis_mode', 'diagnosisMode'])
    || diagnosisMode
    || resolveAnalysisTextField(payload, ['diagnosis_mode', 'diagnosisMode'])
  );
  const defaults = DIAGNOSIS_BOUNDARY_DEFAULTS[mode] || DIAGNOSIS_BOUNDARY_DEFAULTS.insufficient_data;
  return {
    mode,
    label: resolveAnalysisTextField(boundary, ['label', 'title']) || defaults.label,
    message: resolveAnalysisTextField(boundary, ['message', 'summary', 'description']) || defaults.message,
    dataEvidenceSummary: resolveAnalysisTextField(boundary, [
      'data_evidence_summary',
      'dataEvidenceSummary',
      'data_summary',
      'dataSummary',
    ]),
    dataMappingAnchor: resolveAnalysisTextField(boundary, [
      'data_mapping_anchor',
      'dataMappingAnchor',
      'anchor',
    ]) || defaults.dataMappingAnchor,
  };
}

function resolvePrimaryDecision(
  payload: ContentAssetAnalysisRecord | null,
  diagnoses: ContentAssetAnalysisDiagnosis[],
  currentAnalysis: ContentAssetAnalysisRecord | null
): ContentAssetPrimaryDecision {
  const rawValue =
    resolveAnalysisTextField(currentAnalysis, ['primary_decision', 'primaryDecision', 'decision'])
    || resolveAnalysisTextField(payload, ['primary_decision', 'primaryDecision', 'decision'])
    || firstDiagnosisText(diagnoses, 'finalVerdict')
    || resolveAnalysisTextField(currentAnalysis, ['final_judgment', 'finalJudgment'])
    || resolveAnalysisTextField(payload, ['final_judgment', 'finalJudgment']);
  const key = normalizePrimaryDecisionKey(rawValue);
  return {
    key,
    label: PRIMARY_DECISION_LABELS[key],
    rawValue,
  };
}

export function resolveAnalysisScores(
  payload: ContentAssetAnalysisRecord | null,
  limit = 10
): ContentAssetAnalysisScoreItem[] {
  if (!payload) return [];
  const scores = payload.scores ?? payload.score;
  if (Array.isArray(scores)) {
    return scores
      .map((item, index) => normalizeScoreItem(item, `score_${index + 1}`))
      .filter((item): item is ContentAssetAnalysisScoreItem => Boolean(item))
      .slice(0, limit);
  }
  const scoresRecord = asContentAssetAnalysisRecord(scores);
  if (!scoresRecord) return [];
  return Object.entries(scoresRecord)
    .map(([key, value]) => normalizeScoreItem(value, key))
    .filter((item): item is ContentAssetAnalysisScoreItem => Boolean(item))
    .slice(0, limit);
}

export function resolveAnalysisNextActions(
  payload: ContentAssetAnalysisRecord | null,
  limit = 8
): ContentAssetAnalysisNextActionItem[] {
  if (!payload) return [];
  const sources = [
    payload.next_actions ?? payload.nextActions,
    readNestedNextActions(payload, ['fusion_diagnosis', 'fusionDiagnosis']),
    readNestedNextActions(payload, ['performance_diagnosis', 'performanceDiagnosis']),
    readNestedNextActions(payload, ['content_diagnosis', 'contentDiagnosis']),
  ];
  const actions: ContentAssetAnalysisNextActionItem[] = [];
  for (const source of sources) {
    for (const action of normalizeNextActionItems(source)) {
      const actionKey = nextActionKey(action);
      const exists = actions.some((item) => {
        return nextActionKey(item) === actionKey;
      });
      if (!exists) actions.push(action);
      if (actions.length >= limit) return actions;
    }
  }
  return actions;
}

function nextActionKey(action: ContentAssetAnalysisNextActionItem): string {
  return [
    action.title,
    action.detail,
    action.owner,
    action.problemStage,
    action.actionType,
    action.metricTarget,
  ].join('\n');
}

export function resolveAnalysisEvidenceLedger(
  payload: ContentAssetAnalysisRecord | null,
  limit = 12
): ContentAssetAnalysisEvidenceLedgerItem[] {
  if (!payload) return [];
  const ledger: ContentAssetAnalysisEvidenceLedgerItem[] = [];
  const appendEvidence = (value: unknown, sourceLabel: string, fallbackPrefix: string) => {
    for (const item of normalizeEvidenceLedgerItems(value, sourceLabel, fallbackPrefix)) {
      const duplicate = ledger.some((existing) => evidenceLedgerKey(existing) === evidenceLedgerKey(item));
      if (!duplicate) ledger.push(item);
      if (ledger.length >= limit) return;
    }
  };

  appendEvidence(
    readFirstValue(payload, ['evidence_ledger', 'evidenceLedger', 'evidence']),
    '综合证据',
    'evidence'
  );

  const performanceDiagnosis = readNestedRecord(payload, ['performance_diagnosis', 'performanceDiagnosis']);
  appendEvidence(
    readEvidenceLedgerValue(performanceDiagnosis),
    '数据诊断',
    'performance'
  );

  const contentDiagnosis = readNestedRecord(payload, ['content_diagnosis', 'contentDiagnosis']);
  appendEvidence(
    readEvidenceLedgerValue(contentDiagnosis),
    '内容诊断',
    'content'
  );

  const fusionDiagnosis = readNestedRecord(payload, ['fusion_diagnosis', 'fusionDiagnosis']);
  appendEvidence(
    readEvidenceLedgerValue(fusionDiagnosis),
    '融合诊断',
    'fusion'
  );

  return ledger;
}

export function resolveAnalysisTimelineItems(
  payload: ContentAssetAnalysisRecord | null
): ContentAssetAnalysisTimelineItem[] {
  const timeline = payload?.timeline;
  if (!Array.isArray(timeline)) return [];
  return timeline.slice(0, 3).map((item) => {
    const row = asContentAssetAnalysisRecord(item);
    return {
      startTime: resolveAnalysisTimelineTimeField(row, ['start_time', 'startTime', 'start']),
      endTime: resolveAnalysisTimelineTimeField(row, ['end_time', 'endTime', 'end']),
      visual: resolveAnalysisTextField(row, ['visual', 'description']),
      audioOrText: resolveAnalysisTextField(row, ['audio_or_text', 'audioOrText', 'text']),
      purpose: resolveAnalysisTextField(row, ['purpose', 'title']),
      qualitySignal: resolveAnalysisTextField(row, ['quality_signal', 'qualitySignal']),
    };
  });
}

export function formatAnalysisTimelineRange(item: ContentAssetAnalysisTimelineItem): string {
  if (item.startTime && item.endTime) return `${item.startTime} - ${item.endTime}`;
  return item.startTime || item.endTime || '关键片段';
}

function readNestedRecord(
  payload: ContentAssetAnalysisRecord | null,
  keys: string[]
): ContentAssetAnalysisRecord | null {
  if (!payload) return null;
  for (const key of keys) {
    const record = asContentAssetAnalysisRecord(payload[key]);
    if (record) return record;
  }
  return null;
}

function readNestedNextActions(
  payload: ContentAssetAnalysisRecord | null,
  keys: string[]
): unknown {
  const record = readNestedRecord(payload, keys);
  return record?.next_actions ?? record?.nextActions;
}

function readFirstValue(
  payload: ContentAssetAnalysisRecord | null,
  keys: readonly string[]
): unknown {
  if (!payload) return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      return payload[key];
    }
  }
  return undefined;
}

function readEvidenceLedgerValue(payload: ContentAssetAnalysisRecord | null): unknown {
  return readFirstValue(payload, [
    'evidence_ledger',
    'evidenceLedger',
    'metric_evidence',
    'metricEvidence',
    'performance_evidence',
    'performanceEvidence',
  ]);
}

const CONTENT_UNDERSTANDING_DEFINITIONS: Array<{
  key: ContentAssetContentUnderstandingKey;
  label: string;
  structuredKeys: string[];
  legacyKeys: string[];
  emptyText: string;
}> = [
  {
    key: 'what_it_says',
    label: '素材讲什么',
    structuredKeys: ['what_it_says', 'whatItSays', 'what', 'summary', 'topic'],
    legacyKeys: ['summary', 'one_sentence_summary', 'oneSentenceSummary', 'ai_summary', 'aiSummary'],
    emptyText: '待补充素材主题、主角、使用场景和核心信息。',
  },
  {
    key: 'content_structure',
    label: '内容结构',
    structuredKeys: ['content_structure', 'contentStructure', 'structure', 'storyline', 'narrative_structure'],
    legacyKeys: ['structure', 'storyline', 'timeline_summary', 'timelineSummary'],
    emptyText: '待补充开头、铺垫、卖点展开和转化引导的结构关系。',
  },
  {
    key: 'core_selling_points',
    label: '核心卖点',
    structuredKeys: ['core_selling_points', 'coreSellingPoints', 'selling_points', 'sellingPoints'],
    legacyKeys: ['selling_points', 'sellingPoints', 'product_points', 'productPoints'],
    emptyText: '待补充用户能记住的核心利益点和可信背书。',
  },
  {
    key: 'visual_rhythm',
    label: '画面与节奏',
    structuredKeys: ['visual_rhythm', 'visualRhythm', 'visual_and_rhythm', 'visualAndRhythm', 'pace'],
    legacyKeys: ['first_3s_assessment', 'first3s_assessment', 'visual', 'hook_type', 'hookType'],
    emptyText: '待补充前三秒、镜头变化、信息密度和节奏是否支撑看完。',
  },
  {
    key: 'speech_and_emotion',
    label: '话术与情绪',
    structuredKeys: ['speech_and_emotion', 'speechAndEmotion', 'talk_track', 'talkTrack', 'script_tone'],
    legacyKeys: ['talk_track', 'script_tone', 'voiceover', 'emotion', 'audio_or_text', 'audioOrText'],
    emptyText: '待补充口播/字幕如何建立情绪、信任和行动意愿。',
  },
  {
    key: 'user_comprehension_barrier',
    label: '用户理解门槛',
    structuredKeys: [
      'user_comprehension_barrier',
      'userComprehensionBarrier',
      'comprehension_barrier',
      'barrier',
    ],
    legacyKeys: ['risk_flags', 'riskFlags', 'bad_points', 'badPoints', 'weaknesses'],
    emptyText: '待补充用户可能卡住、误解或不相信的环节。',
  },
  {
    key: 'reusable_content_assets',
    label: '可复用内容资产',
    structuredKeys: ['reusable_content_assets', 'reusableContentAssets', 'reuse_points', 'reusePoints'],
    legacyKeys: ['repurpose_suggestions', 'repurposeSuggestions', 'rewrite_suggestions'],
    emptyText: '待补充可复剪的镜头、话术、结构或转化组件。',
  },
];

const PRIMARY_DECISION_LABELS: Record<ContentAssetPrimaryDecisionKey, string> = {
  scale: '继续放量',
  observe: '小测观察',
  recut: '重剪再测',
  pause: '暂停投放',
  insufficient: '证据不足',
};

const DIAGNOSIS_BOUNDARY_DEFAULTS: Record<string, {
  label: string;
  message: string;
  dataMappingAnchor: string;
}> = {
  data_content_fusion: {
    label: '数据 x 内容融合',
    message: '已结合千川素材表现和视频内容判断。',
    dataMappingAnchor: 'performance-summary',
  },
  content_only: {
    label: '仅内容分析',
    message: '缺投放样本，仅按视频内容、画面、脚本、口播和节奏复盘。',
    dataMappingAnchor: 'data-mapping',
  },
  data_only: {
    label: '仅数据分析',
    message: '缺内容理解，仅按千川表现数据复盘。',
    dataMappingAnchor: 'performance-summary',
  },
  insufficient_data: {
    label: '证据不足',
    message: '数据和内容证据都不足，仅展示可确认线索。',
    dataMappingAnchor: 'data-mapping',
  },
};

function resolveUnderstandingText(
  payload: ContentAssetAnalysisRecord | null,
  keys: string[]
): string {
  if (!payload) return '';
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    const normalized = normalizeUnderstandingValue(payload[key]);
    if (normalized) return normalized;
  }
  return '';
}

function normalizeUnderstandingValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    return uniqueTextValues(value.map(normalizeUnderstandingValue)).slice(0, 4).join('；');
  }
  const record = asContentAssetAnalysisRecord(value);
  if (!record) return '';
  return resolveAnalysisTextField(record, [
    'text',
    'summary',
    'description',
    'content',
    'title',
    'point',
    'label',
  ]);
}

function normalizePrimaryDecisionKey(value: string): ContentAssetPrimaryDecisionKey {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'insufficient';
  if (/scale|scale_up|continue|good|可扩|放量|继续放量/.test(normalized)) return 'scale';
  if (/observe|test|small|hold|watch|小测|观察/.test(normalized)) return 'observe';
  if (/recut|recut|rewrite|iteration|iterate|needs_iteration|重剪|复剪|迭代|优化/.test(normalized)) {
    return 'recut';
  }
  if (/pause|stop|bad|negative|暂停|停止|不建议/.test(normalized)) return 'pause';
  return 'insufficient';
}

function normalizeDiagnosisBoundaryMode(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'fusion' || normalized === 'data_content' || normalized === 'data_content_fusion') {
    return 'data_content_fusion';
  }
  if (normalized === 'content' || normalized === 'content_only') return 'content_only';
  if (normalized === 'data' || normalized === 'data_only') return 'data_only';
  return 'insufficient_data';
}

function firstDiagnosisText(
  diagnoses: ContentAssetAnalysisDiagnosis[],
  key: 'finalVerdict' | 'oneSentenceSummary' | 'problemStage' | 'reasoning'
): string {
  for (const diagnosis of diagnoses) {
    if (diagnosis[key]) return diagnosis[key];
  }
  return '';
}

function uniqueTextValues(values: string[]): string[] {
  return values
    .map((item) => item.trim())
    .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index);
}

function normalizeNextActionItems(value: unknown): ContentAssetAnalysisNextActionItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') {
        const title = item.trim();
        return title
          ? {
              title,
              detail: '',
              owner: '',
              priority: '',
              problemStage: '',
              metricTarget: '',
              actionType: '',
              expectedMetricLift: '',
              reason: '',
              evidenceRefs: [],
            }
          : null;
      }
      const record = asContentAssetAnalysisRecord(item);
      if (!record) return null;
      const actionType = resolveAnalysisTextField(record, ['action_type', 'actionType', 'type']);
      const title = resolveAnalysisTextField(record, ['title', 'action', 'recommendation', 'next_action', 'nextAction']);
      const detail = resolveAnalysisTextField(record, ['detail', 'description', 'execution']);
      const reason = resolveAnalysisTextField(record, ['reason', 'why', 'rationale']);
      const owner = resolveAnalysisTextField(record, ['owner', 'root_cause_owner', 'rootCauseOwner', 'role']);
      const priority = resolveAnalysisTextField(record, ['priority', 'urgency']);
      const problemStage = resolveAnalysisTextField(record, [
        'problem_stage',
        'problemStage',
        'primary_problem_stage',
        'primaryProblemStage',
      ]);
      const metricTarget = resolveAnalysisTextField(record, [
        'metric_target',
        'metricTarget',
        'expected_metric',
        'expectedMetric',
        'target',
      ]);
      const expectedMetricLift = resolveAnalysisTextField(record, [
        'expected_metric_lift',
        'expectedMetricLift',
        'metric_lift',
        'metricLift',
      ]);
      const evidenceRefs = normalizeEvidenceRefs(record.evidence_refs ?? record.evidenceRefs ?? record.evidence);
      if (
        !title
        && !detail
        && !reason
        && !owner
        && !priority
        && !problemStage
        && !metricTarget
        && !actionType
        && !expectedMetricLift
        && evidenceRefs.length === 0
      ) {
        return null;
      }
      return {
        title: title || actionType || reason || detail || '待明确动作',
        detail,
        owner,
        priority,
        problemStage,
        metricTarget,
        actionType,
        expectedMetricLift,
        reason,
        evidenceRefs,
      };
    })
    .filter((item): item is ContentAssetAnalysisNextActionItem => Boolean(item));
}

function normalizeEvidenceRefs(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return values
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (typeof item === 'number' && Number.isFinite(item)) return String(item);
      return '';
    })
    .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index)
    .slice(0, 6);
}

function resolveFusionContractValidation(
  payload: ContentAssetAnalysisRecord | null,
  fusionPayload: ContentAssetAnalysisRecord | null
): ContentAssetFusionContractValidation | null {
  const metadata = asContentAssetAnalysisRecord(readFirstValue(payload, ['metadata', 'meta']));
  const candidates = [
    readFirstValue(payload, ['fusion_contract_validation', 'fusionContractValidation']),
    readFirstValue(metadata, ['fusion_contract_validation', 'fusionContractValidation']),
    readFirstValue(fusionPayload, ['fusion_contract_validation', 'fusionContractValidation']),
  ];
  const validations = candidates
    .map(normalizeFusionContractValidation)
    .filter((item): item is ContentAssetFusionContractValidation => Boolean(item));
  if (validations.length === 0) return null;
  return mergeFusionContractValidations(validations);
}

function normalizeFusionContractValidation(value: unknown): ContentAssetFusionContractValidation | null {
  const record = asContentAssetAnalysisRecord(value);
  if (!record) return null;
  const status = resolveAnalysisTextField(record, ['status', 'state', 'verdict']).toLowerCase();
  const errors = normalizeValidationMessages(record.errors ?? record.error);
  const warnings = normalizeValidationMessages(record.warnings ?? record.warning);
  return status === 'invalid' || status === 'warning' || errors.length > 0 || warnings.length > 0
    ? { status, errors, warnings }
    : null;
}

function mergeFusionContractValidations(
  validations: ContentAssetFusionContractValidation[]
): ContentAssetFusionContractValidation {
  const status = validations
    .map((item) => item.status)
    .find((item) => item === 'invalid')
    || validations.map((item) => item.status).find((item) => item === 'warning')
    || validations.find((item) => item.status)?.status
    || '';
  return {
    status,
    errors: uniqueValidationMessages(validations.flatMap((item) => item.errors)),
    warnings: uniqueValidationMessages(validations.flatMap((item) => item.warnings)),
  };
}

function normalizeValidationMessages(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return uniqueValidationMessages(
    values.map((item) => {
      if (typeof item === 'string') return item.trim();
      if (typeof item === 'number' && Number.isFinite(item)) return String(item);
      const record = asContentAssetAnalysisRecord(item);
      if (!record) return '';
      return resolveAnalysisTextField(record, [
        'message',
        'error',
        'warning',
        'text',
        'detail',
        'reason',
        'field',
      ]);
    })
  ).slice(0, 6);
}

function uniqueValidationMessages(values: string[]): string[] {
  return values.filter((item, index, array) => item.length > 0 && array.indexOf(item) === index);
}

function resolveDiagnosisBlock(
  payload: ContentAssetAnalysisRecord | null,
  diagnosisMode: string,
  contractValidation: ContentAssetFusionContractValidation | null = null
): ContentAssetAnalysisDiagnosis | null {
  if (!payload) {
    return contractValidation
      ? {
          diagnosisMode,
          finalVerdict: '',
          oneSentenceSummary: '',
          problemStage: '',
          rootCauseOwner: '',
          reasoning: '',
          nextVersionDirection: '',
          goodPoints: [],
          badPoints: [],
          metricEvidence: [],
          contentEvidence: [],
          liveAcceptanceAttribution: null,
          contractValidation,
        }
      : null;
  }
  const diagnosis: ContentAssetAnalysisDiagnosis = {
    diagnosisMode,
    finalVerdict: resolveAnalysisTextField(payload, [
      'final_verdict',
      'finalVerdict',
      'verdict',
      'summary',
    ]),
    oneSentenceSummary: resolveAnalysisTextField(payload, [
      'one_sentence_summary',
      'oneSentenceSummary',
      'summary',
    ]),
    problemStage: resolveAnalysisTextField(payload, [
      'primary_problem_stage',
      'primaryProblemStage',
      'problem_stage',
      'problemStage',
      'broken_stage',
      'brokenStage',
      'stage',
    ]),
    rootCauseOwner: resolveAnalysisTextField(payload, [
      'final_root_cause_owner',
      'finalRootCauseOwner',
      'root_cause_owner',
      'rootCauseOwner',
      'root_cause_owner_by_data',
      'rootCauseOwnerByData',
      'owner',
      'root_owner',
      'rootOwner',
    ]),
    reasoning: resolveAnalysisTextField(payload, ['reasoning', 'reason', 'why']),
    nextVersionDirection: resolveAnalysisTextField(payload, [
      'next_version_direction',
      'nextVersionDirection',
      'next_direction',
      'nextDirection',
    ]),
    goodPoints: resolveDiagnosisList(payload, ['good_points', 'goodPoints', 'strengths']),
    badPoints: resolveDiagnosisList(payload, ['bad_points', 'badPoints', 'weaknesses', 'problems']),
    metricEvidence: resolveDiagnosisList(payload, [
      'metric_evidence',
      'metricEvidence',
    ]),
    contentEvidence: resolveDiagnosisList(payload, [
      'content_evidence',
      'contentEvidence',
      'creative_evidence',
      'creativeEvidence',
      'evidence_content',
      'evidenceContent',
    ]),
    liveAcceptanceAttribution: normalizeLiveAcceptanceAttribution(
      readFirstValue(payload, ['live_acceptance_attribution', 'liveAcceptanceAttribution'])
    ),
    contractValidation,
  };
  const hasDiagnosis =
    Boolean(
      diagnosis.finalVerdict
        || diagnosis.oneSentenceSummary
        || diagnosis.problemStage
        || diagnosis.rootCauseOwner
        || diagnosis.reasoning
        || diagnosis.nextVersionDirection
    )
    || diagnosis.goodPoints.length > 0
    || diagnosis.badPoints.length > 0
    || diagnosis.metricEvidence.length > 0
    || diagnosis.contentEvidence.length > 0
    || Boolean(diagnosis.liveAcceptanceAttribution)
    || Boolean(diagnosis.contractValidation);
  return hasDiagnosis ? diagnosis : null;
}

function normalizeLiveAcceptanceAttribution(
  value: unknown
): ContentAssetAnalysisLiveAcceptanceAttribution | null {
  const record = asContentAssetAnalysisRecord(value);
  if (!record) return null;
  const attribution: ContentAssetAnalysisLiveAcceptanceAttribution = {
    level: resolveAnalysisTextField(record, ['level', 'attribution_level', 'attributionLevel']),
    confidence: resolveAnalysisTextField(record, ['confidence']),
    source: resolveAnalysisTextField(record, ['source', 'source_table', 'sourceTable']),
    limitation: resolveAnalysisTextField(record, ['limitation', 'note', 'description']),
  };
  return attribution.level || attribution.confidence || attribution.source || attribution.limitation
    ? attribution
    : null;
}

function resolveDiagnosisList(
  payload: ContentAssetAnalysisRecord,
  keys: string[],
  limit = 8
): string[] {
  const values: string[] = [];
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = normalizeDiagnosisListItem(item);
        if (normalized && !values.includes(normalized)) {
          values.push(normalized);
        }
        if (values.length >= limit) return values;
      }
    } else {
      const normalized = normalizeDiagnosisListItem(value);
      if (normalized && !values.includes(normalized)) {
        values.push(normalized);
      }
    }
    if (values.length >= limit) return values;
  }
  return values;
}

function normalizeDiagnosisListItem(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  const record = asContentAssetAnalysisRecord(value);
  if (!record) return '';
  const evidenceRefs = normalizeEvidenceRefs(record.evidence_refs ?? record.evidenceRefs);
  const label = resolveAnalysisTextField(record, ['label', 'metric', 'title', 'key', 'point']);
  const key = resolveAnalysisTextField(record, ['key', 'name', 'dimension']);
  const formattedValue = formatEvidenceValue(record.value ?? record.score, key || label);
  const benchmark = resolveAnalysisTextField(record, ['benchmark', 'target']);
  const judgment = resolveAnalysisTextField(record, ['judgment', 'status', 'verdict']);
  if (label && (formattedValue || benchmark || judgment)) {
    return withDiagnosisEvidenceRefs([
      formattedValue ? `${label}=${formattedValue}` : label,
      benchmark ? `参考 ${benchmark}` : '',
      judgment ? evidenceJudgmentLabel(judgment) : '',
    ].filter(Boolean).join('，'), evidenceRefs);
  }
  const text = (
    resolveAnalysisTextField(record, ['text', 'label', 'title', 'summary', 'evidence', 'metric', 'content'])
    || Object.values(record)
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, 2)
      .join('：')
      .trim()
  );
  return withDiagnosisEvidenceRefs(text, evidenceRefs);
}

function withDiagnosisEvidenceRefs(text: string, evidenceRefs: string[]): string {
  if (evidenceRefs.length === 0) return text;
  const suffix = `证据：${evidenceRefs.join(' / ')}`;
  return text ? `${text}（${suffix}）` : suffix;
}

function normalizeEvidenceLedgerItems(
  value: unknown,
  sourceLabel: string,
  fallbackPrefix: string
): ContentAssetAnalysisEvidenceLedgerItem[] {
  const record = asContentAssetAnalysisRecord(value);
  if (record && shouldTreatEvidenceLedgerAsMap(record)) {
    return Object.entries(record)
      .map(([key, item], index) => {
        return normalizeEvidenceLedgerItem(item, sourceLabel, `${fallbackPrefix}_${index + 1}`, key);
      })
      .filter((item): item is ContentAssetAnalysisEvidenceLedgerItem => Boolean(item));
  }
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values
    .map((item, index) => normalizeEvidenceLedgerItem(item, sourceLabel, `${fallbackPrefix}_${index + 1}`))
    .filter((item): item is ContentAssetAnalysisEvidenceLedgerItem => Boolean(item));
}

function shouldTreatEvidenceLedgerAsMap(record: ContentAssetAnalysisRecord): boolean {
  const evidenceKeys = [
    'id',
    'evidence_id',
    'evidenceId',
    'ref',
    'reference_id',
    'referenceId',
    'metric',
    'label',
    'title',
    'key',
    'name',
    'dimension',
    'value',
    'score',
    'actual',
    'current',
    'benchmark',
    'target',
    'threshold',
    'reference',
    'source',
    'source_name',
    'sourceName',
    'meaning',
    'summary',
    'text',
    'evidence',
    'content',
  ];
  return !evidenceKeys.some((key) => Object.prototype.hasOwnProperty.call(record, key));
}

function normalizeEvidenceLedgerItem(
  value: unknown,
  sourceLabel: string,
  fallbackId: string,
  fallbackMetric = ''
): ContentAssetAnalysisEvidenceLedgerItem | null {
  if (typeof value === 'string') {
    const metric = value.trim();
    return metric
      ? {
          id: fallbackId,
          metric,
          value: '',
          benchmark: '',
          source: sourceLabel,
          judgment: '',
          meaning: '',
        }
      : null;
  }
  const record = asContentAssetAnalysisRecord(value);
  if (!record) return null;
  const key = resolveAnalysisTextField(record, ['key', 'name', 'dimension']);
  const metric = resolveAnalysisTextField(record, ['metric', 'label', 'title', 'key', 'name', 'dimension'])
    || fallbackMetric
    || key;
  const formattedValue = formatEvidenceValue(
    record.value ?? record.score ?? record.metric_value ?? record.metricValue ?? record.actual ?? record.current,
    key || metric
  );
  const benchmark = resolveAnalysisTextField(record, [
    'benchmark',
    'benchmark_value',
    'benchmarkValue',
    'reference',
    'threshold',
    'target',
  ]);
  const explicitSource = resolveAnalysisTextField(record, [
    'source',
    'source_table',
    'sourceTable',
    'source_name',
    'sourceName',
    'basis',
    'scope',
  ]);
  const judgment = resolveAnalysisTextField(record, ['judgment', 'status', 'verdict']);
  const meaning = resolveAnalysisTextField(record, ['meaning', 'summary', 'text', 'evidence', 'content'])
    || (judgment ? evidenceJudgmentLabel(judgment) : '');
  if (!metric && !formattedValue && !benchmark && !meaning) return null;
  return {
    id: resolveEvidenceId(record) || fallbackId,
    metric: metric || '证据',
    value: formattedValue,
    benchmark,
    source: explicitSource || sourceLabel,
    judgment,
    meaning,
  };
}

function resolveEvidenceId(record: ContentAssetAnalysisRecord): string {
  for (const key of ['evidence_id', 'evidenceId', 'id', 'ref', 'reference_id', 'referenceId', 'key']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function evidenceLedgerKey(item: ContentAssetAnalysisEvidenceLedgerItem): string {
  return `${item.id}\n${item.metric}\n${item.value}\n${item.source}`;
}

function formatEvidenceValue(value: unknown, key: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (key && /rate|ctr|cvr/i.test(key) && value >= 0 && value <= 1) {
      return `${Number((value * 100).toFixed(2))}%`;
    }
    if (/roi/i.test(key)) {
      return value.toFixed(2);
    }
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
}

function evidenceJudgmentLabel(value: string): string {
  const labels: Record<string, string> = {
    good: '达标',
    weak: '偏弱',
    bad: '偏弱',
    warning: '需关注',
  };
  return labels[value] || value;
}

function formatScoreValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value <= 1) return `${Math.round(value * 100)}分`;
    return `${Math.round(value)}分`;
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  const record = asContentAssetAnalysisRecord(value);
  if (!record) return '';
  const score = record.score ?? record.value;
  if (typeof score === 'number' || typeof score === 'string') {
    return formatScoreValue(score);
  }
  return '';
}

function normalizeScoreItem(value: unknown, fallbackKey: string): ContentAssetAnalysisScoreItem | null {
  const record = asContentAssetAnalysisRecord(value);
  if (!record) {
    const formattedValue = formatScoreValue(value);
    return formattedValue
      ? {
          key: fallbackKey,
          label: scoreLabel(fallbackKey),
          value: formattedValue,
        }
      : null;
  }
  const key = resolveAnalysisTextField(record, ['key', 'name', 'dimension']) || fallbackKey;
  const label = resolveAnalysisTextField(record, ['label', 'title']) || scoreLabel(key);
  const formattedValue = formatScoreValue(record.score ?? record.value);
  return formattedValue
    ? {
        key,
        label,
        value: formattedValue,
      }
    : null;
}

function scoreLabel(key: string): string {
  const labels: Record<string, string> = {
    performance: '数据表现',
    content: '内容质量',
    fusion: '综合判断',
    hook: '开头钩子',
    retention: '留存承接',
    conversion: '转化承接',
    acceptance: '直播承接',
    data_performance_score: '数据表现',
    content_quality_score: '内容质量',
    hook_score: '开头钩子',
    selling_point_score: '卖点表达',
    conversion_support_score: '转化承接',
    live_entry_score: '直播进房',
    live_acceptance_score: '直播承接',
    risk_score: '风险控制',
    confidence: '置信度',
    content_hook_score: '内容钩子',
    performance_score: '数据表现',
    fusion_overall_score: '综合判断',
  };
  return labels[key] || key;
}

function platformLabel(key: string): string {
  switch (key) {
    case 'qianchuan':
      return '千川';
    case 'douyin':
      return '抖音';
    case 'xiaohongshu':
      return '小红书';
    case 'product_cart':
      return '商品卡/挂车承接';
    case 'live_room':
      return '直播间承接';
    default:
      return key;
  }
}

function resolveAnalysisTimelineTimeField(
  payload: ContentAssetAnalysisRecord | null,
  keys: string[]
): string {
  if (!payload) return '';
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return formatTimelineSeconds(value);
    }
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function formatTimelineSeconds(value: number): string {
  const seconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
