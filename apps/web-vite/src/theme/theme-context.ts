import { createContext } from 'react';
import { DESIGN_COLOR_VALUES } from '@/lib/design-token-values';

export interface ThemeColors {
  primary: string;
  success: string;
  warning: string;
  error: string;
  statusSuccess: string;
  statusWarning: string;
  statusDanger: string;
  statusInfo: string;
  statusNeutral: string;
  trendUp: string;
  trendDown: string;
  trendNeutral: string;
  platformTmall: string;
  platformDouyin: string;
  platformXiaohongshu: string;
  platformKuaishou: string;
  platformJd: string;
  platformWechat: string;
  platformUnknown: string;
  borderColor: string;
  textPrimary: string;
  textTertiary: string;
  dividerColor: string;
  bgCard: string;
  chartLabelColor: string;
  echartsColors: string[];
}

export const DEFAULT_THEME_COLORS: ThemeColors = {
  primary: DESIGN_COLOR_VALUES.primary,
  success: DESIGN_COLOR_VALUES.statusSuccess,
  warning: DESIGN_COLOR_VALUES.statusWarning,
  error: DESIGN_COLOR_VALUES.statusDanger,
  statusSuccess: DESIGN_COLOR_VALUES.statusSuccess,
  statusWarning: DESIGN_COLOR_VALUES.statusWarning,
  statusDanger: DESIGN_COLOR_VALUES.statusDanger,
  statusInfo: DESIGN_COLOR_VALUES.statusInfo,
  statusNeutral: DESIGN_COLOR_VALUES.statusNeutral,
  trendUp: DESIGN_COLOR_VALUES.trendUp,
  trendDown: DESIGN_COLOR_VALUES.trendDown,
  trendNeutral: DESIGN_COLOR_VALUES.trendNeutral,
  platformTmall: DESIGN_COLOR_VALUES.platformTmall,
  platformDouyin: DESIGN_COLOR_VALUES.platformDouyin,
  platformXiaohongshu: DESIGN_COLOR_VALUES.platformXiaohongshu,
  platformKuaishou: DESIGN_COLOR_VALUES.platformKuaishou,
  platformJd: DESIGN_COLOR_VALUES.platformJd,
  platformWechat: DESIGN_COLOR_VALUES.platformWechat,
  platformUnknown: DESIGN_COLOR_VALUES.platformUnknown,
  borderColor: DESIGN_COLOR_VALUES.border,
  textPrimary: DESIGN_COLOR_VALUES.textPrimary,
  textTertiary: DESIGN_COLOR_VALUES.textTertiary,
  dividerColor: DESIGN_COLOR_VALUES.divider,
  bgCard: DESIGN_COLOR_VALUES.backgroundPrimary,
  chartLabelColor: DESIGN_COLOR_VALUES.textSecondary,
  echartsColors: [...DESIGN_COLOR_VALUES.chartSeries],
};

export const ThemeContext = createContext<ThemeColors>(DEFAULT_THEME_COLORS);
