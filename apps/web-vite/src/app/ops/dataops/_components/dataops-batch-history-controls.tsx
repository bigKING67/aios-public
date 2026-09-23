'use client';

import { Button, Input, Select, Tooltip } from 'antd';
import { CopyOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
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
      <Select<BatchOperationAction | 'all'>
        size="small"
        value={actionFilter}
        onChange={onActionFilterChange}
        options={[
          { label: '全部动作', value: 'all' },
          { label: '触发', value: 'trigger_pipeline' },
          { label: '暂停', value: 'pause_deployment' },
          { label: '恢复', value: 'resume_deployment' },
        ]}
        className={batchResultStyles.batchResultFilterSelect}
      />
      <Select<BatchHistoryFailureFilter>
        size="small"
        value={failureFilter}
        onChange={onFailureFilterChange}
        options={[
          { label: '全部结果', value: 'all' },
          { label: '仅含失败', value: 'has_failed' },
        ]}
        className={batchResultStyles.batchResultFilterSelect}
      />
      <Select<BatchHistoryTimeRangeFilter>
        size="small"
        value={timeRangeFilter}
        onChange={onTimeRangeFilterChange}
        options={[
          { label: '全部时间', value: 'all' },
          { label: '近24小时', value: '24h' },
          { label: '近7天', value: '7d' },
        ]}
        className={batchResultStyles.batchResultFilterSelect}
      />
      <Input
        allowClear
        size="small"
        value={keyword}
        onChange={(event) => onKeywordChange(event.target.value)}
        placeholder="搜索批次名 / 执行人 / 任务ID / 失败原因"
        className={batchResultStyles.batchHistoryKeywordInput}
      />
      <Button size="small" icon={<DownloadOutlined />} onClick={onExportCsv}>
        导出CSV
      </Button>
      <Button
        size="small"
        icon={<CopyOutlined />}
        disabled={!markdownText}
        onClick={() => {
          void onCopyMarkdown();
        }}
      >
        复制Markdown
      </Button>
      <Button
        size="small"
        icon={<CopyOutlined />}
        disabled={!failedPipelineCount}
        onClick={() => {
          void onCopyFailedPipelineIds();
        }}
      >
        复制失败任务ID{failedPipelineCount ? `(${failedPipelineCount})` : ''}
      </Button>
      <Tooltip title={`将按动作+参数分 ${retryGroupCount} 组顺序执行`}>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          disabled={!hasOperatePermission || globalActionBusy || retryGroupCount === 0}
          onClick={() => {
            void onRetryFiltered({ retryableOnly: false });
          }}
        >
          按筛选重试失败{failedPipelineCount ? `(${failedPipelineCount})` : ''}
        </Button>
      </Tooltip>
      <Tooltip title={`仅重试可重试失败项，按动作+参数分 ${retryableGroupCount} 组`}>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          disabled={!hasOperatePermission || globalActionBusy || retryableGroupCount === 0}
          onClick={() => {
            void onRetryFiltered({ retryableOnly: true });
          }}
        >
          按筛选重试可重试
          {retryableFailedPipelineCount ? `(${retryableFailedPipelineCount})` : ''}
        </Button>
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
