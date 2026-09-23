'use client';

import { Button, Modal } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataOpsNotificationChannel, DataOpsNotificationEvent } from '@/config/dataops-hub';
import type {
  DataOpsNotificationTraceReasonHashRecoveryItem,
  DataOpsNotificationTraceSloScanResponse,
  DataOpsNotificationTraceSloStatus,
  DataOpsNotificationTraceSummary,
} from '@/types/dataops';
import { DataOpsNotificationTraceSloScanModalBody } from './dataops-notification-trace-slo-scan-modal-body';
import { DataOpsRetryGroupTraceResult } from './dataops-retry-group-trace-result';
import {
  formatTokenPreview,
  type NotificationTraceFilter,
  type NotificationTraceSloScanQuickFilter,
  type NotificationTraceSloScanRankedItem,
} from './dataops-hub-formatters';
import type {
  NotificationTraceReasonHashRecoverySummary,
  NotificationTraceSloScanRiskSummary,
} from './dataops-notification-retry-helpers';

interface DataOpsNotificationTraceModalsProps {
  notificationTraceSloScanOpen: boolean;
  notificationTraceSloScanDryRun: boolean;
  notificationTraceSloScanRunning: boolean;
  notificationTraceSloScanLookbackHours: number;
  notificationTraceSloScanMaxGroups: number;
  notificationTraceSloScanConcurrency: number;
  notificationTraceSloScanResult: DataOpsNotificationTraceSloScanResponse | null;
  notificationTraceSloScanRiskSummary: NotificationTraceSloScanRiskSummary;
  notificationTraceSloScanQuickFilter: NotificationTraceSloScanQuickFilter;
  notificationTraceSloScanRankedItems: NotificationTraceSloScanRankedItem[];
  notificationTraceSloScanDisplayedItems: NotificationTraceSloScanRankedItem[];
  notificationTraceSloScanMarkdownText: string;
  notificationTraceSloScanColumns: ColumnsType<NotificationTraceSloScanRankedItem>;
  defaultAlertChannel: DataOpsNotificationChannel | null | undefined;
  retryGroupTraceOpen: boolean;
  activeRetryGroupTraceId: string;
  retryGroupTraceEvents: DataOpsNotificationEvent[];
  filteredRetryGroupTraceEvents: DataOpsNotificationEvent[];
  retryGroupTraceFailedEvents: DataOpsNotificationEvent[];
  retryGroupTraceRetryableFailedEvents: DataOpsNotificationEvent[];
  retryGroupTraceSummary: DataOpsNotificationTraceSummary | null;
  retryGroupTraceIsFetching: boolean;
  retryGroupTraceErrorMessage: string | null;
  retryGroupTraceSource: 'postgres' | 'runtime_store' | null;
  retryGroupTraceSloStatus: DataOpsNotificationTraceSloStatus | null;
  retryGroupTraceSloDescription: string;
  retryGroupTraceReasonHashRecovery: DataOpsNotificationTraceReasonHashRecoveryItem[];
  retryGroupTraceReasonHashRecoverySummary: NotificationTraceReasonHashRecoverySummary | null;
  normalizedRetryGroupTraceReasonHashFocus: string;
  retryGroupTraceReasonHashFocusLabel: string;
  retryGroupTraceFilter: NotificationTraceFilter;
  retryGroupTraceMarkdownText: string;
  retryGroupTraceColumns: ColumnsType<DataOpsNotificationEvent>;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  notificationBatchRetrySubmitting: boolean;
  isCompactViewport: boolean;
  onCloseNotificationTraceSloScan: () => void;
  onRunNotificationTraceSloScan: () => void | Promise<void>;
  onNotificationTraceSloScanDryRunChange: (value: boolean) => void;
  onNotificationTraceSloScanLookbackHoursChange: (value: number) => void;
  onNotificationTraceSloScanMaxGroupsChange: (value: number) => void;
  onNotificationTraceSloScanConcurrencyChange: (value: number) => void;
  onNotificationTraceSloScanQuickFilterChange: (
    value: NotificationTraceSloScanQuickFilter
  ) => void;
  onCopyNotificationTraceSloScanMarkdown: () => void | Promise<void>;
  onOpenNotifyTraceSloScanAlert: () => void;
  onCloseRetryGroupTrace: () => void;
  onFocusRetryGroupTraceReasonHash: (reasonHashKey: string) => void;
  onRetryGroupTraceFilterChange: (value: NotificationTraceFilter) => void;
  onRetryCurrentTraceFailedNotifications: () => Promise<void>;
  onRetryCurrentTraceRetryableNotifications: () => Promise<void>;
  onApplyRetryGroupTraceAsNotifyFilter: () => void;
  onCopyRetryGroupTraceLink: () => Promise<void>;
  onCopyRetryGroupTraceMarkdown: () => Promise<void>;
  onExportRetryGroupTraceCsv: () => Promise<void>;
  onClearRetryGroupTraceReasonHashFocus: () => void;
}

export function DataOpsNotificationTraceModals({
  notificationTraceSloScanOpen,
  notificationTraceSloScanDryRun,
  notificationTraceSloScanRunning,
  notificationTraceSloScanLookbackHours,
  notificationTraceSloScanMaxGroups,
  notificationTraceSloScanConcurrency,
  notificationTraceSloScanResult,
  notificationTraceSloScanRiskSummary,
  notificationTraceSloScanQuickFilter,
  notificationTraceSloScanRankedItems,
  notificationTraceSloScanDisplayedItems,
  notificationTraceSloScanMarkdownText,
  notificationTraceSloScanColumns,
  defaultAlertChannel,
  retryGroupTraceOpen,
  activeRetryGroupTraceId,
  retryGroupTraceEvents,
  filteredRetryGroupTraceEvents,
  retryGroupTraceFailedEvents,
  retryGroupTraceRetryableFailedEvents,
  retryGroupTraceSummary,
  retryGroupTraceIsFetching,
  retryGroupTraceErrorMessage,
  retryGroupTraceSource,
  retryGroupTraceSloStatus,
  retryGroupTraceSloDescription,
  retryGroupTraceReasonHashRecovery,
  retryGroupTraceReasonHashRecoverySummary,
  normalizedRetryGroupTraceReasonHashFocus,
  retryGroupTraceReasonHashFocusLabel,
  retryGroupTraceFilter,
  retryGroupTraceMarkdownText,
  retryGroupTraceColumns,
  hasOperatePermission,
  globalActionBusy,
  notificationBatchRetrySubmitting,
  isCompactViewport,
  onCloseNotificationTraceSloScan,
  onRunNotificationTraceSloScan,
  onNotificationTraceSloScanDryRunChange,
  onNotificationTraceSloScanLookbackHoursChange,
  onNotificationTraceSloScanMaxGroupsChange,
  onNotificationTraceSloScanConcurrencyChange,
  onNotificationTraceSloScanQuickFilterChange,
  onCopyNotificationTraceSloScanMarkdown,
  onOpenNotifyTraceSloScanAlert,
  onCloseRetryGroupTrace,
  onFocusRetryGroupTraceReasonHash,
  onRetryGroupTraceFilterChange,
  onRetryCurrentTraceFailedNotifications,
  onRetryCurrentTraceRetryableNotifications,
  onApplyRetryGroupTraceAsNotifyFilter,
  onCopyRetryGroupTraceLink,
  onCopyRetryGroupTraceMarkdown,
  onExportRetryGroupTraceCsv,
  onClearRetryGroupTraceReasonHashFocus,
}: DataOpsNotificationTraceModalsProps) {
  return (
    <>
      <Modal
        title="通知链路SLO巡检"
        open={notificationTraceSloScanOpen}
        onCancel={onCloseNotificationTraceSloScan}
        onOk={() => {
          void onRunNotificationTraceSloScan();
        }}
        okText={notificationTraceSloScanDryRun ? '执行模拟巡检' : '执行巡检'}
        confirmLoading={notificationTraceSloScanRunning}
        cancelButtonProps={{ disabled: notificationTraceSloScanRunning }}
        width={isCompactViewport ? 'calc(100vw - 24px)' : 1100}
      >
        <DataOpsNotificationTraceSloScanModalBody
          dryRun={notificationTraceSloScanDryRun}
          running={notificationTraceSloScanRunning}
          lookbackHours={notificationTraceSloScanLookbackHours}
          maxGroups={notificationTraceSloScanMaxGroups}
          concurrency={notificationTraceSloScanConcurrency}
          result={notificationTraceSloScanResult}
          riskSummary={notificationTraceSloScanRiskSummary}
          quickFilter={notificationTraceSloScanQuickFilter}
          rankedItems={notificationTraceSloScanRankedItems}
          displayedItems={notificationTraceSloScanDisplayedItems}
          markdownText={notificationTraceSloScanMarkdownText}
          defaultAlertChannel={defaultAlertChannel}
          hasOperatePermission={hasOperatePermission}
          globalActionBusy={globalActionBusy}
          columns={notificationTraceSloScanColumns}
          isCompactViewport={isCompactViewport}
          onDryRunChange={onNotificationTraceSloScanDryRunChange}
          onLookbackHoursChange={onNotificationTraceSloScanLookbackHoursChange}
          onMaxGroupsChange={onNotificationTraceSloScanMaxGroupsChange}
          onConcurrencyChange={onNotificationTraceSloScanConcurrencyChange}
          onQuickFilterChange={onNotificationTraceSloScanQuickFilterChange}
          onCopyMarkdown={onCopyNotificationTraceSloScanMarkdown}
          onSendAlert={onOpenNotifyTraceSloScanAlert}
        />
      </Modal>

      <Modal
        title={
          activeRetryGroupTraceId
            ? `通知重发链路 · ${formatTokenPreview(activeRetryGroupTraceId, 20)}`
            : '通知重发链路'
        }
        open={retryGroupTraceOpen}
        onCancel={onCloseRetryGroupTrace}
        footer={[
          <Button key="close" onClick={onCloseRetryGroupTrace}>
            关闭
          </Button>,
        ]}
        width={isCompactViewport ? 'calc(100vw - 24px)' : 1100}
        destroyOnHidden
      >
        <DataOpsRetryGroupTraceResult
          retryGroupId={activeRetryGroupTraceId}
          events={retryGroupTraceEvents}
          filteredEvents={filteredRetryGroupTraceEvents}
          failedEvents={retryGroupTraceFailedEvents}
          retryableFailedEvents={retryGroupTraceRetryableFailedEvents}
          summary={retryGroupTraceSummary}
          isFetching={retryGroupTraceIsFetching}
          errorMessage={retryGroupTraceErrorMessage}
          source={retryGroupTraceSource}
          sloStatus={retryGroupTraceSloStatus}
          sloDescription={retryGroupTraceSloDescription}
          reasonHashRecovery={retryGroupTraceReasonHashRecovery}
          reasonHashRecoverySummary={retryGroupTraceReasonHashRecoverySummary}
          normalizedReasonHashFocus={normalizedRetryGroupTraceReasonHashFocus}
          reasonHashFocusLabel={retryGroupTraceReasonHashFocusLabel}
          traceFilter={retryGroupTraceFilter}
          markdownText={retryGroupTraceMarkdownText}
          hasOperatePermission={hasOperatePermission}
          globalActionBusy={globalActionBusy}
          retrySubmitting={notificationBatchRetrySubmitting}
          columns={retryGroupTraceColumns}
          isCompactViewport={isCompactViewport}
          onFocusReasonHash={onFocusRetryGroupTraceReasonHash}
          onTraceFilterChange={onRetryGroupTraceFilterChange}
          onRetryFailed={onRetryCurrentTraceFailedNotifications}
          onRetryRetryableFailed={onRetryCurrentTraceRetryableNotifications}
          onApplyAsNotifyFilter={onApplyRetryGroupTraceAsNotifyFilter}
          onCopyLink={onCopyRetryGroupTraceLink}
          onCopyMarkdown={onCopyRetryGroupTraceMarkdown}
          onExportCsv={onExportRetryGroupTraceCsv}
          onClearReasonHashFocus={onClearRetryGroupTraceReasonHashFocus}
        />
      </Modal>
    </>
  );
}
