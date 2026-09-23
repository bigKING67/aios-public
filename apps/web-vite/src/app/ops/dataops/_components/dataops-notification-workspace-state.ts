'use client';
import { useDataOpsNotificationTraceSloScanState } from './dataops-notification-trace-slo-scan-state';
import { useDataOpsNotificationRetryState } from './dataops-notification-retry-state';
import { useDataOpsRetryGroupTraceState } from './dataops-retry-group-trace-state';
import { useDataOpsNotificationFilterState } from './dataops-notification-filter-state';

type RetryGroupTraceParams = Parameters<typeof useDataOpsRetryGroupTraceState>[0];
type NotificationFilterParams = Parameters<typeof useDataOpsNotificationFilterState>[0];
type NotificationRetryParams = Omit<
  Parameters<typeof useDataOpsNotificationRetryState>[0],
  | 'activeRetryGroupTraceId'
  | 'filteredFailedNotificationEvents'
  | 'retryGroupTraceFailedEvents'
  | 'retryGroupTraceRetryableFailedEvents'
  | 'selectedReasonFailedNotificationEvents'
>;
type NotificationTraceSloScanParams = Omit<
  Parameters<typeof useDataOpsNotificationTraceSloScanState>[0],
  'onOpenRetryGroupTrace'
>;

type UseDataOpsNotificationWorkspaceStateParams = {
  notificationFilter: NotificationFilterParams;
  notificationRetry: NotificationRetryParams;
  notificationTraceSloScan: NotificationTraceSloScanParams;
  retryGroupTrace: RetryGroupTraceParams;
};

export function useDataOpsNotificationWorkspaceState({
  notificationFilter,
  notificationRetry,
  notificationTraceSloScan,
  retryGroupTrace,
}: UseDataOpsNotificationWorkspaceStateParams) {
  const retryGroupTraceState = useDataOpsRetryGroupTraceState(retryGroupTrace);
  const notificationFilterState = useDataOpsNotificationFilterState(notificationFilter);
  const notificationRetryState = useDataOpsNotificationRetryState({
    ...notificationRetry,
    activeRetryGroupTraceId: retryGroupTraceState.activeRetryGroupTraceId,
    filteredFailedNotificationEvents: notificationFilterState.filteredFailedNotificationEvents,
    retryGroupTraceFailedEvents: retryGroupTraceState.retryGroupTraceFailedEvents,
    retryGroupTraceRetryableFailedEvents: retryGroupTraceState.retryGroupTraceRetryableFailedEvents,
    selectedReasonFailedNotificationEvents:
      notificationFilterState.selectedReasonFailedNotificationEvents,
  });
  const notificationTraceSloScanState = useDataOpsNotificationTraceSloScanState({
    ...notificationTraceSloScan,
    onOpenRetryGroupTrace: retryGroupTraceState.openRetryGroupTraceModalById,
  });

  return {
    ...retryGroupTraceState,
    ...notificationFilterState,
    ...notificationRetryState,
    ...notificationTraceSloScanState,
  };
}
