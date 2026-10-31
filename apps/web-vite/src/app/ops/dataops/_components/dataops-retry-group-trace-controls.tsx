'use client';

import { Button } from '@lobehub/ui';
import { Copy, Download, RotateCw } from 'lucide-react';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import {
  formatTokenPreview,
  type NotificationTraceFilter,
} from './dataops-hub-formatters';
import { DATAOPS_ICON_PROPS } from './dataops-icon-props';
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
      <LabeledSelect<NotificationTraceFilter>
        label="链路事件筛选"
        size="small"
        value={traceFilter}
        onChange={(value) => value && onTraceFilterChange(value)}
        options={[
          { label: `全部事件 (${totalEventCount})`, value: 'all' },
          { label: `仅失败 (${failedEventCount})`, value: 'failed' },
          {
            label: `仅可重发失败 (${retryableFailedEventCount})`,
            value: 'retryable_failed',
          },
        ]}
        wrapperClassName={batchResultStyles.batchResultFilterSelect}
      />
      <Button
        size="small"
        icon={<RotateCw {...DATAOPS_ICON_PROPS} />}
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
        icon={<RotateCw {...DATAOPS_ICON_PROPS} />}
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
        icon={<Copy {...DATAOPS_ICON_PROPS} />}
        onClick={() => {
          void onCopyLink();
        }}
      >
        复制链路链接
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
        icon={<Download {...DATAOPS_ICON_PROPS} />}
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
