import type { MessageInstance } from 'antd/es/message/interface';
import type { ModalStaticFunctions } from 'antd/es/modal/confirm';

import { request } from '@/lib/request';
import type {
  DataOpsActionRequest,
  DataOpsActionResponse,
  DataOpsRuntimePipeline,
} from '@/types/dataops';
import {
  getActionErrorMessage,
  isRetryableBatchFailure,
  isRetryableBatchFailureReason,
} from './dataops-action-helpers';
import {
  BATCH_OPERATION_CONCURRENCY,
  type BatchOperationAction,
} from './dataops-hub-formatters';
import {
  buildBatchOperationExecutionOutcome,
  buildResolvedBatchExecutionItems,
  buildSkippedBatchExecutionItems,
  splitBatchOperationPipelines,
  type BatchExecutionResultItem,
  type BatchExecutionSummary,
  type BatchOperationFailureContext,
  type BatchOperationOptions,
} from './dataops-batch-helpers';

interface ExecuteDataOpsBatchOperationParams {
  action: BatchOperationAction;
  label: string;
  operationOptions: BatchOperationOptions;
  hasOperatePermission: boolean;
  message: MessageInstance;
  modal: Pick<ModalStaticFunctions, 'confirm'>;
  persistBatchExecutionHistory: (summary: BatchExecutionSummary) => Promise<void>;
  pipelineMap: ReadonlyMap<string, DataOpsRuntimePipeline>;
  refetchRuntime: () => Promise<unknown>;
  selectedPipelines: DataOpsRuntimePipeline[];
  setBatchActionKey: (action: BatchOperationAction | null) => void;
  setLastBatchExecutionSummary: (summary: BatchExecutionSummary) => void;
  setLastBatchFailureContext: (context: BatchOperationFailureContext | null) => void;
}

export async function executeDataOpsBatchOperation({
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
}: ExecuteDataOpsBatchOperationParams): Promise<boolean> {
  if (!hasOperatePermission) {
    message.warning('当前账号仅有查看权限，无法执行批量操作。');
    return false;
  }

  const targetPipelines = (operationOptions.pipelineIds || []).length
    ? (operationOptions.pipelineIds || [])
        .map((id) => pipelineMap.get(id))
        .filter((item): item is DataOpsRuntimePipeline => Boolean(item))
    : selectedPipelines;

  const requestedPipelineIds = operationOptions.pipelineIds || [];
  const missingPipelineIds = requestedPipelineIds.filter((id) => !pipelineMap.has(id));

  if (requestedPipelineIds.length > 0 && missingPipelineIds.length > 0) {
    if (missingPipelineIds.length === requestedPipelineIds.length) {
      message.warning('目标任务不存在或已下线，请刷新任务快照后重试。');
      return false;
    }

    message.warning(
      `有 ${missingPipelineIds.length} 个目标任务不存在或已下线，已自动跳过。`
    );
  }

  if (!targetPipelines.length) {
    message.info('请先选择任务。');
    return false;
  }

  if (action === 'trigger_pipeline') {
    const batchBlockedPipelines = targetPipelines.filter(
      (pipeline) => pipeline.batchTriggerAllowed === false
    );
    if (batchBlockedPipelines.length) {
      message.warning(
        `以下任务包含外部投递副作用，不能批量触发：${batchBlockedPipelines
          .map((pipeline) => pipeline.name)
          .join(' / ')}`
      );
      return false;
    }
  }

  const { executablePipelines, skippedPipelines } =
    splitBatchOperationPipelines(targetPipelines);

  if (!executablePipelines.length) {
    message.warning('所选任务没有可操作的 Deployment。');
    return false;
  }

  const requireConfirm = operationOptions.requireConfirm !== false;
  if (requireConfirm) {
    const confirmed = await new Promise<boolean>((resolve) => {
      modal.confirm({
        title: `${label}确认`,
        content: `即将对 ${executablePipelines.length} 个任务执行「${label}」，是否继续？`,
        okText: '确认执行',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });

    if (!confirmed) {
      return false;
    }
  }

  setBatchActionKey(action);

  try {
    const failedReasons: string[] = [];
    const executionItemMap = new Map<string, BatchExecutionResultItem>();

    for (const item of buildSkippedBatchExecutionItems(skippedPipelines)) {
      executionItemMap.set(item.pipelineId, item);
    }

    const executeSinglePipeline = async (pipeline: DataOpsRuntimePipeline) => {
      try {
        const requestPayload: DataOpsActionRequest = {
          action,
          pipelineId: pipeline.id,
        };
        if (action === 'trigger_pipeline') {
          requestPayload.batchExecution = true;
        }
        if (
          action === 'trigger_pipeline' &&
          operationOptions.parameters &&
          Object.keys(operationOptions.parameters).length > 0
        ) {
          requestPayload.parameters = operationOptions.parameters;
        }

        const result = await request.post<DataOpsActionResponse>(
          '/dataops/actions',
          requestPayload,
          {
            cancelPrevious: false,
            requestKey: `dataops-batch-${action}-${pipeline.id}${
              operationOptions.requestKeySuffix ? `-${operationOptions.requestKeySuffix}` : ''
            }`,
          }
        );

        if (result.success) {
          executionItemMap.set(pipeline.id, {
            pipelineId: pipeline.id,
            pipelineName: pipeline.name,
            status: 'success',
            message: result.message || '执行成功',
            retryable: false,
          });
        } else {
          const failureReason = result.message || '执行失败';
          failedReasons.push(`${pipeline.name}: ${failureReason}`);
          executionItemMap.set(pipeline.id, {
            pipelineId: pipeline.id,
            pipelineName: pipeline.name,
            status: 'failed',
            message: failureReason,
            retryable: isRetryableBatchFailureReason(failureReason),
          });
        }
      } catch (error) {
        const failureReason = getActionErrorMessage(error);
        failedReasons.push(`${pipeline.name}: ${failureReason}`);
        executionItemMap.set(pipeline.id, {
          pipelineId: pipeline.id,
          pipelineName: pipeline.name,
          status: 'failed',
          message: failureReason,
          retryable: isRetryableBatchFailure(error, failureReason),
        });
      }
    };

    for (
      let startIndex = 0;
      startIndex < executablePipelines.length;
      startIndex += BATCH_OPERATION_CONCURRENCY
    ) {
      const chunk = executablePipelines.slice(
        startIndex,
        startIndex + BATCH_OPERATION_CONCURRENCY
      );
      await Promise.all(chunk.map((pipeline) => executeSinglePipeline(pipeline)));
    }

    const executionItems = buildResolvedBatchExecutionItems(targetPipelines, executionItemMap);
    const { summaryPayload, failureContext, completionText } =
      buildBatchOperationExecutionOutcome({
        action,
        label,
        executionItems,
        parameters: operationOptions.parameters,
      });

    setLastBatchExecutionSummary(summaryPayload);
    await persistBatchExecutionHistory(summaryPayload);

    if (failureContext) {
      setLastBatchFailureContext(failureContext);
      message.warning(completionText);
      if (failedReasons[0]) {
        message.warning(`失败示例：${failedReasons[0]}`);
      }
      return false;
    }

    setLastBatchFailureContext(null);
    message.success(completionText);
    return true;
  } finally {
    await refetchRuntime();
    setBatchActionKey(null);
  }
}
