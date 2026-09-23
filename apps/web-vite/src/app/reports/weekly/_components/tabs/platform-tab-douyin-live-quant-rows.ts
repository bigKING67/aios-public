import { safeDivide } from './platform-tab-formatters';
import { buildLiveQuantReasonAction } from './platform-tab-douyin-diagnostics';
import { buildDouyinQuantRowsFromFactors } from './platform-tab-douyin-quant-row-builder';
import type {
  DouyinLiveSessionRow,
  QuantAttributionRow,
} from './platform-tab-types';

export function buildDouyinLiveQuantRows(
  row: DouyinLiveSessionRow | undefined
): QuantAttributionRow[] {
  if (!row) {
    return [];
  }

  const currWatchRate =
    safeDivide(row.currLiveWatchUserCount, row.currLiveExposureUserCount) ?? 0;
  const prevWatchRate =
    safeDivide(row.prevLiveWatchUserCount, row.prevLiveExposureUserCount) ?? 0;
  const currProductExposureRate =
    safeDivide(row.currLiveProductExposureUser, row.currLiveWatchUserCount) ?? 0;
  const prevProductExposureRate =
    safeDivide(row.prevLiveProductExposureUser, row.prevLiveWatchUserCount) ?? 0;
  const currProductClickRate =
    safeDivide(row.currLiveProductClickUser, row.currLiveProductExposureUser) ?? 0;
  const prevProductClickRate =
    safeDivide(row.prevLiveProductClickUser, row.prevLiveProductExposureUser) ?? 0;
  const currClickToPayRate =
    safeDivide(row.currLiveBuyerCount, row.currLiveProductClickUser) ?? 0;
  const prevClickToPayRate =
    safeDivide(row.prevLiveBuyerCount, row.prevLiveProductClickUser) ?? 0;
  const currAvgOrderValue = row.currAvgOrderValue ?? 0;
  const prevAvgOrderValue = row.prevAvgOrderValue ?? 0;

  return buildDouyinQuantRowsFromFactors(
    [
      {
        factorKey: 'live_exposure_user_count',
        factorLabel: '直播间曝光人数',
        currValue: row.currLiveExposureUserCount,
        prevValue: row.prevLiveExposureUserCount,
      },
      {
        factorKey: 'watch_rate',
        factorLabel: '看播率',
        currValue: currWatchRate,
        prevValue: prevWatchRate,
      },
      {
        factorKey: 'product_exposure_rate',
        factorLabel: '商品曝光率',
        currValue: currProductExposureRate,
        prevValue: prevProductExposureRate,
      },
      {
        factorKey: 'product_click_rate',
        factorLabel: '商品点击率',
        currValue: currProductClickRate,
        prevValue: prevProductClickRate,
      },
      {
        factorKey: 'click_to_pay_rate',
        factorLabel: '商品点击成交转化率',
        currValue: currClickToPayRate,
        prevValue: prevClickToPayRate,
      },
      {
        factorKey: 'avg_order_value',
        factorLabel: '客单价',
        currValue: currAvgOrderValue,
        prevValue: prevAvgOrderValue,
      },
    ],
    buildLiveQuantReasonAction
  );
}
