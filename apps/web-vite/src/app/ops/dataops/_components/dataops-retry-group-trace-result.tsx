'use client';

import { Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataOpsNotificationEvent } from '@/config/dataops-hub';
import type {
  DataOpsNotificationTraceReasonHashRecoveryItem,
  DataOpsNotificationTraceSloStatus,
  DataOpsNotificationTraceSummary,
} from '@/types/dataops';
import type { NotificationTraceFilter } from './dataops-hub-formatters';
import type { NotificationTraceReasonHashRecoverySummary } from './dataops-notification-retry-helpers';
import { DataOpsRetryGroupTraceControls } from './dataops-retry-group-trace-controls';
import { DataOpsRetryGroupTraceSummary } from './dataops-retry-group-trace-summary';
import { DataOpsTraceReasonHashRecoveryPanel } from './dataops-trace-reason-hash-recovery-panel';

type RetryGroupTraceSource = 'postgres' | 'runtime_store';

interface DataOpsRetryGroupTraceResultProps {
  retryGroupId: string;
  events: DataOpsNotificationEvent[];
  filteredEvents: DataOpsNotificationEvent[];
  failedEvents: DataOpsNotificationEvent[];
  retryableFailedEvents: DataOpsNotificationEvent[];
  summary: DataOpsNotificationTraceSummary | null;
  isFetching: boolean;
  errorMessage: string | null;
  source: RetryGroupTraceSource | null;
  sloStatus: DataOpsNotificationTraceSloStatus | null;
  sloDescription: string;
  reasonHashRecovery: DataOpsNotificationTraceReasonHashRecoveryItem[];
  reasonHashRecoverySummary: NotificationTraceReasonHashRecoverySummary | null;
  normalizedReasonHashFocus: string;
  reasonHashFocusLabel: string;
  traceFilter: NotificationTraceFilter;
  markdownText: string;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  retrySubmitting: boolean;
  columns: ColumnsType<DataOpsNotificationEvent>;
  isCompactViewport: boolean;
  onFocusReasonHash: (reasonHashKey: string) => void;
  onTraceFilterChange: (value: NotificationTraceFilter) => void;
  onRetryFailed: () => Promise<void>;
  onRetryRetryableFailed: () => Promise<void>;
  onApplyAsNotifyFilter: () => void;
  onCopyLink: () => Promise<void>;
  onCopyMarkdown: () => Promise<void>;
  onExportCsv: () => Promise<void>;
  onClearReasonHashFocus: () => void;
}

export function DataOpsRetryGroupTraceResult({
  retryGroupId,
  events,
  filteredEvents,
  failedEvents,
  retryableFailedEvents,
  summary,
  isFetching,
  errorMessage,
  source,
  sloStatus,
  sloDescription,
  reasonHashRecovery,
  reasonHashRecoverySummary,
  normalizedReasonHashFocus,
  reasonHashFocusLabel,
  traceFilter,
  markdownText,
  hasOperatePermission,
  globalActionBusy,
  retrySubmitting,
  columns,
  isCompactViewport,
  onFocusReasonHash,
  onTraceFilterChange,
  onRetryFailed,
  onRetryRetryableFailed,
  onApplyAsNotifyFilter,
  onCopyLink,
  onCopyMarkdown,
  onExportCsv,
  onClearReasonHashFocus,
}: DataOpsRetryGroupTraceResultProps) {
  if (!events.length) {
    return <Empty description="当前链路没有匹配到通知事件" />;
  }

  return (
    <>
      <DataOpsRetryGroupTraceSummary
        retryGroupId={retryGroupId}
        summary={summary}
        filteredEventCount={filteredEvents.length}
        isFetching={isFetching}
        errorMessage={errorMessage}
        source={source}
        sloStatus={sloStatus}
        sloDescription={sloDescription}
      />
      <DataOpsTraceReasonHashRecoveryPanel
        items={reasonHashRecovery}
        summary={reasonHashRecoverySummary}
        activeReasonHashFocus={normalizedReasonHashFocus}
        onFocusReasonHash={onFocusReasonHash}
      />
      <DataOpsRetryGroupTraceControls
        traceFilter={traceFilter}
        onTraceFilterChange={onTraceFilterChange}
        totalEventCount={events.length}
        filteredEventCount={filteredEvents.length}
        failedEventCount={failedEvents.length}
        retryableFailedEventCount={retryableFailedEvents.length}
        hasOperatePermission={hasOperatePermission}
        globalActionBusy={globalActionBusy}
        retrySubmitting={retrySubmitting}
        markdownText={markdownText}
        normalizedReasonHashFocus={normalizedReasonHashFocus}
        reasonHashFocusLabel={reasonHashFocusLabel}
        onRetryFailed={onRetryFailed}
        onRetryRetryableFailed={onRetryRetryableFailed}
        onApplyAsNotifyFilter={onApplyAsNotifyFilter}
        onCopyLink={onCopyLink}
        onCopyMarkdown={onCopyMarkdown}
        onExportCsv={onExportCsv}
        onClearReasonHashFocus={onClearReasonHashFocus}
      />
      {filteredEvents.length ? (
        <Table<DataOpsNotificationEvent>
          rowKey="id"
          columns={columns}
          dataSource={filteredEvents}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          size="small"
          scroll={isCompactViewport ? undefined : { x: 'max-content' }}
        />
      ) : (
        <Empty
          description={
            normalizedReasonHashFocus !== 'all'
              ? `当前链路在 ${reasonHashFocusLabel} 下没有匹配到事件`
              : traceFilter === 'all'
                ? '当前链路没有匹配到通知事件'
                : traceFilter === 'failed'
                  ? '当前链路没有失败事件'
                  : '当前链路没有可重发失败事件'
          }
        />
      )}
    </>
  );
}
