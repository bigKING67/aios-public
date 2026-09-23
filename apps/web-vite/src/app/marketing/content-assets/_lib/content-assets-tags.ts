const MAX_CONTENT_ASSET_TAGS = 20;
const MAX_CONTENT_ASSET_TAG_LENGTH = 40;

export function normalizeContentAssetTagList(
  value: unknown,
  maxCount = MAX_CONTENT_ASSET_TAGS
): string[] {
  const rawItems = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const result: string[] = [];

  rawItems.forEach((item) => {
    if (typeof item !== 'string') {
      return;
    }
    const normalized = normalizeContentAssetTagText(item);
    const key = normalizeContentAssetTagKey(normalized);
    if (!normalized || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(normalized);
  });

  return result.slice(0, maxCount);
}

export function splitContentAssetTagText(value?: string | null): string[] {
  if (!value) {
    return [];
  }
  return normalizeContentAssetTagList(value.split(/[，,、/;；\n]+/));
}

export function normalizeContentAssetTagText(value?: string | null): string {
  const normalized = (value || '').trim().replace(/\s+/g, ' ');
  return normalized.slice(0, MAX_CONTENT_ASSET_TAG_LENGTH);
}

export function normalizeContentAssetTagKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .toLocaleLowerCase('zh-CN');
}

export function findExistingContentAssetTag(rawTag: string, options: string[]): string {
  const rawKey = normalizeContentAssetTagKey(normalizeContentAssetTagText(rawTag));
  if (!rawKey) {
    return '';
  }
  return options.find((option) => normalizeContentAssetTagKey(option) === rawKey) || '';
}

export function mergeContentAssetTagOptions(options: string[], selectedTags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  [...selectedTags, ...options].forEach((tag) => {
    const normalized = normalizeContentAssetTagText(tag);
    const key = normalizeContentAssetTagKey(normalized);
    if (!normalized || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(normalized);
  });
  return result;
}
