import type {
  ContentAssetAnalysisProfile,
  ContentAssetAnalysisSource,
  ContentAssetDetailResponse,
  ContentAssetProcessingJob,
} from '../_lib/content-assets-types';
import {
  CONTENT_ASSET_LONG_VIDEO_AI_HELPER,
  isLongFormContentAssetForAi,
} from '../_lib/content-assets-ai-eligibility';
import {
  isActiveProcessingJobStatus,
  processingJobTimestamp,
  resolveProcessingJobErrorInfo,
  resolveProcessingJobStageLabel,
} from '../_lib/content-assets-processing-jobs';

export type WorkflowState = 'ready' | 'partial' | 'blocked';

export interface PrimaryAction {
  kind: 'analysis' | 'transcript';
  label: string;
  buttonLabel?: string;
  helper: string;
  enabled: boolean;
  onClick: () => void;
}

export function findLatestProcessingJob(
  jobs: ContentAssetProcessingJob[],
  jobType: 'transcript' | 'analysis'
): ContentAssetProcessingJob | null {
  let latest: ContentAssetProcessingJob | null = null;
  let latestTime = -1;
  for (const job of jobs) {
    if (job.jobType !== jobType) continue;
    const timestamp = processingJobTimestamp(job);
    if (timestamp > latestTime) {
      latest = job;
      latestTime = timestamp;
    }
  }
  return latest;
}

export function resolveWorkflowJobValue({
  fallback,
  job,
  ready,
}: {
  fallback: string;
  job: ContentAssetProcessingJob | null;
  ready: boolean;
}): string {
  return !ready && job ? resolveProcessingJobStatus(job.status).label : fallback;
}

export function resolveWorkflowJobState({
  hasPartialRecord,
  job,
  ready,
}: {
  hasPartialRecord: boolean;
  job: ContentAssetProcessingJob | null;
  ready: boolean;
}): WorkflowState {
  if (ready) return 'ready';
  const status = job?.status;
  return status === 'queued' || status === 'running' || status === 'succeeded' || hasPartialRecord
    ? 'partial'
    : 'blocked';
}

export function resolveProcessingJobStatus(status: string): {
  label: string;
  helper: string;
} {
  const statusMap: Record<string, { label: string; helper: string }> = {
    queued: {
      label: '排队中',
      helper: '等待 worker 领取，不显示假进度。',
    },
    running: {
      label: '运行中',
      helper: '处理中，完成后写回。',
    },
    succeeded: {
      label: '已完成',
      helper: '已写回；未显示请刷新。',
    },
    failed: {
      label: '失败',
      helper: '查看错误后重试。',
    },
    cancelled: {
      label: '已取消',
      helper: '可重新发起任务。',
    },
  };
  return statusMap[status] || {
    label: status || '--',
    helper: '刷新状态或看日志。',
  };
}

export function resolveMediaState(asset: ContentAssetDetailResponse['asset']): {
  label: string;
  state: WorkflowState;
} {
  if (asset.externalOnly) {
    return {
      label: '待补源文件',
      state: 'blocked',
    };
  }
  if (asset.assetStatus === 'failed' && !asset.previewObjectKey) {
    return {
      label: '处理失败',
      state: 'blocked',
    };
  }
  if (asset.assetStatus === 'processing') {
    return {
      label: '处理中',
      state: 'partial',
    };
  }
  if (asset.assetStatus === 'pending_processing' && asset.rawObjectKey && !asset.previewObjectKey) {
    return {
      label: '待生成预览',
      state: 'partial',
    };
  }
  if (asset.previewObjectKey) {
    return {
      label: '预览可播放',
      state: 'ready',
    };
  }
  if (asset.rawObjectKey) {
    return {
      label: '原片临时播放',
      state: 'partial',
    };
  }
  return {
    label: '缺少视频对象',
    state: 'blocked',
  };
}

export function resolveProfileCompletionPercent(status: string | null | undefined): number {
  const values: Record<string, number> = {
    incomplete: 0,
    basic_complete: 50,
    platform_bound: 70,
    performance_ready: 85,
    complete: 100,
    verified: 100,
  };

  return values[status || ''] ?? 0;
}

export function resolvePrimaryAction({
  canWrite,
  hasAiSummary,
  hasAnalysisObject,
  hasTranscript,
  hasPreview,
  hasRaw,
  durationSeconds,
  externalOnly,
  transcriptJob,
  analysisJob,
  onCreateAnalysisJob,
  onCreateTranscriptJob,
}: {
  canWrite: boolean;
  hasAiSummary: boolean;
  hasAnalysisObject: boolean;
  hasTranscript: boolean;
  hasPreview: boolean;
  hasRaw: boolean;
  durationSeconds: number | null;
  externalOnly: boolean;
  transcriptJob: ContentAssetProcessingJob | null;
  analysisJob: ContentAssetProcessingJob | null;
  onCreateAnalysisJob: (
    source: ContentAssetAnalysisSource,
    force: boolean,
    profile?: ContentAssetAnalysisProfile
  ) => void;
  onCreateTranscriptJob: (force: boolean) => void;
}): PrimaryAction | null {
  const canUseVideo = !externalOnly && (hasPreview || hasRaw);
  const isLongFormForAi = isLongFormContentAssetForAi(durationSeconds);
  if (!hasTranscript) {
    if (transcriptJob && isActiveProcessingJob(transcriptJob)) {
      const status = resolveProcessingJobStatus(transcriptJob.status);
      const stageLabel = resolveProcessingJobStageLabel(transcriptJob);
      return {
        kind: 'transcript',
        label: transcriptJob.status === 'running' ? '脚本生成中' : '脚本已排队',
        buttonLabel: status.label,
        helper: stageLabel || status.helper,
        enabled: false,
        onClick: () => undefined,
      };
    }
    if (transcriptJob && isFailedProcessingJob(transcriptJob)) {
      const errorInfo = resolveProcessingJobErrorInfo(transcriptJob);
      return {
        kind: 'transcript',
        label: '重试脚本 / SRT',
        helper: isLongFormForAi
          ? CONTENT_ASSET_LONG_VIDEO_AI_HELPER
          : errorInfo
            ? `${errorInfo.label}：${errorInfo.helper}`
            : '上次失败，确认视频可读后重试。',
        enabled: canWrite && canUseVideo && !isLongFormForAi,
        onClick: () => onCreateTranscriptJob(true),
      };
    }
    if (transcriptJob?.status === 'succeeded') {
      return {
        kind: 'transcript',
        label: '脚本已完成',
        helper: '已完成；未显示请刷新。',
        enabled: false,
        onClick: () => undefined,
      };
    }
    return {
      kind: 'transcript',
      label: '生成脚本 / SRT',
      helper: canUseVideo
        ? isLongFormForAi
          ? CONTENT_ASSET_LONG_VIDEO_AI_HELPER
          : '先生成脚本，再做复剪分析。'
        : '补齐源视频后再生成。',
      enabled: canWrite && canUseVideo && !isLongFormForAi,
      onClick: () => onCreateTranscriptJob(false),
    };
  }
  if (!hasAnalysisObject) {
    const source: ContentAssetAnalysisSource = hasPreview ? 'preview' : 'raw';
    const profile: ContentAssetAnalysisProfile = hasPreview ? 'preview_fast' : 'raw_deep';
    if (analysisJob && isActiveProcessingJob(analysisJob)) {
      const status = resolveProcessingJobStatus(analysisJob.status);
      const stageLabel = resolveProcessingJobStageLabel(analysisJob);
      return {
        kind: 'analysis',
        label: analysisJob.status === 'running' ? 'AI 分析中' : 'AI 已排队',
        buttonLabel: status.label,
        helper: stageLabel || status.helper,
        enabled: false,
        onClick: () => undefined,
      };
    }
    if (analysisJob && isFailedProcessingJob(analysisJob)) {
      const errorInfo = resolveProcessingJobErrorInfo(analysisJob);
      return {
        kind: 'analysis',
        label: '重试 AI 分析',
        helper: isLongFormForAi
          ? CONTENT_ASSET_LONG_VIDEO_AI_HELPER
          : errorInfo
            ? `${errorInfo.label}：${errorInfo.helper}`
            : '上次失败，确认视频可读后重试。',
        enabled: canWrite && canUseVideo && !isLongFormForAi,
        onClick: () => onCreateAnalysisJob(source, true, profile),
      };
    }
    if (analysisJob?.status === 'succeeded') {
      return {
        kind: 'analysis',
        label: 'AI 已完成',
        helper: '已完成；未显示请刷新。',
        enabled: false,
        onClick: () => undefined,
      };
    }
    return {
      kind: 'analysis',
      label: hasAiSummary ? '补全 AI 分析' : '开始 AI 分析',
      helper: canUseVideo
        ? isLongFormForAi
          ? CONTENT_ASSET_LONG_VIDEO_AI_HELPER
          : hasAiSummary
            ? '已有摘要或评分，继续补完整分析。'
            : '生成摘要、钩子、卖点与复剪建议。'
        : '补齐可分析视频后再开始。',
      enabled: canWrite && canUseVideo && !isLongFormForAi,
      onClick: () => onCreateAnalysisJob(source, hasAiSummary, profile),
    };
  }
  return null;
}

function isActiveProcessingJob(job: ContentAssetProcessingJob | null): boolean {
  return Boolean(job && isActiveProcessingJobStatus(job.status));
}

function isFailedProcessingJob(job: ContentAssetProcessingJob | null): boolean {
  return job?.status === 'failed';
}
