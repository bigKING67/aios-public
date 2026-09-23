import {
  formatCurrencyCompact,
  formatDateText,
  formatSignedCurrency,
} from './platform-tab-formatters';

interface FormatAttributionSummaryParams {
  asOfDate: string | undefined;
  previousValue: number;
  currentValue: number;
  deltaValue: number;
}

export function formatAttributionSummary({
  asOfDate,
  previousValue,
  currentValue,
  deltaValue,
}: FormatAttributionSummaryParams) {
  return [
    `同期口径截止：${formatDateText(asOfDate)}`,
    `上周同期：${formatCurrencyCompact(previousValue)}`,
    `本周同期：${formatCurrencyCompact(currentValue)}`,
    `总增量：${formatSignedCurrency(deltaValue)}`,
  ].join(' ｜ ');
}
