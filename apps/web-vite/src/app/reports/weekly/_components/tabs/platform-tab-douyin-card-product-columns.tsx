import type { ColumnsType } from 'antd/es/table';
import {
  renderDouyinMetricTrend,
  type TrendClassNameResolver,
} from './platform-tab-douyin-renderers';
import type { DouyinCardProductRow } from './platform-tab-types';
import {
  createWeeklyGmvCellProps,
  renderWeeklyPlainTextCell,
} from './platform-tab-column-cells';
import { buildDouyinCardCountColumns } from './platform-tab-douyin-card-count-columns';

export function buildDouyinCardProductColumns(
  resolveTrendClassName: TrendClassNameResolver
): ColumnsType<DouyinCardProductRow> {
  return [
    {
      title: '商品名称',
      dataIndex: 'productTitle',
      key: 'productTitle',
      fixed: 'left',
      width: 280,
      render: (value: DouyinCardProductRow['productTitle']) =>
        renderWeeklyPlainTextCell(value),
    },
    {
      title: '商品ID',
      dataIndex: 'productId',
      key: 'productId',
      width: 170,
      render: (value: DouyinCardProductRow['productId']) =>
        renderWeeklyPlainTextCell(value, 'goods-id'),
    },
    {
      title: '商品卡GMV',
      dataIndex: 'currCardUserPayAmount',
      key: 'currCardUserPayAmount',
      width: 190,
      onCell: createWeeklyGmvCellProps,
      render: (_value: DouyinCardProductRow['currCardUserPayAmount'], row) =>
        renderDouyinMetricTrend(
          row.currCardUserPayAmount,
          row.prevCardUserPayAmount,
          resolveTrendClassName
        ),
    },
    ...buildDouyinCardCountColumns<DouyinCardProductRow>(),
  ];
}
