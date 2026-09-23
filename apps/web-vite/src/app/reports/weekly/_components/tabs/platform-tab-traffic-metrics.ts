import {
  calcChangePercent,
  formatCurrencyFixed,
  formatInteger,
  formatRatioPercent,
} from './platform-tab-formatters';
import type { PlatformMetricCard } from './platform-tab-metric-types';

export interface BuildTrafficMetricsParams {
  useDashForTrafficQualityMetrics: boolean;
  visitorCount: number | undefined;
  prevVisitorCount: number | undefined;
  payCvr: number | undefined;
  prevPayCvr: number | undefined;
  uvValue: number | undefined;
  prevUvValue: number | undefined;
}

export function buildTrafficMetrics({
  useDashForTrafficQualityMetrics,
  visitorCount,
  prevVisitorCount,
  payCvr,
  prevPayCvr,
  uvValue,
  prevUvValue,
}: BuildTrafficMetricsParams): PlatformMetricCard[] {
  return [
    {
      key: 'visitor',
      label: '访客数',
      value: useDashForTrafficQualityMetrics ? '-' : formatInteger(visitorCount),
      wow:
        useDashForTrafficQualityMetrics
          ? undefined
          : visitorCount !== undefined && prevVisitorCount !== undefined
            ? calcChangePercent(visitorCount, prevVisitorCount)
            : undefined,
    },
    {
      key: 'pay-cvr',
      label: '支付转化率',
      value: useDashForTrafficQualityMetrics ? '-' : formatRatioPercent(payCvr, 0),
      wow:
        useDashForTrafficQualityMetrics
          ? undefined
          : payCvr !== undefined && prevPayCvr !== undefined
            ? calcChangePercent(payCvr, prevPayCvr)
            : undefined,
    },
    {
      key: 'uv-value',
      label: 'UV价值',
      value: useDashForTrafficQualityMetrics ? '-' : formatCurrencyFixed(uvValue, 2),
      wow:
        useDashForTrafficQualityMetrics
          ? undefined
          : uvValue !== undefined && prevUvValue !== undefined
            ? calcChangePercent(uvValue, prevUvValue)
            : undefined,
    },
  ];
}
