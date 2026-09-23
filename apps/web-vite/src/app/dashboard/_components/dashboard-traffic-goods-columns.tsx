import type { ColumnsType } from 'antd/es/table';
import {
  TRAFFIC_GOODS_METRIC_DEFINITIONS,
} from './dashboard-metric-definitions';
import {
  compareNullableNumbers,
  compareText,
} from './dashboard-sorters';
import type {
  DashboardTrafficGoodsTreeNode,
} from './dashboard-types';
import type {
  DashboardTrafficTableClassNames,
} from './dashboard-traffic-table-class-names';
import {
  buildTrafficBodyCellProps,
  buildTrafficGoodsFirstCellProps,
  buildTrafficHeaderCellProps,
  renderTrafficGoodsSourceCell,
  renderTrafficMetricCell,
} from './dashboard-traffic-table-renderers';

export function buildDashboardTrafficGoodsColumns({
  isMobile,
  classNames,
}: {
  isMobile: boolean;
  classNames: DashboardTrafficTableClassNames;
}): ColumnsType<DashboardTrafficGoodsTreeNode> {
  const firstHeaderCellProps = () =>
    buildTrafficHeaderCellProps(classNames, classNames.trafficFirstHeaderCell);
  const goodsMetricHeaderCellProps = () =>
    buildTrafficHeaderCellProps(
      classNames,
      classNames.trafficMetricHeaderCell,
      classNames.trafficGoodsMetricHeaderCell
    );
  const bodyCellProps = () => buildTrafficBodyCellProps(classNames);

  const sourceColumn: ColumnsType<DashboardTrafficGoodsTreeNode>[number] = {
    title: '商品流量来源',
    key: 'productSource',
    width: isMobile ? 340 : 520,
    fixed: isMobile ? undefined : 'left',
    align: 'left',
    onHeaderCell: firstHeaderCellProps,
    onCell: (row) => buildTrafficGoodsFirstCellProps(classNames, row),
    sorter: (left, right) => {
      const productNameCompare = compareText(left.productName, right.productName);
      if (productNameCompare !== 0) {
        return productNameCompare;
      }
      const productIdCompare = compareText(left.productId, right.productId);
      if (productIdCompare !== 0) {
        return productIdCompare;
      }
      if (left.sourceLevel !== right.sourceLevel) {
        return left.sourceLevel - right.sourceLevel;
      }
      return compareText(left.sourceName, right.sourceName);
    },
    render: (_value, row) => renderTrafficGoodsSourceCell({ row, classNames }),
  };

  const metricColumns: ColumnsType<DashboardTrafficGoodsTreeNode> = TRAFFIC_GOODS_METRIC_DEFINITIONS.map(
    (item) => ({
      title: item.title,
      key: item.key,
      width: isMobile ? 126 : 150,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: goodsMetricHeaderCellProps,
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
