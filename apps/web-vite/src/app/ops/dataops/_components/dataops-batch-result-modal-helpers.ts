import {
  buildFailureContextFromSummary,
  resolveBatchResultFailedPipelineIds,
  type BatchExecutionSummary,
  type BatchOperationFailureContext,
} from './dataops-batch-helpers';
import type { BatchResultFilter } from './dataops-hub-formatters';

export interface DataOpsBatchResultOpenState {
  failureContext: BatchOperationFailureContext | null;
  filter: BatchResultFilter;
  open: boolean;
}

export interface DataOpsBatchResultCloseState {
  filter: BatchResultFilter;
  open: boolean;
}

export function buildDataOpsBatchResultOpenState(
  summary: BatchExecutionSummary
): DataOpsBatchResultOpenState {
  return {
    failureContext: buildFailureContextFromSummary(summary),
    filter: 'all',
    open: true,
  };
}

export function buildDataOpsBatchResultCloseState(): DataOpsBatchResultCloseState {
  return {
    filter: 'all',
    open: false,
  };
}

export function buildDataOpsBatchResultFailedPipelineIdText(
  summary: BatchExecutionSummary
): string {
  return resolveBatchResultFailedPipelineIds(summary.items, {
    retryableOnly: false,
  }).join('\n');
}

export async function copyDataOpsBatchResultFailedPipelineIds({
  summary,
  copyText,
  info,
}: {
  summary: BatchExecutionSummary | null;
  copyText: (text: string, label: string) => Promise<void>;
  info: (content: string) => void;
}): Promise<void> {
  if (!summary) {
    info('暂无批量结果。');
    return;
  }

  const failedPipelineIdText = buildDataOpsBatchResultFailedPipelineIdText(summary);
  if (!failedPipelineIdText) {
    info('当前批量执行没有失败任务。');
    return;
  }

  await copyText(failedPipelineIdText, '失败任务ID列表');
}
