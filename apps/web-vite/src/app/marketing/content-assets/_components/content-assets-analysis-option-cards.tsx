import { useEffect, useState } from 'react';
import { Button } from 'antd';
import { CONTENT_ASSET_ANALYSIS_OPTIONS } from '../_lib/content-assets-analysis-options';
import {
  CONTENT_ASSET_LONG_VIDEO_AI_HELPER,
  isLongFormContentAssetForAi,
} from '../_lib/content-assets-ai-eligibility';
import type {
  ContentAssetAnalysisProfile,
  ContentAssetAnalysisSource,
  ContentAssetProcessingJob,
} from '../_lib/content-assets-types';
import {
  findActiveProcessingJob,
  findLatestAnalysisJobForProfile,
  isActiveProcessingJobStatus,
  isTerminalProcessingJobStatus,
  processingJobTimestamp,
  resolveProcessingJobErrorInfo,
  resolveProcessingJobProgress,
  resolveProcessingJobStageLabel,
} from '../_lib/content-assets-processing-jobs';
import optionStyles from './content-assets-analysis-option-cards.module.css';
import { resolveProcessingJobStatus } from './content-asset-detail-workbench-state';

export function AnalysisOptionGrid({
  actionLoading,
  canAnalyzePreview,
  canAnalyzeRaw,
  durationSeconds,
  hasExistingAnalysis,
  processingJobs,
  submittingProfile,
  onCreateAnalysisJob,
}: {
  actionLoading: boolean;
  canAnalyzePreview: boolean;
  canAnalyzeRaw: boolean;
  durationSeconds: number | null;
  hasExistingAnalysis: boolean;
  processingJobs: ContentAssetProcessingJob[];
  submittingProfile: ContentAssetAnalysisProfile | null;
  onCreateAnalysisJob: (
    source: ContentAssetAnalysisSource,
    force: boolean,
    profile?: ContentAssetAnalysisProfile
  ) => void;
}) {
  const [pendingSelection, setPendingSelection] = useState<PendingAnalysisSelection | null>(null);
  const selectedProfile = pendingSelection?.profile ?? null;
  const activeAnalysisJob = findActiveProcessingJob(processingJobs, 'analysis');
  const activeAnalysisJobProfile = activeAnalysisJob
    ? readAnalysisJobProfile(activeAnalysisJob)
    : null;
  const pendingSelectedProfile = submittingProfile ?? selectedProfile;
  const currentResultProfile =
    activeAnalysisJob || pendingSelectedProfile
      ? null
      : findCurrentAnalysisResultProfile(processingJobs);
  const isLongFormForAi = isLongFormContentAssetForAi(durationSeconds);

  useEffect(() => {
    if (!pendingSelection) return;
    const selectedProfile = pendingSelection.profile;
    if (actionLoading || submittingProfile === selectedProfile) return;

    const selectedJob = findLatestAnalysisJobForProfile(processingJobs, selectedProfile);
    if (selectedJob && isActiveProcessingJobStatus(selectedJob.status)) return;
    if (
      selectedJob &&
      isTerminalProcessingJobStatus(selectedJob.status) &&
      !isPendingSelectionBaselineJob(selectedJob, pendingSelection)
    ) {
      setPendingSelection(null);
      return;
    }
    if (activeAnalysisJob && activeAnalysisJobProfile !== selectedProfile) {
      setPendingSelection(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPendingSelection((selection) => (selection === pendingSelection ? null : selection));
    }, 8000);
    return () => window.clearTimeout(timeoutId);
  }, [
    actionLoading,
    activeAnalysisJob,
    activeAnalysisJobProfile,
    pendingSelection,
    processingJobs,
    submittingProfile,
  ]);

  return (
    <div className={optionStyles.analysisOptionGrid}>
      {CONTENT_ASSET_ANALYSIS_OPTIONS.map((option) => {
        const canRun = option.source === 'preview' ? canAnalyzePreview : canAnalyzeRaw;
        const job = findLatestAnalysisJobForProfile(processingJobs, option.profile);
        const isSubmitting = actionLoading && submittingProfile === option.profile;
        const isActiveJob = Boolean(job && isActiveProcessingJobStatus(job.status));
        const isActiveOrSubmitting = isActiveJob || isSubmitting;
        const isBlockedByOtherActiveJob = Boolean(activeAnalysisJob && activeAnalysisJob.jobId !== job?.jobId);
        const isRecommended = option.profile === 'preview_fast';
        const isCurrentResult = !activeAnalysisJob && currentResultProfile === option.profile;
        const isSelectedPending =
          pendingSelectedProfile === option.profile && !isActiveOrSubmitting && !isCurrentResult;
        const isEmphasized = isActiveOrSubmitting || isCurrentResult || isSelectedPending;
        const buttonDisabled =
          !canRun ||
          isLongFormForAi ||
          isActiveJob ||
          isSelectedPending ||
          isBlockedByOtherActiveJob ||
          actionLoading;
        const actionText = analysisOptionButtonText({
          job,
          isBlockedByOtherActiveJob,
          isLongFormForAi,
        });
        return (
          <article
            key={option.key}
            className={optionStyles.analysisOptionCard}
            data-active={isActiveOrSubmitting || undefined}
            data-current={isCurrentResult || undefined}
            data-selected={isSelectedPending || undefined}
            data-emphasized={isEmphasized || undefined}
            data-status={job?.status || 'idle'}
          >
            <div className={optionStyles.analysisOptionHeader}>
              <div>
                <strong>{option.title}</strong>
                <div className={optionStyles.analysisOptionMeta}>
                  <span className={optionStyles.analysisOptionBadge}>{option.badge}</span>
                  <AnalysisOptionStateBadge
                    isActive={isActiveOrSubmitting}
                    isCurrent={isCurrentResult}
                    isSelected={isSelectedPending}
                    isRecommended={isRecommended}
                  />
                </div>
              </div>
            </div>
            <p>
              {analysisOptionHelperText({
                job,
                optionHelper: option.helper,
                isBlockedByOtherActiveJob,
                isLongFormForAi,
              })}
            </p>
            {job ? <AnalysisJobProgress job={job} /> : null}
            <Button
              className={optionStyles.analysisOptionAction}
              type={isEmphasized ? 'primary' : 'default'}
              size="middle"
              block
              loading={isSubmitting}
              disabled={buttonDisabled}
              aria-label={`${actionText}：${option.title}`}
              onClick={() => {
                setPendingSelection({
                  profile: option.profile,
                  baselineJobId: job?.jobId ?? null,
                  baselineJobStatus: job?.status ?? null,
                  baselineJobTimestamp: job ? processingJobTimestamp(job) : -1,
                });
                onCreateAnalysisJob(option.source, hasExistingAnalysis, option.profile);
              }}
            >
              {actionText}
            </Button>
          </article>
        );
      })}
    </div>
  );
}

interface PendingAnalysisSelection {
  profile: ContentAssetAnalysisProfile;
  baselineJobId: string | null;
  baselineJobStatus: string | null;
  baselineJobTimestamp: number;
}

function AnalysisOptionStateBadge({
  isActive,
  isCurrent,
  isSelected,
  isRecommended,
}: {
  isActive: boolean;
  isCurrent: boolean;
  isSelected: boolean;
  isRecommended: boolean;
}) {
  if (isActive) {
    return (
      <span className={optionStyles.analysisOptionStateBadge} data-tone="active">
        分析中
      </span>
    );
  }
  if (isCurrent) {
    return (
      <span className={optionStyles.analysisOptionStateBadge} data-tone="current">
        当前结果
      </span>
    );
  }
  if (isSelected) {
    return (
      <span className={optionStyles.analysisOptionStateBadge} data-tone="selected">
        已选中
      </span>
    );
  }
  if (isRecommended) {
    return (
      <span className={optionStyles.analysisOptionStateBadge} data-tone="recommended">
        推荐
      </span>
    );
  }
  return null;
}

function AnalysisJobProgress({ job }: { job: ContentAssetProcessingJob }) {
  const progress = resolveProcessingJobProgress(job);
  const percent = progress.percent;
  if (percent == null) return null;
  const status = resolveProcessingJobStatus(job.status);
  const attemptText = job.attempts > 0 ? ` · ${job.attempts}/${job.maxAttempts}` : '';
  const headline = progress.stageLabel || status.label;
  return (
    <div className={optionStyles.analysisJobProgress} data-status={job.status}>
      <div className={optionStyles.analysisJobProgressHeader}>
        <span>{headline}{attemptText}</span>
        <strong>{percent}%</strong>
      </div>
      <div
        className={optionStyles.analysisJobProgressTrack}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span className={optionStyles.analysisJobProgressFill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function analysisOptionButtonText({
  job,
  isBlockedByOtherActiveJob,
  isLongFormForAi,
}: {
  job: ContentAssetProcessingJob | null;
  isBlockedByOtherActiveJob: boolean;
  isLongFormForAi: boolean;
}): string {
  if (job && isActiveProcessingJobStatus(job.status)) {
    return resolveProcessingJobStatus(job.status).label;
  }
  if (isBlockedByOtherActiveJob) return '等待当前任务';
  if (isLongFormForAi) return '视频过长';
  if (job?.status === 'failed') return '重新分析';
  if (job?.status === 'succeeded') return '重新分析';
  return '开始分析';
}

function analysisOptionHelperText({
  job,
  optionHelper,
  isBlockedByOtherActiveJob,
  isLongFormForAi,
}: {
  job: ContentAssetProcessingJob | null;
  optionHelper: string;
  isBlockedByOtherActiveJob: boolean;
  isLongFormForAi: boolean;
}): string {
  if (job && isActiveProcessingJobStatus(job.status)) {
    return resolveProcessingJobStageLabel(job) || resolveProcessingJobStatus(job.status).helper;
  }
  if (isLongFormForAi) {
    return CONTENT_ASSET_LONG_VIDEO_AI_HELPER;
  }
  if (job?.status === 'failed') {
    const errorInfo = resolveProcessingJobErrorInfo(job);
    return errorInfo ? `${errorInfo.label}：${errorInfo.helper}` : '上次失败，确认视频可读后再重新分析。';
  }
  if (isBlockedByOtherActiveJob) {
    return '当前素材同一时间只运行一个 AI 分析任务，避免结果互相覆盖。';
  }
  if (job?.status === 'succeeded') {
    return '该策略已有完成记录，重新分析会覆盖当前摘要、评分与推荐标签。';
  }
  return optionHelper;
}

function findCurrentAnalysisResultProfile(
  jobs: ContentAssetProcessingJob[]
): ContentAssetAnalysisProfile | null {
  let latestProfile: ContentAssetAnalysisProfile | null = null;
  let latestTime = -1;
  for (const job of jobs) {
    if (job.jobType !== 'analysis' || job.status !== 'succeeded') continue;
    const profile = readAnalysisJobProfile(job);
    if (!profile) continue;
    const timestamp = processingJobTimestamp(job);
    if (timestamp > latestTime) {
      latestProfile = profile;
      latestTime = timestamp;
    }
  }
  return latestProfile;
}

function readAnalysisJobProfile(job: ContentAssetProcessingJob): ContentAssetAnalysisProfile | null {
  const profile = readMetadataString(job.metadata, 'analysis_profile');
  return isAnalysisProfile(profile) ? profile : null;
}

function isPendingSelectionBaselineJob(
  job: ContentAssetProcessingJob,
  pendingSelection: PendingAnalysisSelection
): boolean {
  return (
    job.jobId === pendingSelection.baselineJobId &&
    job.status === pendingSelection.baselineJobStatus &&
    processingJobTimestamp(job) <= pendingSelection.baselineJobTimestamp
  );
}

function readMetadataString(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function isAnalysisProfile(value: string): value is ContentAssetAnalysisProfile {
  return CONTENT_ASSET_ANALYSIS_OPTIONS.some((option) => option.profile === value);
}
