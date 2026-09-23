'use client';

import { CopyOutlined } from '@ant-design/icons';
import { Button, Select } from 'antd';
import { type BatchResultFilter } from './dataops-hub-formatters';
import batchResultStyles from './dataops-batch-result.module.css';

interface DataOpsBatchResultControlsProps {
  resultFilter: BatchResultFilter;
  onResultFilterChange: (value: BatchResultFilter) => void;
  failedPipelineCount: number;
  retryableFailedCount: number;
  onCopyFailedPipelineIds: () => Promise<void>;
}

export function DataOpsBatchResultControls({
  resultFilter,
  onResultFilterChange,
  failedPipelineCount,
  retryableFailedCount,
  onCopyFailedPipelineIds,
}: DataOpsBatchResultControlsProps) {
  return (
    <div className={batchResultStyles.batchResultControls}>
      <Select<BatchResultFilter>
        size="small"
        value={resultFilter}
        onChange={onResultFilterChange}
        options={[
          { label: '全部结果', value: 'all' },
          {
            label: `仅失败 (${failedPipelineCount})`,
            value: 'failed',
          },
          {
            label: `仅可重试失败 (${retryableFailedCount})`,
            value: 'retryable_failed',
          },
        ]}
        className={batchResultStyles.batchResultFilterSelect}
      />
      <Button
        size="small"
        icon={<CopyOutlined />}
        disabled={failedPipelineCount === 0}
        onClick={() => {
          void onCopyFailedPipelineIds();
        }}
      >
        复制失败任务ID
      </Button>
    </div>
  );
}
