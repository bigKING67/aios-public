import {
  buildFunnelStagePointsFromSeeds,
  type FunnelStageSeed,
} from './platform-tab-funnel-stage-points';
import type { DouyinCardSourceRow, FunnelStagePoint } from './platform-tab-types';

export function buildDouyinCardSourceStages(
  row: DouyinCardSourceRow | undefined
): FunnelStagePoint[] {
  if (!row) {
    return [];
  }

  const stageSeed: FunnelStageSeed[] = [
    {
      key: 'card-exposure',
      label: '商品卡曝光人数',
      value: row.currCardExposureUserCount,
      prevValue: row.prevCardExposureUserCount,
    },
    {
      key: 'card-click',
      label: '商品卡点击人数',
      value: row.currCardClickUserCount,
      prevValue: row.prevCardClickUserCount,
      conversionLabel: '点击率',
      conversionRate: row.currCardClickRate,
      conversionPrevRate: row.prevCardClickRate,
    },
    {
      key: 'card-buyer',
      label: '商品卡成交人数',
      value: row.currCardBuyerCount,
      prevValue: row.prevCardBuyerCount,
      conversionLabel: '点击成交率',
      conversionRate: row.currCardClickToPayRate,
      conversionPrevRate: row.prevCardClickToPayRate,
    },
  ];

  return buildFunnelStagePointsFromSeeds(stageSeed);
}
