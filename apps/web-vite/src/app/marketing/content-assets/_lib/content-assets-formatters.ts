export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null) return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return Math.round(numeric).toLocaleString('zh-CN');
}

export function formatBytes(value: number | null | undefined): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = numeric;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  const numeric = Number(seconds);
  if (!Number.isFinite(numeric) || numeric <= 0) return '--';
  const total = Math.round(numeric);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function formatSrtTextForDisplay(value: string | null | undefined): string {
  const text = (value || '').trim();
  if (!text) return '';
  return text
    .split(/\r?\n/)
    .map((line) => (line.includes('-->') ? line.replace(/\b(\d{2}:\d{2}:\d{2}),000\b/g, '$1') : line))
    .join('\n');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null) return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return `${(numeric * 100).toFixed(digits)}%`;
}

export function formatRatio(value: number | null | undefined): string {
  if (value == null) return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return numeric.toFixed(2);
}
