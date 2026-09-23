import { Button, Empty, Popconfirm, Tag } from 'antd';
import type { ContentAssetProcessingJob } from '../_lib/content-assets-types';
import { formatDateTime } from '../_lib/content-assets-formatters';
import {
  CONTENT_ASSET_LONG_VIDEO_AI_HELPER,
  isLongFormContentAssetForAi,
} from '../_lib/content-assets-ai-eligibility';
import {
  resolveProcessingJobErrorInfo,
  resolveProcessingJobProgress,
  resolveProcessingJobStageLabel,
  isStaleRunningProcessingJob,
} from '../_lib/content-assets-processing-jobs';
import jobStyles from './content-assets-processing-jobs.module.css';
import workspaceStyles from './content-assets-workspace-panels.module.css';

export function ProcessingJobList({
  actionLoading,
  canManage,
  canWrite,
  emptyDescription,
  items,
  loading,
  onCancelJob,
  onOpenAssets,
  onResetStaleJob,
  onRetryJob,
}: {
  actionLoading: boolean;
  canManage: boolean;
  canWrite: boolean;
  emptyDescription: string;
  items: ContentAssetProcessingJob[];
  loading: boolean;
  onCancelJob: (jobId: string) => void;
  onOpenAssets: () => void;
  onResetStaleJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className={workspaceStyles.jobEmpty}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? '正在加载处理任务' : emptyDescription} />
      </div>
    );
  }

  return (
    <div className={jobStyles.jobList}>
      {items.map((job) => (
        <ProcessingJobRow
          actionLoading={actionLoading}
          canManage={canManage}
          canWrite={canWrite}
          job={job}
          key={job.jobId}
          onCancelJob={onCancelJob}
          onOpenAssets={onOpenAssets}
          onResetStaleJob={onResetStaleJob}
          onRetryJob={onRetryJob}
        />
      ))}
    </div>
  );
}

function ProcessingJobRow({
  actionLoading,
  canManage,
  canWrite,
  job,
  onCancelJob,
  onOpenAssets,
  onResetStaleJob,
  onRetryJob,
}: {
  actionLoading: boolean;
  canManage: boolean;
  canWrite: boolean;
  job: ContentAssetProcessingJob;
  onCancelJob: (jobId: string) => void;
  onOpenAssets: () => void;
  onResetStaleJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
}) {
  const isLongAiJob =
    (job.jobType === 'analysis' || job.jobType === 'transcript') &&
    isLongFormContentAssetForAi(job.durationSeconds);
  const longAiRetryBlocked = isLongAiJob && (job.status === 'failed' || job.status === 'cancelled');
  const canRetry = canWrite && !longAiRetryBlocked && (job.status === 'failed' || job.status === 'cancelled');
  const canCancel = canWrite && job.status === 'queued';
  const canResetStale = canManage && isStaleRunningProcessingJob(job);
  const progress = resolveProcessingJobProgress(job);
  const stageLabel = resolveProcessingJobStageLabel(job);
  const errorInfo = resolveProcessingJobErrorInfo(job);

  return (
    <article className={jobStyles.jobRow}>
      <div className={jobStyles.jobRowMain}>
        <div>
          <strong>{job.title}</strong>
          <span>{processingJobTypeLabel(job.jobType)} · {formatDateTime(job.queuedAt)}</span>
        </div>
        <Tag color={processingJobStatusColor(job.status)}>{processingJobStatusLabel(job.status)}</Tag>
      </div>
      <div className={jobStyles.jobMetaGrid}>
        <span>尝试 {job.attempts}/{job.maxAttempts}</span>
        <span>{stageLabel || job.outputObjectKey || job.inputObjectKey || '--'}</span>
      </div>
      {progress.percent != null ? (
        <div className={jobStyles.jobProgress} data-status={job.status}>
          <div
            className={jobStyles.jobProgressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <span className={jobStyles.jobProgressFill} style={{ width: `${progress.percent}%` }} />
          </div>
          <strong>{progress.percent}%</strong>
        </div>
      ) : null}
      {errorInfo && !longAiRetryBlocked ? (
        <div className={jobStyles.jobError}>
          <strong>{errorInfo.label}</strong>
          <span>{errorInfo.helper}</span>
          {errorInfo.rawError ? <small>技术错误：{errorInfo.rawError}</small> : null}
        </div>
      ) : null}
      {longAiRetryBlocked ? (
        <div className={jobStyles.jobError}>
          <strong>视频过长</strong>
          <span>{CONTENT_ASSET_LONG_VIDEO_AI_HELPER}</span>
        </div>
      ) : null}
      <div className={jobStyles.jobActions}>
        {canRetry ? (
          <Button size="small" loading={actionLoading} onClick={() => onRetryJob(job.jobId)}>
            重试
          </Button>
        ) : null}
        {canCancel ? (
          <Button size="small" danger loading={actionLoading} onClick={() => onCancelJob(job.jobId)}>
            取消
          </Button>
        ) : null}
        {canResetStale ? (
          <Popconfirm
            title="标记为超时失败？"
            description="仅用于 worker 长时间无进度更新的任务。标记失败后可再重试。"
            okText="标记超时"
            cancelText="取消"
            onConfirm={() => onResetStaleJob(job.jobId)}
          >
            <Button size="small" danger loading={actionLoading}>
              标记超时
            </Button>
          </Popconfirm>
        ) : null}
        <button className={jobStyles.jobOpenButton} type="button" onClick={onOpenAssets}>
          到素材库查看
        </button>
      </div>
    </article>
  );
}

function processingJobTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    preview: '预览视频',
    cover: '封面图',
    frames: '抽帧',
    transcript: '脚本/SRT',
    analysis: 'AI分析',
  };
  return labels[type] || type;
}

function processingJobStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: '排队中',
    running: '运行中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
  };
  return labels[status] || status;
}

function processingJobStatusColor(status: string): string {
  const colors: Record<string, string> = {
    queued: 'default',
    running: 'processing',
    succeeded: 'success',
    failed: 'error',
    cancelled: 'default',
  };
  return colors[status] || 'default';
}
