import { useCallback } from 'react';

type NullableStringSetter = (value: string | null) => void;
type BooleanSetter = (value: boolean) => void;

type DashboardLiveResetHandlersArgs = {
  resetLiveData: () => void;
  resetLiveGoodsRowsData: () => void;
  resetLiveGoodsExpansionState: () => void;
  resetLiveMetricsDrawerState: () => void;
  resetLiveFunnelDrawerState: () => void;
  setLiveLoadError: NullableStringSetter;
  setLiveGoodsLoadError: NullableStringSetter;
  setLiveGoodsLoading: BooleanSetter;
};

export function useDashboardLiveResetHandlers({
  resetLiveData,
  resetLiveGoodsRowsData,
  resetLiveGoodsExpansionState,
  resetLiveMetricsDrawerState,
  resetLiveFunnelDrawerState,
  setLiveLoadError,
  setLiveGoodsLoadError,
  setLiveGoodsLoading,
}: DashboardLiveResetHandlersArgs) {
  const resetLiveDrawerState = useCallback(() => {
    resetLiveMetricsDrawerState();
    resetLiveFunnelDrawerState();
  }, [resetLiveFunnelDrawerState, resetLiveMetricsDrawerState]);

  const resetLiveGoodsData = useCallback(() => {
    resetLiveGoodsRowsData();
    resetLiveGoodsExpansionState();
  }, [resetLiveGoodsExpansionState, resetLiveGoodsRowsData]);

  const resetLiveGoodsState = useCallback(() => {
    resetLiveGoodsData();
    setLiveGoodsLoadError(null);
    setLiveGoodsLoading(false);
  }, [resetLiveGoodsData, setLiveGoodsLoadError, setLiveGoodsLoading]);

  const resetLiveState = useCallback(() => {
    resetLiveData();
    setLiveLoadError(null);
    resetLiveDrawerState();
  }, [resetLiveData, resetLiveDrawerState, setLiveLoadError]);

  return {
    resetLiveDrawerState,
    resetLiveGoodsData,
    resetLiveGoodsState,
    resetLiveState,
  };
}
