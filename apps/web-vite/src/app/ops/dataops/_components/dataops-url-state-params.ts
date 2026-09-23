import type { useDataOpsHubFoundationState } from './dataops-hub-foundation-state';
import type { useDataOpsNotificationWorkspaceState } from './dataops-notification-workspace-state';
import type { DataOpsUrlStateEffectsOptions } from './dataops-url-state-effects';

type DataOpsHubFoundationState = ReturnType<typeof useDataOpsHubFoundationState>;
type DataOpsNotificationWorkspaceState = ReturnType<
  typeof useDataOpsNotificationWorkspaceState
>;

type BuildDataOpsUrlStateEffectsOptionsInput = {
  foundationState: DataOpsHubFoundationState;
  notificationWorkspaceState: DataOpsNotificationWorkspaceState;
};

export function buildDataOpsUrlStateEffectsOptions({
  foundationState,
  notificationWorkspaceState,
}: BuildDataOpsUrlStateEffectsOptionsInput): DataOpsUrlStateEffectsOptions {
  const {
    activeTab,
    batchHistoryActionFilter,
    batchHistoryFailureFilter,
    batchHistoryKeyword,
    batchHistoryModalOpen,
    batchHistoryTimeRangeFilter,
    channelFilter,
    notificationEventTypeFilter,
    notificationStatusFilter,
    notifyFailureChannelFocus,
    notifyReasonHashFilter,
    notifyRetryGroupIdFilter,
    selectedNotifyFailureReason,
    setActiveTab,
    setBatchHistoryActionFilter,
    setBatchHistoryFailureFilter,
    setBatchHistoryKeyword,
    setBatchHistoryModalOpen,
    setBatchHistoryTimeRangeFilter,
    setChannelFilter,
    setNotificationEventTypeFilter,
    setNotificationStatusFilter,
    setNotifyFailureChannelFocus,
    setNotifyReasonHashFilter,
    setNotifyRetryGroupIdFilter,
    setSelectedNotifyFailureReason,
  } = foundationState;
  const {
    activeRetryGroupTraceId,
    pendingRetryGroupTraceIdFromUrl,
    retryGroupTraceModalOpen,
    setActiveRetryGroupTraceId,
    setPendingRetryGroupTraceIdFromUrl,
    setRetryGroupTraceFilter,
    setRetryGroupTraceModalOpen,
    setRetryGroupTraceReasonHashFocus,
  } = notificationWorkspaceState;

  return {
    activeTab,
    batchHistoryModalOpen,
    batchHistoryActionFilter,
    batchHistoryFailureFilter,
    batchHistoryTimeRangeFilter,
    batchHistoryKeyword,
    retryGroupTraceModalOpen,
    activeRetryGroupTraceId,
    channelFilter,
    notificationEventTypeFilter,
    notificationStatusFilter,
    notifyFailureChannelFocus,
    selectedNotifyFailureReason,
    notifyReasonHashFilter,
    notifyRetryGroupIdFilter,
    pendingRetryGroupTraceIdFromUrl,
    setActiveTab,
    setBatchHistoryModalOpen,
    setBatchHistoryActionFilter,
    setBatchHistoryFailureFilter,
    setBatchHistoryTimeRangeFilter,
    setBatchHistoryKeyword,
    setChannelFilter,
    setNotificationEventTypeFilter,
    setNotificationStatusFilter,
    setNotifyFailureChannelFocus,
    setSelectedNotifyFailureReason,
    setNotifyReasonHashFilter,
    setNotifyRetryGroupIdFilter,
    setPendingRetryGroupTraceIdFromUrl,
    setActiveRetryGroupTraceId,
    setRetryGroupTraceFilter,
    setRetryGroupTraceReasonHashFocus,
    setRetryGroupTraceModalOpen,
  };
}
