import type { ContentAssetUnmatchedStatsMatchTypeFilter } from '../_lib/content-assets-types';
import type {
  AiProcessingJobTypeFilter,
  ProcessingJobStatusFilter,
  ProcessingJobTypeFilter,
} from './content-assets-workspace-types';

export const PROCESSING_JOB_STATUS_FILTER_OPTIONS: { label: string; value: ProcessingJobStatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '排队', value: 'queued' },
  { label: '运行', value: 'running' },
  { label: '失败', value: 'failed' },
  { label: '完成', value: 'succeeded' },
  { label: '取消', value: 'cancelled' },
];

export const PROCESSING_JOB_TYPE_FILTER_OPTIONS: { label: string; value: ProcessingJobTypeFilter }[] = [
  { label: '全部类型', value: 'all' },
  { label: '预览视频', value: 'preview' },
  { label: '封面图', value: 'cover' },
  { label: 'AI分析', value: 'analysis' },
  { label: '抽帧', value: 'frames' },
  { label: '转写', value: 'transcript' },
];

export const AI_PROCESSING_JOB_TYPE_OPTIONS: { label: string; value: AiProcessingJobTypeFilter }[] = [
  { label: 'AI分析', value: 'analysis' },
  { label: '脚本/SRT', value: 'transcript' },
];

export const UNMATCHED_STATS_TYPE_OPTIONS: { label: string; value: ContentAssetUnmatchedStatsMatchTypeFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '广告素材', value: 'ad_material' },
  { label: '平台内容', value: 'platform_video' },
];
