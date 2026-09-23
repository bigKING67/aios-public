import type { ColumnsType } from 'antd/es/table';
import {
  TRAFFIC_METRIC_DEFINITIONS,
} from './dashboard-metric-definitions';
import {
  compareNullableNumbers,
  compareText,
} from './dashboard-sorters';
import type {
  DashboardTrafficTreeNode,
} from './dashboard-types';
import type {
  DashboardTrafficTableClassNames,
} from './dashboard-traffic-table-class-names';
import {
  buildTrafficBodyCellProps,
  buildTrafficFirstCellProps,
  buildTrafficHeaderCellProps,
  renderTrafficMetricCell,
  renderTrafficSourceCell,
} from './dashboard-traffic-table-renderers';

export function buildDashboardTrafficColumns({
  isMobile,
  classNames,
}: {
  isMobile: boolean;
  classNames: DashboardTrafficTableClassNames;
}): ColumnsType<DashboardTrafficTreeNode> {
  const firstHeaderCellProps = () =>
    buildTrafficHeaderCellProps(classNames, classNames.trafficFirstHeaderCell);
  const metricHeaderCellProps = () =>
    buildTrafficHeaderCellProps(classNames, classNames.trafficMetricHeaderCell);
  const bodyCellProps = () => buildTrafficBodyCellProps(classNames);

  const sourceColumn: ColumnsType<DashboardTrafficTreeNode>[number] = {
    title: '流量来源',
    key: 'sourceName',
    width: isMobile ? 194 : 236,
    fixed: isMobile ? undefined : 'left',
    align: 'left',
    onHeaderCell: firstHeaderCellProps,
    onCell: (row) => buildTrafficFirstCellProps(classNames, row),
    sorter: (left, right) => {
      if (left.sourceLevel !== right.sourceLevel) {
        return left.sourceLevel - right.sourceLevel;
      }
      return compareText(left.sourceName, right.sourceName);
    },
    render: (_value, row) => renderTrafficSourceCell({ row, classNames }),
  };

  const metricColumns: ColumnsType<DashboardTrafficTreeNode> = TRAFFIC_METRIC_DEFINITIONS.map((item) => ({
    title: item.title,
    key: item.key,
    width: isMobile ? 148 : 172,
    align: isMobile ? 'left' : 'right',
    onHeaderCell: metricHeaderCellProps,
    onCell: bodyCellProps,
    sorter: (left, right) =>
      compareNullableNumbers(left.metrics[item.key].current, right.metrics[item.key].current),
    render: (_value, row) =>
      renderTrafficMetricCell({
        metric: row.metrics[item.key],
        format: item.format,
        digits: item.digits ?? 2,
        classNames,
      }),
  }));

  return [sourceColumn, ...metricColumns];
}
