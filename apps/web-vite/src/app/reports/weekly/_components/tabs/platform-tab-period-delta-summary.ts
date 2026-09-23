import {
  formatCurrencyCompact,
  formatSignedCurrency,
} from './platform-tab-formatters';

interface FormatPeriodDeltaSummaryParams {
  prefix?: string;
  previousValue: number | undefined;
  currentValue: number | undefined;
  deltaValue: number;
  previousLabel?: string;
  currentLabel?: string;
  deltaLabel?: string;
}

export function formatPeriodDeltaSummary({
  prefix,
  previousValue,
  currentValue,
  deltaValue,
  previousLabel = '上周同期',
  currentLabel = '本周同期',
  deltaLabel = '总增量',
}: FormatPeriodDeltaSummaryParams) {
  const summary = [
    `${previousLabel}：${formatCurrencyCompact(previousValue)}`,
    `${currentLabel}：${formatCurrencyCompact(currentValue)}`,
    `${deltaLabel}：${formatSignedCurrency(deltaValue)}`,
  ].join(' ｜ ');

  return prefix ? `${prefix}｜${summary}` : summary;
}
