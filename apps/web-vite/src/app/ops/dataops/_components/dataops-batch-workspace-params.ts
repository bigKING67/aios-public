import type { useDataOpsHubFoundationState } from './dataops-hub-foundation-state';
import type { useDataOpsBatchWorkspaceState } from './dataops-batch-workspace-state';

type DataOpsHubFoundationState = ReturnType<typeof useDataOpsHubFoundationState>;
type DataOpsBatchWorkspaceParams = Parameters<typeof useDataOpsBatchWorkspaceState>[0];

export function buildDataOpsBatchWorkspaceParams({
  availableAlertChannels,
  batchExecutionHistory,
  batchHistoryActionFilter,
  batchHistoryFailureFilter,
  batchHistoryKeyword,
  batchHistoryTimeRangeFilter,
  copyTextToClipboard,
  defaultAlertChannel,
  exportDataOpsCsv,
  hasOperatePermission,
  message,
  modal,
  openBatchHistoryAlertDraftModal,
  pipelineMap,
  runtimeQuery,
  selectedPipelines,
  setBatchHistoryModalOpen,
}: DataOpsHubFoundationState): DataOpsBatchWorkspaceParams {
  return {
    batchHistoryDerived: {
      availableAlertChannels,
      batchExecutionHistory,
      batchHistoryActionFilter,
      batchHistoryFailureFilter,
      batchHistoryKeyword,
      batchHistoryTimeRangeFilter,
      copyText: copyTextToClipboard,
      defaultAlertChannelId: defaultAlertChannel?.id,
      exportCsv: exportDataOpsCsv,
      hasOperatePermission,
      message,
      openAlertDraft: openBatchHistoryAlertDraftModal,
    },
    batchOperation: {
      hasOperatePermission,
      message,
      modal,
      pipelineMap,
      refetchRuntime: runtimeQuery.refetch,
      selectedPipelines,
      setBatchHistoryModalOpen,
    },
    batchResult: {
      copyText: copyTextToClipboard,
      message,
    },
  };
}
