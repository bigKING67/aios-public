import type { WeeklyReportResponse } from '@/hooks/use-weekly-report';

type WeeklyReportCharts = WeeklyReportResponse['charts'];

export type PlatformChartCollectionKey =
  | 'goods_attribution'
  | 'goods_channel_attribution'
  | 'goods_channel_funnel_diagnosis'
  | 'douyin_live_attribution'
  | 'douyin_shortvideo_attribution'
  | 'douyin_card_attribution';

export type ChartCollectionItem<Key extends PlatformChartCollectionKey> =
  NonNullable<WeeklyReportCharts[Key]> extends Array<infer Item> ? Item : never;

export type ChartCollectionItems<Key extends PlatformChartCollectionKey> =
  Array<ChartCollectionItem<Key>>;

export interface PlatformAttributionSources {
  platformGoodsAttribution: ChartCollectionItem<'goods_attribution'> | undefined;
  platformGoodsChannelAttribution: ChartCollectionItem<'goods_channel_attribution'> | undefined;
  platformGoodsChannelFunnelDiagnosis:
    | ChartCollectionItem<'goods_channel_funnel_diagnosis'>
    | undefined;
  douyinLiveAttributionSummaryItem: ChartCollectionItem<'douyin_live_attribution'> | undefined;
  douyinShortvideoAttributionSummaryItem:
    | ChartCollectionItem<'douyin_shortvideo_attribution'>
    | undefined;
  douyinCardAttributionSummaryItem: ChartCollectionItem<'douyin_card_attribution'> | undefined;
  attributionAsOfDate: string | undefined;
  channelAttributionAsOfDate: string | undefined;
}
