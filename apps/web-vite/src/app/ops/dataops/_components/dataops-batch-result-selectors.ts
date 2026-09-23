import {
  countBatchResultRetryableFailures,
  filterBatchResultItems,
  resolveBatchResultFailedPipelineIds,
  type BatchExecutionSummary,
  type BatchOperationFailureContext,
} from './dataops-batch-helpers';
import type { BatchResultFilter } from './dataops-hub-formatters';

export interface DataOpsBatchResultDerivedState {
  retryableFailedCount: number;
  items: BatchExecutionSummary['items'];
  failedPipelineIds: string[];
  retryableFailedCountInItems: number;
  filteredItems: BatchExecutionSummary['items'];
}

export function buildDataOpsBatchResultDerivedState({
  lastBatchFailureContext,
  lastBatchExecutionSummary,
  filter,
}: {
  lastBatchFailureContext: BatchOperationFailureContext | null;
  lastBatchExecutionSummary: BatchExecutionSummary | null;
  filter: BatchResultFilter;
}): DataOpsBatchResultDerivedState {
  const items = lastBatchExecutionSummary?.items || [];

  return {
    retryableFailedCount: lastBatchFailureContext?.retryableFailedPipelineIds.length || 0,
    items,
    failedPipelineIds: resolveBatchResultFailedPipelineIds(items, {
      retryableOnly: false,
    }),
    retryableFailedCountInItems: countBatchResultRetryableFailures(items),
    filteredItems: filterBatchResultItems(items, filter),
  };
}
