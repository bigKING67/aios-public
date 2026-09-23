import type { ColumnsType } from 'antd/es/table';
import {
  formatCurrencyFixed,
  formatInteger,
  formatRatioPercent,
} from './platform-tab-formatters';
import type { QuantAttributionRow } from './platform-tab-types';
import {
  createFormattedMetricColumn,
  createSignedPercentMetricColumn,
} from './platform-tab-metric-column-builders';

function formatDriverValue(factorKey: string, value: number): string {
  if (!Number.isFinite(value)) {
    return '--';
  }

  if (factorKey === 'impression' || factorKey === 'visitor') {
    return formatInteger(value);
  }

  if (factorKey === 'avg_order_value') {
    return formatCurrencyFixed(value, 2);
  }

  return formatRatioPercent(value, 2);
}

export function buildQuantDriverColumns(): ColumnsType<QuantAttributionRow> {
  return [
    {
      title: '驱动因子',
      dataIndex: 'factorLabel',
      key: 'factorLabel',
      fixed: 'left',
      width: 140,
    },
    createFormattedMetricColumn<QuantAttributionRow>(
      '本周值',
      'currValue',
      120,
      (_value, item) => formatDriverValue(item.factorKey, item.currValue)
    ),
    createFormattedMetricColumn<QuantAttributionRow>(
      '上周同期',
      'prevValue',
      120,
      (_value, item) => formatDriverValue(item.factorKey, item.prevValue)
    ),
    createSignedPercentMetricColumn<QuantAttributionRow>(
      '变化率',
      'changeRate',
      100,
      2
    ),
  ];
}
