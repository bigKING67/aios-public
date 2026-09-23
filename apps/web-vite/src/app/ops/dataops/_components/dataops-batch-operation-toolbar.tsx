import { Button } from 'antd';
import type { BatchOperationAction } from './dataops-hub-formatters';
import { formatDateTime } from './dataops-hub-formatters';
import type {
  BatchExecutionSummary,
  BatchOperationFailureContext,
} from './dataops-batch-helpers';
import batchStyles from './dataops-batch-controls.module.css';

interface DataOpsBatchOperationToolbarProps {
  selectedPipelineCount: number;
  lastBatchExecutionSummary: BatchExecutionSummary | null;
  lastBatchFailureContext: BatchOperationFailureContext | null;
  retryableFailedCount: number;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  batchActionKey: BatchOperationAction | null;
  batchExecutionHistoryCount: number;
  onSelectExecutable: () => void;
  onClearSelected: () => void;
  onBatchOperation: (action: BatchOperationAction, label: string) => void | Promise<unknown>;
  onOpenBatchTrigger: () => void;
  onRetryFailed: () => void | Promise<void>;
  onRetryRetryableFailed: () => void | Promise<void>;
  onOpenBatchResult: () => void;
  onOpenBatchHistory: () => void;
}

export function DataOpsBatchOperationToolbar({
  selectedPipelineCount,
  lastBatchExecutionSummary,
  lastBatchFailureContext,
  retryableFailedCount,
  hasOperatePermission,
  globalActionBusy,
  batchActionKey,
  batchExecutionHistoryCount,
  onSelectExecutable,
  onClearSelected,
  onBatchOperation,
  onOpenBatchTrigger,
  onRetryFailed,
  onRetryRetryableFailed,
  onOpenBatchResult,
  onOpenBatchHistory,
}: DataOpsBatchOperationToolbarProps) {
  const selectedActionDisabled = !hasOperatePermission || globalActionBusy || selectedPipelineCount === 0;
  const failedPipelineCount = lastBatchFailureContext?.failedPipelineIds.length ?? 0;

  return (
    <div className={batchStyles.batchToolbar}>
      <div className={batchStyles.batchPrimaryRow}>
        <span className={batchStyles.batchInfo}>
          已选择 {selectedPipelineCount} 个任务（仅可操作任务可勾选）
        </span>
        {lastBatchExecutionSummary ? (
          <span className={batchStyles.batchSummaryInfo}>
            最近批量：
            {formatDateTime(lastBatchExecutionSummary.executedAt)} · 成功
            {lastBatchExecutionSummary.successCount} / 失败
            {lastBatchExecutionSummary.failedCount} / 跳过
            {lastBatchExecutionSummary.skippedCount}
          </span>
        ) : null}
        {failedPipelineCount ? (
          <span className={batchStyles.batchFailureInfo}>
            最近批量失败 {failedPipelineCount} 个（{formatDateTime(lastBatchFailureContext?.executedAt)}）
          </span>
        ) : null}
      </div>

      <div className={batchStyles.batchSelectionRow}>
        <Button size="small" disabled={!hasOperatePermission || globalActionBusy} onClick={onSelectExecutable}>
          选中可执行
        </Button>
        <Button
          size="small"
          disabled={selectedActionDisabled}
          onClick={onClearSelected}
        >
          清空选择
        </Button>
      </div>

      <div className={batchStyles.batchActions}>
        <Button
          type="primary"
          loading={batchActionKey === 'trigger_pipeline'}
          disabled={selectedActionDisabled}
          onClick={() => {
            void onBatchOperation('trigger_pipeline', '批量触发');
          }}
        >
          批量触发
        </Button>
        <details className={batchStyles.batchQuickSelectorPanel}>
          <summary>更多操作</summary>
          <div className={batchStyles.batchQuickActions}>
            <Button
              size="small"
              loading={batchActionKey === 'pause_deployment'}
              disabled={selectedActionDisabled}
              onClick={() => {
                void onBatchOperation('pause_deployment', '批量暂停');
              }}
            >
              批量暂停
            </Button>
            <Button
              size="small"
              loading={batchActionKey === 'resume_deployment'}
              disabled={selectedActionDisabled}
              onClick={() => {
                void onBatchOperation('resume_deployment', '批量恢复');
              }}
            >
              批量恢复
            </Button>
            <Button
              size="small"
              disabled={selectedActionDisabled}
              onClick={onOpenBatchTrigger}
            >
              批量参数触发
            </Button>
            <Button
              size="small"
              disabled={!hasOperatePermission || globalActionBusy || failedPipelineCount === 0}
              onClick={() => {
                void onRetryFailed();
              }}
            >
              重试失败
              {failedPipelineCount ? `(${failedPipelineCount})` : ''}
            </Button>
            <Button
              size="small"
              disabled={!hasOperatePermission || globalActionBusy || retryableFailedCount === 0}
              onClick={() => {
                void onRetryRetryableFailed();
              }}
            >
              重试可重试失败
              {retryableFailedCount > 0 ? `(${retryableFailedCount})` : ''}
            </Button>
            <Button size="small" disabled={globalActionBusy || !lastBatchExecutionSummary} onClick={onOpenBatchResult}>
              查看结果
            </Button>
            <Button size="small" disabled={globalActionBusy || batchExecutionHistoryCount === 0} onClick={onOpenBatchHistory}>
              批量历史
            </Button>
          </div>
        </details>
      </div>
    </div>
  );
}
