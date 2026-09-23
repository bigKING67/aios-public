'use client';

import { Button, Modal } from 'antd';
import type { FormInstance } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataOpsNotificationChannel } from '@/config/dataops-hub';
import { DataOpsAlertSendModalBody } from './dataops-alert-send-modal-body';
import { DataOpsBatchHistoryDetail } from './dataops-batch-history-detail';
import { DataOpsBatchResultDetail } from './dataops-batch-result-detail';
import type { AlertSendModalCopy } from './dataops-alert-helpers';
import type {
  BatchExecutionResultItem,
  BatchExecutionSummary,
  BatchFailureReasonSummaryItem,
  BatchHistoryAlertSendFormValues,
  BatchOperationFailureContext,
} from './dataops-batch-helpers';
import type {
  BatchHistoryFailureFilter,
  BatchHistoryTimeRangeFilter,
  BatchOperationAction,
  BatchResultFilter,
} from './dataops-hub-formatters';

interface DataOpsBatchModalsProps {
  batchHistoryOpen: boolean;
  batchHistoryItems: BatchExecutionSummary[];
  filteredBatchHistoryItems: BatchExecutionSummary[];
  batchHistoryActionFilter: BatchOperationAction | 'all';
  batchHistoryFailureFilter: BatchHistoryFailureFilter;
  batchHistoryTimeRangeFilter: BatchHistoryTimeRangeFilter;
  batchHistoryKeyword: string;
  batchHistoryMarkdownText: string;
  batchHistoryFailedPipelineCount: number;
  batchHistoryRetryableFailedPipelineCount: number;
  batchHistoryRetryGroupCount: number;
  batchHistoryRetryableGroupCount: number;
  batchHistoryFailureSummary: BatchFailureReasonSummaryItem[];
  batchHistoryFailureSummaryText: string;
  batchHistoryAlertTemplateText: string;
  batchHistoryAlertTooltipTitle: string;
  batchHistoryAlertDisabled: boolean;
  batchHistoryColumns: ColumnsType<BatchExecutionSummary>;
  batchHistoryAlertOpen: boolean;
  batchHistoryAlertCopy: AlertSendModalCopy;
  batchHistoryAlertSubmitting: boolean;
  batchHistoryAlertForm: FormInstance<BatchHistoryAlertSendFormValues>;
  availableAlertChannels: DataOpsNotificationChannel[];
  batchResultOpen: boolean;
  batchResultSummary: BatchExecutionSummary | null;
  batchResultFilter: BatchResultFilter;
  batchResultFailedPipelineCount: number;
  batchResultRetryableFailedCount: number;
  batchResultFilteredItems: BatchExecutionResultItem[];
  batchResultColumns: ColumnsType<BatchExecutionResultItem>;
  lastBatchFailureContext: BatchOperationFailureContext | null;
  retryableFailedCount: number;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  isCompactViewport: boolean;
  onCloseBatchHistory: () => void;
  onBatchHistoryActionFilterChange: (value: BatchOperationAction | 'all') => void;
  onBatchHistoryFailureFilterChange: (value: BatchHistoryFailureFilter) => void;
  onBatchHistoryTimeRangeFilterChange: (value: BatchHistoryTimeRangeFilter) => void;
  onBatchHistoryKeywordChange: (value: string) => void;
  onExportBatchHistoryCsv: () => void;
  onCopyBatchHistoryMarkdown: () => Promise<void>;
  onCopyBatchHistoryFailedPipelineIds: () => Promise<void>;
  onRetryFilteredBatchHistory: (options: { retryableOnly: boolean }) => Promise<void>;
  onResetBatchHistoryFilters: () => void;
  onCopy: (text: string, label: string) => Promise<void>;
  onOpenBatchHistoryAlert: () => void;
  onApplyBatchHistoryReasonFilter: (reason: string) => void;
  onCloseBatchHistoryAlert: () => void;
  onSubmitBatchHistoryAlert: () => void | Promise<void>;
  onCloseBatchResult: () => void;
  onRetryLastRetryableFailedBatch: () => void | Promise<void>;
  onRetryLastFailedBatch: () => void | Promise<void>;
  onBatchResultFilterChange: (value: BatchResultFilter) => void;
  onCopyBatchResultFailedPipelineIds: () => Promise<void>;
}

export function DataOpsBatchModals({
  batchHistoryOpen,
  batchHistoryItems,
  filteredBatchHistoryItems,
  batchHistoryActionFilter,
  batchHistoryFailureFilter,
  batchHistoryTimeRangeFilter,
  batchHistoryKeyword,
  batchHistoryMarkdownText,
  batchHistoryFailedPipelineCount,
  batchHistoryRetryableFailedPipelineCount,
  batchHistoryRetryGroupCount,
  batchHistoryRetryableGroupCount,
  batchHistoryFailureSummary,
  batchHistoryFailureSummaryText,
  batchHistoryAlertTemplateText,
  batchHistoryAlertTooltipTitle,
  batchHistoryAlertDisabled,
  batchHistoryColumns,
  batchHistoryAlertOpen,
  batchHistoryAlertCopy,
  batchHistoryAlertSubmitting,
  batchHistoryAlertForm,
  availableAlertChannels,
  batchResultOpen,
  batchResultSummary,
  batchResultFilter,
  batchResultFailedPipelineCount,
  batchResultRetryableFailedCount,
  batchResultFilteredItems,
  batchResultColumns,
  lastBatchFailureContext,
  retryableFailedCount,
  hasOperatePermission,
  globalActionBusy,
  isCompactViewport,
  onCloseBatchHistory,
  onBatchHistoryActionFilterChange,
  onBatchHistoryFailureFilterChange,
  onBatchHistoryTimeRangeFilterChange,
  onBatchHistoryKeywordChange,
  onExportBatchHistoryCsv,
  onCopyBatchHistoryMarkdown,
  onCopyBatchHistoryFailedPipelineIds,
  onRetryFilteredBatchHistory,
  onResetBatchHistoryFilters,
  onCopy,
  onOpenBatchHistoryAlert,
  onApplyBatchHistoryReasonFilter,
  onCloseBatchHistoryAlert,
  onSubmitBatchHistoryAlert,
  onCloseBatchResult,
  onRetryLastRetryableFailedBatch,
  onRetryLastFailedBatch,
  onBatchResultFilterChange,
  onCopyBatchResultFailedPipelineIds,
}: DataOpsBatchModalsProps) {
  return (
    <>
      <Modal
        title="批量执行历史"
        open={batchHistoryOpen}
        onCancel={onCloseBatchHistory}
        footer={[
          <Button key="close" onClick={onCloseBatchHistory}>
            关闭
          </Button>,
        ]}
        width={isCompactViewport ? 'calc(100vw - 24px)' : 980}
        destroyOnHidden
      >
        <DataOpsBatchHistoryDetail
          historyItems={batchHistoryItems}
          filteredItems={filteredBatchHistoryItems}
          actionFilter={batchHistoryActionFilter}
          failureFilter={batchHistoryFailureFilter}
          timeRangeFilter={batchHistoryTimeRangeFilter}
          keyword={batchHistoryKeyword}
          markdownText={batchHistoryMarkdownText}
          failedPipelineCount={batchHistoryFailedPipelineCount}
          retryableFailedPipelineCount={batchHistoryRetryableFailedPipelineCount}
          retryGroupCount={batchHistoryRetryGroupCount}
          retryableGroupCount={batchHistoryRetryableGroupCount}
          failureSummaryItems={batchHistoryFailureSummary}
          failureSummaryText={batchHistoryFailureSummaryText}
          alertTemplateText={batchHistoryAlertTemplateText}
          alertTooltipTitle={batchHistoryAlertTooltipTitle}
          alertSendDisabled={batchHistoryAlertDisabled}
          hasOperatePermission={hasOperatePermission}
          globalActionBusy={globalActionBusy}
          columns={batchHistoryColumns}
          isCompactViewport={isCompactViewport}
          onActionFilterChange={onBatchHistoryActionFilterChange}
          onFailureFilterChange={onBatchHistoryFailureFilterChange}
          onTimeRangeFilterChange={onBatchHistoryTimeRangeFilterChange}
          onKeywordChange={onBatchHistoryKeywordChange}
          onExportCsv={onExportBatchHistoryCsv}
          onCopyMarkdown={onCopyBatchHistoryMarkdown}
          onCopyFailedPipelineIds={onCopyBatchHistoryFailedPipelineIds}
          onRetryFiltered={onRetryFilteredBatchHistory}
          onResetFilters={onResetBatchHistoryFilters}
          onCopy={onCopy}
          onSendAlertTemplate={onOpenBatchHistoryAlert}
          onApplyReasonFilter={onApplyBatchHistoryReasonFilter}
        />
      </Modal>

      <Modal
        title={batchHistoryAlertCopy.title}
        open={batchHistoryAlertOpen}
        onCancel={onCloseBatchHistoryAlert}
        onOk={() => {
          void onSubmitBatchHistoryAlert();
        }}
        okText="发送到飞书"
        confirmLoading={batchHistoryAlertSubmitting}
        destroyOnHidden
      >
        <DataOpsAlertSendModalBody
          form={batchHistoryAlertForm}
          channels={availableAlertChannels}
          copy={batchHistoryAlertCopy}
        />
      </Modal>

      <Modal
        title={batchResultSummary ? `批量结果 · ${batchResultSummary.label}` : '批量结果'}
        open={batchResultOpen}
        onCancel={onCloseBatchResult}
        footer={[
          <Button key="close" onClick={onCloseBatchResult}>
            关闭
          </Button>,
          <Button
            key="retry-retryable"
            disabled={!hasOperatePermission || globalActionBusy || retryableFailedCount === 0}
            onClick={() => {
              void onRetryLastRetryableFailedBatch();
            }}
          >
            重试可重试失败
            {retryableFailedCount > 0 ? `(${retryableFailedCount})` : ''}
          </Button>,
          <Button
            key="retry-all"
            type="primary"
            disabled={
              !hasOperatePermission ||
              globalActionBusy ||
              !lastBatchFailureContext?.failedPipelineIds.length
            }
            onClick={() => {
              void onRetryLastFailedBatch();
            }}
          >
            重试全部失败
            {lastBatchFailureContext?.failedPipelineIds.length
              ? `(${lastBatchFailureContext.failedPipelineIds.length})`
              : ''}
          </Button>,
        ]}
        width={isCompactViewport ? 'calc(100vw - 24px)' : 980}
        destroyOnHidden
      >
        <DataOpsBatchResultDetail
          summary={batchResultSummary}
          resultFilter={batchResultFilter}
          failedPipelineCount={batchResultFailedPipelineCount}
          retryableFailedCount={batchResultRetryableFailedCount}
          filteredItems={batchResultFilteredItems}
          columns={batchResultColumns}
          isCompactViewport={isCompactViewport}
          onResultFilterChange={onBatchResultFilterChange}
          onCopyFailedPipelineIds={onCopyBatchResultFailedPipelineIds}
        />
      </Modal>
    </>
  );
}
