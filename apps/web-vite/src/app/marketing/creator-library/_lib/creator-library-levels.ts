const CANONICAL_ANCHOR_LEVELS = [
  'S-超头部',
  'A-头部',
  'B-肩部',
  'C-中腰部',
  'D-尾部',
] as const;

export type CreatorAnchorLevelTone = 's' | 'a' | 'b' | 'c' | 'd' | 'unknown';

export function normalizeCreatorAnchorLevel(value?: string | null): string | undefined {
  const raw = value?.trim().replace(/\uFEFF/g, '');
  if (!raw) {
    return undefined;
  }

  const compact = raw
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s+/g, '')
    .toUpperCase();

  if (compact.includes('超头')) {
    return 'S-超头部';
  }
  if (compact.includes('中腰') || compact.includes('腰部')) {
    return 'C-中腰部';
  }
  if (compact.includes('肩部')) {
    return 'B-肩部';
  }
  if (compact.includes('尾部')) {
    return 'D-尾部';
  }
  if (compact.includes('头部')) {
    return 'A-头部';
  }

  if (compact === 'S' || compact.startsWith('S-')) {
    return 'S-超头部';
  }
  if (compact === 'A' || compact.startsWith('A-')) {
    return 'A-头部';
  }
  if (compact === 'B' || compact.startsWith('B-')) {
    return 'B-肩部';
  }
  if (compact === 'C' || compact.startsWith('C-')) {
    return 'C-中腰部';
  }
  if (compact === 'D' || compact.startsWith('D-')) {
    return 'D-尾部';
  }

  return raw.replace(/（/g, '(').replace(/）/g, ')');
}

export function resolveCreatorAnchorLevelTone(value?: string | null): CreatorAnchorLevelTone {
  const normalized = normalizeCreatorAnchorLevel(value);
  if (!normalized) {
    return 'unknown';
  }
  if (normalized.startsWith('S')) {
    return 's';
  }
  if (normalized.startsWith('A')) {
    return 'a';
  }
  if (normalized.startsWith('B')) {
    return 'b';
  }
  if (normalized.startsWith('C')) {
    return 'c';
  }
  if (normalized.startsWith('D')) {
    return 'd';
  }
  return 'unknown';
}

export function formatCreatorAnchorLevel(value?: string | null): string {
  return normalizeCreatorAnchorLevel(value) ?? '--';
}

export function buildCreatorAnchorLevelOptions(values?: string[]) {
  const seen = new Set<string>();
  const normalizedValues = (values ?? [])
    .map((value) => normalizeCreatorAnchorLevel(value))
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });

  const canonicalSet = new Set(CANONICAL_ANCHOR_LEVELS);
  const customValues = normalizedValues
    .filter((value) => !canonicalSet.has(value as (typeof CANONICAL_ANCHOR_LEVELS)[number]))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'));

  return [...CANONICAL_ANCHOR_LEVELS, ...customValues].map((value) => ({
    label: value,
    value,
  }));
}
