import { getChartColor } from '@/styles/echarts-theme';

export const WATERFALL_TOTAL_COLOR = getChartColor(0);

export const DOUYIN_CHANNEL_COLORS = {
  video: getChartColor(0),
  live: getChartColor(1),
  productCard: getChartColor(2),
} as const;

export function getCategoryWaterfallColor(index: number): string {
  return getChartColor(index);
}

export function getFunnelStageColor(index: number): string {
  return getChartColor(index);
}
