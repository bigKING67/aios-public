'use client';

import { Button, Input, Tooltip } from '@lobehub/ui';
import { Copy, Download, RotateCw } from 'lucide-react';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import { DATAOPS_ICON_PROPS } from './dataops-icon-props';
import type {
  BatchHistoryFailureFilter,
  BatchHistoryTimeRangeFilter,
  BatchOperationAction,
} from './dataops-hub-formatters';
import batchResultStyles from './dataops-batch-result.module.css';

interface DataOpsBatchHistoryControlsProps {
  actionFilter: BatchOperationAction | 'all';
  onActionFilterChange: (value: BatchOperationAction | 'all') => void;
  failureFilter: BatchHistoryFailureFilter;
  onFailureFilterChange: (value: BatchHistoryFailureFilter) => void;
  timeRangeFilter: BatchHistoryTimeRangeFilter;
  onTimeRangeFilterChange: (value: BatchHistoryTimeRangeFilter) => void;
  keyword: string;
  onKeywordChange: (value: string) => void;
  markdownText: string;
  failedPipelineCount: number;
  retryableFailedPipelineCount: number;
  retryGroupCount: number;
  retryableGroupCount: number;
  matchedCount: number;
  totalCount: number;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  onExportCsv: () => void;
  onCopyMarkdown: () => Promise<void>;
  onCopyFailedPipelineIds: () => Promise<void>;
  onRetryFiltered: (options: { retryableOnly: boolean }) => Promise<void>;
  onResetFilters: () => void;
}

export function DataOpsBatchHistoryControls({
  actionFilter,
  onActionFilterChange,
  failureFilter,
  onFailureFilterChange,
  timeRangeFilter,
  onTimeRangeFilterChange,
  keyword,
  onKeywordChange,
  markdownText,
  failedPipelineCount,
  retryableFailedPipelineCount,
  retryGroupCount,
  retryableGroupCount,
  matchedCount,
  totalCount,
  hasOperatePermission,
  globalActionBusy,
  onExportCsv,
  onCopyMarkdown,
  onCopyFailedPipelineIds,
  onRetryFiltered,
  onResetFilters,
}: DataOpsBatchHistoryControlsProps) {
  return (
    <div className={batchResultStyles.batchResultControls}>
      <LabeledSelect<BatchOperationAction | 'all'>
        label="批量动作"
        size="small"
        value={actionFilter}
        onChange={(value) => value && onActionFilterChange(value)}
        options={[
          { label: '全部动作', value: 'all' },
          { label: '触发', value: 'trigger_pipeline' },
          { label: '暂停', value: 'pause_deployment' },
          { label: '恢复', value: 'resume_deployment' },
        ]}
        wrapperClassName={batchResultStyles.batchResultFilterSelect}
      />
      <LabeledSelect<BatchHistoryFailureFilter>
        label="批量结果"
        size="small"
        value={failureFilter}
        onChange={(value) => value && onFailureFilterChange(value)}
        options={[
          { label: '全部结果', value: 'all' },
          { label: '仅含失败', value: 'has_failed' },
        ]}
        wrapperClassName={batchResultStyles.batchResultFilterSelect}
      />
      <LabeledSelect<BatchHistoryTimeRangeFilter>
        label="批量时间范围"
        size="small"
        value={timeRangeFilter}
        onChange={(value) => value && onTimeRangeFilterChange(value)}
        options={[
          { label: '全部时间', value: 'all' },
          { label: '近24小时', value: '24h' },
          { label: '近7天', value: '7d' },
        ]}
        wrapperClassName={batchResultStyles.batchResultFilterSelect}
      />
      <Input
        allowClear
        size="small"
        value={keyword}
        onChange={(event) => onKeywordChange(event.target.value)}
        placeholder="搜索批次名 / 执行人 / 任务ID / 失败原因"
        className={batchResultStyles.batchHistoryKeywordInput}
      />
      <Button size="small" icon={<Download {...DATAOPS_ICON_PROPS} />} onClick={onExportCsv}>
        导出CSV
      </Button>
      <Button
        size="small"
        icon={<Copy {...DATAOPS_ICON_PROPS} />}
        disabled={!markdownText}
        onClick={() => {
          void onCopyMarkdown();
        }}
      >
        复制Markdown
      </Button>
      <Button
        size="small"
        icon={<Copy {...DATAOPS_ICON_PROPS} />}
        disabled={!failedPipelineCount}
        onClick={() => {
          void onCopyFailedPipelineIds();
        }}
      >
        复制失败任务ID{failedPipelineCount ? `(${failedPipelineCount})` : ''}
      </Button>
      <Tooltip title={`将按动作+参数分 ${retryGroupCount} 组顺序执行`}>
        <span className="inline-flex">
          <Button
            size="small"
            icon={<RotateCw {...DATAOPS_ICON_PROPS} />}
            disabled={!hasOperatePermission || globalActionBusy || retryGroupCount === 0}
            onClick={() => {
              void onRetryFiltered({ retryableOnly: false });
            }}
          >
            按筛选重试失败{failedPipelineCount ? `(${failedPipelineCount})` : ''}
          </Button>
        </span>
      </Tooltip>
      <Tooltip title={`仅重试可重试失败项，按动作+参数分 ${retryableGroupCount} 组`}>
        <span className="inline-flex">
          <Button
            size="small"
            icon={<RotateCw {...DATAOPS_ICON_PROPS} />}
            disabled={!hasOperatePermission || globalActionBusy || retryableGroupCount === 0}
            onClick={() => {
              void onRetryFiltered({ retryableOnly: true });
            }}
          >
            按筛选重试可重试
            {retryableFailedPipelineCount ? `(${retryableFailedPipelineCount})` : ''}
          </Button>
        </span>
      </Tooltip>
      <Button size="small" onClick={onResetFilters}>
        重置筛选
      </Button>
      <span className={batchResultStyles.batchHistoryStatsText}>
        匹配 {matchedCount} / 总计 {totalCount}
      </span>
    </div>
  );
}
