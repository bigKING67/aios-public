import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { formatInteger } from './creator-formatters';

export interface CreatorFilterOptionCell {
  label: string;
  value: string;
}

type CreatorDetailFilterCellItem = string | CreatorFilterOptionCell;
type CreatorDetailFilterCell = CreatorDetailFilterCellItem | readonly CreatorDetailFilterCellItem[];

export interface CreatorDetailFilterRowBase {
  creator?: CreatorDetailFilterCell;
  cooperationStatus: CreatorDetailFilterCell;
  owner: CreatorDetailFilterCell;
  platform: CreatorDetailFilterCell;
}

export interface CreatorFilterOption {
  label: string;
  value: string;
}

interface CreatorDetailFilterValues {
  filterCreator?: string;
  filterCooperationStatus?: string;
  filterOwner?: string;
  filterPlatform?: string;
}

export interface CreatorDetailFilterState extends CreatorDetailFilterValues {
  setFilterCreator: Dispatch<SetStateAction<string | undefined>>;
  setFilterCooperationStatus: Dispatch<SetStateAction<string | undefined>>;
  setFilterOwner: Dispatch<SetStateAction<string | undefined>>;
  setFilterPlatform: Dispatch<SetStateAction<string | undefined>>;
  clearFilterCreator: () => void;
  clearFilterCooperationStatus: () => void;
  clearFilterOwner: () => void;
  clearFilterPlatform: () => void;
  hasActiveDetailFilters: boolean;
  resetDetailFilters: () => void;
}

export interface UseCreatorDetailFilterOptionsParams<TRow extends CreatorDetailFilterRowBase> {
  rows: readonly TRow[];
  filteredCount: number;
  totalCount: number;
  cooperationStatusOrder: readonly string[];
  platformPriorityOrder: readonly string[];
  filters: CreatorDetailFilterState;
}

export interface UseCreatorDetailFilterOptionsResult {
  creatorFilterOptions: CreatorFilterOption[];
  cooperationStatusFilterOptions: CreatorFilterOption[];
  ownerFilterOptions: CreatorFilterOption[];
  platformFilterOptions: CreatorFilterOption[];
  detailFilterCountText: string;
}

export function useCreatorDetailFilters(): CreatorDetailFilterState {
  const [filterCreator, setFilterCreator] = useState<string | undefined>(undefined);
  const [filterCooperationStatus, setFilterCooperationStatus] = useState<string | undefined>(undefined);
  const [filterOwner, setFilterOwner] = useState<string | undefined>(undefined);
  const [filterPlatform, setFilterPlatform] = useState<string | undefined>(undefined);
  const clearFilterCreator = useCallback(() => setFilterCreator(undefined), []);
  const clearFilterCooperationStatus = useCallback(() => setFilterCooperationStatus(undefined), []);
  const clearFilterOwner = useCallback(() => setFilterOwner(undefined), []);
  const clearFilterPlatform = useCallback(() => setFilterPlatform(undefined), []);
  const resetDetailFilters = useCallback(() => {
    clearFilterCreator();
    clearFilterCooperationStatus();
    clearFilterOwner();
    clearFilterPlatform();
  }, [clearFilterCooperationStatus, clearFilterCreator, clearFilterOwner, clearFilterPlatform]);

  return {
    filterCreator,
    setFilterCreator,
    filterCooperationStatus,
    setFilterCooperationStatus,
    filterOwner,
    setFilterOwner,
    filterPlatform,
    setFilterPlatform,
    clearFilterCreator,
    clearFilterCooperationStatus,
    clearFilterOwner,
    clearFilterPlatform,
    hasActiveDetailFilters: Boolean(filterCreator || filterCooperationStatus || filterOwner || filterPlatform),
    resetDetailFilters,
  };
}

export function useCreatorDetailFilterOptions<TRow extends CreatorDetailFilterRowBase>({
  rows,
  filteredCount,
  totalCount,
  cooperationStatusOrder,
  platformPriorityOrder,
  filters,
}: UseCreatorDetailFilterOptionsParams<TRow>): UseCreatorDetailFilterOptionsResult {
  const {
    filterCreator,
    filterCooperationStatus,
    filterOwner,
    filterPlatform,
    clearFilterCreator,
    clearFilterCooperationStatus,
    clearFilterOwner,
    clearFilterPlatform,
    hasActiveDetailFilters,
  } = filters;

  const creatorFilterOptions = useMemo(() => {
    return buildCreatorNameFilterOptions(rows, {
      filterCooperationStatus,
      filterOwner,
      filterPlatform,
    });
  }, [filterCooperationStatus, filterOwner, filterPlatform, rows]);

  const cooperationStatusFilterOptions = useMemo(() => {
    return buildCreatorCooperationStatusFilterOptions(
      rows,
      { filterCreator, filterOwner, filterPlatform },
      cooperationStatusOrder
    );
  }, [cooperationStatusOrder, filterCreator, filterOwner, filterPlatform, rows]);

  const ownerFilterOptions = useMemo(() => {
    return buildCreatorOwnerFilterOptions(rows, {
      filterCreator,
      filterCooperationStatus,
      filterPlatform,
    });
  }, [filterCooperationStatus, filterCreator, filterPlatform, rows]);

  const platformFilterOptions = useMemo(() => {
    return buildCreatorPlatformFilterOptions(
      rows,
      { filterCreator, filterCooperationStatus, filterOwner },
      platformPriorityOrder
    );
  }, [filterCooperationStatus, filterCreator, filterOwner, platformPriorityOrder, rows]);

  useCreatorFilterOptionPruning(filterCreator, creatorFilterOptions, clearFilterCreator);
  useCreatorFilterOptionPruning(filterCooperationStatus, cooperationStatusFilterOptions, clearFilterCooperationStatus);
  useCreatorFilterOptionPruning(filterOwner, ownerFilterOptions, clearFilterOwner);
  useCreatorFilterOptionPruning(filterPlatform, platformFilterOptions, clearFilterPlatform);

  const detailFilterCountText = useMemo(() => {
    return formatCreatorDetailFilterCountText(filteredCount, totalCount, hasActiveDetailFilters);
  }, [filteredCount, hasActiveDetailFilters, totalCount]);

  return {
    creatorFilterOptions,
    cooperationStatusFilterOptions,
    ownerFilterOptions,
    platformFilterOptions,
    detailFilterCountText,
  };
}

export interface CreatorDetailFilterRowWithSource<TRow> extends CreatorDetailFilterRowBase {
  row: TRow;
}

interface BuildCreatorDetailFilterRowsParams<TRow> {
  rows: readonly TRow[];
  resolveCreator?: (row: TRow) => CreatorDetailFilterCell;
  resolveCooperationStatus: (row: TRow) => CreatorDetailFilterCell;
  resolveOwner: (row: TRow) => CreatorDetailFilterCell;
  resolvePlatform: (row: TRow) => CreatorDetailFilterCell;
}

export function buildCreatorDetailFilterRows<TRow>({
  rows,
  resolveCreator,
  resolveCooperationStatus,
  resolveOwner,
  resolvePlatform,
}: BuildCreatorDetailFilterRowsParams<TRow>): CreatorDetailFilterRowWithSource<TRow>[] {
  return rows.map((row) => ({
    row,
    ...(resolveCreator ? { creator: resolveCreator(row) } : {}),
    cooperationStatus: resolveCooperationStatus(row),
    owner: resolveOwner(row),
    platform: resolvePlatform(row),
  }));
}

export function filterCreatorDetailRows<TRow>(
  rows: readonly CreatorDetailFilterRowWithSource<TRow>[],
  filters: CreatorDetailFilterValues
): TRow[] {
  return rows
    .filter((item) => {
      if (filters.filterCreator && !filterCellIncludes(item.creator, filters.filterCreator)) {
        return false;
      }
      if (filters.filterCooperationStatus && !filterCellIncludes(item.cooperationStatus, filters.filterCooperationStatus)) {
        return false;
      }
      if (filters.filterOwner && !filterCellIncludes(item.owner, filters.filterOwner)) {
        return false;
      }
      if (filters.filterPlatform && !filterCellIncludes(item.platform, filters.filterPlatform)) {
        return false;
      }
      return true;
    })
    .map((item) => item.row);
}

export function buildCreatorNameFilterOptions<TRow extends CreatorDetailFilterRowBase>(
  rows: readonly TRow[],
  filters: Pick<CreatorDetailFilterValues, 'filterCooperationStatus' | 'filterOwner' | 'filterPlatform'>
): CreatorFilterOption[] {
  const countMap = new Map<string, FilterOptionCount>();

  for (const item of rows) {
    if (item.creator === undefined) {
      continue;
    }
    if (filters.filterCooperationStatus && !filterCellIncludes(item.cooperationStatus, filters.filterCooperationStatus)) {
      continue;
    }
    if (filters.filterOwner && !filterCellIncludes(item.owner, filters.filterOwner)) {
      continue;
    }
    if (filters.filterPlatform && !filterCellIncludes(item.platform, filters.filterPlatform)) {
      continue;
    }
    incrementFilterOptionCounts(countMap, item.creator);
  }

  return Array.from(countMap.entries())
    .sort(([, leftOption], [, rightOption]) => {
      if (rightOption.count !== leftOption.count) {
        return rightOption.count - leftOption.count;
      }
      return leftOption.label.localeCompare(rightOption.label, 'zh-CN');
    })
    .map(([value, option]) => ({
      label: `${option.label} (${formatInteger(option.count)})`,
      value,
    }));
}

export function buildCreatorCooperationStatusFilterOptions<TRow extends CreatorDetailFilterRowBase>(
  rows: readonly TRow[],
  filters: Pick<CreatorDetailFilterValues, 'filterCreator' | 'filterOwner' | 'filterPlatform'>,
  cooperationStatusOrder: readonly string[]
): CreatorFilterOption[] {
  const countMap = new Map<string, FilterOptionCount>();

  for (const item of rows) {
    if (filters.filterCreator && !filterCellIncludes(item.creator, filters.filterCreator)) {
      continue;
    }
    if (filters.filterOwner && !filterCellIncludes(item.owner, filters.filterOwner)) {
      continue;
    }
    if (filters.filterPlatform && !filterCellIncludes(item.platform, filters.filterPlatform)) {
      continue;
    }
    incrementFilterOptionCounts(countMap, item.cooperationStatus);
  }

  return Array.from(countMap.entries())
    .sort(([leftStatus, leftOption], [rightStatus, rightOption]) => {
      const leftIndex = cooperationStatusOrder.indexOf(leftStatus);
      const rightIndex = cooperationStatusOrder.indexOf(rightStatus);
      const leftScore = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const rightScore = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }
      return leftOption.label.localeCompare(rightOption.label, 'zh-CN');
    })
    .map(([value, option]) => ({
      label: `${option.label} (${formatInteger(option.count)})`,
      value,
    }));
}

export function useCreatorFilterOptionPruning(
  value: string | undefined,
  options: readonly CreatorFilterOption[],
  clearValue: () => void
): void {
  useEffect(() => {
    if (!value) {
      return;
    }
    const exists = options.some((item) => item.value === value);
    if (!exists) {
      clearValue();
    }
  }, [clearValue, options, value]);
}

export function buildCreatorOwnerFilterOptions<TRow extends CreatorDetailFilterRowBase>(
  rows: readonly TRow[],
  filters: Pick<CreatorDetailFilterValues, 'filterCreator' | 'filterCooperationStatus' | 'filterPlatform'>
): CreatorFilterOption[] {
  const countMap = new Map<string, FilterOptionCount>();

  for (const item of rows) {
    if (filters.filterCreator && !filterCellIncludes(item.creator, filters.filterCreator)) {
      continue;
    }
    if (filters.filterCooperationStatus && !filterCellIncludes(item.cooperationStatus, filters.filterCooperationStatus)) {
      continue;
    }
    if (filters.filterPlatform && !filterCellIncludes(item.platform, filters.filterPlatform)) {
      continue;
    }
    incrementFilterOptionCounts(countMap, item.owner);
  }

  return Array.from(countMap.entries())
    .sort(([, leftOption], [, rightOption]) => {
      const leftIsUnassigned = leftOption.label === '未分配';
      const rightIsUnassigned = rightOption.label === '未分配';
      if (leftIsUnassigned !== rightIsUnassigned) {
        return leftIsUnassigned ? 1 : -1;
      }
      if (rightOption.count !== leftOption.count) {
        return rightOption.count - leftOption.count;
      }
      return leftOption.label.localeCompare(rightOption.label, 'zh-CN');
    })
    .map(([value, option]) => ({
      label: `${option.label} (${formatInteger(option.count)})`,
      value,
    }));
}

export function buildCreatorPlatformFilterOptions<TRow extends CreatorDetailFilterRowBase>(
  rows: readonly TRow[],
  filters: Pick<CreatorDetailFilterValues, 'filterCreator' | 'filterCooperationStatus' | 'filterOwner'>,
  platformPriorityOrder: readonly string[]
): CreatorFilterOption[] {
  const countMap = new Map<string, FilterOptionCount>();

  for (const item of rows) {
    if (filters.filterCreator && !filterCellIncludes(item.creator, filters.filterCreator)) {
      continue;
    }
    if (filters.filterCooperationStatus && !filterCellIncludes(item.cooperationStatus, filters.filterCooperationStatus)) {
      continue;
    }
    if (filters.filterOwner && !filterCellIncludes(item.owner, filters.filterOwner)) {
      continue;
    }
    incrementFilterOptionCounts(countMap, item.platform);
  }

  return Array.from(countMap.entries())
    .sort(([leftPlatform, leftOption], [rightPlatform, rightOption]) => {
      const leftIndex = platformPriorityOrder.indexOf(leftPlatform);
      const rightIndex = platformPriorityOrder.indexOf(rightPlatform);
      const leftScore = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const rightScore = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }
      if (rightOption.count !== leftOption.count) {
        return rightOption.count - leftOption.count;
      }
      return leftOption.label.localeCompare(rightOption.label, 'zh-CN');
    })
    .map(([value, option]) => ({
      label: `${option.label} (${formatInteger(option.count)})`,
      value,
    }));
}

interface NormalizedFilterOptionEntry {
  label: string;
  value: string;
}

interface FilterOptionCount {
  label: string;
  count: number;
}

function isCreatorFilterOptionCell(value: CreatorDetailFilterCellItem): value is CreatorFilterOptionCell {
  return typeof value === 'object' && value !== null && 'value' in value;
}

function normalizeFilterOptionEntries(value: CreatorDetailFilterCell | undefined): NormalizedFilterOptionEntry[] {
  if (value === undefined) {
    return [];
  }
  const rawValues = Array.isArray(value) ? value : [value];
  const normalizedValues = rawValues.reduce<NormalizedFilterOptionEntry[]>((entries, item) => {
    if (isCreatorFilterOptionCell(item)) {
      const optionValue = String(item.value ?? '').trim();
      const optionLabel = String(item.label ?? '').trim() || optionValue;
      if (optionValue) {
        entries.push({ label: optionLabel, value: optionValue });
      }
      return entries;
    }

    const normalizedValue = String(item ?? '').trim();
    if (normalizedValue) {
      entries.push({ label: normalizedValue, value: normalizedValue });
    }
    return entries;
  }, []);

  const entriesByValue = new Map<string, NormalizedFilterOptionEntry>();
  for (const entry of normalizedValues) {
    const current = entriesByValue.get(entry.value);
    if (!current || current.label === current.value) {
      entriesByValue.set(entry.value, entry);
    }
  }

  return Array.from(entriesByValue.values());
}

function normalizeFilterCell(value: CreatorDetailFilterCell | undefined): string[] {
  return normalizeFilterOptionEntries(value).map((entry) => entry.value);
}

function filterCellIncludes(value: CreatorDetailFilterCell | undefined, selectedValue: string): boolean {
  return normalizeFilterCell(value).includes(selectedValue);
}

function incrementFilterOptionCounts(countMap: Map<string, FilterOptionCount>, value: CreatorDetailFilterCell): void {
  const entries = normalizeFilterOptionEntries(value);
  for (const item of entries.length ? entries : [{ label: '未维护', value: '未维护' }]) {
    const current = countMap.get(item.value);
    countMap.set(item.value, {
      label: current?.label ?? item.label,
      count: (current?.count ?? 0) + 1,
    });
  }
}

export function formatCreatorDetailFilterCountText(
  filteredCount: number,
  totalCount: number,
  hasActiveFilters: boolean
): string {
  const formattedFilteredCount = formatInteger(filteredCount);
  const formattedTotalCount = formatInteger(totalCount);
  if (hasActiveFilters) {
    return `已筛选 ${formattedFilteredCount} / ${formattedTotalCount} 条`;
  }
  return `共 ${formattedTotalCount} 条`;
}
