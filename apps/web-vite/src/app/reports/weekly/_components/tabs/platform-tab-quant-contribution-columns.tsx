import type { ColumnsType } from 'antd/es/table';
import {
  renderWeeklyPlainTextCell,
  renderWeeklyPriorityTag,
  renderWeeklyTrendText,
} from './platform-tab-column-cells';
import {
  createSignedCurrencyMetricColumn,
  createSignedPercentMetricColumn,
} from './platform-tab-metric-column-builders';
import type { QuantAttributionRow } from './platform-tab-types';

export function buildQuantContributionColumns(): ColumnsType<QuantAttributionRow> {
  return [
    createSignedCurrencyMetricColumn<QuantAttributionRow>(
      '归因贡献值',
      'lnContribution',
      100
    ),
    createSignedPercentMetricColumn<QuantAttributionRow>(
      '贡献占比',
      'contributionRate',
      120
    ),
    {
      title: '影响',
      dataIndex: 'effect',
      key: 'effect',
      width: 90,
      render: (value: QuantAttributionRow['effect'], item) =>
        renderWeeklyTrendText(value, item.lnContribution, 'up'),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 88,
      render: (value: QuantAttributionRow['priority']) => renderWeeklyPriorityTag(value),
    },
    {
      title: '关键原因',
      dataIndex: 'reason',
      key: 'reason',
      width: 280,
      render: (value: QuantAttributionRow['reason']) => renderWeeklyPlainTextCell(value),
    },
    {
      title: '建议动作',
      dataIndex: 'action',
      key: 'action',
      width: 300,
      render: (value: QuantAttributionRow['action']) => renderWeeklyPlainTextCell(value),
    },
  ];
}
