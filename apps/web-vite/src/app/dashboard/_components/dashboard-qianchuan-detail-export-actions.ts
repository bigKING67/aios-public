import type { MessageInstance } from 'antd/es/message/interface';
import { useCallback, useState } from 'react';

import { buildDashboardQueryDateRangeParams, type DashboardDateRangeLike } from './dashboard-date-range';
import {
  DASHBOARD_EXPORT_EMPTY_QIANCHUAN_LIVE_ROOM_SCREEN_DETAIL_MESSAGE,
  DASHBOARD_EXPORT_EMPTY_QIANCHUAN_MATERIAL_TYPE_MIX_DETAIL_MESSAGE,
  DASHBOARD_EXPORT_EMPTY_QIANCHUAN_VIDEO_DETAIL_MESSAGE,
  DASHBOARD_EXPORT_LOGIN_REQUIRED_MESSAGE,
  buildDashboardExportSuccessMessage,
  downloadDashboardCsvFile,
  isDashboardDetailExportDisabled,
} from './dashboard-export';
import { resolveDashboardExportErrorMessage } from './dashboard-errors';
import {
  buildDashboardQianchuanLiveRoomScreenDetailCsvExport,
  buildDashboardQianchuanLiveVideoDetailCsvExport,
  buildDashboardQianchuanMaterialTypeMixDetailCsvExport,
} from './dashboard-qianchuan-detail-export';
import type {
  DashboardQianchuanApiResponse,
  DashboardQianchuanLiveRoomScreenRow,
  DashboardQianchuanLiveVideoRow,
  DashboardQianchuanMaterialTypeMixRow,
} from './dashboard-qianchuan-types';

type DashboardQianchuanDetailExportActionsArgs = {
  currentRange?: DashboardDateRangeLike;
  isAuthenticated: boolean;
  isLoading: boolean;
  liveRoomScreenRows: DashboardQianchuanLiveRoomScreenRow[];
  liveVideoRows: DashboardQianchuanLiveVideoRow[];
  materialTypeMixRows: DashboardQianchuanMaterialTypeMixRow[];
  messageApi?: MessageInstance;
  responseData: DashboardQianchuanApiResponse | null;
};

function getQianchuanExportDateRange(
  currentRange: DashboardDateRangeLike | undefined,
  responseData: DashboardQianchuanApiResponse | null
): { startDate: string; endDate: string } {
  if (currentRange) {
    return buildDashboardQueryDateRangeParams(currentRange);
  }

  const bounds = responseData?.dataDateBounds ?? null;
  const startDate = responseData?.startDate ?? bounds?.startDate ?? bounds?.minDate ?? 'unknown-start';
  const endDate = responseData?.endDate ?? bounds?.endDate ?? bounds?.maxDate ?? startDate ?? 'unknown-end';

  return { startDate, endDate };
}

export function useDashboardQianchuanDetailExportActions({
  currentRange,
  isAuthenticated,
  isLoading,
  liveRoomScreenRows,
  liveVideoRows,
  materialTypeMixRows,
  messageApi,
  responseData,
}: DashboardQianchuanDetailExportActionsArgs) {
  const [isExportingMaterialTypeMixDetails, setIsExportingMaterialTypeMixDetails] = useState(false);
  const [isExportingLiveRoomScreenDetails, setIsExportingLiveRoomScreenDetails] = useState(false);
  const [isExportingLiveVideoDetails, setIsExportingLiveVideoDetails] = useState(false);

  const disableMaterialTypeMixDetailExport = isDashboardDetailExportDisabled({
    isAuthenticated,
    isLoading,
    rowCount: materialTypeMixRows.length,
  });
  const disableLiveVideoDetailExport = isDashboardDetailExportDisabled({
    isAuthenticated,
    isLoading,
    rowCount: liveVideoRows.length,
  });
  const disableLiveRoomScreenDetailExport = isDashboardDetailExportDisabled({
    isAuthenticated,
    isLoading,
    rowCount: liveRoomScreenRows.length,
  });

  const handleExportMaterialTypeMixDetails = useCallback(() => {
    if (isExportingMaterialTypeMixDetails) {
      return;
    }
    if (!isAuthenticated) {
      messageApi?.info(DASHBOARD_EXPORT_LOGIN_REQUIRED_MESSAGE);
      return;
    }
    if (!materialTypeMixRows.length) {
      messageApi?.info(DASHBOARD_EXPORT_EMPTY_QIANCHUAN_MATERIAL_TYPE_MIX_DETAIL_MESSAGE);
      return;
    }

    const { startDate, endDate } = getQianchuanExportDateRange(currentRange, responseData);
    setIsExportingMaterialTypeMixDetails(true);
    try {
      const { csvText, fileName } = buildDashboardQianchuanMaterialTypeMixDetailCsvExport({
        rows: materialTypeMixRows,
        startDate,
        endDate,
      });

      downloadDashboardCsvFile(csvText, fileName);
      messageApi?.success(
        buildDashboardExportSuccessMessage(materialTypeMixRows.length, '千川内容类型对比明细', fileName)
      );
    } catch (error) {
      messageApi?.error(resolveDashboardExportErrorMessage(error));
    } finally {
      setIsExportingMaterialTypeMixDetails(false);
    }
  }, [
    currentRange,
    isAuthenticated,
    isExportingMaterialTypeMixDetails,
    materialTypeMixRows,
    messageApi,
    responseData,
  ]);

  const handleExportLiveRoomScreenDetails = useCallback(() => {
    if (isExportingLiveRoomScreenDetails) {
      return;
    }
    if (!isAuthenticated) {
      messageApi?.info(DASHBOARD_EXPORT_LOGIN_REQUIRED_MESSAGE);
      return;
    }
    if (!liveRoomScreenRows.length) {
      messageApi?.info(DASHBOARD_EXPORT_EMPTY_QIANCHUAN_LIVE_ROOM_SCREEN_DETAIL_MESSAGE);
      return;
    }

    const { startDate, endDate } = getQianchuanExportDateRange(currentRange, responseData);
    setIsExportingLiveRoomScreenDetails(true);
    try {
      const { csvText, fileName } = buildDashboardQianchuanLiveRoomScreenDetailCsvExport({
        rows: liveRoomScreenRows,
        startDate,
        endDate,
      });

      downloadDashboardCsvFile(csvText, fileName);
      messageApi?.success(
        buildDashboardExportSuccessMessage(liveRoomScreenRows.length, '千川直播间画面明细', fileName)
      );
    } catch (error) {
      messageApi?.error(resolveDashboardExportErrorMessage(error));
    } finally {
      setIsExportingLiveRoomScreenDetails(false);
    }
  }, [
    currentRange,
    isAuthenticated,
    isExportingLiveRoomScreenDetails,
    liveRoomScreenRows,
    messageApi,
    responseData,
  ]);

  const handleExportLiveVideoDetails = useCallback(() => {
    if (isExportingLiveVideoDetails) {
      return;
    }
    if (!isAuthenticated) {
      messageApi?.info(DASHBOARD_EXPORT_LOGIN_REQUIRED_MESSAGE);
      return;
    }
    if (!liveVideoRows.length) {
      messageApi?.info(DASHBOARD_EXPORT_EMPTY_QIANCHUAN_VIDEO_DETAIL_MESSAGE);
      return;
    }

    const { startDate, endDate } = getQianchuanExportDateRange(currentRange, responseData);
    setIsExportingLiveVideoDetails(true);
    try {
      const { csvText, fileName } = buildDashboardQianchuanLiveVideoDetailCsvExport({
        rows: liveVideoRows,
        startDate,
        endDate,
      });

      downloadDashboardCsvFile(csvText, fileName);
      messageApi?.success(buildDashboardExportSuccessMessage(liveVideoRows.length, '千川视频明细', fileName));
    } catch (error) {
      messageApi?.error(resolveDashboardExportErrorMessage(error));
    } finally {
      setIsExportingLiveVideoDetails(false);
    }
  }, [
    currentRange,
    isAuthenticated,
    isExportingLiveVideoDetails,
    liveVideoRows,
    messageApi,
    responseData,
  ]);

  return {
    disableLiveRoomScreenDetailExport,
    disableLiveVideoDetailExport,
    disableMaterialTypeMixDetailExport,
    handleExportLiveRoomScreenDetails,
    handleExportLiveVideoDetails,
    handleExportMaterialTypeMixDetails,
    isExportingLiveRoomScreenDetails,
    isExportingLiveVideoDetails,
    isExportingMaterialTypeMixDetails,
  };
}
