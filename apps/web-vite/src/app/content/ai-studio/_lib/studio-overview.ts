import type { AiTaskView } from '@/components/molecules/ai-task-status';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { StudioOverviewActivity, StudioOverviewPeriod, StudioOverviewResponse } from './ai-studio-api';
import { buildRemixBatchPath } from './remix-routes';
import { remixBatchStatusView, remixModeLabel } from './remix-api';
import { suggestionJobStatusView } from './segment-suggestion-api';

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

/**
 * `ai`: AI is working at this step (violet dot); `attention`: something waits on a person (amber
 * dot); `failed`: work failed in the period (danger dot).
 */
export type OverviewFlowSignal = 'ai' | 'attention' | 'failed' | null;

export interface OverviewFlowStep {
  label: string;
  to: string;
  /** The step's headline number with what it counts; null while loading. */
  metric: { value: number; caption: string; signal: OverviewFlowSignal } | null;
}

/** Default for the AI 切段 estimate until enough priced calls exist: 9 production calls on 2026-09-30 averaged ¥0.05. */
export const DEFAULT_ANALYSIS_CNY_PER_CALL = 0.05;
const MIN_PRICED_CALLS_FOR_AVERAGE = 3;

/**
 * Average model spend per AI 切段 call over the overview period, from recorded usage at list price.
 * `measured` is false when there are too few priced calls and the default stands in.
 */
export function analysisCostPerCall(overview: StudioOverviewResponse | undefined): { cny: number; measured: boolean } {
  const model = overview?.costs.modelAnalysis;
  const priced = model ? model.calls - model.unpricedCalls : 0;
  if (!model || priced < MIN_PRICED_CALLS_FOR_AVERAGE) return { cny: DEFAULT_ANALYSIS_CNY_PER_CALL, measured: false };
  return { cny: model.estimatedCny / priced, measured: true };
}

/** Names the period inside step captions: 「10 月 26 日分析」「10 月出片」「2026 年失败批次」. */
export function overviewPeriodLabel(period: StudioOverviewPeriod | undefined): string {
  if (!period) return '本期';
  const [year, month, day] = period.from.split('-').map(Number);
  const yearPrefix = period.from.slice(0, 4) === period.today.slice(0, 4) ? '' : `${year} 年 `;
  switch (period.key) {
    case 'day':
      return `${yearPrefix}${month} 月 ${day} 日`;
    case 'month':
      return `${yearPrefix}${month} 月`;
    case 'year':
      return `${year} 年`;
    case 'last7':
      return '近 7 天';
    case 'last30':
      return '近 30 天';
    default:
      return '所选时段';
  }
}

/**
 * Production chain with live counts; `overview` is absent while loading or when the studio is disabled.
 * Each step shows the one number that matters now: work in progress, then failures or pending
 * review, then the settled count. Period-scoped captions name the period; AI 切段 counts every run
 * and names failures inside it (「6 · 近 30 天分析 · 1 次失败」), so the big number is never read
 * as the failure count.
 */
export function buildOverviewFlow(overview: StudioOverviewResponse | undefined, periodLabel = '本期'): OverviewFlowStep[] {
  const p = overview?.pipeline;
  return [
    {
      label: '原片',
      to: ROUTE_PATHS.contentAiStudioAssets,
      metric: p ? { value: p.readyAssets, caption: '条可用', signal: null } : null,
    },
    {
      label: 'AI 切段',
      to: ROUTE_PATHS.contentAiStudioAnalysis,
      metric: !p
        ? null
        : p.analysisActive > 0
          ? { value: p.analysisActive, caption: '个进行中', signal: 'ai' }
          : {
              value: p.analysisSucceeded + p.analysisFailed,
              caption: p.analysisFailed > 0 ? `${periodLabel}分析 · ${p.analysisFailed} 次失败` : `${periodLabel}分析`,
              signal: p.analysisFailed > 0 ? 'failed' : null,
            },
    },
    {
      label: '确认片段',
      // Pending work spans framework and selling-point presets, so it opens AI 切段,
      // whose jobs link to their own preset's review; otherwise the confirmed library.
      to: p && p.segmentsSuggested > 0 ? ROUTE_PATHS.contentAiStudioAnalysis : ROUTE_PATHS.contentAiStudioSegments,
      metric: !p
        ? null
        : p.segmentsSuggested > 0
          ? { value: p.segmentsSuggested, caption: '段待确认', signal: 'attention' }
          : { value: p.segmentsConfirmed, caption: '段已确认', signal: null },
    },
    {
      label: 'AI 合成',
      to: ROUTE_PATHS.contentAiStudioEditing,
      metric: !p
        ? null
        : p.remixBatchesRunning > 0
          ? { value: p.remixBatchesRunning, caption: '批出片中', signal: 'ai' }
          : p.remixBatchesFailed > 0
            ? { value: p.remixBatchesFailed, caption: `${periodLabel}失败批次`, signal: 'failed' }
            : { value: 0, caption: '批进行中', signal: null },
    },
    {
      label: '成片',
      to: ROUTE_PATHS.contentAiStudioOutputs,
      metric: p ? { value: p.outputs, caption: `${periodLabel}出片`, signal: null } : null,
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
  framework_required: '缺少已确认框架段',
  voiceover_required: '缺少混剪口播段',
};

export interface OverviewActivityView {
  kindLabel: string;
  title: string;
  detail: string | null;
  status: AiTaskView;
  to: string;
}

export function overviewActivityView(activity: StudioOverviewActivity): OverviewActivityView {
  if (activity.kind === 'remix' || activity.kind === 'edit' || activity.kind === 'sellingPoint') {
    return {
      kindLabel: remixModeLabel(activity.kind),
      title: activity.title,
      detail: activity.detail ?? null,
      status: remixBatchStatusView(activity.status),
      to: buildRemixBatchPath(activity.id),
    };
  }
  const code = activity.detail ?? null;
  return {
    kindLabel: 'AI 切段',
    title: activity.title,
    detail: code ? (ANALYSIS_ERROR_LABELS[code] ?? code) : null,
    status: suggestionJobStatusView(activity.status),
    to: ROUTE_PATHS.contentAiStudioAnalysis,
  };
}
