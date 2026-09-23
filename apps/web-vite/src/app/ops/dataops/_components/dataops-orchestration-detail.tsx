'use client';

import { Empty, Table } from 'antd';
import type { DataOpsRuntimePipeline } from '@/types/dataops';
import { DataOpsBatchOperationToolbar } from './dataops-batch-operation-toolbar';
import type { DataOpsOrchestrationDetailProps } from './dataops-orchestration-detail-types';
import { DataOpsPipelineFilterContext } from './dataops-pipeline-filter-context';
import { pipelineTableComponents } from './dataops-pipeline-table-components';
import pipelineStyles from './dataops-pipeline-table.module.css';

export function DataOpsOrchestrationDetail({
  filteredPipelines,
  selectedPipelineIds,
  lastBatchExecutionSummary,
  lastBatchFailureContext,
  retryableFailedCount,
  statusFilterLabel,
  keywordFilterText,
  hasPipelineFilter,
  hasOperatePermission,
  globalActionBusy,
  batchActionKey,
  batchExecutionHistoryCount,
  columns,
  isCompactViewport,
  renderExpandedRow,
  renderPaginationTotal,
  onSelectExecutable,
  onClearSelected,
  onBatchOperation,
  onOpenBatchTrigger,
  onRetryFailed,
  onRetryRetryableFailed,
  onOpenBatchResult,
  onOpenBatchHistory,
  onClearFilters,
  onSelectedPipelineIdsChange,
}: DataOpsOrchestrationDetailProps) {
  if (!filteredPipelines.length) {
    return <Empty description="当前筛选条件下没有匹配到任务编排记录" />;
  }

  return (
    <>
      <DataOpsBatchOperationToolbar
        selectedPipelineCount={selectedPipelineIds.length}
        lastBatchExecutionSummary={lastBatchExecutionSummary}
        lastBatchFailureContext={lastBatchFailureContext}
        retryableFailedCount={retryableFailedCount}
        hasOperatePermission={hasOperatePermission}
        globalActionBusy={globalActionBusy}
        batchActionKey={batchActionKey}
        batchExecutionHistoryCount={batchExecutionHistoryCount}
        onSelectExecutable={onSelectExecutable}
        onClearSelected={onClearSelected}
        onBatchOperation={onBatchOperation}
        onOpenBatchTrigger={onOpenBatchTrigger}
        onRetryFailed={onRetryFailed}
        onRetryRetryableFailed={onRetryRetryableFailed}
        onOpenBatchResult={onOpenBatchResult}
        onOpenBatchHistory={onOpenBatchHistory}
      />

      <DataOpsPipelineFilterContext
        statusFilterLabel={statusFilterLabel}
        keywordFilterText={keywordFilterText}
        matchedPipelineCount={filteredPipelines.length}
        hasPipelineFilter={hasPipelineFilter}
        onClearFilters={onClearFilters}
      />

      <Table<DataOpsRuntimePipeline>
        className={pipelineStyles.pipelineTable}
        size="small"
        rowKey="id"
        columns={columns}
        components={pipelineTableComponents}
        dataSource={filteredPipelines}
        expandable={
          isCompactViewport
            ? undefined
            : {
                expandedRowRender: renderExpandedRow,
                columnWidth: 32,
                fixed: 'left',
              }
        }
        rowSelection={{
          selectedRowKeys: selectedPipelineIds,
          onChange: (keys) => onSelectedPipelineIdsChange(keys.map((item) => String(item))),
          preserveSelectedRowKeys: true,
          fixed: !isCompactViewport,
          columnWidth: 34,
          getCheckboxProps: (record) => ({
            disabled: !hasOperatePermission || !record.runtime?.deploymentId,
          }),
        }}
        pagination={{
          defaultPageSize: isCompactViewport ? 10 : 20,
          pageSizeOptions: ['10', '20', '50', '100'],
          showSizeChanger: true,
          showQuickJumper: true,
          hideOnSinglePage: true,
          showTotal: renderPaginationTotal,
        }}
        tableLayout={isCompactViewport ? undefined : 'fixed'}
        scroll={isCompactViewport ? undefined : { x: 1100 }}
      />
    </>
  );
}
