import { useCallback, useMemo, useState } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { ModalStaticFunctions } from 'antd/es/modal/confirm';

import type { DataOpsRuntimePipeline } from '@/types/dataops';
import {
  type BatchOperationAction,
  type BatchResultFilter,
} from './dataops-hub-formatters';
import {
  buildBatchHistoryRetryCompletionText,
  buildBatchHistoryRetryPlan,
  resolveFailedPipelineIdsFromSummary,
  type BatchExecutionSummary,
  type BatchHistoryRetryGroup,
  type BatchOperationFailureContext,
  type BatchOperationOptions,
} from './dataops-batch-helpers';
import { executeDataOpsBatchOperation } from './dataops-batch-operation-executor';
import {
  buildDataOpsBatchResultCloseState,
  buildDataOpsBatchResultOpenState,
} from './dataops-batch-result-modal-helpers';

export function useDataOpsBatchOperationState(options: {
  hasOperatePermission: boolean;
  message: MessageInstance;
  modal: Pick<ModalStaticFunctions, 'confirm'>;
  persistBatchExecutionHistory: (summary: BatchExecutionSummary) => Promise<void>;
  pipelineMap: ReadonlyMap<string, DataOpsRuntimePipeline>;
  refetchRuntime: () => Promise<unknown>;
  selectedPipelines: DataOpsRuntimePipeline[];
  setBatchHistoryModalOpen: (value: boolean) => void;
}) {
  const {
    hasOperatePermission,
    message,
    modal,
    persistBatchExecutionHistory,
    pipelineMap,
    refetchRuntime,
    selectedPipelines,
    setBatchHistoryModalOpen,
  } = options;
  const [batchActionKey, setBatchActionKey] = useState<BatchOperationAction | null>(null);
  const [lastBatchFailureContext, setLastBatchFailureContext] =
    useState<BatchOperationFailureContext | null>(null);
  const [lastBatchExecutionSummary, setLastBatchExecutionSummary] =
    useState<BatchExecutionSummary | null>(null);
  const [batchResultModalOpen, setBatchResultModalOpen] = useState(false);
  const [batchResultFilter, setBatchResultFilter] = useState<BatchResultFilter>('all');

  const openBatchResultModal = useCallback(() => {
    if (!lastBatchExecutionSummary) {
      message.info('暂无批量执行结果可查看。');
      return;
    }

    const nextState = buildDataOpsBatchResultOpenState(lastBatchExecutionSummary);
    setLastBatchFailureContext(nextState.failureContext);
    setBatchResultFilter(nextState.filter);
    setBatchResultModalOpen(nextState.open);
  }, [lastBatchExecutionSummary, message]);

  const closeBatchResultModal = useCallback(() => {
    const nextState = buildDataOpsBatchResultCloseState();
    setBatchResultModalOpen(nextState.open);
    setBatchResultFilter(nextState.filter);
  }, []);

  const handleBatchOperation = useCallback(
    async (
      action: BatchOperationAction,
      label: string,
      operationOptions: BatchOperationOptions = {}
    ): Promise<boolean> => {
      return executeDataOpsBatchOperation({
        action,
        label,
        operationOptions,
        hasOperatePermission,
        message,
        modal,
        persistBatchExecutionHistory,
        pipelineMap,
        refetchRuntime,
        selectedPipelines,
        setBatchActionKey,
        setLastBatchExecutionSummary,
        setLastBatchFailureContext,
      });
    },
    [
      hasOperatePermission,
      message,
      modal,
      persistBatchExecutionHistory,
      pipelineMap,
      refetchRuntime,
      selectedPipelines,
    ]
  );

  const retryLastFailedBatch = useCallback(async () => {
    if (!lastBatchFailureContext?.failedPipelineIds.length) {
      message.info('当前没有可重试的失败任务。');
      return;
    }

    await handleBatchOperation(
      lastBatchFailureContext.action,
      `${lastBatchFailureContext.label}重试`,
      {
        pipelineIds: lastBatchFailureContext.failedPipelineIds,
        parameters: lastBatchFailureContext.parameters,
        requireConfirm: false,
        requestKeySuffix: 'retry',
      }
    );
  }, [handleBatchOperation, lastBatchFailureContext, message]);

  const retryLastRetryableFailedBatch = useCallback(async () => {
    if (!lastBatchFailureContext?.retryableFailedPipelineIds.length) {
      message.info('当前没有可重试失败项（网络/锁冲突）。');
      return;
    }

    await handleBatchOperation(
      lastBatchFailureContext.action,
      `${lastBatchFailureContext.label}可重试失败重跑`,
      {
        pipelineIds: lastBatchFailureContext.retryableFailedPipelineIds,
        parameters: lastBatchFailureContext.parameters,
        requireConfirm: false,
        requestKeySuffix: 'retryable',
      }
    );
  }, [handleBatchOperation, lastBatchFailureContext, message]);

  const retryFromBatchHistory = useCallback(
    async (summary: BatchExecutionSummary, retryOptions: { retryableOnly: boolean }) => {
      if (!hasOperatePermission) {
        message.warning('当前账号仅有查看权限，无法执行批量操作。');
        return;
      }

      const targetPipelineIds = resolveFailedPipelineIdsFromSummary(summary, retryOptions);
      if (!targetPipelineIds.length) {
        message.info(retryOptions.retryableOnly ? '该批次没有可重试失败项。' : '该批次没有失败项。');
        return;
      }

      const label = retryOptions.retryableOnly
        ? `${summary.label}历史可重试失败重跑`
        : `${summary.label}历史失败重跑`;

      const success = await handleBatchOperation(summary.action, label, {
        pipelineIds: targetPipelineIds,
        parameters: summary.parameters,
        requireConfirm: false,
        requestKeySuffix: retryOptions.retryableOnly ? 'history-retryable' : 'history-retry',
      });

      if (success) {
        setBatchHistoryModalOpen(false);
      }
    },
    [handleBatchOperation, hasOperatePermission, message, setBatchHistoryModalOpen]
  );

  const openBatchHistoryResult = useCallback(
    (
      summary: BatchExecutionSummary,
      failureContext: BatchOperationFailureContext | null
    ) => {
      setLastBatchExecutionSummary(summary);
      setLastBatchFailureContext(failureContext);
      setBatchResultFilter('all');
      setBatchResultModalOpen(true);
      setBatchHistoryModalOpen(false);
    },
    [setBatchHistoryModalOpen]
  );

  const retryFilteredBatchHistory = useCallback(
    async (
      retryOptions: { retryableOnly: boolean },
      groups: {
        retryGroups: BatchHistoryRetryGroup[];
        retryableGroups: BatchHistoryRetryGroup[];
      }
    ) => {
      if (!hasOperatePermission) {
        message.warning('当前账号仅有查看权限，无法执行批量操作。');
        return;
      }

      const targetGroups = retryOptions.retryableOnly
        ? groups.retryableGroups
        : groups.retryGroups;
      if (!targetGroups.length) {
        message.info(retryOptions.retryableOnly ? '当前筛选条件下没有可重试失败项。' : '当前筛选条件下没有失败项。');
        return;
      }

      const retryPlan = buildBatchHistoryRetryPlan(targetGroups, retryOptions);

      const confirmed = await new Promise<boolean>((resolve) => {
        modal.confirm({
          title: `${retryPlan.retryLabel}确认`,
          content: `将按动作和参数分 ${retryPlan.operations.length} 组顺序执行，覆盖 ${retryPlan.targetPipelineCount} 个任务。是否继续？`,
          okText: '确认执行',
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });

      if (!confirmed) {
        return;
      }

      let successGroupCount = 0;
      for (const operation of retryPlan.operations) {
        const success = await handleBatchOperation(
          operation.action,
          operation.label,
          {
            pipelineIds: operation.pipelineIds,
            parameters: operation.parameters,
            requireConfirm: false,
            requestKeySuffix: operation.requestKeySuffix,
          }
        );
        if (success) {
          successGroupCount += 1;
        }
      }

      const completionText = buildBatchHistoryRetryCompletionText({
        retryLabel: retryPlan.retryLabel,
        successGroupCount,
        totalGroupCount: retryPlan.operations.length,
      });
      if (successGroupCount === retryPlan.operations.length) {
        message.success(completionText);
        return;
      }

      message.warning(completionText);
    },
    [handleBatchOperation, hasOperatePermission, message, modal]
  );

  const batchResultActions = useMemo(
    () => ({
      batchActionKey,
      batchResultFilter,
      batchResultModalOpen,
      handleBatchOperation,
      lastBatchExecutionSummary,
      lastBatchFailureContext,
      openBatchHistoryResult,
      openBatchResultModal,
      retryFilteredBatchHistory,
      retryFromBatchHistory,
      retryLastFailedBatch,
      retryLastRetryableFailedBatch,
      setBatchResultFilter,
    }),
    [
      batchActionKey,
      batchResultFilter,
      batchResultModalOpen,
      handleBatchOperation,
      lastBatchExecutionSummary,
      lastBatchFailureContext,
      openBatchHistoryResult,
      openBatchResultModal,
      retryFilteredBatchHistory,
      retryFromBatchHistory,
      retryLastFailedBatch,
      retryLastRetryableFailedBatch,
    ]
  );

  return {
    ...batchResultActions,
    closeBatchResultModal,
  };
}
