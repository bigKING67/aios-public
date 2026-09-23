import { useMemo } from 'react';
import {
  buildCreatorDetailFilterRows,
  filterCreatorDetailRows,
  type CreatorDetailFilterRowBase,
  type CreatorDetailFilterState,
  type UseCreatorDetailFilterOptionsResult,
  useCreatorDetailFilterOptions,
} from './creator-detail-filters';
import {
  formatCreatorCooperationStatusDisplay,
  normalizeCreatorCooperationPlatform,
  normalizeCreatorDetailOwner,
} from './creator-cooperation-normalizers';

export interface CreatorDashboardDetailFilterSourceRow {
  cooperation_status: string | null;
  cooperation_status_norm: string | null;
  owner_name: string | null;
  platform: string | null;
}

interface UseCreatorDashboardDetailFilterStateParams<TRow extends CreatorDashboardDetailFilterSourceRow> {
  rows: readonly TRow[];
  filters: CreatorDetailFilterState;
  cooperationStatusOrder: readonly string[];
  platformPriorityOrder: readonly string[];
  resolveCreator?: (row: TRow) => NonNullable<CreatorDetailFilterRowBase['creator']>;
  resolveCooperationStatus?: (row: TRow) => CreatorDetailFilterRowBase['cooperationStatus'];
  resolveOwner?: (row: TRow) => CreatorDetailFilterRowBase['owner'];
  resolvePlatform?: (row: TRow) => CreatorDetailFilterRowBase['platform'];
}

interface UseCreatorDashboardDetailFilterStateResult<TRow> extends UseCreatorDetailFilterOptionsResult {
  filteredDetailRows: TRow[];
}

export function useCreatorDashboardDetailFilterState<TRow extends CreatorDashboardDetailFilterSourceRow>({
  rows,
  filters,
  cooperationStatusOrder,
  platformPriorityOrder,
  resolveCreator,
  resolveCooperationStatus,
  resolveOwner,
  resolvePlatform,
}: UseCreatorDashboardDetailFilterStateParams<TRow>): UseCreatorDashboardDetailFilterStateResult<TRow> {
  const detailFilterRows = useMemo(
    () =>
      buildCreatorDetailFilterRows({
        rows,
        resolveCreator,
        resolveCooperationStatus:
          resolveCooperationStatus ??
          ((row) => formatCreatorCooperationStatusDisplay(row.cooperation_status_norm || row.cooperation_status)),
        resolveOwner: resolveOwner ?? ((row) => normalizeCreatorDetailOwner(row.owner_name)),
        resolvePlatform: resolvePlatform ?? ((row) => normalizeCreatorCooperationPlatform(row.platform)),
      }),
    [resolveCooperationStatus, resolveCreator, resolveOwner, resolvePlatform, rows]
  );

  const filteredDetailRows = useMemo(
    () =>
      filterCreatorDetailRows(detailFilterRows, {
        filterCreator: filters.filterCreator,
        filterCooperationStatus: filters.filterCooperationStatus,
        filterOwner: filters.filterOwner,
        filterPlatform: filters.filterPlatform,
      }),
    [
      detailFilterRows,
      filters.filterCooperationStatus,
      filters.filterCreator,
      filters.filterOwner,
      filters.filterPlatform,
    ]
  );

  const detailFilterOptions = useCreatorDetailFilterOptions({
    rows: detailFilterRows,
    filteredCount: filteredDetailRows.length,
    totalCount: rows.length,
    cooperationStatusOrder,
    platformPriorityOrder,
    filters,
  });

  return {
    filteredDetailRows,
    ...detailFilterOptions,
  };
}
