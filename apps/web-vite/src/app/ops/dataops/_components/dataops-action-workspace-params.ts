import type { useDataOpsActionColumnsWorkspaceState } from './dataops-action-columns-workspace-state';
import type { useDataOpsBatchWorkspaceState } from './dataops-batch-workspace-state';
import type { useDataOpsHubFoundationState } from './dataops-hub-foundation-state';
import type { useDataOpsNotificationWorkspaceState } from './dataops-notification-workspace-state';
import type { useDataOpsUrlStateEffects } from './dataops-url-state-effects';

type DataOpsActionColumnsWorkspaceParams = Parameters<
  typeof useDataOpsActionColumnsWorkspaceState
>[0];
type DataOpsBatchWorkspaceState = ReturnType<typeof useDataOpsBatchWorkspaceState>;
type DataOpsHubFoundationState = ReturnType<typeof useDataOpsHubFoundationState>;
type DataOpsNotificationWorkspaceState = ReturnType<
  typeof useDataOpsNotificationWorkspaceState
>;
type DataOpsUrlState = ReturnType<typeof useDataOpsUrlStateEffects>;

type BuildDataOpsActionColumnsWorkspaceParamsInput = {
  batchWorkspaceState: DataOpsBatchWorkspaceState;
  foundationState: DataOpsHubFoundationState;
  notificationWorkspaceState: DataOpsNotificationWorkspaceState;
  urlState: DataOpsUrlState;
};

export function buildDataOpsActionColumnsWorkspaceParams({
  batchWorkspaceState,
  foundationState,
  notificationWorkspaceState,
  urlState,
}: BuildDataOpsActionColumnsWorkspaceParamsInput): DataOpsActionColumnsWorkspaceParams {
  const {
    actionMutation,
    activeActionKey,
    availableAlertChannels,
    batchTriggerForm,
    batchTriggerModalPipelineIds,
    batchTriggerModalSpecs,
    batchTriggerPayloadPreview,
    closeBatchTriggerModal,
    closeTriggerModal,
    copyTextToClipboard,
    currentNotifyShareFilters,
    defaultAlertChannel,
    executeAction,
    exportDataOpsCsv,
    hasOperatePermission,
    message,
    modal,
    notificationChannelMap,
    openBatchHistoryAlertDraftModal,
    openCommandModal,
    openTriggerModal,
    resolveAuditScopeLabel,
    triggerForm,
    triggerModalPipeline,
    triggerModalSpecs,
  } = foundationState;
  const {
    applyNotifyReasonHashFilter,
    applyNotifyRetryGroupFilter,
    copyRetryGroupTraceLink: copyRetryGroupTraceLinkAction,
    notificationBatchRetrySubmitting,
    notificationFailureAlertTemplateText,
    notificationMarkdownText,
    notificationRetryReport,
    notificationTraceSloScanRunning,
    openRetryGroupTraceModalById,
  } = notificationWorkspaceState;
  const {
    batchActionKey,
    handleBatchOperation,
    openBatchHistoryResult,
    retryFromBatchHistory,
  } = batchWorkspaceState;
  const { pathname, searchParams } = urlState;

  return {
    actionHandlers: {
      availableAlertChannels,
      copyRetryGroupTraceLinkAction,
      copyText: copyTextToClipboard,
      currentNotifyShareFilters,
      defaultAlertChannelId: defaultAlertChannel?.id,
      executeAction,
      exportCsv: exportDataOpsCsv,
      hasOperatePermission,
      message,
      modal,
      notificationChannelMap,
      notificationFailureAlertTemplateText,
      notificationMarkdownText,
      notificationRetryReport,
      openAlertDraft: openBatchHistoryAlertDraftModal,
      pathname,
      searchParams,
    },
    globalAction: {
      actionPending: actionMutation.isPending,
      activeActionKey,
      batchActionKey,
      notificationBatchRetrySubmitting,
      notificationTraceSloScanRunning,
    },
    tableColumns: {
      actionPending: actionMutation.isPending,
      activeActionKey,
      availableAlertChannels,
      hasOperatePermission,
      notificationChannelMap,
      onApplyReasonHashFilter: applyNotifyReasonHashFilter,
      onApplyRetryGroupFilter: applyNotifyRetryGroupFilter,
      onCopy: copyTextToClipboard,
      onOpenCommandModal: openCommandModal,
      onOpenRetryGroupTrace: openRetryGroupTraceModalById,
      onOpenTriggerModal: openTriggerModal,
      onRetryBatchHistory: retryFromBatchHistory,
      onViewBatchResult: openBatchHistoryResult,
      resolveAuditScopeLabel,
    },
    triggerSubmit: {
      actionPending: actionMutation.isPending,
      activeActionKey,
      batchActionKey,
      batchTriggerForm,
      batchTriggerModalPipelineIds,
      batchTriggerModalSpecs,
      batchTriggerPayloadPreview,
      closeBatchTriggerModal,
      closeTriggerModal,
      executeAction,
      handleBatchOperation,
      hasOperatePermission,
      message,
      triggerForm,
      triggerModalPipeline,
      triggerModalSpecs,
    },
  };
}
