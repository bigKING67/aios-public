import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';

import { buildLiveGoodsSessionGroups } from './dashboard-live-goods-groups';
import type {
  DashboardLiveGoodsApiResponse,
  DashboardLiveGoodsRow,
  DashboardLiveGoodsSessionGroup,
} from './dashboard-types';

type DashboardLiveGoodsDerivedStateArgs = {
  liveGoodsData: DashboardLiveGoodsApiResponse | null;
  liveGoodsSessionPage: number;
  liveGoodsSessionPageSize: number;
};

type DashboardLiveGoodsDerivedState = {
  liveGoodsSessionGroups: DashboardLiveGoodsSessionGroup[];
  paginatedLiveGoodsSessionGroups: DashboardLiveGoodsSessionGroup[];
  liveGoodsSessionCount: number;
};

const EMPTY_LIVE_GOODS_ROWS: DashboardLiveGoodsRow[] = [];

export function useDashboardLiveGoodsDerivedState({
  liveGoodsData,
  liveGoodsSessionPage,
  liveGoodsSessionPageSize,
}: DashboardLiveGoodsDerivedStateArgs): DashboardLiveGoodsDerivedState {
  const liveGoodsSessionGroups = useMemo(
    () => buildLiveGoodsSessionGroups(Array.isArray(liveGoodsData?.tree) ? liveGoodsData.tree : EMPTY_LIVE_GOODS_ROWS),
    [liveGoodsData?.tree]
  );
  const paginatedLiveGoodsSessionGroups = useMemo(() => {
    const startIndex = (liveGoodsSessionPage - 1) * liveGoodsSessionPageSize;
    return liveGoodsSessionGroups.slice(startIndex, startIndex + liveGoodsSessionPageSize);
  }, [liveGoodsSessionGroups, liveGoodsSessionPage, liveGoodsSessionPageSize]);

  return {
    liveGoodsSessionGroups,
    paginatedLiveGoodsSessionGroups,
    liveGoodsSessionCount: liveGoodsSessionGroups.length,
  };
}

type DashboardLiveGoodsPageClampEffectArgs = {
  liveGoodsSessionCount: number;
  liveGoodsSessionPage: number;
  liveGoodsSessionPageSize: number;
  setLiveGoodsSessionPage: Dispatch<SetStateAction<number>>;
};

export function useDashboardLiveGoodsPageClampEffect({
  liveGoodsSessionCount,
  liveGoodsSessionPage,
  liveGoodsSessionPageSize,
  setLiveGoodsSessionPage,
}: DashboardLiveGoodsPageClampEffectArgs) {
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(liveGoodsSessionCount / liveGoodsSessionPageSize));
    if (liveGoodsSessionPage > maxPage) {
      setLiveGoodsSessionPage(maxPage);
    }
  }, [liveGoodsSessionCount, liveGoodsSessionPage, liveGoodsSessionPageSize, setLiveGoodsSessionPage]);
}
