import type { ColumnsType } from 'antd/es/table';
import {
  renderDouyinMetricTrend,
  type TrendClassNameResolver,
} from './platform-tab-douyin-renderers';
import type { DouyinCardSourceRow } from './platform-tab-types';
import { createWeeklyGmvCellProps } from './platform-tab-column-cells';
import { buildDouyinCardCountColumns } from './platform-tab-douyin-card-count-columns';
import {
  createIntegerMetricColumn,
  createRatioPercentMetricColumn,
} from './platform-tab-metric-column-builders';

export function buildDouyinCardSourceColumns(
  resolveTrendClassName: TrendClassNameResolver
): ColumnsType<DouyinCardSourceRow> {
  return [
    {
      title: '一级来源渠道',
      dataIndex: 'sourceLevel1',
      key: 'sourceLevel1',
      fixed: 'left',
      width: 140,
    },
    {
      title: '支付金额',
      dataIndex: 'currCardUserPayAmount',
      key: 'currCardUserPayAmount',
      width: 180,
      onCell: createWeeklyGmvCellProps,
      render: (_value: DouyinCardSourceRow['currCardUserPayAmount'], row) =>
        renderDouyinMetricTrend(
          row.currCardUserPayAmount,
          row.prevCardUserPayAmount,
          resolveTrendClassName
        ),
    },
    ...buildDouyinCardCountColumns<DouyinCardSourceRow>(),
    createRatioPercentMetricColumn<DouyinCardSourceRow>('点击率', 'currCardClickRate', 100),
    createRatioPercentMetricColumn<DouyinCardSourceRow>(
      '点击成交率',
      'currCardClickToPayRate',
      120
    ),
    createIntegerMetricColumn<DouyinCardSourceRow>('跳失人数', 'currCardBounceUserCount', 110),
  ];
}
