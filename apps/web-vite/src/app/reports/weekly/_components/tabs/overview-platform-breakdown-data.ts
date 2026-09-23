import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import { CHART_SERIES_COLORS } from '@/lib/domain-taxonomy-colors';
import {
  PLATFORM_LEGEND_COLORS,
  resolvePlatformLegendKey,
  type PlatformLegendColorKey,
} from '@/lib/platform-colors';
import { formatPeriodDeltaSummary } from './platform-tab-period-delta-summary';

export interface OverviewPlatformBreakdownItem {
  name: string;
  value: number;
  prevValue: number;
  delta: number;
  deltaContribution: number;
  color: string;
}

export interface OverviewPlatformDonutItem {
  name: string;
  value: number;
  prevValue: number;
  color: string;
}

export interface OverviewPlatformWaterfallStep {
  name: string;
  delta: number;
  current: number;
  prev: number;
  share: number;
  color: string;
}

export interface OverviewPlatformBreakdownViewModel {
  breakdown: OverviewPlatformBreakdownItem[];
  donutData: OverviewPlatformDonutItem[];
  waterfallSteps: OverviewPlatformWaterfallStep[];
  totalPlatformGmv: number;
  totalPrevPlatformGmv: number;
  totalPlatformDelta: number;
  summaryText: string;
}

interface PlatformBreakdownConfigItem {
  label: string;
  key: Exclude<PlatformLegendColorKey, 'unknown'>;
}

const PLATFORM_BREAKDOWN_CONFIG: PlatformBreakdownConfigItem[] = [
  { label: '天猫', key: 'tmall' },
  { label: '抖音', key: 'douyin' },
  { label: '小红书', key: 'xiaohongshu' },
  { label: '微信', key: 'wechat' },
  { label: '京东', key: 'jd' },
];

export const OVERVIEW_PLATFORM_TOTAL_BAR_COLOR = CHART_SERIES_COLORS.series1;

type PlatformBreakdownRow = WeeklyReportResponse['charts']['platforms'][number];

interface NormalizedPlatformBreakdownRow {
  legendKey: PlatformLegendColorKey | undefined;
  gmvValue: number;
  prevGmvValue: number;
}

function toFiniteNumber(value: unknown): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizePlatformBreakdownRows(
  platforms: PlatformBreakdownRow[]
): NormalizedPlatformBreakdownRow[] {
  return platforms.map((item) => ({
    legendKey: resolvePlatformLegendKey(item.platform),
    gmvValue: toFiniteNumber(item.gmv),
    prevGmvValue: toFiniteNumber(item.prev_gmv),
  }));
}

export function buildOverviewPlatformBreakdown(
  charts: WeeklyReportResponse['charts']
): OverviewPlatformBreakdownItem[] {
  const platforms = Array.isArray(charts?.platforms) ? charts.platforms : [];
  const normalizedPlatforms = normalizePlatformBreakdownRows(platforms);

  const breakdown = PLATFORM_BREAKDOWN_CONFIG.map((config) => {
    const matched = normalizedPlatforms.find((row) => row.legendKey === config.key);

    return {
      name: config.label,
      value: matched?.gmvValue ?? 0,
      prevValue: matched?.prevGmvValue ?? 0,
      delta: 0,
      deltaContribution: 0,
      color: PLATFORM_LEGEND_COLORS[config.key],
    };
  });

  const totalDelta = breakdown.reduce((sum, item) => sum + (item.value - item.prevValue), 0);
  return breakdown.map((item) => ({
    ...item,
    delta: item.value - item.prevValue,
    deltaContribution:
      totalDelta !== 0 ? ((item.value - item.prevValue) / totalDelta) * 100 : 0,
  }));
}

export function buildOverviewPlatformBreakdownViewModel(
  charts: WeeklyReportResponse['charts']
): OverviewPlatformBreakdownViewModel {
  const breakdown = buildOverviewPlatformBreakdown(charts);
  const totalPlatformGmv = breakdown.reduce((sum, item) => sum + item.value, 0);
  const totalPrevPlatformGmv = breakdown.reduce(
    (sum, item) => sum + item.prevValue,
    0
  );
  const totalPlatformDelta = totalPlatformGmv - totalPrevPlatformGmv;

  return {
    breakdown,
    donutData: breakdown.map((item) => ({
      name: item.name,
      value: item.value,
      prevValue: item.prevValue,
      color: item.color,
    })),
    waterfallSteps: breakdown.map((item) => ({
      name: item.name,
      delta: item.delta,
      current: item.value,
      prev: item.prevValue,
      share: item.deltaContribution,
      color: item.color,
    })),
    totalPlatformGmv,
    totalPrevPlatformGmv,
    totalPlatformDelta,
    summaryText: formatPeriodDeltaSummary({
      previousValue: totalPrevPlatformGmv,
      currentValue: totalPlatformGmv,
      deltaValue: totalPlatformDelta,
    }),
  };
}
