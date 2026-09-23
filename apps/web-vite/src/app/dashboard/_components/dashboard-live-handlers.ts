import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import dayjs from 'dayjs';

import {
  getLiveDetailBusinessSessionKey,
} from './dashboard-live-detail-formatters';
import {
  getLiveTrendDateKey,
} from './dashboard-live-trend-formatters';
import type {
  DashboardLiveDetailRow,
  DashboardLiveTrendRow,
} from './dashboard-types';

type DashboardLiveHandlersArgs = {
  messageApi: MessageInstance;
  liveRowsByDate: ReadonlyMap<string, DashboardLiveDetailRow[]>;
  selectedLiveFunnelDayRows: DashboardLiveDetailRow[];
  activeLiveTrendRows: DashboardLiveTrendRow[];
  openLiveMetricsDrawer: (row: DashboardLiveDetailRow) => void;
  closeLiveMetricsDrawer: () => void;
  openLiveFunnelDrawer: (row: DashboardLiveDetailRow) => void;
  closeLiveFunnelDrawer: () => void;
  setSelectedLiveFunnelRow: Dispatch<SetStateAction<DashboardLiveDetailRow | null>>;
};

export function useDashboardLiveHandlers({
  messageApi,
  liveRowsByDate,
  selectedLiveFunnelDayRows,
  activeLiveTrendRows,
  openLiveMetricsDrawer,
  closeLiveMetricsDrawer,
  openLiveFunnelDrawer,
  closeLiveFunnelDrawer,
  setSelectedLiveFunnelRow,
}: DashboardLiveHandlersArgs) {
  const handleOpenLiveMetricsDrawer = useCallback(
    (row: DashboardLiveDetailRow) => {
      openLiveMetricsDrawer(row);
    },
    [openLiveMetricsDrawer]
  );

  const handleCloseLiveMetricsDrawer = useCallback(() => {
    closeLiveMetricsDrawer();
  }, [closeLiveMetricsDrawer]);

  const handleOpenLiveFunnelDateDrawer = useCallback(
    (dateKey: string) => {
      const dayRows = liveRowsByDate.get(dateKey) || [];
      if (!dayRows.length) {
        messageApi.info(`${dateKey} 暂无可查看的直播场次明细`);
        return;
      }
      openLiveFunnelDrawer(dayRows[0]);
    },
    [liveRowsByDate, messageApi, openLiveFunnelDrawer]
  );

  const handleCloseLiveFunnelDrawer = useCallback(() => {
    closeLiveFunnelDrawer();
  }, [closeLiveFunnelDrawer]);

  const handleLiveFunnelSessionChange = useCallback(
    (value: string) => {
      const nextRow = selectedLiveFunnelDayRows.find((row) => getLiveDetailBusinessSessionKey(row) === value);
      if (nextRow) {
        setSelectedLiveFunnelRow(nextRow);
      }
    },
    [selectedLiveFunnelDayRows, setSelectedLiveFunnelRow]
  );

  const handleLiveTrendPointClick = useCallback(
    (params: unknown) => {
      const payload = params as {
        dataIndex?: unknown;
        seriesDataIndex?: unknown;
        name?: unknown;
      };
      const fallbackIndex =
        typeof payload.seriesDataIndex === 'number'
          ? payload.seriesDataIndex
          : typeof payload.dataIndex === 'number'
            ? payload.dataIndex
            : -1;
      let dateKey = fallbackIndex >= 0 ? getLiveTrendDateKey(activeLiveTrendRows[fallbackIndex]) : null;

      if (!dateKey && typeof payload.name === 'string') {
        const matchedTrendRow = activeLiveTrendRows.find((row) => dayjs(row.date).format('MM/DD') === payload.name);
        dateKey = getLiveTrendDateKey(matchedTrendRow);
      }

      if (!dateKey) {
        return;
      }
      handleOpenLiveFunnelDateDrawer(dateKey);
    },
    [activeLiveTrendRows, handleOpenLiveFunnelDateDrawer]
  );

  return {
    handleOpenLiveMetricsDrawer,
    handleCloseLiveMetricsDrawer,
    handleOpenLiveFunnelDateDrawer,
    handleCloseLiveFunnelDrawer,
    handleLiveFunnelSessionChange,
    handleLiveTrendPointClick,
  };
}
