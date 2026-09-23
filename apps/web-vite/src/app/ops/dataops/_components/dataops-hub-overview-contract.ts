import { DATAOPS_HUB_NAME } from '@/config/dataops-hub-metadata';
import {
  TAB_ITEMS,
  type TabKey,
} from './dataops-hub-formatters';
import type { DataOpsHubClientState } from './dataops-hub-client-state-contract';
import type { DataOpsHubOverviewProps } from './dataops-hub-overview';

export function pickDataOpsHubOverviewProps(
  state: DataOpsHubClientState,
): DataOpsHubOverviewProps {
  return {
    englishName: DATAOPS_HUB_NAME.englishName,
    pageName: DATAOPS_HUB_NAME.pageName,
    metrics: state.metrics,
    metricStatusItems: state.metricStatusItems,
    snapshotAt: state.snapshotAt,
    runtimeStorageModeLabel: state.runtimeStoreDerivedState.runtimeStorageModeLabel,
    runtimeLockModeLabel: state.runtimeStoreDerivedState.runtimeLockModeLabel,
    hasOperatePermission: state.hasOperatePermission,
    hasImportantRisk: state.hasImportantRisk,
    defaultAlertChannelName: state.defaultAlertChannel?.channelName || '未配置',
    keywordInput: state.keywordInput,
    onKeywordInputChange: state.setKeywordInput,
    statusFilter: state.statusFilter,
    onStatusFilterChange: state.setStatusFilter,
    runtimeFetching: state.runtimeQuery.isFetching,
    onRefreshRuntime: () => {
      void state.runtimeQuery.refetch();
    },
    onOpenRuntimeDetails: () => state.setRuntimeDetailDrawerOpen(true),
    systemNoticeCount: state.systemNoticeCount,
    runtimeErrorMessage: state.runtimeQuery.error?.message,
    runtimeWarnings: state.runtimeWarnings,
    tabItems: TAB_ITEMS,
    activeTab: state.activeTab,
    onTabChange: (nextTab) => state.setActiveTab(nextTab as TabKey),
    statusFilterLabel: state.statusFilterLabel,
    keywordFilterText: state.keywordFilterText,
    filteredPipelineCount: state.filteredPipelines.length,
  };
}
