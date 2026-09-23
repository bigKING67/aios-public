import type {
  CreatorLibraryFilterOptions,
  CreatorLibraryItem,
} from '../_lib/creator-library-types';
import {
  normalizeCreatorTagList,
  resolveCreatorDisplayTags,
} from '../_lib/creator-library-tags';

export const EMPTY_CREATOR_LIBRARY_FILTER_OPTIONS: CreatorLibraryFilterOptions = {
  platforms: [],
  categories: [],
  anchorTags: [],
  anchorLevels: [],
  cooperationStatuses: [],
  owners: [],
  bdUsers: [],
  sourceTypes: [],
};

export function mergeCreatorFilterOptions(
  filterOptions: CreatorLibraryFilterOptions,
  items: CreatorLibraryItem[]
): CreatorLibraryFilterOptions {
  return {
    ...filterOptions,
    bdUsers: filterOptions.bdUsers ?? [],
    anchorTags: mergeUniqueTextOptions(
      filterOptions.anchorTags,
      items.flatMap((item) => resolveCreatorDisplayTags(item))
    ),
  };
}

export function normalizeCreatorFilterOptions(
  filterOptions: CreatorLibraryFilterOptions
): CreatorLibraryFilterOptions {
  return {
    ...filterOptions,
    platforms: filterOptions.platforms ?? [],
    categories: filterOptions.categories ?? [],
    anchorTags: normalizeCreatorTagList(filterOptions.anchorTags),
    anchorLevels: filterOptions.anchorLevels ?? [],
    cooperationStatuses: filterOptions.cooperationStatuses ?? [],
    owners: filterOptions.owners ?? [],
    bdUsers: filterOptions.bdUsers ?? [],
    sourceTypes: filterOptions.sourceTypes ?? [],
  };
}

function mergeUniqueTextOptions(
  primary: string[] | null | undefined,
  fallback: string[] | null | undefined
): string[] {
  const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
  const seen = new Set<string>();
  const result: string[] = [];
  [
    ...normalizeCreatorTagList(primary),
    ...normalizeCreatorTagList(fallback),
  ].forEach((value) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  });
  return result.sort((left, right) => collator.compare(left, right));
}
