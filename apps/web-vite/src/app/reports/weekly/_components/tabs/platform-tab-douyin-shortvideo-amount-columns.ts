import type { ColumnsType } from 'antd/es/table';
import {
  renderDouyinMetricTrend,
  type TrendClassNameResolver,
} from './platform-tab-douyin-renderers';
import type { DouyinShortvideoRow } from './platform-tab-types';
import { createWeeklyGmvCellProps } from './platform-tab-column-cells';
import { createCurrencyFixedMetricColumn } from './platform-tab-metric-column-builders';

export function buildDouyinShortvideoAmountColumns(
  resolveTrendClassName: TrendClassNameResolver
): ColumnsType<DouyinShortvideoRow> {
  return [
    {
      title: '用户支付金额',
      dataIndex: 'currUserPayAmount',
      key: 'currUserPayAmount',
      width: 190,
      onCell: createWeeklyGmvCellProps,
      render: (_value: DouyinShortvideoRow['currUserPayAmount'], row) =>
        renderDouyinMetricTrend(
          row.currUserPayAmount,
          row.prevUserPayAmount,
          resolveTrendClassName
        ),
    },
    createCurrencyFixedMetricColumn<DouyinShortvideoRow>('退款金额', 'currRefundAmount', 140),
    createCurrencyFixedMetricColumn<DouyinShortvideoRow>(
      '引流直播间支付',
      'currLiveRoomPayAmount',
      150
    ),
    createCurrencyFixedMetricColumn<DouyinShortvideoRow>(
      '看后搜支付',
      'currSearchAfterViewPayAmount',
      130
    ),
    createCurrencyFixedMetricColumn<DouyinShortvideoRow>(
      '引流店铺页支付',
      'currShopPagePayAmount',
      150
    ),
  ];
}
