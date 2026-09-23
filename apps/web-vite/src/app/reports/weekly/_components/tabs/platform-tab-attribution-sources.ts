import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';
import { findChartItemByPlatform } from './platform-tab-chart-collections';
import type { PlatformAttributionSources } from './platform-tab-chart-source-types';

export function resolvePlatformAttributionSources(
  report: WeeklyReportResponse,
  platformAliases: string[]
): PlatformAttributionSources {
  const platformGoodsAttribution = findChartItemByPlatform(
    report,
    'goods_attribution',
    platformAliases
  );
  const attributionAsOfDate = typeof platformGoodsAttribution?.as_of_date === 'string'
    ? platformGoodsAttribution.as_of_date
    : undefined;
  const platformGoodsChannelAttribution = findChartItemByPlatform(
    report,
    'goods_channel_attribution',
    platformAliases
  );
  const platformGoodsChannelFunnelDiagnosis = findChartItemByPlatform(
    report,
    'goods_channel_funnel_diagnosis',
    platformAliases
  );
  const douyinLiveAttributionSummaryItem = findChartItemByPlatform(
    report,
    'douyin_live_attribution',
    platformAliases
  );
  const douyinShortvideoAttributionSummaryItem = findChartItemByPlatform(
    report,
    'douyin_shortvideo_attribution',
    platformAliases
  );
  const douyinCardAttributionSummaryItem = findChartItemByPlatform(
    report,
    'douyin_card_attribution',
    platformAliases
  );
  const channelAttributionAsOfDate = typeof platformGoodsChannelAttribution?.as_of_date === 'string'
    ? platformGoodsChannelAttribution.as_of_date
    : attributionAsOfDate;

  return {
    platformGoodsAttribution,
    platformGoodsChannelAttribution,
    platformGoodsChannelFunnelDiagnosis,
    douyinLiveAttributionSummaryItem,
    douyinShortvideoAttributionSummaryItem,
    douyinCardAttributionSummaryItem,
    attributionAsOfDate,
    channelAttributionAsOfDate,
  };
}
