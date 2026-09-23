import { safeDivide } from './platform-tab-formatters';
import {
  buildClickFunnelStageSeeds,
  buildNoClickFunnelStageSeeds,
} from './platform-tab-funnel-stage-seeds';
import {
  buildFunnelStagePointsFromSeeds,
  type FunnelStageSeed,
} from './platform-tab-funnel-stage-points';
import type {
  DouyinLiveSessionRow,
  FunnelChannelRow,
  FunnelStagePoint,
} from './platform-tab-types';

export function buildDouyinLiveFunnelStagePoints(
  row: DouyinLiveSessionRow
): FunnelStagePoint[] {
  const currWatchRate = safeDivide(row.currLiveWatchUserCount, row.currLiveExposureUserCount);
  const prevWatchRate = safeDivide(row.prevLiveWatchUserCount, row.prevLiveExposureUserCount);
  const currProductExposureRate = safeDivide(
    row.currLiveProductExposureUser,
    row.currLiveWatchUserCount
  );
  const prevProductExposureRate = safeDivide(
    row.prevLiveProductExposureUser,
    row.prevLiveWatchUserCount
  );
  const currProductClickRate = safeDivide(
    row.currLiveProductClickUser,
    row.currLiveProductExposureUser
  );
  const prevProductClickRate = safeDivide(
    row.prevLiveProductClickUser,
    row.prevLiveProductExposureUser
  );
  const currClickToPayRate = safeDivide(row.currLiveBuyerCount, row.currLiveProductClickUser);
  const prevClickToPayRate = safeDivide(row.prevLiveBuyerCount, row.prevLiveProductClickUser);

  const stageSeed: FunnelStageSeed[] = [
    {
      key: 'live-exposure',
      label: '直播间曝光人数',
      value: row.currLiveExposureUserCount,
      prevValue: row.prevLiveExposureUserCount,
    },
    {
      key: 'live-watch',
      label: '直播间观看人数',
      value: row.currLiveWatchUserCount,
      prevValue: row.prevLiveWatchUserCount,
      conversionLabel: '看播率',
      conversionRate: currWatchRate,
      conversionPrevRate: prevWatchRate,
    },
    {
      key: 'live-product-exposure',
      label: '直播间商品曝光人数',
      value: row.currLiveProductExposureUser,
      prevValue: row.prevLiveProductExposureUser,
      conversionLabel: '商品曝光率',
      conversionRate: currProductExposureRate,
      conversionPrevRate: prevProductExposureRate,
    },
    {
      key: 'live-product-click',
      label: '直播间商品点击人数',
      value: row.currLiveProductClickUser,
      prevValue: row.prevLiveProductClickUser,
      conversionLabel: '商品点击率',
      conversionRate: currProductClickRate,
      conversionPrevRate: prevProductClickRate,
    },
    {
      key: 'live-buyer',
      label: '直播间成交人数',
      value: row.currLiveBuyerCount,
      prevValue: row.prevLiveBuyerCount,
      conversionLabel: '商品点击成交转化率',
      conversionRate: currClickToPayRate,
      conversionPrevRate: prevClickToPayRate,
    },
  ];

  return buildFunnelStagePointsFromSeeds(stageSeed);
}

export function buildFunnelStagePoints(rows: FunnelChannelRow[]): FunnelStagePoint[] {
  if (rows.length === 0) {
    return [];
  }

  const hasClickStage = rows.some((item) => item.hasClickStage);
  const stageSeed: FunnelStageSeed[] = hasClickStage
    ? buildClickFunnelStageSeeds(rows)
    : buildNoClickFunnelStageSeeds(rows);

  return buildFunnelStagePointsFromSeeds(stageSeed);
}
