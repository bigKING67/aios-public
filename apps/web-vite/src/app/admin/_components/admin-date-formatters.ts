const ADMIN_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function formatAdminDateTime(value?: string | null): string {
  if (!value) {
    return '-';
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return '-';
  }

  return ADMIN_DATE_TIME_FORMATTER.format(new Date(timestamp));
}
