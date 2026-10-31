'use client';

import { Button } from '@lobehub/ui';
import { Copy } from 'lucide-react';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import { DATAOPS_ICON_PROPS } from './dataops-icon-props';
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
      <LabeledSelect<BatchResultFilter>
        label="批量结果筛选"
        size="small"
        value={resultFilter}
        onChange={(value) => value && onResultFilterChange(value)}
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
        wrapperClassName={batchResultStyles.batchResultFilterSelect}
      />
      <Button
        size="small"
        icon={<Copy {...DATAOPS_ICON_PROPS} />}
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
