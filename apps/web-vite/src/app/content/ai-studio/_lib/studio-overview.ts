import type { BadgeStatus } from '@/components/atoms/badge';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { StudioOverviewActivity, StudioOverviewPeriodKey, StudioOverviewResponse } from './ai-studio-api';
import { buildRemixBatchPath } from './remix-routes';
import { remixBatchStatusView } from './remix-api';
import { suggestionJobStatusView } from './segment-suggestion-api';

export const OVERVIEW_PERIODS: readonly { value: StudioOverviewPeriodKey; label: string }[] = [
  { value: 'last7', label: '近 7 天' },
  { value: 'last30', label: '近 30 天' },
  { value: 'month', label: '本月' },
];

/** `企业:百雀羚` → `企业：百雀羚` for display. */
export function enterpriseLabel(tag: string): string {
  return tag.replace(/^企业:/, '企业：');
}

/** Estimates keep two decimals; a non-zero amount below one fen is not shown as ¥0.00. */
export function formatCny(value: number): string {
  if (value > 0 && value < 0.01) return '< ¥0.01';
  return `¥${value.toFixed(2)}`;
}

/** Token counts in 万 above ten thousand, plain integers below. */
export function formatTokens(value: number): string {
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)} 万`;
  return value.toLocaleString('zh-CN');
}

export function formatMinutes(seconds: number): string {
  return `${(seconds / 60).toFixed(1)} 分钟`;
}

export interface OverviewFlowStep {
  label: string;
  helper: string;
  to: string;
  status: { label: string; tone: BadgeStatus } | null;
}

export function overviewPeriodLabel(period: StudioOverviewPeriodKey): string {
  return OVERVIEW_PERIODS.find((option) => option.value === period)?.label ?? '本期';
}

/**
 * Production chain with live counts; `overview` is absent while loading or when the studio is disabled.
 * Period-scoped counts name the period (「近 30 天失败 2 个」) so they read correctly away from the selector.
 */
export function buildOverviewFlow(overview: StudioOverviewResponse | undefined, periodLabel = '本期'): OverviewFlowStep[] {
  const p = overview?.pipeline;
  return [
    {
      label: '原片',
      helper: '直接使用素材库里的原片，不复制媒体或授权信息。',
      to: ROUTE_PATHS.contentAiStudioAssets,
      status: p ? { label: `${p.readyAssets} 条可用`, tone: 'info' } : null,
    },
    {
      label: 'AI 分析',
      helper: '多模态模型按结构框架给原片切段并打框架标签，结果进入待确认。',
      to: ROUTE_PATHS.contentAiStudioAnalysis,
      status: !p
        ? null
        : p.analysisActive > 0
          ? { label: `${p.analysisActive} 个进行中`, tone: 'info' }
          : p.analysisFailed > 0
            ? { label: `${periodLabel}失败 ${p.analysisFailed} 个`, tone: 'warning' }
            : { label: `${periodLabel}完成 ${p.analysisSucceeded} 个`, tone: 'success' },
    },
    {
      label: '人工确认与片段素材',
      helper: `确认后的片段才进入可混剪的片段池${p ? `，当前已确认 ${p.segmentsConfirmed} 段` : ''}。`,
      // Pending work opens the library filtered to it; otherwise the confirmed library.
      to: p && p.segmentsSuggested > 0 ? `${ROUTE_PATHS.contentAiStudioSegments}?status=suggested` : ROUTE_PATHS.contentAiStudioSegments,
      status: !p
        ? null
        : p.segmentsSuggested > 0
          ? { label: `待确认 ${p.segmentsSuggested} 段`, tone: 'warning' }
          : { label: '无待确认', tone: 'success' },
    },
    {
      label: 'AI 剪辑',
      helper: '按框架结构从已确认片段批量混剪出片，在云端合成。',
      to: ROUTE_PATHS.contentAiStudioEditing,
      status: !p
        ? null
        : p.remixBatchesRunning > 0
          ? { label: `${p.remixBatchesRunning} 批出片中`, tone: 'info' }
          : p.remixBatchesFailed > 0
            ? { label: `${periodLabel}失败 ${p.remixBatchesFailed} 批`, tone: 'warning' }
            : { label: '无进行中', tone: 'neutral' },
    },
    {
      label: '成片',
      helper: '批次与单条成片、回写素材库和来源追溯。',
      to: ROUTE_PATHS.contentAiStudioOutputs,
      status: p ? { label: `${periodLabel} ${p.outputs} 条`, tone: p.outputs > 0 ? 'success' : 'neutral' } : null,
    },
  ];
}

const ANALYSIS_ERROR_LABELS: Record<string, string> = {
  provider_error: '模型调用失败',
  invalid_response: '模型输出无效',
  source_unavailable: '原片不可读',
  lease_expired: '任务中断超时',
  invalid_request: '请求无效',
  unavailable: '服务不可用',
  internal_error: '内部错误',
};

export interface OverviewActivityView {
  kindLabel: string;
  title: string;
  detail: string | null;
  status: { label: string; tone: BadgeStatus };
  to: string;
}

export function overviewActivityView(activity: StudioOverviewActivity): OverviewActivityView {
  if (activity.kind === 'remix' || activity.kind === 'edit') {
    return {
      kindLabel: activity.kind === 'edit' ? '单条剪辑' : '框架混剪',
      title: activity.title,
      detail: activity.detail ?? null,
      status: remixBatchStatusView(activity.status),
      to: buildRemixBatchPath(activity.id),
    };
  }
  const code = activity.detail ?? null;
  return {
    kindLabel: 'AI 分析',
    title: activity.title,
    detail: code ? (ANALYSIS_ERROR_LABELS[code] ?? code) : null,
    status: suggestionJobStatusView(activity.status),
    to: ROUTE_PATHS.contentAiStudioAnalysis,
  };
}
