import type { ResolveDouyinSectionDataParams } from './platform-tab-douyin-section-types';

export function resolveDouyinChannelAsOfDate({
  report,
  channelAttributionAsOfDate,
  attributionAsOfDate,
}: Pick<
  ResolveDouyinSectionDataParams,
  'report' | 'channelAttributionAsOfDate' | 'attributionAsOfDate'
>): string | undefined {
  return channelAttributionAsOfDate || attributionAsOfDate || report.meta?.period_end;
}
