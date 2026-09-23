export type NumericInput = number | string | null;
export type LiveDetailMetricFormat = 'integer' | 'number' | 'rate';

export function toCompactNumber(value: number): string {
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)}亿`;
  }
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(2)}万`;
  }
  if (value >= 1_000) {
    return Math.round(value).toLocaleString('zh-CN');
  }
  return value.toLocaleString('zh-CN');
}

export function toIntegerNumber(value: number): string {
  return Math.round(value).toLocaleString('zh-CN');
}

export function escapeCsvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function formatCsvNumber(value: NumericInput, digits?: number): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }

  if (typeof digits === 'number') {
    return parsed.toFixed(digits);
  }

  return String(parsed);
}

export function formatCsvInteger(value: NumericInput): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }

  return String(Math.round(parsed));
}

export function formatCsvRate(value: NumericInput): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }

  return `${(parsed * 100).toFixed(2)}%`;
}

export function formatTableNumber(value: NumericInput, digits = 2): string {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return '--';
  }

  return parsed.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatTableInteger(value: NumericInput): string {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return '--';
  }

  return Math.round(parsed).toLocaleString('zh-CN');
}

export function formatTableRate(value: NumericInput): string {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return '--';
  }

  return `${(parsed * 100).toFixed(2)}%`;
}

export function formatLiveDetailMetricValue(
  value: NumericInput,
  format: LiveDetailMetricFormat,
  digits = 2,
): string {
  if (format === 'integer') {
    return formatTableInteger(value);
  }
  if (format === 'rate') {
    return formatTableRate(value);
  }
  return formatTableNumber(value, digits);
}

export function formatSignedRatePercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }

  const percent = value * 100;
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(digits)}%`;
}

export function formatCompactWanInteger(value: NumericInput): string {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return '--';
  }

  if (Math.abs(parsed) >= 10_000) {
    return `${(parsed / 10_000).toFixed(2)}万`;
  }

  return Math.round(parsed).toLocaleString('zh-CN');
}

export function formatCompactWanCurrency(value: NumericInput): string {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return '--';
  }

  if (Math.abs(parsed) >= 10_000) {
    return `¥${(parsed / 10_000).toFixed(2)}万`;
  }

  return `¥${Math.round(parsed).toLocaleString('zh-CN')}`;
}
