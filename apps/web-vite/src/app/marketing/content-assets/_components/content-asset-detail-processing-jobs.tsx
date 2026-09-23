import type { ContentAssetProcessingJob } from '../_lib/content-assets-types';
import { resolveProcessingJobProgress } from '../_lib/content-assets-processing-jobs';
import { resolveProcessingJobStatus } from './content-asset-detail-workbench-state';
import workbenchStyles from './content-assets-detail-workbench.module.css';

export function ProcessingJobProgress({
  job,
}: {
  job: ContentAssetProcessingJob;
}) {
  const progress = resolveProcessingJobProgress(job);
  if (progress.percent == null) return null;
  const status = resolveProcessingJobStatus(job.status);
  const jobLabel = job.jobType === 'analysis' ? 'AI' : '脚本';
  const headline = progress.stageLabel ? `${jobLabel} · ${progress.stageLabel}` : `${jobLabel}${status.label}`;
  const percent = progress.percent;
  const attemptText = job.attempts > 0 ? ` · ${job.attempts}/${job.maxAttempts}` : '';

  return (
    <div className={workbenchStyles.primaryJobProgress} data-status={job.status}>
      <div className={workbenchStyles.primaryJobProgressHeader}>
        <span>{headline}{attemptText}</span>
        <strong>{percent}%</strong>
      </div>
      <div
        className={workbenchStyles.primaryJobProgressTrack}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span className={workbenchStyles.primaryJobProgressFill} style={{ width: `${percent}%` }} />
      </div>
      <div className={workbenchStyles.primaryJobProgressFooter}>
        <span>{status.helper}</span>
      </div>
    </div>
  );
}
