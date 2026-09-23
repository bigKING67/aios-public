import { useCallback, useState } from 'react';
import type { Key } from 'react';

const INITIAL_LIVE_GOODS_SESSION_PAGE = 1;
const INITIAL_LIVE_GOODS_SESSION_PAGE_SIZE = 10;

export function useDashboardTableUiState() {
  const [expandedTrafficRowKeys, setExpandedTrafficRowKeys] = useState<Key[]>([]);
  const [expandedTrafficGoodsRowKeys, setExpandedTrafficGoodsRowKeys] = useState<Key[]>([]);
  const [expandedLiveGoodsRowKeys, setExpandedLiveGoodsRowKeys] = useState<Key[]>([]);
  const [expandedLiveGoodsSessionKeys, setExpandedLiveGoodsSessionKeys] = useState<Key[]>([]);
  const [liveGoodsSessionPage, setLiveGoodsSessionPage] = useState(INITIAL_LIVE_GOODS_SESSION_PAGE);
  const [liveGoodsSessionPageSize, setLiveGoodsSessionPageSize] = useState(
    INITIAL_LIVE_GOODS_SESSION_PAGE_SIZE
  );

  const resetTrafficExpansionState = useCallback(() => {
    setExpandedTrafficRowKeys([]);
  }, []);

  const resetTrafficGoodsExpansionState = useCallback(() => {
    setExpandedTrafficGoodsRowKeys([]);
  }, []);

  const resetLiveGoodsExpansionState = useCallback(() => {
    setExpandedLiveGoodsRowKeys([]);
    setExpandedLiveGoodsSessionKeys([]);
    setLiveGoodsSessionPage(INITIAL_LIVE_GOODS_SESSION_PAGE);
  }, []);

  const toggleLiveGoodsSession = useCallback((key: Key) => {
    setExpandedLiveGoodsSessionKeys((currentKeys) =>
      currentKeys.includes(key) ? currentKeys.filter((item) => item !== key) : [...currentKeys, key]
    );
  }, []);

  const toggleLiveGoodsProduct = useCallback((key: Key) => {
    setExpandedLiveGoodsRowKeys((currentKeys) =>
      currentKeys.includes(key) ? currentKeys.filter((item) => item !== key) : [...currentKeys, key]
    );
  }, []);

  const changeLiveGoodsPage = useCallback((page: number, pageSize: number) => {
    setLiveGoodsSessionPage(page);
    setLiveGoodsSessionPageSize(pageSize);
  }, []);

  return {
    expandedTrafficRowKeys,
    setExpandedTrafficRowKeys,
    resetTrafficExpansionState,
    expandedTrafficGoodsRowKeys,
    setExpandedTrafficGoodsRowKeys,
    resetTrafficGoodsExpansionState,
    expandedLiveGoodsRowKeys,
    expandedLiveGoodsSessionKeys,
    liveGoodsSessionPage,
    setLiveGoodsSessionPage,
    liveGoodsSessionPageSize,
    resetLiveGoodsExpansionState,
    toggleLiveGoodsSession,
    toggleLiveGoodsProduct,
    changeLiveGoodsPage,
  };
}
