import type { AiTaskView } from '@/components/molecules/ai-task-status';
import { apiClient } from '@/lib/api-client';
import {
  AIOS_API_PATHS,
  type StudioCompetitorAnalysis,
  type StudioCompetitorAnalysisSummary,
  type StudioCompetitorVideo,
  type StudioCompetitorVideoListResponse,
  type StudioCreateCompetitorVideoRequest,
  type StudioUpdateCompetitorVideoRequest,
} from '@/lib/generated-api-contract';
import type { PeriodQuery } from './studio-period';
import { aiStudioQueryKeys } from './ai-studio-api';

export type { StudioCompetitorAnalysis, StudioCompetitorAnalysisSummary, StudioCompetitorVideo };

/** Requesting an analysis downloads the original and queues a billable model call; never replayed. */
const NO_RETRY = { retryAttempts: 0 } as const;

export const competitorQueryKeys = {
  videos: () => [...aiStudioQueryKeys.root, 'competitor', 'videos'] as const,
  analysis: (analysisId: string) => [...aiStudioQueryKeys.root, 'competitor', 'analysis', analysisId] as const,
};

export type CompetitorSource = 'all' | 'compass' | 'manual';
export type CompetitorVideoFilters = PeriodQuery & { source: CompetitorSource; page: number; pageSize: number };

export async function fetchCompetitorVideos(filters: CompetitorVideoFilters, options?: { signal?: AbortSignal }) {
  return (
    await apiClient.get<StudioCompetitorVideoListResponse>(AIOS_API_PATHS.contentStudioCompetitorVideos, {
      params: { ...filters },
      signal: options?.signal,
    })
  ).data;
}

export async function createCompetitorVideo(request: StudioCreateCompetitorVideoRequest) {
  return (
    await apiClient.post<StudioCompetitorVideo>(AIOS_API_PATHS.contentStudioCompetitorVideos, request, NO_RETRY)
  ).data;
}

export async function requestCompetitorAnalysis(awemeId: string) {
  return (
    await apiClient.post<StudioCompetitorAnalysis>(
      AIOS_API_PATHS.contentStudioCompetitorVideoAnalyses(awemeId),
      {},
      NO_RETRY,
    )
  ).data;
}

export async function fetchCompetitorAnalysis(analysisId: string, options?: { signal?: AbortSignal }) {
  return (
    await apiClient.get<StudioCompetitorAnalysis>(AIOS_API_PATHS.contentStudioCompetitorAnalysis(analysisId), {
      signal: options?.signal,
    })
  ).data;
}

/**
 * Card A (phase-0 average ¥0.04) plus the framework / selling-point structure (¥0.03–0.04 in the
 * 2026-10-26 trial) at list price, ~2.5 min films; the row shows the real cost.
 */
export const ESTIMATED_CNY_PER_VIDEO = 0.08;

export function competitorVideoTitle(video: Pick<StudioCompetitorVideo, 'title' | 'awemeId'>): string {
  return video.title?.trim() || `抖音作品 ${video.awemeId}`;
}

export function isAnalysisActive(analysis: Pick<StudioCompetitorAnalysisSummary, 'status'> | null | undefined): boolean {
  return analysis?.status === 'queued' || analysis?.status === 'running';
}

/** A card exists (possibly with parts removed by host validation). */
export function hasAnalysisCard(analysis: Pick<StudioCompetitorAnalysisSummary, 'status'> | null | undefined): boolean {
  return analysis?.status === 'succeeded' || analysis?.status === 'partial';
}

const STATUS_VIEWS: Record<string, AiTaskView> = {
  queued: { label: '排队中', state: 'queued' },
  running: { label: '分析中', state: 'thinking' },
  succeeded: { label: '已完成', state: 'done' },
  partial: { label: '部分完成', state: 'done' },
  failed: { label: '失败', state: 'failed' },
  cancelled: { label: '已取消', state: 'cancelled' },
};

export function analysisStatusView(status: string): AiTaskView {
  return STATUS_VIEWS[status] ?? { label: status, state: 'queued' };
}

const FAILURE_TEXT: Record<string, string> = {
  provider_error: '模型没有返回结果，可重新分析（这次调用可能已计费）',
  lease_expired: '分析被中断，可重新分析（这次调用可能已计费）',
  invalid_response: '模型返回的卡片无法解析，可重新分析',
  source_changed: '暂存原片校验不一致，请重新分析',
  duplicate_input: '同样的原片已有拆解结果（可能是重复发布的视频）',
  download_failed: '抖音原片下载失败，可能是作品受限、已删除或抖音风控，可稍后重新分析',
  download_timeout: '抖音原片下载超时，可稍后重新分析',
  video_removed: '抖音作品已不存在（删除、私密或下架），无法分析',
  staging_lost: '原片暂存中断，请重新分析',
};

/** Plain-language failure; the raw message stays available as detail. */
export function analysisFailureText(
  analysis: Pick<StudioCompetitorAnalysis, 'errorCode' | 'errorMessage'>,
): { text: string; detail: string | null } {
  const mapped = analysis.errorCode ? FAILURE_TEXT[analysis.errorCode] : undefined;
  if (mapped) return { text: mapped, detail: analysis.errorMessage || null };
  return { text: analysis.errorMessage || '分析未完成', detail: null };
}

/** `competitor-card-a-v9` → `v9`. */
export function promptVersionLabel(promptVersion: string | null | undefined): string | null {
  if (!promptVersion) return null;
  const match = /-(v\d+)$/.exec(promptVersion.trim());
  return match ? match[1] : promptVersion.trim();
}

/** Douyin's official embed player; only numeric aweme ids are accepted. */
export function douyinEmbedUrl(awemeId: string): string | null {
  return /^\d{6,25}$/.test(awemeId) ? `https://open.douyin.com/player/video?vid=${awemeId}&autoplay=0` : null;
}

export async function fetchCompetitorVideo(awemeId: string, signal?: AbortSignal) {
  return (await apiClient.get<StudioCompetitorVideo>(AIOS_API_PATHS.contentStudioCompetitorVideo(awemeId), { signal })).data;
}

export async function updateCompetitorVideo(awemeId: string, request: StudioUpdateCompetitorVideoRequest) {
  return (await apiClient.patch<StudioCompetitorVideo>(AIOS_API_PATHS.contentStudioCompetitorVideo(awemeId), request, NO_RETRY)).data;
}

export function isAnalysisComplete(analysis: StudioCompetitorAnalysisSummary | null | undefined): boolean {
  return analysis?.complete === true;
}

export function collectionNotice(video: StudioCompetitorVideo): string {
  const title = `「${competitorVideoTitle(video)}」`;
  const prefix = video.addOutcome === 'created' ? `已添加${title}。` : `${title}已存在，已保留原有资料。`;
  const analysis = video.latestAnalysis;
  const status = isAnalysisActive(analysis) ? '正在分析，已复用当前任务。'
    : isAnalysisComplete(analysis) ? '已有完整分析，可直接查看。'
      : analysis ? '已有分析记录，可查看结果或手动重试。' : '尚未分析，可从列表发起分析。';
  return `${prefix}${status}`;
}
