import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import {
  buildCreatorAnchorLevelDetailColumns,
  type BuildCreatorAnchorLevelDetailColumnsParams,
  type CreatorAnchorLevelDetailColumnRecord,
} from './creator-anchor-level-detail-columns';
import {
  buildCreatorDetailColumns,
  type BuildCreatorDetailColumnsParams,
  type CreatorDetailBaseColumnRecord,
  type CreatorDetailMetricColumnRecord,
} from './creator-detail-table-columns';
import { useResolvedTableScrollX } from './creator-table-scroll';

export type CreatorDashboardTableRecord =
  CreatorAnchorLevelDetailColumnRecord &
  CreatorDetailBaseColumnRecord &
  CreatorDetailMetricColumnRecord;

export interface CreatorDashboardTableStateConfig<TRecord extends CreatorDashboardTableRecord> {
  anchorLevel: Omit<BuildCreatorAnchorLevelDetailColumnsParams, 'numericCellClassName'>;
  detail: BuildCreatorDetailColumnsParams<TRecord>;
}

interface UseCreatorDashboardTableStateParams<TRecord extends CreatorDashboardTableRecord> {
  numericCellClassName: string;
  config: CreatorDashboardTableStateConfig<TRecord>;
}

interface UseCreatorDashboardTableStateResult<TRecord> {
  anchorLevelDetailColumns: ColumnsType<TRecord>;
  anchorLevelTableScrollX: number;
  detailColumns: ColumnsType<TRecord>;
  detailTableScrollX: number;
}

export function useCreatorDashboardTableState<TRecord extends CreatorDashboardTableRecord>({
  numericCellClassName,
  config,
}: UseCreatorDashboardTableStateParams<TRecord>): UseCreatorDashboardTableStateResult<TRecord> {
  const anchorLevelDetailColumns = useMemo<ColumnsType<TRecord>>(
    () =>
      buildCreatorAnchorLevelDetailColumns({
        numericCellClassName,
        resolveStageKey: config.anchorLevel.resolveStageKey,
        formatDisplay: config.anchorLevel.formatDisplay,
      }),
    [config, numericCellClassName]
  );

  const detailColumns = useMemo<ColumnsType<TRecord>>(
    () => buildCreatorDetailColumns<TRecord>(config.detail),
    [config]
  );

  return {
    anchorLevelDetailColumns,
    anchorLevelTableScrollX: useResolvedTableScrollX(anchorLevelDetailColumns),
    detailColumns,
    detailTableScrollX: useResolvedTableScrollX(detailColumns),
  };
}
