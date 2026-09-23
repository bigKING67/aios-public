import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import {
  resolvePlatformAliases,
  resolvePlatformLabel,
  resolvePlatformSummaryWeekPeriod,
} from './platform-tab-formatters';
import type { PlatformTrendItem } from './platform-tab-metrics';

type PlatformData = WeeklyReportResponse['charts']['platforms'][number];

export interface PlatformTabContext {
  platformData: PlatformData | undefined;
  platformLabel: string;
  platformAliases: string[];
  summaryWeekPeriod: string | undefined;
  trend7d: PlatformTrendItem[];
  isTmallPlatform: boolean;
  isDouyinPlatform: boolean;
  useDashForTrafficQualityMetrics: boolean;
}

export function resolvePlatformTabContext(
  report: WeeklyReportResponse,
  platform: string
): PlatformTabContext {
  const platforms = Array.isArray(report.charts?.platforms) ? report.charts.platforms : [];
  const trend7d = Array.isArray(report.charts?.trend_7d) ? report.charts.trend_7d : [];
  const platformData = platforms.find((item) => item.platform === platform);
  const platformAliases = resolvePlatformAliases(platform);
  const isTmallPlatform = platformAliases.some((alias) => alias === 'taobao' || alias === 'tmall');
  const isDouyinPlatform = platformAliases.some((alias) => alias === 'douyin');
  const useDashForTrafficQualityMetrics = platformAliases.some(
    (alias) => alias === 'xiaohongshu' || alias === 'jd' || alias === 'wechat'
  );

  return {
    platformData,
    platformLabel: resolvePlatformLabel(platform),
    platformAliases,
    summaryWeekPeriod: resolvePlatformSummaryWeekPeriod(report),
    trend7d,
    isTmallPlatform,
    isDouyinPlatform,
    useDashForTrafficQualityMetrics,
  };
}
