import { resolveWeeklyTrendClassName } from './weekly-primitives';
export {
  DOUYIN_CHANNEL_COLORS,
  WATERFALL_TOTAL_COLOR,
  getCategoryWaterfallColor,
  getFunnelStageColor,
} from './platform-tab-chart-visuals';

export function getTrendClassName(value: number | undefined): string {
  return resolveWeeklyTrendClassName(value);
}
