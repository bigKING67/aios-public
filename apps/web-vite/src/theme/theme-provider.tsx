'use client';

import { useMemo, type ReactNode } from 'react';
import {
  DEFAULT_THEME_COLORS,
  ThemeContext,
  type ThemeColors,
} from './theme-context';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const colors = useMemo<ThemeColors>(() => {
    if (typeof window === 'undefined') return DEFAULT_THEME_COLORS;
    const rootStyle = getComputedStyle(document.documentElement);
    const getVar = (name: string, fallback: string) => rootStyle.getPropertyValue(name).trim() || fallback;

    return {
      ...DEFAULT_THEME_COLORS,
      primary: getVar('--brand-primary', DEFAULT_THEME_COLORS.primary),
      success: getVar('--status-success', DEFAULT_THEME_COLORS.success),
      warning: getVar('--status-warning', DEFAULT_THEME_COLORS.warning),
      error: getVar('--status-danger', DEFAULT_THEME_COLORS.error),
      statusSuccess: getVar('--status-success', DEFAULT_THEME_COLORS.statusSuccess),
      statusWarning: getVar('--status-warning', DEFAULT_THEME_COLORS.statusWarning),
      statusDanger: getVar('--status-danger', DEFAULT_THEME_COLORS.statusDanger),
      statusInfo: getVar('--status-info', DEFAULT_THEME_COLORS.statusInfo),
      statusNeutral: getVar('--status-neutral', DEFAULT_THEME_COLORS.statusNeutral),
      trendUp: getVar('--trend-up', DEFAULT_THEME_COLORS.trendUp),
      trendDown: getVar('--trend-down', DEFAULT_THEME_COLORS.trendDown),
      trendNeutral: getVar('--trend-neutral', DEFAULT_THEME_COLORS.trendNeutral),
      platformTmall: getVar('--platform-tmall', DEFAULT_THEME_COLORS.platformTmall),
      platformDouyin: getVar('--platform-douyin', DEFAULT_THEME_COLORS.platformDouyin),
      platformXiaohongshu: getVar('--platform-xiaohongshu', DEFAULT_THEME_COLORS.platformXiaohongshu),
      platformKuaishou: getVar('--platform-kuaishou', DEFAULT_THEME_COLORS.platformKuaishou),
      platformJd: getVar('--platform-jd', DEFAULT_THEME_COLORS.platformJd),
      platformWechat: getVar('--platform-wechat', DEFAULT_THEME_COLORS.platformWechat),
      platformUnknown: getVar('--platform-unknown', DEFAULT_THEME_COLORS.platformUnknown),
      borderColor: getVar('--border-color', DEFAULT_THEME_COLORS.borderColor),
      textPrimary: getVar('--text-primary', DEFAULT_THEME_COLORS.textPrimary),
      textTertiary: getVar('--text-tertiary', DEFAULT_THEME_COLORS.textTertiary),
      dividerColor: getVar('--divider-color', DEFAULT_THEME_COLORS.dividerColor),
      bgCard: getVar('--bg-card', DEFAULT_THEME_COLORS.bgCard),
      chartLabelColor: getVar('--chart-label-color', DEFAULT_THEME_COLORS.chartLabelColor),
      echartsColors: [
        getVar('--chart-series-1', DEFAULT_THEME_COLORS.echartsColors[0]),
        getVar('--chart-series-2', DEFAULT_THEME_COLORS.echartsColors[1]),
        getVar('--chart-series-3', DEFAULT_THEME_COLORS.echartsColors[2]),
        getVar('--chart-series-4', DEFAULT_THEME_COLORS.echartsColors[3]),
        getVar('--chart-series-5', DEFAULT_THEME_COLORS.echartsColors[4]),
        getVar('--chart-series-6', DEFAULT_THEME_COLORS.echartsColors[5]),
      ],
    };
  }, []);

  return <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>;
}
