import type { ColumnsType } from 'antd/es/table';
import type { TrendClassNameResolver } from './platform-tab-column-contracts';
import {
  createWeeklyFrozenHeaderCellProps,
  createWeeklyFrozenGoodsIdCellProps,
  createWeeklyGmvCellProps,
  renderWeeklyCurrencyTrendCell,
  renderWeeklyPlainTextCell,
} from './platform-tab-column-cells';
import type { FunnelChannelRow } from './platform-tab-types';

export function buildFunnelBaseColumns(
  resolveTrendClassName: TrendClassNameResolver
): ColumnsType<FunnelChannelRow> {
  return [
    {
      title: '商品ID',
      dataIndex: 'productId',
      key: 'productId',
      fixed: 'left',
      width: 170,
      onHeaderCell: createWeeklyFrozenHeaderCellProps,
      onCell: createWeeklyFrozenGoodsIdCellProps,
      render: (value: FunnelChannelRow['productId']) =>
        renderWeeklyPlainTextCell(value, 'goods-id'),
    },
    {
      title: '流量渠道',
      dataIndex: 'trafficChannelLabel',
      key: 'trafficChannelLabel',
      width: 130,
    },
    {
      title: '支付金额',
      dataIndex: 'currPayAmount',
      key: 'currPayAmount',
      width: 180,
      onCell: createWeeklyGmvCellProps,
      render: (_value: FunnelChannelRow['currPayAmount'], item) =>
        renderWeeklyCurrencyTrendCell(
          item.currPayAmount,
          item.payAmountWoW,
          resolveTrendClassName
        ),
    },
  ];
}
