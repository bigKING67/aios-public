'use client';

import { Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type {
  BatchHistoryFailureFilter,
  BatchHistoryTimeRangeFilter,
  BatchOperationAction,
} from './dataops-hub-formatters';
import type {
  BatchExecutionSummary,
  BatchFailureReasonSummaryItem,
} from './dataops-batch-helpers';
import { DataOpsBatchHistoryControls } from './dataops-batch-history-controls';
import { DataOpsBatchHistoryFailureSummaryPanel } from './dataops-batch-history-failure-summary-panel';

interface DataOpsBatchHistoryDetailProps {
  historyItems: BatchExecutionSummary[];
  filteredItems: BatchExecutionSummary[];
  actionFilter: BatchOperationAction | 'all';
  failureFilter: BatchHistoryFailureFilter;
  timeRangeFilter: BatchHistoryTimeRangeFilter;
  keyword: string;
  markdownText: string;
  failedPipelineCount: number;
  retryableFailedPipelineCount: number;
  retryGroupCount: number;
  retryableGroupCount: number;
  failureSummaryItems: BatchFailureReasonSummaryItem[];
  failureSummaryText: string;
  alertTemplateText: string;
  alertTooltipTitle: string;
  alertSendDisabled: boolean;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  columns: ColumnsType<BatchExecutionSummary>;
  isCompactViewport: boolean;
  onActionFilterChange: (value: BatchOperationAction | 'all') => void;
  onFailureFilterChange: (value: BatchHistoryFailureFilter) => void;
  onTimeRangeFilterChange: (value: BatchHistoryTimeRangeFilter) => void;
  onKeywordChange: (value: string) => void;
  onExportCsv: () => void;
  onCopyMarkdown: () => Promise<void>;
  onCopyFailedPipelineIds: () => Promise<void>;
  onRetryFiltered: (options: { retryableOnly: boolean }) => Promise<void>;
  onResetFilters: () => void;
  onCopy: (text: string, label: string) => Promise<void>;
  onSendAlertTemplate: () => void;
  onApplyReasonFilter: (reason: string) => void;
}

export function DataOpsBatchHistoryDetail({
  historyItems,
  filteredItems,
  actionFilter,
  failureFilter,
  timeRangeFilter,
  keyword,
  markdownText,
  failedPipelineCount,
  retryableFailedPipelineCount,
  retryGroupCount,
  retryableGroupCount,
  failureSummaryItems,
  failureSummaryText,
  alertTemplateText,
  alertTooltipTitle,
  alertSendDisabled,
  hasOperatePermission,
  globalActionBusy,
  columns,
  isCompactViewport,
  onActionFilterChange,
  onFailureFilterChange,
  onTimeRangeFilterChange,
  onKeywordChange,
  onExportCsv,
  onCopyMarkdown,
  onCopyFailedPipelineIds,
  onRetryFiltered,
  onResetFilters,
  onCopy,
  onSendAlertTemplate,
  onApplyReasonFilter,
}: DataOpsBatchHistoryDetailProps) {
  if (!historyItems.length) {
    return <Empty description="暂无批量执行历史" />;
  }

  return (
    <>
      <DataOpsBatchHistoryControls
        actionFilter={actionFilter}
        onActionFilterChange={onActionFilterChange}
        failureFilter={failureFilter}
        onFailureFilterChange={onFailureFilterChange}
        timeRangeFilter={timeRangeFilter}
        onTimeRangeFilterChange={onTimeRangeFilterChange}
        keyword={keyword}
        onKeywordChange={onKeywordChange}
        markdownText={markdownText}
        failedPipelineCount={failedPipelineCount}
        retryableFailedPipelineCount={retryableFailedPipelineCount}
        retryGroupCount={retryGroupCount}
        retryableGroupCount={retryableGroupCount}
        matchedCount={filteredItems.length}
        totalCount={historyItems.length}
        hasOperatePermission={hasOperatePermission}
        globalActionBusy={globalActionBusy}
        onExportCsv={onExportCsv}
        onCopyMarkdown={onCopyMarkdown}
        onCopyFailedPipelineIds={onCopyFailedPipelineIds}
        onRetryFiltered={onRetryFiltered}
        onResetFilters={onResetFilters}
      />
      <DataOpsBatchHistoryFailureSummaryPanel
        items={failureSummaryItems}
        summaryText={failureSummaryText}
        alertTemplateText={alertTemplateText}
        alertTooltipTitle={alertTooltipTitle}
        alertSendDisabled={alertSendDisabled}
        onCopy={onCopy}
        onSendAlertTemplate={onSendAlertTemplate}
        onApplyReasonFilter={onApplyReasonFilter}
      />
      {filteredItems.length ? (
        <Table<BatchExecutionSummary>
          rowKey={(record) => record.id || `${record.executedAt}:${record.action}:${record.label}`}
          columns={columns}
          dataSource={filteredItems}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          size="small"
          scroll={isCompactViewport ? undefined : { x: 'max-content' }}
        />
      ) : (
        <Empty description="当前筛选条件下没有批量历史记录" />
      )}
    </>
  );
}
