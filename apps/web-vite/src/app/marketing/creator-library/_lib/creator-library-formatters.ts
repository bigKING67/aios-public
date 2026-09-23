export function formatInteger(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  return Math.round(value).toLocaleString('zh-CN');
}

export function formatCompactNumber(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--';
  }
  if (Math.abs(value) >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)}亿`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${(value / 10_000).toFixed(1)}万`;
  }
  return formatInteger(value);
}

export function formatFanCountWanText(raw?: string | null, count?: number | null): string {
  const rawWanValue = parseFanRawTextAsWanValue(raw);
  if (rawWanValue !== null) {
    return formatWanValue(rawWanValue);
  }

  if (count === null || count === undefined || !Number.isFinite(count)) {
    return '--';
  }
  return formatWanValue(count / 10_000);
}

export function formatCurrencyText(raw?: string | null, amount?: number | null): string {
  if (raw && raw.trim()) {
    return raw.trim();
  }
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '--';
  }
  if (Math.abs(amount) >= 100_000_000) {
    return `¥${(amount / 100_000_000).toFixed(2)}亿`;
  }
  if (Math.abs(amount) >= 10_000) {
    return `¥${(amount / 10_000).toFixed(2)}万`;
  }
  return `¥${amount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

export function formatOptionalText(value?: string | null): string {
  return value?.trim() || '--';
}

export function formatDateText(value?: string | null): string {
  if (!value) {
    return '--';
  }
  return value.slice(0, 10).replace(/-/g, '/');
}

export function formatDateTimeText(value?: string | null): string {
  if (!value) {
    return '--';
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return '--';
  }

  const localDateTimeMatch = normalizedValue.match(
    /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T\s]+(\d{2}):(\d{2}))?/
  );
  if (localDateTimeMatch) {
    const [, year, month, day, hour, minute] = localDateTimeMatch;
    const dateText = [year, month, day].join('/');
    return hour && minute ? `${dateText} ${hour}:${minute}` : dateText;
  }

  const [datePart, timePart] = normalizedValue.replace('T', ' ').split(' ');
  const normalizedDate = datePart.slice(0, 10).replace(/-/g, '/');
  const normalizedTime = (timePart || '').slice(0, 5);
  return normalizedTime ? `${normalizedDate} ${normalizedTime}` : normalizedDate;
}

export function parseBooleanText(value?: string): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (['是', '可合作', 'true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['否', '不可合作', 'false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return undefined;
}

export function normalizeDateInput(value?: string): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  const dashed = normalized.replace(/\//g, '-');
  return /^\d{4}-\d{2}-\d{2}$/.test(dashed) ? dashed : undefined;
}

function parseFanRawTextAsWanValue(raw?: string | null): number | null {
  const rawText = raw?.trim();
  if (!rawText || rawText === '--') {
    return null;
  }

  const normalized = rawText.replace(/,/g, '').replace(/\s+/g, '');
  const numericMatch = normalized.match(/[-+]?\d+(?:\.\d+)?/);
  if (!numericMatch) {
    return null;
  }

  const numericValue = Number.parseFloat(numericMatch[0]);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const lowerText = normalized.toLowerCase();
  if (lowerText.includes('亿') || lowerText.includes('bn')) {
    return numericValue * 10_000;
  }
  if (lowerText.includes('万') || lowerText.includes('w')) {
    return numericValue;
  }
  if (lowerText.includes('千') || lowerText.includes('k')) {
    return numericValue / 10;
  }

  return Math.abs(numericValue) >= 10_000 ? numericValue / 10_000 : numericValue;
}

function formatWanValue(value: number): string {
  if (!Number.isFinite(value)) {
    return '--';
  }
  return `${value.toFixed(1).replace(/\.0$/, '')}w`;
}
