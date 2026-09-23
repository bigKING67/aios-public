import { formatCurrencyFixed } from './platform-tab-formatters';

export function formatCurrencyWithTwoDecimals(value: number): string {
  return formatCurrencyFixed(value, 2);
}
