import { useMemo, type Dispatch, type SetStateAction } from 'react';
import {
  buildCreatorCooperationStageRows,
  compareCreatorRowsBySequenceThenName,
  type CreatorCooperationStageMeta,
  type CreatorCooperationStageRows,
  type CreatorOrderedInfluencerRow,
  useCreatorCooperationStageSelection,
} from './creator-cooperation-stages';
import type { NumericInput } from './creator-formatters';
import { compareCreatorNumbersDesc } from './creator-sorters';
import {
  buildCreatorStatusTableMetricsGetter,
  type BuildCreatorStatusTableMetricsGetterParams,
} from './creator-status-metrics';
import type { CreatorStatusTableRowMetrics } from './creator-status-table-row';

export interface CreatorDashboardCooperationStageStateConfig<
  TStageKey extends string,
  TRow extends CreatorOrderedInfluencerRow,
> {
  stages: readonly CreatorCooperationStageMeta<TStageKey>[];
  activeStageKey: TStageKey;
  resolveStageKey: (row: TRow) => TStageKey;
  resolveActiveStageSortValue: (row: TRow) => NumericInput;
  metrics: BuildCreatorStatusTableMetricsGetterParams<TRow>;
}

interface UseCreatorDashboardCooperationStageStateParams<
  TStageKey extends string,
  TRow extends CreatorOrderedInfluencerRow,
> {
  rows: readonly TRow[];
  config: CreatorDashboardCooperationStageStateConfig<TStageKey, TRow>;
}

interface UseCreatorDashboardCooperationStageStateResult<TStageKey extends string, TRow> {
  cooperationStageRows: CreatorCooperationStageRows<TStageKey, TRow>[];
  selectedCooperationStage: TStageKey | null;
  setSelectedCooperationStage: Dispatch<SetStateAction<TStageKey | null>>;
  cooperationStageTotalCount: number;
  selectedCooperationStageRows: TRow[];
  showSelectedStageMetrics: boolean;
  getSelectedStageTableMetrics: (record: TRow) => CreatorStatusTableRowMetrics;
}

export function useCreatorDashboardCooperationStageState<
  TStageKey extends string,
  TRow extends CreatorOrderedInfluencerRow,
>({
  rows,
  config,
}: UseCreatorDashboardCooperationStageStateParams<
  TStageKey,
  TRow
>): UseCreatorDashboardCooperationStageStateResult<TStageKey, TRow> {
  const cooperationStageRows = useMemo(() => {
    return buildCreatorCooperationStageRows({
      rows,
      stages: config.stages,
      resolveStageKey: config.resolveStageKey,
      compareRows: (stageKey, left, right) => {
        if (stageKey === config.activeStageKey) {
          const activeStageDiff = compareCreatorNumbersDesc(
            config.resolveActiveStageSortValue(left),
            config.resolveActiveStageSortValue(right)
          );
          if (Math.abs(activeStageDiff) > 0.000001) {
            return activeStageDiff;
          }
        }

        return compareCreatorRowsBySequenceThenName(left, right);
      },
    });
  }, [config, rows]);

  const {
    selectedCooperationStage,
    setSelectedCooperationStage,
    cooperationStageTotalCount,
    selectedCooperationStageRows,
  } = useCreatorCooperationStageSelection<TStageKey, TRow>({
    stages: config.stages,
    rows: cooperationStageRows,
  });

  const getSelectedStageTableMetrics = useMemo(
    () => buildCreatorStatusTableMetricsGetter(config.metrics),
    [config]
  );

  return {
    cooperationStageRows,
    selectedCooperationStage,
    setSelectedCooperationStage,
    cooperationStageTotalCount,
    selectedCooperationStageRows,
    showSelectedStageMetrics: selectedCooperationStage === config.activeStageKey,
    getSelectedStageTableMetrics,
  };
}
