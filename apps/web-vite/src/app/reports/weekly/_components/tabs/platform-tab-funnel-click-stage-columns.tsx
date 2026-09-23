import type { ColumnsType } from 'antd/es/table';
import type { TrendClassNameResolver } from './platform-tab-column-contracts';
import {
  createWeeklyGmvCellProps,
  renderWeeklyCurrencyTrendCell,
  renderWeeklyRawMetricTrendCell,
} from './platform-tab-column-cells';
import {
  formatDecimal,
} from './platform-tab-formatters';
import type { FunnelChannelRow } from './platform-tab-types';
import { buildFunnelClickStageCountColumns } from './platform-tab-funnel-click-stage-count-columns';
import {
  createCurrencyFixedMetricColumn,
  createRatioPercentMetricColumn,
} from './platform-tab-metric-column-builders';

export function buildFunnelClickStageColumns(
  resolveTrendClassName: TrendClassNameResolver
): ColumnsType<FunnelChannelRow> {
  return [
    {
      title: '花费',
      dataIndex: 'currCost',
      key: 'currCost',
      width: 170,
      onCell: createWeeklyGmvCellProps,
      render: (_value: FunnelChannelRow['currCost'], item) =>
        renderWeeklyCurrencyTrendCell(
          item.currCost,
          item.costWoW,
          resolveTrendClassName
        ),
    },
    {
      title: 'ROI',
      dataIndex: 'currRoi',
      key: 'currRoi',
      width: 130,
      render: (value: FunnelChannelRow['currRoi'], item) =>
        renderWeeklyRawMetricTrendCell(
          formatDecimal(value, 2),
          item.roiWoW,
          resolveTrendClassName
        ),
    },
    createCurrencyFixedMetricColumn<FunnelChannelRow>(
      '平均点击花费',
      'currAvgClickCost',
      140
    ),
    createCurrencyFixedMetricColumn<FunnelChannelRow>('CPM', 'currCpm', 120),
    createRatioPercentMetricColumn<FunnelChannelRow>(
      '点击/访客转化率',
      'currClickConversionRate',
      130,
      0
    ),
    ...buildFunnelClickStageCountColumns(),
  ];
}
