export type NumericInput = number | string | null | undefined;

export function toNumber(value: NumericInput): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toNullableNumber(value: NumericInput): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateCreatorGsv(grossAmount: NumericInput, refundAmount: NumericInput): number {
  return toNumber(grossAmount) - toNumber(refundAmount);
}

export function formatCurrency(value: NumericInput, digits = 2): string {
  const parsed = toNullableNumber(value);
  if (parsed === null) {
    return '--';
  }

  return `¥${parsed.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatCreatorCurrencyCell(value: NumericInput): string {
  return formatCurrency(value, 2);
}

export function formatCompactCurrency(value: number): string {
  if (value >= 100_000_000) {
    return `¥${(value / 100_000_000).toFixed(2)}亿`;
  }

  if (value >= 10_000) {
    return `¥${(value / 10_000).toFixed(2)}万`;
  }

  return `¥${value.toLocaleString('zh-CN', {
    maximumFractionDigits: 0,
  })}`;
}

export function formatInteger(value: NumericInput): string {
  const parsed = toNullableNumber(value);
  if (parsed === null) {
    return '--';
  }

  return Math.round(parsed).toLocaleString('zh-CN');
}

export function formatCreatorIntegerCell(value: NumericInput): string {
  return formatInteger(value);
}

export function formatRate(value: NumericInput, digits = 2): string {
  const parsed = toNullableNumber(value);
  if (parsed === null) {
    return '--';
  }

  return `${(parsed * 100).toFixed(digits)}%`;
}

export function formatCreatorRateCell(value: NumericInput): string {
  return formatRate(value, 2);
}

export function escapeTooltipHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatTooltipCurrency(value: NumericInput): string {
  return formatCurrency(value, 2).replace('¥', '¥ ');
}

export function formatCreatorTextFallback(value: string | null | undefined): string {
  return value || '--';
}

export function formatCreatorTextCell(value: string | null | undefined): string {
  return formatCreatorTextFallback(value);
}

export function formatCsvNumber(value: NumericInput, digits?: number): string {
  const parsed = toNullableNumber(value);
  if (parsed === null) {
    return '';
  }

  if (typeof digits === 'number') {
    return parsed.toFixed(digits);
  }

  return String(parsed);
}

export function formatCsvRate(value: NumericInput): string {
  const parsed = toNullableNumber(value);
  if (parsed === null) {
    return '';
  }

  return `${(parsed * 100).toFixed(2)}%`;
}
