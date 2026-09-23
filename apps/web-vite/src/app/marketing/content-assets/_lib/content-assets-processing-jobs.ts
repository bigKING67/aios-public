import type {
  ContentAssetAnalysisProfile,
  ContentAssetProcessingJob,
} from './content-assets-types';

const ACTIVE_JOB_STATUSES = new Set(['queued', 'running']);
const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const STALE_RUNNING_JOB_MS = 30 * 60 * 1000;

export interface ProcessingJobProgress {
  percent: number | null;
  stageLabel: string;
}

export interface ProcessingJobErrorInfo {
  label: string;
  helper: string;
  category: string;
  rawError: string;
}

export function isActiveProcessingJobStatus(status: string): boolean {
  return ACTIVE_JOB_STATUSES.has(status);
}

export function isTerminalProcessingJobStatus(status: string): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}

export function isStaleRunningProcessingJob(job: ContentAssetProcessingJob, now = Date.now()): boolean {
  if (job.status !== 'running') return false;
  const updatedAt = Date.parse(job.updatedAt || job.startedAt || job.createdAt);
  const startedAt = Date.parse(job.startedAt || job.createdAt);
  if (!Number.isFinite(updatedAt) || !Number.isFinite(startedAt)) return false;
  return now - updatedAt >= STALE_RUNNING_JOB_MS && now - startedAt >= STALE_RUNNING_JOB_MS;
}

export function processingJobTimestamp(job: ContentAssetProcessingJob): number {
  return Date.parse(job.updatedAt || job.finishedAt || job.startedAt || job.queuedAt || job.createdAt) || 0;
}

export function resolveProcessingJobProgress(job: ContentAssetProcessingJob): ProcessingJobProgress {
  if (job.status === 'succeeded') {
    return {
      percent: 100,
      stageLabel: resolveProcessingJobStageLabel(job),
    };
  }
  if (!isActiveProcessingJobStatus(job.status)) {
    return {
      percent: null,
      stageLabel: resolveProcessingJobStageLabel(job),
    };
  }
  return {
    percent: resolveProcessingJobMetadataPercent(job) ?? resolveProcessingJobProgressPercent(job.status),
    stageLabel: resolveProcessingJobStageLabel(job),
  };
}

export function resolveProcessingJobProgressPercent(status: string): number | null {
  switch (status) {
    case 'queued':
      return 5;
    case 'running':
      return 60;
    case 'succeeded':
      return 100;
    default:
      return null;
  }
}

export function resolveProcessingJobStageLabel(job: ContentAssetProcessingJob): string {
  return readProcessingJobMetadataString(job, 'processing_stage_label');
}

export function resolveProcessingJobErrorInfo(job: ContentAssetProcessingJob): ProcessingJobErrorInfo | null {
  const label = readProcessingJobMetadataString(job, 'processing_error_label');
  const helper = readProcessingJobMetadataString(job, 'processing_error_helper');
  const category = readProcessingJobMetadataString(job, 'processing_error_category');
  const rawError = job.errorMessage || '';
  if (!label && !helper && !rawError) return null;
  return {
    label: label || '处理失败',
    helper: helper || '查看技术错误后重试；若反复失败再交给技术排查。',
    category: category || 'unknown',
    rawError,
  };
}

export function findLatestAnalysisJobForProfile(
  jobs: ContentAssetProcessingJob[],
  profile: ContentAssetAnalysisProfile
): ContentAssetProcessingJob | null {
  let latest: ContentAssetProcessingJob | null = null;
  let latestTime = -1;
  for (const job of jobs) {
    if (job.jobType !== 'analysis') continue;
    if (readProcessingJobMetadataString(job, 'analysis_profile') !== profile) continue;
    const timestamp = processingJobTimestamp(job);
    if (timestamp > latestTime) {
      latest = job;
      latestTime = timestamp;
    }
  }
  return latest;
}

export function findActiveProcessingJob(
  jobs: ContentAssetProcessingJob[],
  jobType: 'analysis' | 'transcript'
): ContentAssetProcessingJob | null {
  let latest: ContentAssetProcessingJob | null = null;
  let latestTime = -1;
  for (const job of jobs) {
    if (job.jobType !== jobType || !isActiveProcessingJobStatus(job.status)) continue;
    const timestamp = processingJobTimestamp(job);
    if (timestamp > latestTime) {
      latest = job;
      latestTime = timestamp;
    }
  }
  return latest;
}

export function mergeProcessingJobs(
  serverJobs: ContentAssetProcessingJob[],
  recentJobs: ContentAssetProcessingJob[]
): ContentAssetProcessingJob[] {
  const jobMap = new Map<string, ContentAssetProcessingJob>();
  for (const job of recentJobs) {
    jobMap.set(job.jobId, job);
  }
  for (const job of serverJobs) {
    jobMap.set(job.jobId, job);
  }
  return Array.from(jobMap.values()).sort(compareProcessingJobsForDisplay);
}

function readProcessingJobMetadataString(job: ContentAssetProcessingJob, key: string): string {
  if (!job.metadata || typeof job.metadata !== 'object' || Array.isArray(job.metadata)) return '';
  const value = (job.metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function resolveProcessingJobMetadataPercent(job: ContentAssetProcessingJob): number | null {
  if (!job.metadata || typeof job.metadata !== 'object' || Array.isArray(job.metadata)) return null;
  const value = (job.metadata as Record<string, unknown>).processing_progress_percent;
  if (value == null || value === '') return null;
  const percent = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(percent)) return null;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function compareProcessingJobsForDisplay(a: ContentAssetProcessingJob, b: ContentAssetProcessingJob): number {
  return processingStatusRank(a.status) - processingStatusRank(b.status) || processingJobTimestamp(b) - processingJobTimestamp(a);
}

function processingStatusRank(status: string): number {
  switch (status) {
    case 'running':
      return 1;
    case 'queued':
      return 2;
    case 'failed':
      return 3;
    case 'succeeded':
      return 4;
    default:
      return 9;
  }
}
