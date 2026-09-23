import { Empty } from 'antd';
import { Badge } from '@/components/atoms/badge';
import { resolveStatusBadge } from '../_lib/live-center-formatters';
import {
  resolveAnalysisQualityGateBadge,
  type LiveCenterAnalysisEvidenceItem,
  type LiveCenterAnalysisKeyValueItem,
  type LiveCenterAnalysisQualityGate,
  type LiveCenterAnalysisSpeechScriptItem,
} from '../_lib/live-center-view-helpers';
import resultStyles from '../live-center-analysis-result.module.css';
import {
  ResultSection,
  TimeAnchorPlaybackButton,
  type ResultSectionHeaderVariant,
  type TimeAnchorPlayableResolver,
  type TimeAnchorPlaybackHandler,
} from './live-center-analysis-result-utils';
import qualityGateStyles from '../live-center-analysis-result-quality-gate.module.css';

export function QualityGateSection({
  gate,
}: {
  gate: LiveCenterAnalysisQualityGate;
}) {
  const hasBlockingIssues = gate.blockingIssues.length > 0;
  const hasWarnings = gate.warningIssues.length > 0;
  const hasEvidenceHealth = gate.evidenceHealthItems.length > 0;

  return (
    <section className={qualityGateStyles.analysisResultQualityGate} aria-label="复盘质量门">
      <div className={qualityGateStyles.analysisResultQualityGateHeader}>
        <div>
          <span>证据健康</span>
          <h3>这份复盘能否定稿</h3>
        </div>
        <Badge status={resolveAnalysisQualityGateBadge(gate.status)}>
          {gate.finalReviewLabel}
        </Badge>
      </div>
      <p className={qualityGateStyles.analysisResultQualityGateSummary}>{gate.summary}</p>

      <div className={qualityGateStyles.analysisResultQualityGateStats} aria-label="质量门摘要">
        <div>
          <span>质量分</span>
          <strong>{gate.score || '待评分'}</strong>
        </div>
        <div>
          <span>阻断问题</span>
          <strong>{gate.blockingIssues.length}</strong>
        </div>
        <div>
          <span>复核提醒</span>
          <strong>{gate.warningIssues.length}</strong>
        </div>
        <div>
          <span>证据健康项</span>
          <strong>{gate.evidenceHealthItems.length}</strong>
        </div>
      </div>

      {hasBlockingIssues || hasWarnings ? (
        <div className={qualityGateStyles.analysisResultQualityGateIssueGrid}>
          {hasBlockingIssues ? (
            <QualityGateIssueList title="定稿前必须处理" items={gate.blockingIssues} tone="danger" />
          ) : null}
          {hasWarnings ? (
            <QualityGateIssueList title="建议复核" items={gate.warningIssues} tone="warning" />
          ) : null}
        </div>
      ) : (
        <p className={qualityGateStyles.analysisResultQualityGateClear}>
          未发现阻断问题或警告；运营侧仍可按追溯材料抽查关键证据。
        </p>
      )}

      {hasEvidenceHealth ? (
        <div className={qualityGateStyles.analysisResultQualityGateHealthList} aria-label="证据健康摘要">
          {gate.evidenceHealthItems.map((item) => (
            <article key={`${item.label}-${item.value}`} className={qualityGateStyles.analysisResultQualityGateHealthItem}>
              <div className={resultStyles.analysisResultRowTitle}>
                <strong>{item.label}</strong>
                <Badge status={item.status}>{item.value}</Badge>
              </div>
              {item.detail ? <p>{item.detail}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <p className={qualityGateStyles.analysisResultQualityGateClear}>
          质量门未返回单项证据健康摘要；可继续查看下方证据台账和模型记录。
        </p>
      )}
    </section>
  );
}

function QualityGateIssueList({
  items,
  title,
  tone,
}: {
  items: LiveCenterAnalysisQualityGate['blockingIssues'];
  title: string;
  tone: 'danger' | 'warning';
}) {
  return (
    <div className={qualityGateStyles.analysisResultQualityGateIssueList} data-tone={tone}>
      <strong>{title}</strong>
      <ul>
        {items.map((item, index) => (
          <li key={`${item.title}-${index}`}>
            <span>{item.title}</span>
            {item.detail ? <p>{item.detail}</p> : null}
            {item.evidenceRefs ? <small>依据 {item.evidenceRefs}</small> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EvidenceLedgerSection({
  expanded,
  headerVariant,
  isTimeAnchorPlayable,
  items,
  onToggleExpanded,
  onPlayTimeAnchor,
  playbackLoadingKey,
  totalCount,
  visibleLimit,
}: {
  expanded: boolean;
  headerVariant?: ResultSectionHeaderVariant;
  isTimeAnchorPlayable?: TimeAnchorPlayableResolver;
  items: LiveCenterAnalysisEvidenceItem[];
  onToggleExpanded: () => void;
  onPlayTimeAnchor?: TimeAnchorPlaybackHandler;
  playbackLoadingKey?: string | null;
  totalCount: number;
  visibleLimit: number;
}) {
  return (
    <ResultSection
      title="证据台账"
      visibleCount={items.length}
      totalCount={totalCount}
      visibleLimit={visibleLimit}
      expanded={expanded}
      headerVariant={headerVariant}
      onToggleExpanded={onToggleExpanded}
    >
      {items.length > 0 ? (
        <div className={resultStyles.analysisResultEvidenceTable} role="table" aria-label="证据 ledger">
          <div className={resultStyles.analysisResultEvidenceHeader} role="row">
            <span role="columnheader">ID / 时间</span>
            <span role="columnheader">Claim</span>
            <span role="columnheader">Evidence</span>
            <span role="columnheader">来源 / 置信度</span>
          </div>
          {items.map((item, index) => (
            <div className={resultStyles.analysisResultEvidenceRow} role="row" key={`${item.id}-${index}`}>
              <span
                role="cell"
                className={resultStyles.analysisResultMonoStack}
                data-label="ID / 时间"
                aria-label={`ID / 时间：${item.id || `E${index + 1}`}，${item.time || '-'}`}
              >
                <strong>{item.id || `E${index + 1}`}</strong>
                <small>{item.time || '-'}</small>
                <TimeAnchorPlaybackButton
                  anchor={item.timeAnchor}
                  disabledLabel="证据待定位"
                  isTimeAnchorPlayable={isTimeAnchorPlayable}
                  label="查看证据位置"
                  onPlayTimeAnchor={onPlayTimeAnchor}
                  playbackLoadingKey={playbackLoadingKey}
                  sourceLabel={item.id || item.claim}
                />
              </span>
              <span role="cell" data-label="Claim" aria-label={`Claim：${item.claim}`}>{item.claim}</span>
              <span role="cell" data-label="Evidence" aria-label={`Evidence：${item.evidence}`}>{item.evidence}</span>
              <span
                role="cell"
                className={resultStyles.analysisResultMonoStack}
                data-label="来源 / 置信度"
                aria-label={`来源 / 置信度：${item.source || '-'}，${item.confidence || '-'}`}
              >
                <strong>{item.source || '-'}</strong>
                <small>{item.confidence || '-'}</small>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Empty className={resultStyles.analysisResultEmpty} description="未返回 evidenceLedger / evidence_ledger 字段。" />
      )}
    </ResultSection>
  );
}

export function SpeechAndMetaSections({
  expanded,
  inputItems,
  metaItems,
  onToggleExpanded,
  recordingItems,
  selfEvalItems,
  speechItems,
  totalSpeechCount,
  usageItems,
  visibleLimit,
}: {
  expanded: boolean;
  inputItems: LiveCenterAnalysisKeyValueItem[];
  metaItems: LiveCenterAnalysisKeyValueItem[];
  onToggleExpanded: () => void;
  recordingItems: LiveCenterAnalysisKeyValueItem[];
  selfEvalItems: LiveCenterAnalysisKeyValueItem[];
  speechItems: LiveCenterAnalysisSpeechScriptItem[];
  totalSpeechCount: number;
  usageItems: LiveCenterAnalysisKeyValueItem[];
  visibleLimit: number;
}) {
  return (
    <div className={resultStyles.analysisResultTwoColumnGrid}>
      <ResultSection
        title="ASR 原文底稿"
        visibleCount={speechItems.length}
        totalCount={totalSpeechCount}
        visibleLimit={visibleLimit}
        expanded={expanded}
        onToggleExpanded={onToggleExpanded}
      >
        {speechItems.length > 0 ? (
          <div className={resultStyles.analysisResultScriptList}>
            {speechItems.map((item, index) => (
              <article className={resultStyles.analysisResultScriptCard} key={`${item.title}-${index}`}>
                <div className={resultStyles.analysisResultRowTitle}>
                  <strong>{item.title}</strong>
                  {item.status ? (
                    <Badge status={resolveStatusBadge(item.status)}>
                      {item.status}
                    </Badge>
                  ) : null}
                </div>
                <p className={resultStyles.analysisResultScriptText}>{item.text}</p>
                <div className={resultStyles.analysisResultTaskMeta}>
                  <span>来源 {item.source}</span>
                  {item.time ? <span>时间 {item.time}</span> : null}
                  {item.meta ? <span>{item.meta}</span> : null}
                  {item.evidenceRefs ? <span>依据 {item.evidenceRefs}</span> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            className={resultStyles.analysisResultEmpty}
            description="未发现 speechScript / scriptAnalysis，也没有 inputSnapshot.derivedInputs.asrTranscripts；请确认 worker 已写入 ASR 快照，或人工复核录屏话术。"
          />
        )}
      </ResultSection>

      <ResultSection title="模型元信息" visibleCount={metaItems.length}>
        <dl className={resultStyles.analysisResultMetaGrid}>
          {metaItems.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd title={item.value}>{item.value}</dd>
            </div>
          ))}
        </dl>
        <KeyValueBadges items={usageItems} />
        <KeyValueBadges ariaLabel="录屏元信息" items={recordingItems} prefix="recording" />
        <KeyValueBadges ariaLabel="输入元信息" items={inputItems} prefix="input" />
        <KeyValueBadges ariaLabel="自评和风险" items={selfEvalItems} />
      </ResultSection>
    </div>
  );
}

export function OutputExcerptSection({
  headerVariant,
  outputExcerpt,
}: {
  headerVariant?: ResultSectionHeaderVariant;
  outputExcerpt: string | null;
}) {
  return outputExcerpt ? (
    <ResultSection title="模型输出摘录" visibleCount={1} headerVariant={headerVariant}>
      <p className={resultStyles.analysisResultExcerpt}>{outputExcerpt}</p>
    </ResultSection>
  ) : null;
}

function KeyValueBadges({
  ariaLabel,
  items,
  prefix,
}: {
  ariaLabel?: string;
  items: LiveCenterAnalysisKeyValueItem[];
  prefix?: string;
}) {
  return items.length > 0 ? (
    <div className={resultStyles.analysisResultUsageList} aria-label={ariaLabel}>
      {items.map((item) => (
        <span key={item.label}>
          {prefix ? `${prefix} ` : ''}{item.label} {item.value}
        </span>
      ))}
    </div>
  ) : null;
}
