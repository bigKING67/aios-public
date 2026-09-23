import { useCallback, type Dispatch, type SetStateAction } from 'react';

import { TAB_TO_QUERY_PLATFORM, type PlatformTabKey } from './dashboard-config';
import { buildDashboardQueryDateRangeParams, type DashboardDateRangeLike } from './dashboard-date-range';
import {
  DASHBOARD_EXPORT_EMPTY_OVERVIEW_DETAIL_MESSAGE,
  DASHBOARD_EXPORT_LOGIN_REQUIRED_MESSAGE,
  buildDashboardExportSuccessMessage,
  downloadDashboardCsvFile,
  isDashboardDetailExportDisabled,
} from './dashboard-export';
import { resolveDashboardExportErrorMessage } from './dashboard-errors';
import { buildDashboardOverviewDetailCsvExport } from './dashboard-overview-detail-export';
import type { DashboardOverviewDetailRow } from './dashboard-types';

type DashboardExportMessageApi = {
  info: (content: string) => void;
  success: (content: string) => void;
  error: (content: string) => void;
};

type DashboardOverviewDetailExportActionsArgs = {
  isAuthenticated: boolean;
  messageApi: DashboardExportMessageApi;
  currentRange: DashboardDateRangeLike;
  activeTab: PlatformTabKey;
  detailRows: DashboardOverviewDetailRow[];
  detailLoading: boolean;
  isExportingDetails: boolean;
  setIsExportingDetails: Dispatch<SetStateAction<boolean>>;
};

export function useDashboardOverviewDetailExportActions({
  isAuthenticated,
  messageApi,
  currentRange,
  activeTab,
  detailRows,
  detailLoading,
  isExportingDetails,
  setIsExportingDetails,
}: DashboardOverviewDetailExportActionsArgs) {
  const handleExportDetails = useCallback(async () => {
    if (isExportingDetails) {
      return;
    }

    if (!isAuthenticated) {
      messageApi.info(DASHBOARD_EXPORT_LOGIN_REQUIRED_MESSAGE);
      return;
    }

    if (!detailRows.length) {
      messageApi.info(DASHBOARD_EXPORT_EMPTY_OVERVIEW_DETAIL_MESSAGE);
      return;
    }

    const { startDate, endDate } = buildDashboardQueryDateRangeParams(currentRange);
    const platform = TAB_TO_QUERY_PLATFORM[activeTab];

    setIsExportingDetails(true);
    try {
      const { csvText, fileName } = buildDashboardOverviewDetailCsvExport({
        rows: detailRows,
        platform,
        startDate,
        endDate,
      });

      downloadDashboardCsvFile(csvText, fileName);
      messageApi.success(buildDashboardExportSuccessMessage(detailRows.length, '明细', fileName));
    } catch (error) {
      messageApi.error(resolveDashboardExportErrorMessage(error));
    } finally {
      setIsExportingDetails(false);
    }
  }, [
    activeTab,
    currentRange,
    detailRows,
    isAuthenticated,
    isExportingDetails,
    messageApi,
    setIsExportingDetails,
  ]);

  const handleExportOverviewDetailsAction = useCallback(() => {
    void handleExportDetails();
  }, [handleExportDetails]);

  return {
    handleExportOverviewDetailsAction,
    disableDetailExport: isDashboardDetailExportDisabled({
      isAuthenticated,
      isLoading: detailLoading,
      rowCount: detailRows.length,
    }),
  };
}
