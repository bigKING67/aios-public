import { useCallback, type Dispatch, type SetStateAction } from 'react';

import { buildDashboardQueryDateRangeParams, type DashboardDateRangeLike } from './dashboard-date-range';
import {
  DASHBOARD_EXPORT_EMPTY_LIVE_GOODS_DETAIL_MESSAGE,
  DASHBOARD_EXPORT_EMPTY_LIVE_DETAIL_MESSAGE,
  DASHBOARD_EXPORT_EMPTY_SHORT_VIDEO_DETAIL_MESSAGE,
  DASHBOARD_EXPORT_LOGIN_REQUIRED_MESSAGE,
  buildDashboardExportSuccessMessage,
  downloadDashboardCsvFile,
  isDashboardDetailExportDisabled,
} from './dashboard-export';
import { resolveDashboardExportErrorMessage } from './dashboard-errors';
import { buildDashboardLiveDetailCsvExport } from './dashboard-live-detail-export';
import { buildDashboardLiveGoodsDetailCsvExport } from './dashboard-live-goods-detail-export';
import { fetchDashboardLiveGoodsDetails } from './dashboard-live-fetchers';
import { buildDashboardShortVideoDetailCsvExport } from './dashboard-short-video-detail-export';
import type {
  DashboardLiveDetailRow,
  DashboardShortVideoDetailRow,
  LiveScope,
  ShortVideoScope,
} from './dashboard-types';

type DashboardExportMessageApi = {
  info: (content: string) => void;
  success: (content: string) => void;
  error: (content: string) => void;
};

type DashboardMediaDetailExportActionsArgs = {
  isAuthenticated: boolean;
  messageApi: DashboardExportMessageApi;
  currentRange: DashboardDateRangeLike;
  activeLiveDetailRows: DashboardLiveDetailRow[];
  liveScope: LiveScope;
  isExportingLiveDetails: boolean;
  setIsExportingLiveDetails: Dispatch<SetStateAction<boolean>>;
  liveDetailLoading: boolean;
  liveGoodsSessionCount: number;
  isExportingLiveGoodsDetails: boolean;
  setIsExportingLiveGoodsDetails: Dispatch<SetStateAction<boolean>>;
  liveGoodsLoading: boolean;
  activeShortVideoDetailRows: DashboardShortVideoDetailRow[];
  shortVideoScope: ShortVideoScope;
  isExportingShortVideoDetails: boolean;
  setIsExportingShortVideoDetails: Dispatch<SetStateAction<boolean>>;
  shortVideoDetailLoading: boolean;
};

export function useDashboardMediaDetailExportActions({
  isAuthenticated,
  messageApi,
  currentRange,
  activeLiveDetailRows,
  liveScope,
  isExportingLiveDetails,
  setIsExportingLiveDetails,
  liveDetailLoading,
  liveGoodsSessionCount,
  isExportingLiveGoodsDetails,
  setIsExportingLiveGoodsDetails,
  liveGoodsLoading,
  activeShortVideoDetailRows,
  shortVideoScope,
  isExportingShortVideoDetails,
  setIsExportingShortVideoDetails,
  shortVideoDetailLoading,
}: DashboardMediaDetailExportActionsArgs) {
  const handleExportLiveDetails = useCallback(async () => {
    if (isExportingLiveDetails) {
      return;
    }
    if (!isAuthenticated) {
      messageApi.info(DASHBOARD_EXPORT_LOGIN_REQUIRED_MESSAGE);
      return;
    }
    if (!activeLiveDetailRows.length) {
      messageApi.info(DASHBOARD_EXPORT_EMPTY_LIVE_DETAIL_MESSAGE);
      return;
    }

    const { startDate, endDate } = buildDashboardQueryDateRangeParams(currentRange);
    setIsExportingLiveDetails(true);
    try {
      const { csvText, fileName } = buildDashboardLiveDetailCsvExport({
        rows: activeLiveDetailRows,
        liveScope,
        startDate,
        endDate,
      });

      downloadDashboardCsvFile(csvText, fileName);
      messageApi.success(buildDashboardExportSuccessMessage(activeLiveDetailRows.length, '直播明细', fileName));
    } catch (error) {
      messageApi.error(resolveDashboardExportErrorMessage(error));
    } finally {
      setIsExportingLiveDetails(false);
    }
  }, [
    activeLiveDetailRows,
    currentRange,
    isAuthenticated,
    isExportingLiveDetails,
    liveScope,
    messageApi,
    setIsExportingLiveDetails,
  ]);

  const handleExportLiveGoodsDetails = useCallback(async () => {
    if (isExportingLiveGoodsDetails) {
      return;
    }
    if (!isAuthenticated) {
      messageApi.info(DASHBOARD_EXPORT_LOGIN_REQUIRED_MESSAGE);
      return;
    }
    if (liveGoodsSessionCount === 0) {
      messageApi.info(DASHBOARD_EXPORT_EMPTY_LIVE_GOODS_DETAIL_MESSAGE);
      return;
    }

    const { startDate, endDate } = buildDashboardQueryDateRangeParams(currentRange);
    const abortController = new AbortController();
    setIsExportingLiveGoodsDetails(true);
    try {
      const response = await fetchDashboardLiveGoodsDetails(
        {
          startDate,
          endDate,
          platform: 'douyin',
          scope: liveScope,
        },
        {
          signal: abortController.signal,
          requestKey: `dashboard-live-goods-detail-export-${liveScope}`,
        }
      );
      const rows = Array.isArray(response.rows) ? response.rows : [];
      if (!rows.length) {
        messageApi.info(DASHBOARD_EXPORT_EMPTY_LIVE_GOODS_DETAIL_MESSAGE);
        return;
      }

      const { csvText, fileName } = buildDashboardLiveGoodsDetailCsvExport({
        rows,
        liveScope,
        startDate,
        endDate,
      });

      downloadDashboardCsvFile(csvText, fileName);
      messageApi.success(buildDashboardExportSuccessMessage(rows.length, '直播商品明细', fileName));
    } catch (error) {
      messageApi.error(resolveDashboardExportErrorMessage(error));
    } finally {
      setIsExportingLiveGoodsDetails(false);
    }
  }, [
    currentRange,
    isAuthenticated,
    isExportingLiveGoodsDetails,
    liveGoodsSessionCount,
    liveScope,
    messageApi,
    setIsExportingLiveGoodsDetails,
  ]);

  const handleExportShortVideoDetails = useCallback(async () => {
    if (isExportingShortVideoDetails) {
      return;
    }
    if (!isAuthenticated) {
      messageApi.info(DASHBOARD_EXPORT_LOGIN_REQUIRED_MESSAGE);
      return;
    }
    if (!activeShortVideoDetailRows.length) {
      messageApi.info(DASHBOARD_EXPORT_EMPTY_SHORT_VIDEO_DETAIL_MESSAGE);
      return;
    }

    const { startDate, endDate } = buildDashboardQueryDateRangeParams(currentRange);
    setIsExportingShortVideoDetails(true);
    try {
      const { csvText, fileName } = buildDashboardShortVideoDetailCsvExport({
        rows: activeShortVideoDetailRows,
        shortVideoScope,
        startDate,
        endDate,
      });

      downloadDashboardCsvFile(csvText, fileName);
      messageApi.success(buildDashboardExportSuccessMessage(activeShortVideoDetailRows.length, '短视频明细', fileName));
    } catch (error) {
      messageApi.error(resolveDashboardExportErrorMessage(error));
    } finally {
      setIsExportingShortVideoDetails(false);
    }
  }, [
    activeShortVideoDetailRows,
    currentRange,
    isAuthenticated,
    isExportingShortVideoDetails,
    messageApi,
    setIsExportingShortVideoDetails,
    shortVideoScope,
  ]);

  const handleExportLiveDetailsAction = useCallback(() => {
    void handleExportLiveDetails();
  }, [handleExportLiveDetails]);

  const handleExportShortVideoDetailsAction = useCallback(() => {
    void handleExportShortVideoDetails();
  }, [handleExportShortVideoDetails]);

  const handleExportLiveGoodsDetailsAction = useCallback(() => {
    void handleExportLiveGoodsDetails();
  }, [handleExportLiveGoodsDetails]);

  return {
    handleExportLiveDetailsAction,
    handleExportLiveGoodsDetailsAction,
    handleExportShortVideoDetailsAction,
    disableLiveDetailExport: isDashboardDetailExportDisabled({
      isAuthenticated,
      isLoading: liveDetailLoading,
      rowCount: activeLiveDetailRows.length,
    }),
    disableLiveGoodsDetailExport: isDashboardDetailExportDisabled({
      isAuthenticated,
      isLoading: liveGoodsLoading,
      rowCount: liveGoodsSessionCount,
    }),
    disableShortVideoDetailExport: isDashboardDetailExportDisabled({
      isAuthenticated,
      isLoading: shortVideoDetailLoading,
      rowCount: activeShortVideoDetailRows.length,
    }),
  };
}
