import { useCallback } from 'react';

import type { DashboardGoodsCardRow } from './dashboard-types';

type NullableStringSetter = (value: string | null) => void;
type BooleanSetter = (value: boolean) => void;

type DashboardGoodsCardResetHandlersArgs = {
  resetGoodsCardData: () => void;
  resetGoodsCardTrafficData: () => void;
  resetExpandedGoodsCardTrafficRowKeys: () => void;
  resetGoodsCardTrafficDrawerBaseState: () => void;
  setGoodsCardLoadError: NullableStringSetter;
  setGoodsCardLoading: BooleanSetter;
  setGoodsCardTrafficLoadError: NullableStringSetter;
  setGoodsCardTrafficLoading: BooleanSetter;
};

type DashboardGoodsCardHandlersArgs = {
  openGoodsCardTrafficDrawer: (row: DashboardGoodsCardRow) => void;
  closeGoodsCardTrafficDrawer: () => void;
  resetGoodsCardTrafficDrawerData: () => void;
};

export function useDashboardGoodsCardResetHandlers({
  resetGoodsCardData,
  resetGoodsCardTrafficData,
  resetExpandedGoodsCardTrafficRowKeys,
  resetGoodsCardTrafficDrawerBaseState,
  setGoodsCardLoadError,
  setGoodsCardLoading,
  setGoodsCardTrafficLoadError,
  setGoodsCardTrafficLoading,
}: DashboardGoodsCardResetHandlersArgs) {
  const resetGoodsCardTrafficRowsData = useCallback(() => {
    resetGoodsCardTrafficData();
    resetExpandedGoodsCardTrafficRowKeys();
  }, [resetExpandedGoodsCardTrafficRowKeys, resetGoodsCardTrafficData]);

  const resetGoodsCardTrafficDrawerData = useCallback(() => {
    resetGoodsCardTrafficRowsData();
    setGoodsCardTrafficLoadError(null);
  }, [resetGoodsCardTrafficRowsData, setGoodsCardTrafficLoadError]);

  const resetGoodsCardTrafficDrawerState = useCallback(() => {
    resetGoodsCardTrafficDrawerData();
    resetGoodsCardTrafficDrawerBaseState();
  }, [resetGoodsCardTrafficDrawerBaseState, resetGoodsCardTrafficDrawerData]);

  const resetGoodsCardState = useCallback(() => {
    resetGoodsCardData();
    setGoodsCardLoadError(null);
    setGoodsCardLoading(false);
    setGoodsCardTrafficLoading(false);
    resetGoodsCardTrafficDrawerState();
  }, [
    resetGoodsCardData,
    resetGoodsCardTrafficDrawerState,
    setGoodsCardLoadError,
    setGoodsCardLoading,
    setGoodsCardTrafficLoading,
  ]);

  return {
    resetGoodsCardTrafficRowsData,
    resetGoodsCardTrafficDrawerData,
    resetGoodsCardTrafficDrawerState,
    resetGoodsCardState,
  };
}

export function useDashboardGoodsCardHandlers({
  openGoodsCardTrafficDrawer,
  closeGoodsCardTrafficDrawer,
  resetGoodsCardTrafficDrawerData,
}: DashboardGoodsCardHandlersArgs) {
  const handleOpenGoodsCardTrafficDrawer = useCallback((row: DashboardGoodsCardRow) => {
    resetGoodsCardTrafficDrawerData();
    openGoodsCardTrafficDrawer(row);
  }, [openGoodsCardTrafficDrawer, resetGoodsCardTrafficDrawerData]);

  const handleCloseGoodsCardTrafficDrawer = useCallback(() => {
    closeGoodsCardTrafficDrawer();
  }, [closeGoodsCardTrafficDrawer]);

  return {
    handleOpenGoodsCardTrafficDrawer,
    handleCloseGoodsCardTrafficDrawer,
  };
}
