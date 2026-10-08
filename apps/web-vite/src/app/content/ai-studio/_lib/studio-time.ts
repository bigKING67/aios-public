/** `MM/DD HH:mm` in the viewer's locale for run and batch lists; the raw value when unparsable. */
export function formatShortTimestamp(value: string | null): string {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
