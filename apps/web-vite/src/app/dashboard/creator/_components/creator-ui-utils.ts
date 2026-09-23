export type CreatorMetricValueSize = 'regular' | 'medium' | 'compact';

export const CREATOR_LEVEL_DETAIL_PAGE_SIZE = 8;

export interface CreatorMatchStatusTagMeta {
  label: string;
  color?: 'success' | 'warning' | 'processing';
}

export function resolveMetricValueSize(value: string): CreatorMetricValueSize {
  const normalized = value.replace(/\s+/g, '');
  if (normalized.length >= 12) {
    return 'compact';
  }

  if (normalized.length >= 8) {
    return 'medium';
  }

  return 'regular';
}

export function resolveCreatorMatchStatusTagMeta(
  value: string,
  statusMap: Readonly<Record<string, CreatorMatchStatusTagMeta>>,
  fallback: CreatorMatchStatusTagMeta
): CreatorMatchStatusTagMeta {
  return statusMap[value] ?? fallback;
}
