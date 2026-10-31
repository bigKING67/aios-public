import { Button, SkeletonText, Tooltip } from '@lobehub/ui';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AiTaskStatus } from '@/components/molecules/ai-task-status';
import { isHiddenPresetLabel, type StudioSegmentPreset } from '../_lib/ai-studio-api';
import { findPreset } from '../_lib/segment-display';
import { buildSegmentAnnotationPath } from '../_lib/segment-routes';
import {
  describeSuggestionLabels,
  isSuggestionJobActive,
  readSuggestionJobOutcome,
  splitLatestSuggestionJobs,
  suggestionFailureText,
  suggestionJobStatusView,
  suggestionPromptLabel,
  type StudioSegmentSuggestionJob,
} from '../_lib/segment-suggestion-api';
import { formatShortTimestamp } from '../_lib/studio-time';
import styles from './segment-annotation.module.css';
import suggestStyles from './segment-suggest.module.css';
import workbenchStyles from './studio-workbench.module.css';

function JobResult({ job }: { job: StudioSegmentSuggestionJob }) {
  if (job.status === 'failed' || job.status === 'cancelled') {
    const failure = suggestionFailureText(job);
    return failure.detail ? (
      <Tooltip title={failure.detail}>
        <span tabIndex={0} className={suggestStyles.jobError}>{failure.text}</span>
      </Tooltip>
    ) : (
      <span className={suggestStyles.jobError}>{failure.text}</span>
    );
  }
  if (isSuggestionJobActive(job)) return <span className={styles.readOnlyHint}>{job.stage}</span>;
  const outcome = readSuggestionJobOutcome(job.resultSummary);
  if (!outcome || outcome.inserted === null) return <span className={styles.readOnlyHint}>结果摘要不可读</span>;
  const parts = [`新增待确认 ${outcome.inserted} 段`];
  if (outcome.superseded) parts.push(`替换旧建议 ${outcome.superseded} 段`);
  if (outcome.dropped) parts.push(`丢弃无效输出 ${outcome.dropped} 条`);
  if (outcome.confirmedDuplicates) parts.push(`跳过与已确认重复 ${outcome.confirmedDuplicates} 段`);
  return <span>{parts.join('，')}</span>;
}

interface SuggestionJobTableProps {
  jobs: readonly StudioSegmentSuggestionJob[];
  presets: readonly StudioSegmentPreset[];
  loading: boolean;
  /** Jobs just submitted from this page, highlighted until the next submit. */
  highlightIds?: readonly string[];
}

/**
 * Candidate labels, shown only when a job used a subset of its preset: as the
 * excluded labels when one or two were left out (the common case), otherwise
 * as the included list.
 */
function JobLabels({ job, presets }: { job: StudioSegmentSuggestionJob; presets: readonly StudioSegmentPreset[] }) {
  const preset = findPreset(presets, job.presetKey, job.presetVersion);
  // Older runs still list hidden labels (KOC); judge them against the labels offered today.
  const labelKeys = job.labelKeys.filter((key) => !isHiddenPresetLabel(key));
  const summary = describeSuggestionLabels(labelKeys, preset);
  if (summary.short.startsWith('全部') || summary.short === '--') return null;
  const excluded = preset?.labels.filter((label) => !labelKeys.includes(label.key)).map((label) => label.name) ?? [];
  if (preset && excluded.length > 0 && excluded.length <= 2 && labelKeys.every((key) => preset.labels.some((label) => label.key === key))) {
    return <small className={styles.readOnlyHint}>不含 {excluded.join('、')}</small>;
  }
  return summary.short === summary.full ? (
    <small className={styles.readOnlyHint}>仅 {summary.short}</small>
  ) : (
    // Focusable so keyboard users can open the tooltip; screen readers get the full list.
    <Tooltip title={summary.full}>
      <small tabIndex={0} className={`${styles.readOnlyHint} ${suggestStyles.labelSummary}`}>
        <span aria-hidden="true">仅 {summary.short}</span>
        <span className="sr-only">{summary.full}</span>
      </small>
    </Tooltip>
  );
}

/**
 * One row per original (its newest job), full width under the workbench: 原片, result, time,
 * status and the review link on one line;
 * older runs of the same original fold into history so a re-run failure does
 * not read as the current state.
 */
export function SuggestionJobTable({ jobs, presets, loading, highlightIds }: SuggestionJobTableProps) {
  const [showHistory, setShowHistory] = useState(false);
  const { latest, history } = splitLatestSuggestionJobs(jobs);
  const rows = showHistory ? [...latest, ...history] : latest;

  if (loading) return <SkeletonText rows={3} />;
  if (jobs.length === 0) return <p className={styles.fieldHelp}>还没有发起过 AI 切段。</p>;

  return (
    <div className={suggestStyles.stack}>
      <ul className={workbenchStyles.runRows} aria-label="分析任务">
        {rows.map((job) => {
          const view = suggestionJobStatusView(job.status);
          const old = showHistory && history.includes(job);
          return (
            <li
              key={job.jobId}
              className={[
                workbenchStyles.runRow,
                highlightIds?.includes(job.jobId) ? workbenchStyles.runRowNew : '',
                old ? workbenchStyles.runRowPast : '',
              ].filter(Boolean).join(' ')}
            >
              <span className={workbenchStyles.runTitle} title={job.assetTitle}>{job.assetTitle}</span>
              <span className={workbenchStyles.runDetail}>
                <JobResult job={job} />
                <JobLabels job={job} presets={presets} />
              </span>
              <span
                className={workbenchStyles.runTime}
                title={suggestionPromptLabel(job.promptVersion) ? `AI 提示词 ${suggestionPromptLabel(job.promptVersion)}` : undefined}
              >
                {formatShortTimestamp(job.createdAt)}
              </span>
              <span className={workbenchStyles.runStatus}>
                <AiTaskStatus compact state={view.state} stateLabel={view.label} />
              </span>
              <span className={workbenchStyles.runAction}>
                {job.status === 'succeeded' ? (
                  <RouterLink className={styles.tableLink} to={buildSegmentAnnotationPath(job.assetId, undefined, job.presetKey, 'analysis')}>
                    审核建议片段
                  </RouterLink>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {history.length > 0 ? (
        <Button type="link" size="small" className={suggestStyles.historyToggle} onClick={() => setShowHistory((value) => !value)}>
          {showHistory ? '收起较早记录' : `显示较早记录（${history.length} 条）`}
        </Button>
      ) : null}
    </div>
  );
}
