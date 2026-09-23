import type { CreatorLibraryItem } from './creator-library-types';

const CREATOR_TAG_ALIAS_GROUPS: Array<readonly [string, readonly string[]]> = [
  // 只合并确定同义词；不把穿搭/女装/美妆/彩妆等业务子类折叠成大类。
  ['服饰主播', ['服饰', '服装']],
];

const CREATOR_TAG_ALIAS_MAP = buildCreatorTagAliasMap();

export function normalizeCreatorTagList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];
  value.forEach((item) => {
    if (typeof item !== 'string') {
      return;
    }
    const normalized = normalizeCreatorTagText(item);
    const key = normalizeCreatorTagKey(normalized);
    if (!normalized || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(normalized);
  });

  return result.slice(0, 20);
}

export function getCreatorItemTags(
  item: Pick<CreatorLibraryItem, 'tags'>
): string[] {
  return normalizeCreatorTagList(item.tags);
}

export function splitCreatorTagText(value?: string | null): string[] {
  return normalizeCreatorTagList((value || '').split(/[，,、/;；]+/));
}

export function resolveCreatorDisplayTags(
  item: Pick<CreatorLibraryItem, 'tags' | 'anchorDesc'>
): string[] {
  const tags = getCreatorItemTags(item);
  return tags.length ? tags : splitCreatorTagText(item.anchorDesc);
}

export function normalizeCreatorTagText(value?: string | null): string {
  const trimmed = (value || '').trim().replace(/\s+/g, '');
  if (!trimmed) {
    return '';
  }

  const normalizedRole = normalizeCreatorTagRoleSuffix(trimmed);
  const key = normalizeCreatorTagKey(normalizedRole);
  return CREATOR_TAG_ALIAS_MAP.get(key) ?? normalizedRole;
}

export function normalizeCreatorTagKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .toLocaleLowerCase('zh-CN');
}

function buildCreatorTagAliasMap(): Map<string, string> {
  const aliasMap = new Map<string, string>();
  CREATOR_TAG_ALIAS_GROUPS.forEach(([canonical, aliases]) => {
    const canonicalVariants = [
      canonical,
      canonical.replace(/主播$/, ''),
      `${canonical.replace(/主播$/, '')}类`,
      `${canonical.replace(/主播$/, '')}达人`,
      `${canonical.replace(/主播$/, '')}类主播`,
      `${canonical.replace(/主播$/, '')}类达人`,
    ];
    [...canonicalVariants, ...aliases.flatMap((alias) => [
      alias,
      `${alias}类`,
      `${alias}主播`,
      `${alias}达人`,
      `${alias}类主播`,
      `${alias}类达人`,
      `${alias}垂类主播`,
      `${alias}垂类达人`,
    ])].forEach((alias) => {
      aliasMap.set(normalizeCreatorTagKey(alias), canonical);
    });
  });
  return aliasMap;
}

function normalizeCreatorTagRoleSuffix(value: string): string {
  return value.replace(/(?:垂类|类)主播$/, '主播');
}
