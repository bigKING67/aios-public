export function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

export function formatTokenPreview(value: string, prefixLength: number = 12): string {
  const normalized = value.trim();
  if (!normalized) {
    return '-';
  }

  if (normalized.length <= prefixLength + 4) {
    return normalized;
  }

  return `${normalized.slice(0, prefixLength)}…${normalized.slice(-4)}`;
}

export function buildStableRetryReasonToken(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return 'empty';
  }

  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function matchesKeyword(keyword: string, target: string): boolean {
  if (!keyword) {
    return true;
  }
  return normalizeText(target).includes(keyword);
}

export function joinTableList(values: string[]): string {
  if (!values.length) {
    return '-';
  }

  if (values.length <= 2) {
    return values.join(' / ');
  }

  return `${values.slice(0, 2).join(' / ')} 等 ${values.length} 张`;
}

export function toTimestamp(value?: string): number {
  if (!value) {
    return 0;
  }

  const normalized = value.trim();
  if (!normalized) {
    return 0;
  }

  const asISO = normalized.includes('T')
    ? normalized
    : /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(normalized)
      ? `${normalized.replace(' ', 'T')}:00+08:00`
      : normalized;

  const date = new Date(asISO);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function formatDateTime(value?: string): string {
  if (!value) {
    return '-';
  }

  const timestamp = toTimestamp(value);
  if (!timestamp) {
    return value;
  }

  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

export function truncateText(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(maxLength - 1, 1))}…`;
}

export function escapeCsvCell(value: string | number | boolean): string {
  const normalized = String(value);
  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}
