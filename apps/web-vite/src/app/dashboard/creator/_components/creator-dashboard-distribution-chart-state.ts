import { useMemo } from 'react';
import { buildCreatorAnchorLevelDistributionOption } from './creator-anchor-level-chart';
import type { CreatorChartLayoutPanel } from './creator-chart-layout';
import { buildCreatorDistributionChartPanels } from './creator-chart-panels';
import type { CreatorAnchorLevel } from './creator-chart-colors';
import {
  type CreatorAnchorLevelRow,
  filterCreatorRowsByAnchorLevel,
  useCreatorAnchorLevelSelection,
} from './creator-cooperation-stages';
import {
  CREATOR_COOPERATION_PLATFORM_PRIORITY_ORDER,
  normalizeCreatorCooperationPlatform,
} from './creator-cooperation-normalizers';
import {
  buildCreatorCooperationPlatformDistributionOption,
  buildCreatorPlatformMetricItems,
} from './creator-platform-chart';

export interface CreatorDashboardDistributionChartSourceRow extends CreatorAnchorLevelRow {
  platform: string | null;
}

interface UseCreatorDashboardDistributionChartStateParams<
  TRow extends CreatorDashboardDistributionChartSourceRow,
> {
  rows: readonly TRow[];
  loading: boolean;
  normalizeAnchorLevel: (level: string | null) => CreatorAnchorLevel | null;
  resolveAnchorLevelFromChartParams: (params: unknown) => CreatorAnchorLevel | null;
}

interface UseCreatorDashboardDistributionChartStateResult<TRow> {
  selectedAnchorLevel: CreatorAnchorLevel | null;
  clearSelectedAnchorLevel: () => void;
  selectedAnchorLevelRows: TRow[];
  distributionChartPanels: CreatorChartLayoutPanel[];
}

export function useCreatorDashboardDistributionChartState<
  TRow extends CreatorDashboardDistributionChartSourceRow,
>({
  rows,
  loading,
  normalizeAnchorLevel,
  resolveAnchorLevelFromChartParams,
}: UseCreatorDashboardDistributionChartStateParams<TRow>): UseCreatorDashboardDistributionChartStateResult<TRow> {
  const { selectedAnchorLevel, clearSelectedAnchorLevel, handleAnchorLevelChartClick } =
    useCreatorAnchorLevelSelection<CreatorAnchorLevel, TRow>({
      rows,
      normalizeAnchorLevel,
      resolveAnchorLevelFromChartParams,
    });

  const selectedAnchorLevelRows = useMemo<TRow[]>(
    () => filterCreatorRowsByAnchorLevel(rows, selectedAnchorLevel, normalizeAnchorLevel),
    [normalizeAnchorLevel, rows, selectedAnchorLevel]
  );

  const anchorLevelDistributionOption = useMemo(
    () =>
      buildCreatorAnchorLevelDistributionOption({
        rows,
        selectedAnchorLevel,
        normalizeAnchorLevel,
      }),
    [normalizeAnchorLevel, rows, selectedAnchorLevel]
  );

  const cooperationPlatformOption = useMemo(() => {
    return buildCreatorCooperationPlatformDistributionOption({
      items: buildCreatorPlatformMetricItems({
        rows,
        resolvePlatform: (row) => normalizeCreatorCooperationPlatform(row.platform),
      }),
      priorityOrder: CREATOR_COOPERATION_PLATFORM_PRIORITY_ORDER,
      percentLabel: '平台GMV占比',
    });
  }, [rows]);

  const distributionChartPanels = useMemo(
    () =>
      buildCreatorDistributionChartPanels({
        anchorLevelOption: anchorLevelDistributionOption,
        cooperationPlatformOption,
        loading,
        onAnchorLevelChartClick: handleAnchorLevelChartClick,
      }),
    [anchorLevelDistributionOption, cooperationPlatformOption, handleAnchorLevelChartClick, loading]
  );

  return {
    selectedAnchorLevel,
    clearSelectedAnchorLevel,
    selectedAnchorLevelRows,
    distributionChartPanels,
  };
}
