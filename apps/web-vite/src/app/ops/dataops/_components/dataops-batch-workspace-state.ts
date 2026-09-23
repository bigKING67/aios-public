'use client';
import { useDataOpsBatchOperationState } from './dataops-batch-operation-state';
import { useDataOpsBatchHistoryDerivedState } from './dataops-batch-history-derived-state';
import {
  useDataOpsBatchHistoryPersistenceState,
  useDataOpsBatchResultState,
} from './dataops-batch-result-state';

type BatchOperationParams = Omit<
  Parameters<typeof useDataOpsBatchOperationState>[0],
  'persistBatchExecutionHistory'
>;
type BatchResultParams = Omit<
  Parameters<typeof useDataOpsBatchResultState>[0],
  'batchResultFilter' | 'lastBatchExecutionSummary' | 'lastBatchFailureContext'
>;
type BatchHistoryDerivedParams = Omit<
  Parameters<typeof useDataOpsBatchHistoryDerivedState>[0],
  'retryFilteredBatchHistory'
>;

type UseDataOpsBatchWorkspaceStateParams = {
  batchHistoryDerived: BatchHistoryDerivedParams;
  batchOperation: BatchOperationParams;
  batchResult: BatchResultParams;
};

export function useDataOpsBatchWorkspaceState({
  batchHistoryDerived,
  batchOperation,
  batchResult,
}: UseDataOpsBatchWorkspaceStateParams) {
  const { persistBatchExecutionHistory } = useDataOpsBatchHistoryPersistenceState({
    message: batchOperation.message,
  });
  const batchOperationState = useDataOpsBatchOperationState({
    ...batchOperation,
    persistBatchExecutionHistory,
  });
  const batchResultState = useDataOpsBatchResultState({
    ...batchResult,
    batchResultFilter: batchOperationState.batchResultFilter,
    lastBatchExecutionSummary: batchOperationState.lastBatchExecutionSummary,
    lastBatchFailureContext: batchOperationState.lastBatchFailureContext,
  });
  const batchHistoryDerivedState = useDataOpsBatchHistoryDerivedState({
    ...batchHistoryDerived,
    retryFilteredBatchHistory: batchOperationState.retryFilteredBatchHistory,
  });

  return {
    ...batchOperationState,
    ...batchResultState,
    ...batchHistoryDerivedState,
  };
}
