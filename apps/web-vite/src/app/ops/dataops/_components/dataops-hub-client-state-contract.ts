import type { useDataOpsUrlStateEffects } from './dataops-url-state-effects';
import type { useDataOpsOverviewDerivedState } from './dataops-overview-derived-state';
import type { useDataOpsHubFoundationState } from './dataops-hub-foundation-state';
import type { useDataOpsNotificationWorkspaceState } from './dataops-notification-workspace-state';
import type { useDataOpsBatchWorkspaceState } from './dataops-batch-workspace-state';
import type { useDataOpsActionColumnsWorkspaceState } from './dataops-action-columns-workspace-state';

type DataOpsHubFoundationState = ReturnType<typeof useDataOpsHubFoundationState>;
type DataOpsNotificationWorkspaceState = ReturnType<
  typeof useDataOpsNotificationWorkspaceState
>;
type DataOpsBatchWorkspaceState = ReturnType<typeof useDataOpsBatchWorkspaceState>;
type DataOpsActionColumnsWorkspaceState = ReturnType<
  typeof useDataOpsActionColumnsWorkspaceState
>;
type DataOpsOverviewDerivedState = ReturnType<typeof useDataOpsOverviewDerivedState>;
type DataOpsUrlState = ReturnType<typeof useDataOpsUrlStateEffects>;
type DataOpsHubFoundationInternalKeys =
  | 'auditQuickFilterState'
  | 'availableAlertChannelIdSet'
  | 'batchTriggerPayloadPreview'
  | 'currentNotifyShareFilters'
  | 'executeAction'
  | 'exportDataOpsCsv'
  | 'getCurrentNotifyShareFilters'
  | 'message'
  | 'modal'
  | 'normalizedKeyword'
  | 'normalizedNotifyReasonHashFilter'
  | 'normalizedNotifyRetryGroupIdFilter'
  | 'notificationChannelMap'
  | 'openBatchHistoryAlertDraftModal'
  | 'pipelineMap'
  | 'runtimeStore'
  | 'selectedPipelines';
type DataOpsHubFoundationPublicState = Omit<
  DataOpsHubFoundationState,
  DataOpsHubFoundationInternalKeys
>;
type DataOpsNotificationInternalKeys =
  | 'copyRetryGroupTraceLink'
  | 'pendingRetryGroupTraceIdFromUrl'
  | 'setActiveRetryGroupTraceId'
  | 'setPendingRetryGroupTraceIdFromUrl'
  | 'setRetryGroupTraceModalOpen'
  | 'setRetryGroupTraceReasonHashFocus';
type DataOpsNotificationPublicState = Omit<
  DataOpsNotificationWorkspaceState,
  DataOpsNotificationInternalKeys
>;

export interface BuildDataOpsHubClientStateInput {
  actionColumnsWorkspaceState: DataOpsActionColumnsWorkspaceState;
  auditQuickFilterState: DataOpsHubFoundationState['auditQuickFilterState'];
  batchWorkspaceState: DataOpsBatchWorkspaceState;
  foundationState: DataOpsHubFoundationState;
  notificationWorkspaceState: DataOpsNotificationWorkspaceState;
  overviewDerivedState: DataOpsOverviewDerivedState;
  urlState: DataOpsUrlState;
}

function pickDataOpsHubFoundationPublicState(
  foundationState: DataOpsHubFoundationState,
): DataOpsHubFoundationPublicState {
  const {
    auditQuickFilterState: _auditQuickFilterState,
    availableAlertChannelIdSet: _availableAlertChannelIdSet,
    batchTriggerPayloadPreview: _batchTriggerPayloadPreview,
    currentNotifyShareFilters: _currentNotifyShareFilters,
    executeAction: _executeAction,
    exportDataOpsCsv: _exportDataOpsCsv,
    getCurrentNotifyShareFilters: _getCurrentNotifyShareFilters,
    message: _message,
    modal: _modal,
    normalizedKeyword: _normalizedKeyword,
    normalizedNotifyReasonHashFilter: _normalizedNotifyReasonHashFilter,
    normalizedNotifyRetryGroupIdFilter: _normalizedNotifyRetryGroupIdFilter,
    notificationChannelMap: _notificationChannelMap,
    openBatchHistoryAlertDraftModal: _openBatchHistoryAlertDraftModal,
    pipelineMap: _pipelineMap,
    runtimeStore: _runtimeStore,
    selectedPipelines: _selectedPipelines,
    ...foundationPublicState
  } = foundationState;

  return foundationPublicState;
}

function pickDataOpsNotificationPublicState(
  notificationWorkspaceState: DataOpsNotificationWorkspaceState,
): DataOpsNotificationPublicState {
  const {
    copyRetryGroupTraceLink: _copyRetryGroupTraceLinkAction,
    pendingRetryGroupTraceIdFromUrl: _pendingRetryGroupTraceIdFromUrl,
    setActiveRetryGroupTraceId: _setActiveRetryGroupTraceId,
    setPendingRetryGroupTraceIdFromUrl: _setPendingRetryGroupTraceIdFromUrl,
    setRetryGroupTraceModalOpen: _setRetryGroupTraceModalOpen,
    setRetryGroupTraceReasonHashFocus: _setRetryGroupTraceReasonHashFocus,
    ...notificationPublicState
  } = notificationWorkspaceState;

  return notificationPublicState;
}

export function buildDataOpsHubClientState({
  actionColumnsWorkspaceState,
  auditQuickFilterState,
  batchWorkspaceState,
  foundationState,
  notificationWorkspaceState,
  overviewDerivedState,
  urlState,
}: BuildDataOpsHubClientStateInput) {
  return {
    ...pickDataOpsHubFoundationPublicState(foundationState),
    ...pickDataOpsNotificationPublicState(notificationWorkspaceState),
    ...urlState,
    ...batchWorkspaceState,
    ...actionColumnsWorkspaceState,
    ...auditQuickFilterState,
    ...overviewDerivedState,
  };
}

export type DataOpsHubClientState = ReturnType<typeof buildDataOpsHubClientState>;
