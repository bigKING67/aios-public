import { useMemo, useState } from 'react';
import { Alert } from 'antd';
import { formatFullDateTime } from '../_lib/live-center-formatters';
import type {
  LiveCenterAnalysisJob,
  LiveCenterRecording,
  LiveCenterSession,
} from '../_lib/live-center-types';
import {
  buildAnalysisResultViewModel,
  resolveAnalysisDisplayId,
} from '../_lib/live-center-view-helpers';
import resultStyles from '../live-center-analysis-result.module.css';
import playbackStyles from '../live-center-analysis-result-playback.module.css';
import { ActionBacklogSection } from './live-center-analysis-result-action-section';
import {
  formatPinnedActionDetail,
  isReviewTextDuplicate,
  mergeReviewActionItems,
  resolveReviewActionDedupKey,
} from './live-center-analysis-result-card-helpers';
import { AnalysisResultCover } from './live-center-analysis-result-cover';
import {
  EvidenceLedgerSection,
  OutputExcerptSection,
  QualityGateSection,
  SpeechAndMetaSections,
} from './live-center-analysis-result-evidence-sections';
import {
  MomentReviewsSection,
  ScorecardSection,
  ScriptReviewsSection,
} from './live-center-analysis-result-primary-sections';
import { AnalysisResultPlaybackPanel } from './live-center-analysis-result-playback-panel';
import {
  resolveVisibleSectionItems,
} from './live-center-analysis-result-formatters';
import { useAnalysisResultPlayback } from './use-analysis-result-playback';

const MOMENT_VISIBLE_LIMIT = 5;
const EVIDENCE_VISIBLE_LIMIT = 8;
const ACTION_BACKLOG_VISIBLE_LIMIT = 5;
const SCRIPT_REVIEW_VISIBLE_LIMIT = 2;
const SPEECH_SCRIPT_VISIBLE_LIMIT = 5;
const SCORECARD_VISIBLE_LIMIT = 6;

type ExpandableResultSection = 'actionBacklog' | 'moments' | 'evidence' | 'scriptReview' | 'speechScript' | 'scorecard';

export function AnalysisResultCard({
  analysis,
  recording,
  session,
}: {
  analysis: LiveCenterAnalysisJob;
  recording?: LiveCenterRecording | null;
  session?: LiveCenterSession | null;
}) {
  const displayId = resolveAnalysisDisplayId(analysis);
  const [expandedSections, setExpandedSections] = useState<Record<ExpandableResultSection, boolean>>({
    actionBacklog: false,
    evidence: false,
    moments: false,
    scorecard: false,
    scriptReview: false,
    speechScript: false,
  });
  const {
    clearPlaybackError,
    closePlayback,
    handlePlaybackLoadedMetadata,
    handlePlaybackRetrySeek,
    handlePlaybackSeekStatusChange,
    handlePlaybackSeeked,
    isTimeAnchorPlayable,
    playback,
    playbackError,
    playbackLoadingKey,
    playbackSeekMessage,
    playbackSeekStatus,
    playbackVideoRef,
    playTimeAnchor,
  } = useAnalysisResultPlayback({ recording });
  const viewModel = useMemo(() => buildAnalysisResultViewModel(analysis, {
    recording,
    session,
  }), [analysis, recording, session]);
  const visibleMomentItems = resolveVisibleSectionItems(
    viewModel.momentReviewItems,
    MOMENT_VISIBLE_LIMIT,
    expandedSections.moments
  );
  const visibleEvidenceItems = resolveVisibleSectionItems(
    viewModel.evidenceItems,
    EVIDENCE_VISIBLE_LIMIT,
    expandedSections.evidence
  );
  const actionBacklogItems = useMemo(
    () => mergeReviewActionItems(viewModel.actionItems, viewModel.reviewTasks),
    [viewModel.actionItems, viewModel.reviewTasks]
  );
  const topActionItem = actionBacklogItems[0] ?? null;
  const pinnedActionKey = topActionItem ? resolveReviewActionDedupKey(topActionItem) : null;
  const bodyActionBacklogItems = pinnedActionKey
    ? actionBacklogItems.filter((item) => resolveReviewActionDedupKey(item) !== pinnedActionKey)
    : actionBacklogItems;
  const visibleActionBacklogItems = resolveVisibleSectionItems(
    bodyActionBacklogItems,
    ACTION_BACKLOG_VISIBLE_LIMIT,
    expandedSections.actionBacklog
  );
  const visibleScriptReviewItems = resolveVisibleSectionItems(
    viewModel.scriptReviewItems,
    SCRIPT_REVIEW_VISIBLE_LIMIT,
    expandedSections.scriptReview
  );
  const visibleScorecardItems = resolveVisibleSectionItems(
    viewModel.operatorScorecardItems,
    SCORECARD_VISIBLE_LIMIT,
    expandedSections.scorecard
  );
  const visibleSpeechScriptItems = resolveVisibleSectionItems(
    viewModel.speechScriptItems,
    SPEECH_SCRIPT_VISIBLE_LIMIT,
    expandedSections.speechScript
  );
  const coverReason = isReviewTextDuplicate(
    viewModel.executiveReview.whyNow,
    viewModel.executiveReview.oneSentenceConclusion
  )
    ? null
    : viewModel.executiveReview.whyNow;
  const pinnedActionDetail = topActionItem
    ? formatPinnedActionDetail(topActionItem.detail, [
      viewModel.executiveReview.oneSentenceConclusion,
      coverReason,
    ])
    : null;
  const metaItems = [
    { label: '模型', value: viewModel.model || '默认模型' },
    { label: 'Provider', value: viewModel.provider || '-' },
    { label: 'Profile', value: viewModel.analysisProfile || '-' },
    { label: 'Prompt', value: viewModel.promptVersion || '-' },
    { label: 'Stage', value: viewModel.processingStage || '-' },
    { label: 'Progress', value: viewModel.progressPercent || '-' },
    { label: '分析 ID', value: displayId || '-' },
    { label: 'Response ID', value: viewModel.responseId || '-' },
    { label: '生成', value: formatFullDateTime(viewModel.generatedAt) },
    { label: '创建', value: formatFullDateTime(analysis.createdAt) },
    { label: '开始', value: formatFullDateTime(analysis.startedAt) },
    { label: '完成', value: formatFullDateTime(analysis.completedAt ?? analysis.finishedAt) },
  ];
  const toggleSection = (section: ExpandableResultSection) => {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  return (
    <section className={resultStyles.analysisResultCard} aria-label="AI 分析结果详情">
      <AnalysisResultCover
        analysisStatus={analysis.status}
        confidence={viewModel.executiveReview.confidence}
        coverReason={coverReason}
        evidenceRefs={viewModel.executiveReview.evidenceRefs}
        generatedAt={viewModel.generatedAt}
        oneSentenceConclusion={viewModel.executiveReview.oneSentenceConclusion}
        payloadStatusLabel={viewModel.payloadStatus.label}
        pinnedActionDetail={pinnedActionDetail}
        topActionItem={topActionItem}
        verdict={viewModel.executiveReview.verdict}
      />

      {playbackError ? (
        <Alert
          className={playbackStyles.analysisResultPlaybackAlert}
          closable
          message="录屏定位不可用"
          onClose={clearPlaybackError}
          showIcon
          type="warning"
          description={playbackError}
        />
      ) : null}

      {playback ? (
        <AnalysisResultPlaybackPanel
          onClose={closePlayback}
          onLoadedMetadata={handlePlaybackLoadedMetadata}
          onRetrySeek={handlePlaybackRetrySeek}
          onSeekStatusChange={handlePlaybackSeekStatusChange}
          onSeeked={handlePlaybackSeeked}
          playback={playback}
          playbackSeekMessage={playbackSeekMessage}
          playbackSeekStatus={playbackSeekStatus}
          playbackVideoRef={playbackVideoRef}
        />
      ) : null}

      {viewModel.qualityGate ? <QualityGateSection gate={viewModel.qualityGate} /> : null}

      <MomentReviewsSection
        expanded={expandedSections.moments}
        isTimeAnchorPlayable={isTimeAnchorPlayable}
        items={visibleMomentItems}
        onToggleExpanded={() => toggleSection('moments')}
        onPlayTimeAnchor={playTimeAnchor}
        playbackLoadingKey={playbackLoadingKey}
        totalCount={viewModel.momentReviewItems.length}
        visibleLimit={MOMENT_VISIBLE_LIMIT}
      />

      <ScriptReviewsSection
        expanded={expandedSections.scriptReview}
        isTimeAnchorPlayable={isTimeAnchorPlayable}
        items={visibleScriptReviewItems}
        onToggleExpanded={() => toggleSection('scriptReview')}
        onPlayTimeAnchor={playTimeAnchor}
        playbackLoadingKey={playbackLoadingKey}
        totalCount={viewModel.scriptReviewItems.length}
        visibleLimit={SCRIPT_REVIEW_VISIBLE_LIMIT}
      />

      <ScorecardSection
        expanded={expandedSections.scorecard}
        items={visibleScorecardItems}
        onToggleExpanded={() => toggleSection('scorecard')}
        totalCount={viewModel.operatorScorecardItems.length}
        visibleLimit={SCORECARD_VISIBLE_LIMIT}
      />

      <ActionBacklogSection
        expanded={expandedSections.actionBacklog}
        items={visibleActionBacklogItems}
        onToggleExpanded={() => toggleSection('actionBacklog')}
        pinnedActionTitle={topActionItem?.title ?? null}
        totalCount={bodyActionBacklogItems.length}
        visibleLimit={ACTION_BACKLOG_VISIBLE_LIMIT}
      />

      <section className={resultStyles.analysisResultAppendix} aria-label="证据与追溯材料">
        <div className={resultStyles.analysisResultAppendixHeader}>
          <span>追溯材料</span>
          <strong>证据底稿与模型记录</strong>
          <p>复盘主线已收口到运营判断；证据台账、底稿和模型记录默认折叠，只在排查或复核时展开。</p>
        </div>
        <details className={resultStyles.analysisResultAppendixDetails}>
          <summary>证据台账</summary>
          <EvidenceLedgerSection
            expanded={expandedSections.evidence}
            headerVariant="metaOnly"
            isTimeAnchorPlayable={isTimeAnchorPlayable}
            items={visibleEvidenceItems}
            onToggleExpanded={() => toggleSection('evidence')}
            onPlayTimeAnchor={playTimeAnchor}
            playbackLoadingKey={playbackLoadingKey}
            totalCount={viewModel.evidenceItems.length}
            visibleLimit={EVIDENCE_VISIBLE_LIMIT}
          />
        </details>
        <details className={resultStyles.analysisResultAppendixDetails}>
          <summary>底稿与模型记录</summary>
          <SpeechAndMetaSections
            expanded={expandedSections.speechScript}
            inputItems={viewModel.inputItems}
            metaItems={metaItems}
            onToggleExpanded={() => toggleSection('speechScript')}
            recordingItems={viewModel.recordingItems}
            selfEvalItems={viewModel.selfEvalItems}
            speechItems={visibleSpeechScriptItems}
            totalSpeechCount={viewModel.speechScriptItems.length}
            usageItems={viewModel.usageItems}
            visibleLimit={SPEECH_SCRIPT_VISIBLE_LIMIT}
          />
        </details>
        {viewModel.outputExcerpt ? (
          <details className={resultStyles.analysisResultAppendixDetails}>
            <summary>模型输出摘录</summary>
            <OutputExcerptSection headerVariant="metaOnly" outputExcerpt={viewModel.outputExcerpt} />
          </details>
        ) : null}
      </section>
    </section>
  );
}
