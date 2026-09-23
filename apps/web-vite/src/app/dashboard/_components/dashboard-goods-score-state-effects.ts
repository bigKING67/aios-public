import { useEffect } from 'react';

type DashboardGoodsScoreDrawerScopeEffectArgs = {
  isTmallGoodsDimension: boolean;
  resetGoodsScoreDrawerState: () => void;
};

export function useDashboardGoodsScoreDrawerScopeEffect({
  isTmallGoodsDimension,
  resetGoodsScoreDrawerState,
}: DashboardGoodsScoreDrawerScopeEffectArgs) {
  useEffect(() => {
    if (isTmallGoodsDimension) {
      return;
    }
    resetGoodsScoreDrawerState();
  }, [isTmallGoodsDimension, resetGoodsScoreDrawerState]);
}
