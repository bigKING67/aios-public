import { FUNNEL_COLORS } from './dashboard-config';
import {
  formatNullableRate,
  getLiveFunnelExposureToWatchRate,
  getLiveFunnelProductClickToBuyerRate,
  getLiveFunnelProductExposureToClickRate,
  getLiveFunnelWatchToProductExposureRate,
} from './dashboard-live-funnel-formatters';
import { toLiveGoodsNumber } from './dashboard-live-goods-formatters';
import type { DashboardLiveDetailRow, LiveFunnelStep } from './dashboard-types';

export function buildLiveFunnelSteps(row: DashboardLiveDetailRow): LiveFunnelStep[] {
  const exposureToWatchRate = getLiveFunnelExposureToWatchRate(row);
  const watchToProductExposureRate = getLiveFunnelWatchToProductExposureRate(row);
  const productExposureToClickRate = getLiveFunnelProductExposureToClickRate(row);
  const productClickToBuyerRate = getLiveFunnelProductClickToBuyerRate(row);
  const visualWidths = [100, 92, 82, 72, 60];
  const rawSteps = [
    {
      key: 'exposure',
      label: '直播间曝光人数',
      value: Math.max(0, toLiveGoodsNumber(row.live_exposure_user_count)),
      color: FUNNEL_COLORS.exposure.color,
    },
    {
      key: 'watch',
      label: '直播间观看人数',
      value: Math.max(0, toLiveGoodsNumber(row.live_watch_user_count)),
      color: FUNNEL_COLORS.visit.color,
      conversionRate: formatNullableRate(exposureToWatchRate),
      conversionLabel: '曝光-观看率(人数)',
    },
    {
      key: 'productExposure',
      label: '商品曝光人数',
      value: Math.max(0, toLiveGoodsNumber(row.live_product_exposure_user)),
      color: FUNNEL_COLORS.intent.color,
      conversionRate: formatNullableRate(watchToProductExposureRate),
      conversionLabel: '观看-商品曝光率(人数)',
    },
    {
      key: 'productClick',
      label: '商品点击人数',
      value: Math.max(0, toLiveGoodsNumber(row.live_product_click_user)),
      color: FUNNEL_COLORS.conversion.color,
      conversionRate: formatNullableRate(productExposureToClickRate),
      conversionLabel: '商品曝光-点击率(人数)',
    },
    {
      key: 'buyer',
      label: '成交人数',
      value: Math.max(0, toLiveGoodsNumber(row.live_buyer_count)),
      color: FUNNEL_COLORS.conversion.color,
      conversionRate: formatNullableRate(productClickToBuyerRate),
      conversionLabel: '商品点击-成交转化率(人数)',
    },
  ];

  return rawSteps.map((step, index) => ({
    ...step,
    widthPercent: visualWidths[index],
  }));
}
