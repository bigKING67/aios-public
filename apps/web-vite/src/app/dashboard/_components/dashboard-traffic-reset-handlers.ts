import { useCallback } from 'react';

type NullableStringSetter = (value: string | null) => void;
type BooleanSetter = (value: boolean) => void;

type DashboardTrafficResetHandlersArgs = {
  resetTrafficData: () => void;
  resetTrafficGoodsData: () => void;
  resetTrafficExpansionState: () => void;
  resetTrafficGoodsExpansionState: () => void;
  setTrafficLoadError: NullableStringSetter;
  setTrafficLoading: BooleanSetter;
  setTrafficGoodsLoadError: NullableStringSetter;
  setTrafficGoodsLoading: BooleanSetter;
};

export function useDashboardTrafficResetHandlers({
  resetTrafficData,
  resetTrafficGoodsData,
  resetTrafficExpansionState,
  resetTrafficGoodsExpansionState,
  setTrafficLoadError,
  setTrafficLoading,
  setTrafficGoodsLoadError,
  setTrafficGoodsLoading,
}: DashboardTrafficResetHandlersArgs) {
  const resetTrafficGoodsRowsData = useCallback(() => {
    resetTrafficGoodsData();
    resetTrafficGoodsExpansionState();
  }, [resetTrafficGoodsData, resetTrafficGoodsExpansionState]);

  const resetTrafficGoodsState = useCallback(() => {
    resetTrafficGoodsRowsData();
    setTrafficGoodsLoadError(null);
    setTrafficGoodsLoading(false);
  }, [resetTrafficGoodsRowsData, setTrafficGoodsLoadError, setTrafficGoodsLoading]);

  const resetTrafficRowsData = useCallback(() => {
    resetTrafficData();
    resetTrafficExpansionState();
  }, [resetTrafficData, resetTrafficExpansionState]);

  const resetTrafficState = useCallback(() => {
    resetTrafficRowsData();
    setTrafficLoadError(null);
    setTrafficLoading(false);
  }, [resetTrafficRowsData, setTrafficLoadError, setTrafficLoading]);

  return {
    resetTrafficGoodsRowsData,
    resetTrafficGoodsState,
    resetTrafficRowsData,
    resetTrafficState,
  };
}
