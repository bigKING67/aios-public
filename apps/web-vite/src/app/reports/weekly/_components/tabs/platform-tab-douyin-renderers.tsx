import {
  calcChangePercent,
  formatInteger,
} from './platform-tab-formatters';
import { renderWeeklyCurrencyTrendCell } from './platform-tab-column-cells';

export type TrendClassNameResolver = (value: number | undefined) => string;

export function renderDouyinMetricTrend(
  currentValue: number,
  previousValue: number,
  resolveTrendClassName: TrendClassNameResolver
) {
  const changeRate = calcChangePercent(currentValue, previousValue);

  return renderWeeklyCurrencyTrendCell(
    currentValue,
    changeRate,
    resolveTrendClassName
  );
}

export function renderDouyinTextWithTitle(value: string) {
  return <span title={value}>{value}</span>;
}

export function renderDouyinAccountName(value: string, accountId: string) {
  return <span title={`${value}（${accountId}）`}>{value}</span>;
}

export function formatDouyinDurationMinutes(value: number) {
  return `${formatInteger(value)} 分钟`;
}
