import type { DataOpsBatchExecutionRecord } from '@/types/dataops';
import type { BatchResultFilter, BatchOperationAction } from './dataops-hub-formatters';
import type {
  BatchExecutionResultItem,
  BatchExecutionSummary,
  BatchOperationExecutionOutcome,
  BatchOperationFailureContext,
  BatchOperationPipelineGroups,
  BatchOperationPipelineSnapshot,
} from './dataops-batch-types';

export function toBatchExecutionSummary(
  record: DataOpsBatchExecutionRecord
): BatchExecutionSummary {
  return {
    id: record.id,
    action: record.action,
    label: record.label,
    executedAt: record.executedAt,
    totalCount: record.totalCount,
    successCount: record.successCount,
    failedCount: record.failedCount,
    skippedCount: record.skippedCount,
    operator: record.operator,
    parameters: record.parameters,
    items: record.items,
  };
}

export function buildFailureContextFromSummary(
  summary: BatchExecutionSummary | null
): BatchOperationFailureContext | null {
  if (!summary) {
    return null;
  }

  const failedItems = summary.items.filter((item) => item.status === 'failed');
  if (!failedItems.length) {
    return null;
  }

  return {
    action: summary.action,
    label: summary.label,
    failedPipelineIds: Array.from(new Set(failedItems.map((item) => item.pipelineId))),
    retryableFailedPipelineIds: Array.from(
      new Set(failedItems.filter((item) => item.retryable).map((item) => item.pipelineId))
    ),
    parameters: summary.parameters,
    executedAt: summary.executedAt,
  };
}

export function resolveFailedPipelineIdsFromSummary(
  summary: BatchExecutionSummary,
  options: { retryableOnly: boolean }
): string[] {
  return Array.from(
    new Set(
      summary.items
        .filter((item) => item.status === 'failed' && (!options.retryableOnly || item.retryable))
        .map((item) => item.pipelineId)
    )
  );
}

export function resolveBatchResultFailedPipelineIds(
  items: BatchExecutionResultItem[],
  options: { retryableOnly: boolean }
): string[] {
  return Array.from(
    new Set(
      items
        .filter((item) => item.status === 'failed' && (!options.retryableOnly || item.retryable))
        .map((item) => item.pipelineId)
    )
  );
}

export function countBatchResultRetryableFailures(items: BatchExecutionResultItem[]): number {
  return items.filter((item) => item.status === 'failed' && item.retryable).length;
}

export function filterBatchResultItems(
  items: BatchExecutionResultItem[],
  filter: BatchResultFilter
): BatchExecutionResultItem[] {
  if (filter === 'failed') {
    return items.filter((item) => item.status === 'failed');
  }
  if (filter === 'retryable_failed') {
    return items.filter((item) => item.status === 'failed' && item.retryable);
  }
  return items;
}

export function splitBatchOperationPipelines<T extends BatchOperationPipelineSnapshot>(
  pipelines: T[]
): BatchOperationPipelineGroups<T> {
  return {
    executablePipelines: pipelines.filter((pipeline) => Boolean(pipeline.runtime?.deploymentId)),
    skippedPipelines: pipelines.filter((pipeline) => !pipeline.runtime?.deploymentId),
  };
}

export function buildSkippedBatchExecutionItems(
  pipelines: BatchOperationPipelineSnapshot[]
): BatchExecutionResultItem[] {
  return pipelines.map((pipeline) => ({
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    status: 'skipped',
    message: '未发现可执行 Deployment，已跳过。',
    retryable: false,
  }));
}

export function buildResolvedBatchExecutionItems(
  pipelines: BatchOperationPipelineSnapshot[],
  executionItemMap: ReadonlyMap<string, BatchExecutionResultItem>
): BatchExecutionResultItem[] {
  return pipelines.map((pipeline) => {
    const item = executionItemMap.get(pipeline.id);
    if (item) {
      return item;
    }

    return {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      status: 'failed',
      message: '执行结果缺失，请检查服务端日志后重试。',
      retryable: true,
    };
  });
}

export function buildBatchOperationExecutionOutcome(options: {
  action: BatchOperationAction;
  label: string;
  executionItems: BatchExecutionResultItem[];
  parameters?: Record<string, string | number | boolean>;
  executedAt?: string;
}): BatchOperationExecutionOutcome {
  const successCount = options.executionItems.filter((item) => item.status === 'success').length;
  const failedCount = options.executionItems.filter((item) => item.status === 'failed').length;
  const skippedCount = options.executionItems.filter((item) => item.status === 'skipped').length;
  const executedAt = options.executedAt ?? new Date().toISOString();
  const failedPipelineIds = resolveBatchResultFailedPipelineIds(options.executionItems, {
    retryableOnly: false,
  });
  const retryableFailedPipelineIds = resolveBatchResultFailedPipelineIds(options.executionItems, {
    retryableOnly: true,
  });
  const summaryPayload: BatchExecutionSummary = {
    action: options.action,
    label: options.label,
    executedAt,
    totalCount: options.executionItems.length,
    successCount,
    failedCount,
    skippedCount,
    parameters: options.parameters,
    items: options.executionItems,
  };
  const completionText = `${options.label}完成：成功 ${successCount}，失败 ${failedCount}${
    skippedCount > 0 ? `，跳过 ${skippedCount}` : ''
  }`;

  return {
    summaryPayload,
    completionText,
    failureContext:
      failedCount > 0
        ? {
            action: options.action,
            label: options.label,
            failedPipelineIds,
            retryableFailedPipelineIds,
            parameters: options.parameters,
            executedAt,
          }
        : null,
  };
}
