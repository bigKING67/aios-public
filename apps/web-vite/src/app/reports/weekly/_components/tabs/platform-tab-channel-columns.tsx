import type { ColumnsType } from 'antd/es/table';
import type { ChannelAttributionRow } from './platform-tab-types';
import type { TrendClassNameResolver } from './platform-tab-column-contracts';
import {
  createWeeklyFrozenHeaderCellProps,
  createWeeklyFrozenGoodsIdCellProps,
  createWeeklyGmvCellProps,
  renderWeeklyCurrencyTrendCell,
  renderWeeklyPlainTextCell,
} from './platform-tab-column-cells';
import { buildChannelCountColumns } from './platform-tab-channel-count-columns';

export function buildChannelColumns(
  resolveTrendClassName: TrendClassNameResolver
): ColumnsType<ChannelAttributionRow> {
  return [
    {
      title: '商品ID',
      dataIndex: 'productId',
      key: 'productId',
      fixed: 'left',
      width: 190,
      onHeaderCell: createWeeklyFrozenHeaderCellProps,
      onCell: createWeeklyFrozenGoodsIdCellProps,
      render: (value: ChannelAttributionRow['productId']) =>
        renderWeeklyPlainTextCell(value, 'goods-id'),
    },
    {
      title: '流量渠道',
      dataIndex: 'trafficChannelLabel',
      key: 'trafficChannelLabel',
      width: 150,
      render: (value: ChannelAttributionRow['trafficChannelLabel'], item) => (
        <span title={`${value}（${item.trafficChannel}）`}>{value}</span>
      ),
    },
    {
      title: '支付金额',
      dataIndex: 'payAmount',
      key: 'payAmount',
      width: 190,
      onCell: createWeeklyGmvCellProps,
      render: (_value: ChannelAttributionRow['payAmount'], item) =>
        renderWeeklyCurrencyTrendCell(
          item.payAmount,
          item.payAmountWoW,
          resolveTrendClassName
        ),
    },
    ...buildChannelCountColumns<ChannelAttributionRow>(),
  ];
}
