import type { WeeklyReportResponse } from '@/types/weekly-report';
import {
  asRecord,
  readFiniteNumber,
  readString,
  readStringArray,
} from './unknown-data';

export type NormalizedWeeklyReportResponse = WeeklyReportResponse;

export function normalizeWeeklyReport(raw: unknown): WeeklyReportResponse {
  const report = asRecord(raw) ?? {};
  const metaSource = asRecord(report.meta) ?? asRecord(report.metadata) ?? {};
  const chartsSource = asRecord(report.charts) ?? {};
  const rawConclusions = report.conclusions;
  const conclusionSource = asRecord(rawConclusions);

  const trend7d = Array.isArray(chartsSource.trend_7d)
    ? chartsSource.trend_7d
    : Array.isArray(chartsSource.trend_nd)
      ? chartsSource.trend_nd
      : [];

  const platforms = Array.isArray(chartsSource.platforms)
    ? chartsSource.platforms
    : Array.isArray(chartsSource.dimensions)
      ? chartsSource.dimensions
      : [];
  const goodsAttribution = Array.isArray(chartsSource.goods_attribution)
    ? chartsSource.goods_attribution
    : [];
  const goodsChannelAttribution = Array.isArray(chartsSource.goods_channel_attribution)
    ? chartsSource.goods_channel_attribution
    : [];
  const goodsChannelFunnelDiagnosis = Array.isArray(chartsSource.goods_channel_funnel_diagnosis)
    ? chartsSource.goods_channel_funnel_diagnosis
    : [];
  const douyinLiveAttribution = Array.isArray(chartsSource.douyin_live_attribution)
    ? chartsSource.douyin_live_attribution
    : [];
  const douyinShortvideoAttribution = Array.isArray(chartsSource.douyin_shortvideo_attribution)
    ? chartsSource.douyin_shortvideo_attribution
    : [];
  const douyinCardAttribution = Array.isArray(chartsSource.douyin_card_attribution)
    ? chartsSource.douyin_card_attribution
    : [];

  const conclusions =
    conclusionSource
      ? {
          overall: readString(conclusionSource.overall),
          highlights: readStringArray(conclusionSource.highlights),
          risks: readStringArray(conclusionSource.risks),
        }
      : {
          overall: Array.isArray(rawConclusions)
            ? String(rawConclusions[0] ?? '')
            : '',
          highlights: [],
          risks: [],
        };

  return {
    meta: {
      report_type: 'weekly',
      report_id: readString(metaSource.report_id) || readString(report.report_id),
      period_start: readString(metaSource.period_start),
      period_end: readString(metaSource.period_end),
      generated_at: readString(metaSource.generated_at),
    },
    kpis: Array.isArray(report.kpis)
      ? report.kpis.map((item, index: number) => {
          const kpi = asRecord(item) ?? {};
          const value = readFiniteNumber(kpi.value);

          return {
            key: readString(kpi.key) || readString(kpi.label) || `kpi-${index}`,
            label: readString(kpi.label),
            value: value ?? 0,
            display_value:
              readString(kpi.display_value) ||
              (kpi.value !== undefined ? String(kpi.value) : '--'),
            wow: readFiniteNumber(kpi.wow),
            yoy: readFiniteNumber(kpi.yoy),
          };
        })
      : [],
    charts: {
      trend_7d: trend7d,
      platforms,
      goods_attribution: goodsAttribution,
      goods_channel_attribution: goodsChannelAttribution,
      goods_channel_funnel_diagnosis: goodsChannelFunnelDiagnosis,
      douyin_live_attribution: douyinLiveAttribution,
      douyin_shortvideo_attribution: douyinShortvideoAttribution,
      douyin_card_attribution: douyinCardAttribution,
    },
    conclusions,
  } as WeeklyReportResponse;
}
