'use client';

import { Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { BatchResultFilter } from './dataops-hub-formatters';
import type {
  BatchExecutionResultItem,
  BatchExecutionSummary,
} from './dataops-batch-helpers';
import { DataOpsBatchResultControls } from './dataops-batch-result-controls';
import { DataOpsBatchResultSummary } from './dataops-batch-result-summary';

interface DataOpsBatchResultDetailProps {
  summary: BatchExecutionSummary | null;
  resultFilter: BatchResultFilter;
  failedPipelineCount: number;
  retryableFailedCount: number;
  filteredItems: BatchExecutionResultItem[];
  columns: ColumnsType<BatchExecutionResultItem>;
  isCompactViewport: boolean;
  onResultFilterChange: (value: BatchResultFilter) => void;
  onCopyFailedPipelineIds: () => Promise<void>;
}

export function DataOpsBatchResultDetail({
  summary,
  resultFilter,
  failedPipelineCount,
  retryableFailedCount,
  filteredItems,
  columns,
  isCompactViewport,
  onResultFilterChange,
  onCopyFailedPipelineIds,
}: DataOpsBatchResultDetailProps) {
  if (!summary) {
    return <Empty description="暂无批量执行结果" />;
  }

  return (
    <>
      <DataOpsBatchResultSummary summary={summary} />
      <DataOpsBatchResultControls
        resultFilter={resultFilter}
        onResultFilterChange={onResultFilterChange}
        failedPipelineCount={failedPipelineCount}
        retryableFailedCount={retryableFailedCount}
        onCopyFailedPipelineIds={onCopyFailedPipelineIds}
      />
      <Table<BatchExecutionResultItem>
        rowKey="pipelineId"
        columns={columns}
        dataSource={filteredItems}
        pagination={{ pageSize: 8, showSizeChanger: false }}
        size="small"
        scroll={isCompactViewport ? undefined : { x: 'max-content' }}
      />
    </>
  );
}
