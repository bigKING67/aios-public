export function formatInteger(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }

  return Math.round(value).toLocaleString('zh-CN');
}

export function formatCurrencyCompact(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }

  const sign = value < 0 ? '-' : '';
  const absValue = Math.abs(value);

  if (absValue >= 10_000) {
    return `${sign}¥${(absValue / 10_000).toFixed(2)}万`;
  }

  return `${sign}¥${absValue.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function formatSignedCurrency(value?: number): string {
  if (!Number.isFinite(value)) {
    return '--';
  }
  const finiteValue = value as number;
  const sign = finiteValue > 0 ? '+' : '';
  return `${sign}${formatCurrencyCompact(finiteValue)}`;
}

export function formatRatioPercent(value?: number, digits = 0): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }
  const percentValue = value * 100;
  return `${percentValue.toFixed(digits)}%`;
}

export function formatSignedPercent(value?: number, digits = 0): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

export function formatContributionTag(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '';
  }
  const rounded = Math.round(Math.abs(value));
  if (rounded === 0) {
    return '0%';
  }
  const sign = value > 0 ? '+' : '-';
  return `${sign}${rounded}%`;
}

export function formatDecimal(value?: number, digits = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }
  return value.toFixed(digits);
}

export function formatCurrencyFixed(value?: number, digits = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }
  const sign = value < 0 ? '-' : '';
  const absValue = Math.abs(value);
  return `${sign}¥${absValue.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}
