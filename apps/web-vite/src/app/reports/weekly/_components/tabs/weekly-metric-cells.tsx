import {
  formatCurrencyFixed,
  formatSignedPercent,
} from './platform-tab-formatters';
import { mergeWeeklyClassNames } from './weekly-class-names';
import styles from './weekly-table.module.css';

type TrendClassNameResolver = (value: number | undefined) => string;

export interface WeeklyRawMetricTrendCellProps {
  value: string;
  changePercent: number | undefined;
  resolveTrendClassName: TrendClassNameResolver;
}

export function WeeklyRawMetricTrendCell({
  value,
  changePercent,
  resolveTrendClassName,
}: WeeklyRawMetricTrendCellProps) {
  return (
    <>
      <div className={styles.goodsMetricValue}>{value}</div>
      <div className={styles.goodsMetricMeta}>
        <span>同期环比</span>
        <span
          className={mergeWeeklyClassNames(
            resolveTrendClassName(changePercent),
            styles.goodsMetricTrend
          )}
        >
          {formatSignedPercent(changePercent, 0)}
        </span>
      </div>
    </>
  );
}

export interface WeeklyCurrencyTrendCellProps {
  currentValue: number;
  changePercent: number | undefined;
  resolveTrendClassName: TrendClassNameResolver;
}

export function WeeklyCurrencyTrendCell({
  currentValue,
  changePercent,
  resolveTrendClassName,
}: WeeklyCurrencyTrendCellProps) {
  return (
    <WeeklyRawMetricTrendCell
      value={formatCurrencyFixed(currentValue, 2)}
      changePercent={changePercent}
      resolveTrendClassName={resolveTrendClassName}
    />
  );
}
