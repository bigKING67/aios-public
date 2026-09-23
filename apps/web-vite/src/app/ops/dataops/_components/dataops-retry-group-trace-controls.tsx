'use client';

import { CopyOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Select } from 'antd';
import {
  formatTokenPreview,
  type NotificationTraceFilter,
} from './dataops-hub-formatters';
import batchResultStyles from './dataops-batch-result.module.css';
import traceReasonHashStyles from './dataops-trace-reason-hash.module.css';

interface DataOpsRetryGroupTraceControlsProps {
  traceFilter: NotificationTraceFilter;
  onTraceFilterChange: (value: NotificationTraceFilter) => void;
  totalEventCount: number;
  filteredEventCount: number;
  failedEventCount: number;
  retryableFailedEventCount: number;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  retrySubmitting: boolean;
  markdownText: string;
  normalizedReasonHashFocus: string;
  reasonHashFocusLabel: string;
  onRetryFailed: () => Promise<void>;
  onRetryRetryableFailed: () => Promise<void>;
  onApplyAsNotifyFilter: () => void;
  onCopyLink: () => Promise<void>;
  onCopyMarkdown: () => Promise<void>;
  onExportCsv: () => Promise<void>;
  onClearReasonHashFocus: () => void;
}

export function DataOpsRetryGroupTraceControls({
  traceFilter,
  onTraceFilterChange,
  totalEventCount,
  filteredEventCount,
  failedEventCount,
  retryableFailedEventCount,
  hasOperatePermission,
  globalActionBusy,
  retrySubmitting,
  markdownText,
  normalizedReasonHashFocus,
  reasonHashFocusLabel,
  onRetryFailed,
  onRetryRetryableFailed,
  onApplyAsNotifyFilter,
  onCopyLink,
  onCopyMarkdown,
  onExportCsv,
  onClearReasonHashFocus,
}: DataOpsRetryGroupTraceControlsProps) {
  return (
    <div className={batchResultStyles.batchResultControls}>
      <Select<NotificationTraceFilter>
        size="small"
        value={traceFilter}
        onChange={onTraceFilterChange}
        options={[
          { label: `全部事件 (${totalEventCount})`, value: 'all' },
          { label: `仅失败 (${failedEventCount})`, value: 'failed' },
          {
            label: `仅可重发失败 (${retryableFailedEventCount})`,
            value: 'retryable_failed',
          },
        ]}
        className={batchResultStyles.batchResultFilterSelect}
      />
      <Button
        size="small"
        icon={<ReloadOutlined />}
        loading={retrySubmitting}
        disabled={!hasOperatePermission || globalActionBusy || failedEventCount === 0}
        onClick={() => {
          void onRetryFailed();
        }}
      >
        重发链路失败{failedEventCount ? `(${failedEventCount})` : ''}
      </Button>
      <Button
        size="small"
        icon={<ReloadOutlined />}
        loading={retrySubmitting}
        disabled={!hasOperatePermission || globalActionBusy || retryableFailedEventCount === 0}
        onClick={() => {
          void onRetryRetryableFailed();
        }}
      >
        重发链路可重发失败
        {retryableFailedEventCount ? `(${retryableFailedEventCount})` : ''}
      </Button>
      <Button size="small" onClick={onApplyAsNotifyFilter}>
        应用为当前筛选
      </Button>
      <Button
        size="small"
        icon={<CopyOutlined />}
        onClick={() => {
          void onCopyLink();
        }}
      >
        复制链路链接
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
        icon={<DownloadOutlined />}
        onClick={() => {
          void onExportCsv();
        }}
      >
        导出CSV
      </Button>
      {normalizedReasonHashFocus !== 'all' ? (
        <span className={traceReasonHashStyles.traceReasonHashFocusPill}>
          已筛选：{formatTokenPreview(reasonHashFocusLabel, 22)}
          <Button
            size="small"
            type="link"
            className={traceReasonHashStyles.traceReasonHashClearButton}
            onClick={onClearReasonHashFocus}
          >
            清除
          </Button>
        </span>
      ) : null}
      <span className={batchResultStyles.batchHistoryStatsText}>
        当前视图 {filteredEventCount} / 链路总计 {totalEventCount}
      </span>
    </div>
  );
}
