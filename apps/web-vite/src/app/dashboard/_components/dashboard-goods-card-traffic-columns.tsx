import type { ColumnsType } from 'antd/es/table';
import {
  GOODS_CARD_TRAFFIC_METRIC_DEFINITIONS,
} from './dashboard-metric-definitions';
import {
  compareNullableNumbers,
  compareText,
} from './dashboard-sorters';
import type {
  DashboardGoodsCardTrafficTreeNode,
} from './dashboard-types';
import type {
  DashboardTrafficTableClassNames,
} from './dashboard-traffic-table-class-names';
import {
  buildTrafficBodyCellProps,
  buildTrafficHeaderCellProps,
  renderGoodsCardTrafficSourceCell,
  renderTrafficMetricCell,
} from './dashboard-traffic-table-renderers';

export function buildDashboardGoodsCardTrafficColumns({
  isMobile,
  classNames,
}: {
  isMobile: boolean;
  classNames: DashboardTrafficTableClassNames;
}): ColumnsType<DashboardGoodsCardTrafficTreeNode> {
  const firstHeaderCellProps = () =>
    buildTrafficHeaderCellProps(classNames, classNames.trafficFirstHeaderCell);
  const metricHeaderCellProps = () =>
    buildTrafficHeaderCellProps(classNames, classNames.trafficMetricHeaderCell);
  const bodyCellProps = () => buildTrafficBodyCellProps(classNames);

  const sourceColumn: ColumnsType<DashboardGoodsCardTrafficTreeNode>[number] = {
    title: '来源渠道',
    key: 'sourceName',
    width: isMobile ? 230 : 280,
    fixed: isMobile ? undefined : 'left',
    align: 'left',
    onHeaderCell: firstHeaderCellProps,
    onCell: bodyCellProps,
    sorter: (left, right) => {
      if (left.sourceLevel !== right.sourceLevel) {
        return left.sourceLevel - right.sourceLevel;
      }
      return compareText(left.sourceName, right.sourceName);
    },
    render: (_value, row) => renderGoodsCardTrafficSourceCell({ row, classNames }),
  };

  const metricColumns: ColumnsType<DashboardGoodsCardTrafficTreeNode> = GOODS_CARD_TRAFFIC_METRIC_DEFINITIONS.map(
    (item) => ({
      title: item.title,
      key: item.key,
      width: isMobile ? 136 : 160,
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
    })
  );

  return [sourceColumn, ...metricColumns];
}
