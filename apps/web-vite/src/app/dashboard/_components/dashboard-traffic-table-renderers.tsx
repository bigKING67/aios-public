import {
  formatSignedRatePercent,
} from './dashboard-formatters';
import {
  getTrendClassNameByRate,
} from './dashboard-goods-score-model';
import {
  formatTrafficMetricCurrentValue,
} from './dashboard-traffic-model';
import type {
  DashboardGoodsCardTrafficTreeNode,
  DashboardTrafficGoodsTreeNode,
  DashboardTrafficMetricTriplet,
  DashboardTrafficTreeNode,
  TrafficMetricFormat,
} from './dashboard-types';
import type {
  DashboardTrafficTableClassNames,
} from './dashboard-traffic-table-class-names';

export function buildTrafficHeaderCellProps(
  classNames: DashboardTrafficTableClassNames,
  ...extraClassNames: string[]
) {
  return { className: [classNames.trafficHeaderCell, ...extraClassNames].join(' ') };
}

export function buildTrafficBodyCellProps(classNames: DashboardTrafficTableClassNames) {
  return { className: classNames.trafficBodyCell };
}

export function buildTrafficFirstCellProps(
  classNames: DashboardTrafficTableClassNames,
  row: DashboardTrafficTreeNode
) {
  const levelClassName =
    row.sourceLevel <= 1
      ? classNames.trafficFirstCellL1
      : row.sourceLevel === 2
        ? classNames.trafficFirstCellL2
        : classNames.trafficFirstCellL3;
  return {
    className: `${classNames.trafficBodyCell} ${classNames.trafficFirstCell} ${levelClassName}`,
  };
}

export function buildTrafficGoodsFirstCellProps(
  classNames: DashboardTrafficTableClassNames,
  row: DashboardTrafficGoodsTreeNode
) {
  const levelClassName =
    row.sourceLevel <= 0
      ? classNames.trafficGoodsFirstCellSummary
      : row.sourceLevel === 1
        ? classNames.trafficGoodsFirstCellL1
        : row.sourceLevel === 2
          ? classNames.trafficGoodsFirstCellL2
          : classNames.trafficGoodsFirstCellL3;
  return {
    className: `${classNames.trafficBodyCell} ${classNames.trafficFirstCell} ${levelClassName}`,
  };
}

export function renderTrafficMetricCell({
  metric,
  format,
  digits = 2,
  classNames,
}: {
  metric: DashboardTrafficMetricTriplet;
  format: TrafficMetricFormat;
  digits?: number;
  classNames: DashboardTrafficTableClassNames;
}) {
  return (
    <div className={classNames.trafficMetricCell}>
      <div className={classNames.trafficMetricValue}>
        {formatTrafficMetricCurrentValue(metric, format, digits)}
      </div>
      <div className={classNames.trafficMetricMeta}>
        <span className={classNames.trafficMetricMetaLabel}>较上周期</span>
        <span
          className={`${classNames.trafficMetricTrend} ${getTrendClassNameByRate(metric.wow, classNames)}`}
        >
          {formatSignedRatePercent(metric.wow, 0)}
        </span>
      </div>
    </div>
  );
}

export function renderTrafficSourceCell({
  row,
  classNames,
}: {
  row: DashboardTrafficTreeNode;
  classNames: DashboardTrafficTableClassNames;
}) {
  return (
    <div className={classNames.trafficSourceCell}>
      <span
        className={`${classNames.trafficLevelBadge} ${
          row.sourceLevel <= 1
            ? classNames.trafficLevelBadgeL1
            : row.sourceLevel === 2
              ? classNames.trafficLevelBadgeL2
              : classNames.trafficLevelBadgeL3
        }`}
      >
        {`L${row.sourceLevel}`}
      </span>
      <div className={classNames.trafficSourceTextWrap}>
        <span className={classNames.trafficSourceName} title={row.sourceName}>
          {row.sourceName}
        </span>
      </div>
    </div>
  );
}

export function renderTrafficGoodsSourceCell({
  row,
  classNames,
}: {
  row: DashboardTrafficGoodsTreeNode;
  classNames: DashboardTrafficTableClassNames;
}) {
  return (
    <div className={classNames.trafficSourceCell}>
      <span
        className={`${classNames.trafficLevelBadge} ${
          row.sourceLevel <= 0
            ? classNames.trafficLevelBadgeSummary
            : row.sourceLevel <= 1
              ? classNames.trafficLevelBadgeL1
              : row.sourceLevel === 2
                ? classNames.trafficLevelBadgeL2
                : classNames.trafficLevelBadgeL3
        }`}
      >
        {row.sourceLevel <= 0 ? 'SUM' : `L${row.sourceLevel}`}
      </span>
      {row.sourceLevel <= 0 ? (
        <div className={classNames.trafficGoodsProductCell}>
          <span
            className={`${classNames.trafficGoodsProductName} ${classNames.trafficGoodsProductNameSummary}`}
            title={row.productName}
          >
            {row.productName || '(未命名商品)'}
          </span>
          <span className={classNames.trafficGoodsProductId} title={row.productId}>
            {row.productId}
          </span>
        </div>
      ) : (
        <div className={classNames.trafficSourceTextWrap}>
          <span className={classNames.trafficSourceName} title={row.sourceName}>
            {row.sourceName}
          </span>
        </div>
      )}
    </div>
  );
}

export function renderGoodsCardTrafficSourceCell({
  row,
  classNames,
}: {
  row: DashboardGoodsCardTrafficTreeNode;
  classNames: DashboardTrafficTableClassNames;
}) {
  return (
    <div className={classNames.trafficSourceCell}>
      <span
        className={`${classNames.trafficLevelBadge} ${
          row.sourceLevel <= 0
            ? classNames.trafficLevelBadgeSummary
            : row.sourceLevel === 1
              ? classNames.trafficLevelBadgeL1
              : row.sourceLevel === 2
                ? classNames.trafficLevelBadgeL2
                : classNames.trafficLevelBadgeL3
        }`}
      >
        {row.sourceLevel <= 0 ? 'SUM' : `L${row.sourceLevel}`}
      </span>
      <div className={classNames.trafficSourceTextWrap}>
        <span className={classNames.trafficSourceName} title={row.sourceName}>
          {row.sourceName}
        </span>
      </div>
    </div>
  );
}
