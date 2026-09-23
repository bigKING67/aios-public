import { useCallback, useMemo } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import { request } from '@/lib/request';
import { getActionErrorMessage } from './dataops-action-helpers';
import type {
  BatchExecutionSummary,
  BatchOperationFailureContext,
} from './dataops-batch-helpers';
import { buildDataOpsBatchResultDerivedState } from './dataops-batch-result-selectors';
import type { BatchResultFilter } from './dataops-hub-formatters';
import { copyDataOpsBatchFailedPipelineIds } from './dataops-feedback-actions';

export function useDataOpsBatchHistoryPersistenceState(options: {
  message: MessageInstance;
}) {
  const { message } = options;

  const persistBatchExecutionHistory = useCallback(
    async (summary: BatchExecutionSummary) => {
      try {
        await request.post<{ success: boolean; id?: string; message: string }>(
          '/dataops/batch-executions',
          {
            action: summary.action,
            label: summary.label,
            executedAt: summary.executedAt,
            totalCount: summary.totalCount,
            successCount: summary.successCount,
            failedCount: summary.failedCount,
            skippedCount: summary.skippedCount,
            parameters: summary.parameters,
            items: summary.items,
          },
          {
            cancelPrevious: false,
            requestKey: `dataops-batch-history-${summary.action}-${summary.executedAt}`,
          }
        );
      } catch (error) {
        message.warning(`批量历史写入失败：${getActionErrorMessage(error)}`);
      }
    },
    [message]
  );

  return { persistBatchExecutionHistory };
}

export function useDataOpsBatchResultState(options: {
  batchResultFilter: BatchResultFilter;
  copyText: (text: string, label: string) => Promise<void>;
  lastBatchExecutionSummary: BatchExecutionSummary | null;
  lastBatchFailureContext: BatchOperationFailureContext | null;
  message: MessageInstance;
}) {
  const {
    batchResultFilter,
    copyText,
    lastBatchExecutionSummary,
    lastBatchFailureContext,
    message,
  } = options;

  const batchResultDerivedState = useMemo(
    () =>
      buildDataOpsBatchResultDerivedState({
        lastBatchFailureContext,
        lastBatchExecutionSummary,
        filter: batchResultFilter,
      }),
    [batchResultFilter, lastBatchExecutionSummary, lastBatchFailureContext]
  );

  const copyBatchFailedPipelineIds = useCallback(async () => {
    await copyDataOpsBatchFailedPipelineIds({
      summary: lastBatchExecutionSummary,
      copyText,
      info: message.info,
    });
  }, [copyText, lastBatchExecutionSummary, message]);

  return {
    batchResultFailedPipelineIds: batchResultDerivedState.failedPipelineIds,
    batchResultRetryableFailedCount: batchResultDerivedState.retryableFailedCountInItems,
    copyBatchFailedPipelineIds,
    filteredBatchResultItems: batchResultDerivedState.filteredItems,
    retryableFailedCount: batchResultDerivedState.retryableFailedCount,
  };
}
