export function formatSampleInventoryTimestamp(
  value?: string | null,
  unknownLabel = "--",
): string {
  if (!value) return unknownLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function normalizeSampleInventoryOptionalText(
  value?: string,
): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
