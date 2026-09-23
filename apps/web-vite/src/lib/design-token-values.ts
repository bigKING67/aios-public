import { CHART_SERIES_COLORS } from './domain-taxonomy-colors';
import {
  DESIGN_TOKEN_RUNTIME_COLOR_VALUES,
  DESIGN_TOKEN_RUNTIME_FONT_FAMILY,
  DESIGN_TOKEN_RUNTIME_SHADOW_VALUES,
} from './design-tokens';
import { PLATFORM_LEGEND_COLORS } from './platform-colors';

// Compact runtime mirror; verify:design:token-values-sync owns canonical parity.
export const DESIGN_COLOR_VALUES = {
  ...DESIGN_TOKEN_RUNTIME_COLOR_VALUES,

  platformTmall: PLATFORM_LEGEND_COLORS.tmall,
  platformDouyin: PLATFORM_LEGEND_COLORS.douyin,
  platformXiaohongshu: PLATFORM_LEGEND_COLORS.xiaohongshu,
  platformKuaishou: PLATFORM_LEGEND_COLORS.kuaishou,
  platformJd: PLATFORM_LEGEND_COLORS.jd,
  platformWechat: PLATFORM_LEGEND_COLORS.wechat,
  platformUnknown: PLATFORM_LEGEND_COLORS.unknown,

  chartSeries: [
    CHART_SERIES_COLORS.series1,
    CHART_SERIES_COLORS.series2,
    CHART_SERIES_COLORS.series3,
    CHART_SERIES_COLORS.series4,
    CHART_SERIES_COLORS.series5,
    CHART_SERIES_COLORS.series6,
  ],
} as const;

export const DESIGN_FONT_FAMILY = DESIGN_TOKEN_RUNTIME_FONT_FAMILY;
export const DESIGN_SHADOW_VALUES = DESIGN_TOKEN_RUNTIME_SHADOW_VALUES;
