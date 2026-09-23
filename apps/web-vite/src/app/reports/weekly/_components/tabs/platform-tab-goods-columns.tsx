import type { ColumnsType } from 'antd/es/table';
import type { GoodsTableRow } from './platform-tab-types';
import type { TrendClassNameResolver } from './platform-tab-column-contracts';
import {
  createWeeklyFrozenHeaderCellProps,
  createWeeklyFrozenGoodsNameCellProps,
  createWeeklyGmvCellProps,
  createWeeklyGoodsIdCellProps,
  renderWeeklyCurrencyTrendCell,
  renderWeeklyPlainTextCell,
} from './platform-tab-column-cells';
import {
  createCurrencyFixedMetricColumn,
  createIntegerMetricColumn,
  createRatioPercentMetricColumn,
} from './platform-tab-metric-column-builders';

export function buildGoodsColumns(
  resolveTrendClassName: TrendClassNameResolver
): ColumnsType<GoodsTableRow> {
  return [
    {
      title: '商品名称',
      dataIndex: 'productName',
      key: 'productName',
      fixed: 'left',
      width: 460,
      onHeaderCell: createWeeklyFrozenHeaderCellProps,
      onCell: createWeeklyFrozenGoodsNameCellProps,
      render: (value: GoodsTableRow['productName']) =>
        renderWeeklyPlainTextCell(value, 'goods-name'),
    },
    {
      title: '商品ID',
      dataIndex: 'productId',
      key: 'productId',
      width: 170,
      onCell: createWeeklyGoodsIdCellProps,
      render: (value: GoodsTableRow['productId']) =>
        renderWeeklyPlainTextCell(value, 'goods-id'),
    },
    {
      title: '商品GMV',
      dataIndex: 'gmv',
      key: 'gmv',
      width: 190,
      onCell: createWeeklyGmvCellProps,
      render: (_value: GoodsTableRow['gmv'], item) =>
        renderWeeklyCurrencyTrendCell(item.gmv, item.gmvWoW, resolveTrendClassName),
    },
    createIntegerMetricColumn<GoodsTableRow>('成交人数', 'buyerCount', 115),
    createIntegerMetricColumn<GoodsTableRow>('访客', 'visitorCount', 115),
    createRatioPercentMetricColumn<GoodsTableRow>(
      '成交转化率',
      'payConversionRate',
      115,
      0
    ),
    createCurrencyFixedMetricColumn<GoodsTableRow>('客单价', 'avgOrderValue', 115),
  ];
}
