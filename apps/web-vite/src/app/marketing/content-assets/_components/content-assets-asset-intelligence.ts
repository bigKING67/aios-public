import type { ContentAssetItem, ContentAssetProcessingJob } from '../_lib/content-assets-types';
import {
  isActiveProcessingJobStatus,
  processingJobTimestamp,
} from '../_lib/content-assets-processing-jobs';

export type IntelligencePillState = 'ready' | 'active' | 'failed' | 'muted';

export function resolveIntelligencePills(asset: ContentAssetItem, processingJobs: ContentAssetProcessingJob[]) {
  const analysisJob = findLatestProcessingJobForAsset(processingJobs, asset.assetId, 'analysis');
  const transcriptJob = findLatestProcessingJobForAsset(processingJobs, asset.assetId, 'transcript');
  return [
    resolveJobBackedPill({
      activePrefix: 'AI',
      emptyLabel: '待AI',
      failedLabel: 'AI失败',
      job: analysisJob,
      ready: Boolean(asset.aiAnalyzedAt),
      readyLabel: 'AI已分析',
    }),
    resolveJobBackedPill({
      activePrefix: '脚本',
      emptyLabel: '脚本未生成',
      failedLabel: '脚本失败',
      job: transcriptJob,
      ready: Boolean(asset.transcribedAt || asset.scriptExcerpt),
      readyLabel: '脚本已生成',
    }),
  ];
}

function resolveJobBackedPill({
  activePrefix,
  emptyLabel,
  failedLabel,
  job,
  ready,
  readyLabel,
}: {
  activePrefix: string;
  emptyLabel: string;
  failedLabel: string;
  job: ContentAssetProcessingJob | null;
  ready: boolean;
  readyLabel: string;
}): { label: string; state: IntelligencePillState } {
  if (job && isActiveProcessingJobStatus(job.status)) {
    return {
      label: job.status === 'running' ? `${activePrefix}运行中` : `${activePrefix}排队中`,
      state: 'active',
    };
  }
  if (ready) {
    return {
      label: readyLabel,
      state: 'ready',
    };
  }
  if (job?.status === 'failed') {
    return {
      label: failedLabel,
      state: 'failed',
    };
  }
  return {
    label: emptyLabel,
    state: 'muted',
  };
}

function findLatestProcessingJobForAsset(
  jobs: ContentAssetProcessingJob[],
  assetId: string,
  jobType: 'analysis' | 'transcript'
): ContentAssetProcessingJob | null {
  let latest: ContentAssetProcessingJob | null = null;
  let latestTime = -1;
  for (const job of jobs) {
    if (job.assetId !== assetId || job.jobType !== jobType) continue;
    const timestamp = processingJobTimestamp(job);
    if (timestamp > latestTime) {
      latest = job;
      latestTime = timestamp;
    }
  }
  return latest;
}
