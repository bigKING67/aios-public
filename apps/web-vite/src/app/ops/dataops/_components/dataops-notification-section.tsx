'use client';

import type { ColumnsType } from 'antd/es/table';
import type { DataOpsNotificationChannel, DataOpsNotificationEvent } from '@/config/dataops-hub';
import {
  DataOpsNotificationChannelDetail,
  type DataOpsNotificationChannelSummary,
} from './dataops-notification-channel-detail';
import { DataOpsNotificationDetail } from './dataops-notification-detail';
import type {
  NotificationFailureReasonSummaryItem,
  NotificationRetryReport,
} from './dataops-notification-retry-helpers';
import type {
  NotificationRetryConcurrency,
  NotificationStatusFilter,
} from './dataops-hub-formatters';
import notifyStyles from './dataops-notify-panel.module.css';

interface DataOpsNotificationSectionProps {
  channels: DataOpsNotificationChannel[];
  channelSummary: DataOpsNotificationChannelSummary;
  defaultAlertChannel: DataOpsNotificationChannel | null;
  channelColumns: ColumnsType<DataOpsNotificationChannel>;
  notificationColumns: ColumnsType<DataOpsNotificationEvent>;
  filteredEvents: DataOpsNotificationEvent[];
  notificationEvents: DataOpsNotificationEvent[];
  filteredFailedCount: number;
  filteredRetryableFailedCount: number;
  notificationRetryConcurrency: NotificationRetryConcurrency;
  channelFilter: string;
  notificationEventTypeFilter: string;
  notificationStatusFilter: NotificationStatusFilter;
  notificationChannelSelectOptions: Array<{ label: string; value: string }>;
  notificationEventTypeOptions: Array<{ label: string; value: string }>;
  notificationRetryReport: NotificationRetryReport | null;
  notificationTraceSloScanRunning: boolean;
  notificationBatchRetrySubmitting: boolean;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  notificationMarkdownText: string;
  failedNotificationEventIdCount: number;
  notifyReasonHashFilter: string;
  notifyRetryGroupIdFilter: string;
  notificationFailureSummary: NotificationFailureReasonSummaryItem[];
  notifyFailureChannelFocus: string;
  notifyFailureChannelOptions: Array<{ label: string; value: string }>;
  selectedNotifyFailureReason: string;
  selectedReasonFailedCount: number;
  selectedReasonRetryableCount: number;
  notificationFailureSummaryText: string;
  notificationFailureAlertTemplateText: string;
  isCompactViewport: boolean;
  renderNotificationExpandedRow: (record: DataOpsNotificationEvent) => React.ReactNode;
  renderPaginationTotal: (total: number, range: [number, number]) => string;
  onChannelFilterChange: (value: string) => void;
  onEventTypeFilterChange: (value: string) => void;
  onStatusFilterChange: (value: NotificationStatusFilter) => void;
  onResetFilters: () => void;
  onRetryConcurrencyChange: (value: NotificationRetryConcurrency) => void;
  onRetryFilteredFailed: () => void | Promise<void>;
  onReasonHashFilterChange: (value: string) => void;
  onRetryGroupIdFilterChange: (value: string) => void;
  onOpenRetryGroupTrace: (retryGroupId: string) => void;
  onOpenTraceSloScan: () => void;
  onOpenManualNotify: (channel: DataOpsNotificationChannel) => void;
  onExportEventsCsv: () => Promise<void>;
  onExportRetryReportCsv: () => Promise<void>;
  onCopyMarkdown: () => Promise<void>;
  onSendMarkdown: () => void;
  onCopyFailedEventIds: () => Promise<void>;
  onCopyFilterLink: () => Promise<void>;
  onChannelFocusChange: (value: string) => void;
  onRetrySelectedReason: () => Promise<void>;
  onClearSelectedReason: () => void;
  onCopy: (text: string, label: string) => Promise<void>;
  onSendAlertTemplate: () => void;
  onApplyReasonFilter: (reason: string) => void;
}

export function DataOpsNotificationSection({
  channels,
  channelSummary,
  defaultAlertChannel,
  channelColumns,
  notificationColumns,
  filteredEvents,
  notificationEvents,
  filteredFailedCount,
  filteredRetryableFailedCount,
  notificationRetryConcurrency,
  channelFilter,
  notificationEventTypeFilter,
  notificationStatusFilter,
  notificationChannelSelectOptions,
  notificationEventTypeOptions,
  notificationRetryReport,
  notificationTraceSloScanRunning,
  notificationBatchRetrySubmitting,
  hasOperatePermission,
  globalActionBusy,
  notificationMarkdownText,
  failedNotificationEventIdCount,
  notifyReasonHashFilter,
  notifyRetryGroupIdFilter,
  notificationFailureSummary,
  notifyFailureChannelFocus,
  notifyFailureChannelOptions,
  selectedNotifyFailureReason,
  selectedReasonFailedCount,
  selectedReasonRetryableCount,
  notificationFailureSummaryText,
  notificationFailureAlertTemplateText,
  isCompactViewport,
  renderNotificationExpandedRow,
  renderPaginationTotal,
  onChannelFilterChange,
  onEventTypeFilterChange,
  onStatusFilterChange,
  onResetFilters,
  onRetryConcurrencyChange,
  onRetryFilteredFailed,
  onReasonHashFilterChange,
  onRetryGroupIdFilterChange,
  onOpenRetryGroupTrace,
  onOpenTraceSloScan,
  onOpenManualNotify,
  onExportEventsCsv,
  onExportRetryReportCsv,
  onCopyMarkdown,
  onSendMarkdown,
  onCopyFailedEventIds,
  onCopyFilterLink,
  onChannelFocusChange,
  onRetrySelectedReason,
  onClearSelectedReason,
  onCopy,
  onSendAlertTemplate,
  onApplyReasonFilter,
}: DataOpsNotificationSectionProps) {
  return (
    <div className={notifyStyles.notifyLayout}>
      <DataOpsNotificationChannelDetail
        channels={channels}
        summary={channelSummary}
        defaultAlertChannelName={defaultAlertChannel?.channelName || null}
        columns={channelColumns}
        isCompactViewport={isCompactViewport}
        renderPaginationTotal={renderPaginationTotal}
      />

      <article className={notifyStyles.panel}>
        <div className={notifyStyles.panelHead}>
          <h3>通知发送记录</h3>
          <p>保留核心筛选与重发操作，扩展工具默认折叠，避免界面噪音。</p>
        </div>
        <DataOpsNotificationDetail
          filteredEvents={filteredEvents}
          notificationEvents={notificationEvents}
          filteredFailedCount={filteredFailedCount}
          filteredRetryableFailedCount={filteredRetryableFailedCount}
          notificationRetryConcurrency={notificationRetryConcurrency}
          channelFilter={channelFilter}
          notificationEventTypeFilter={notificationEventTypeFilter}
          notificationStatusFilter={notificationStatusFilter}
          notificationChannelSelectOptions={notificationChannelSelectOptions}
          notificationEventTypeOptions={notificationEventTypeOptions}
          notificationRetryReport={notificationRetryReport}
          notificationTraceSloScanRunning={notificationTraceSloScanRunning}
          notificationBatchRetrySubmitting={notificationBatchRetrySubmitting}
          hasOperatePermission={hasOperatePermission}
          globalActionBusy={globalActionBusy}
          defaultAlertChannel={defaultAlertChannel}
          notificationMarkdownText={notificationMarkdownText}
          failedNotificationEventIdCount={failedNotificationEventIdCount}
          notifyReasonHashFilter={notifyReasonHashFilter}
          notifyRetryGroupIdFilter={notifyRetryGroupIdFilter}
          notificationFailureSummary={notificationFailureSummary}
          notifyFailureChannelFocus={notifyFailureChannelFocus}
          notifyFailureChannelOptions={notifyFailureChannelOptions}
          selectedNotifyFailureReason={selectedNotifyFailureReason}
          selectedReasonFailedCount={selectedReasonFailedCount}
          selectedReasonRetryableCount={selectedReasonRetryableCount}
          notificationFailureSummaryText={notificationFailureSummaryText}
          notificationFailureAlertTemplateText={notificationFailureAlertTemplateText}
          columns={notificationColumns}
          isCompactViewport={isCompactViewport}
          renderExpandedRow={renderNotificationExpandedRow}
          renderPaginationTotal={renderPaginationTotal}
          onChannelFilterChange={onChannelFilterChange}
          onEventTypeFilterChange={onEventTypeFilterChange}
          onStatusFilterChange={onStatusFilterChange}
          onResetFilters={onResetFilters}
          onRetryConcurrencyChange={onRetryConcurrencyChange}
          onRetryFilteredFailed={onRetryFilteredFailed}
          onReasonHashFilterChange={onReasonHashFilterChange}
          onRetryGroupIdFilterChange={onRetryGroupIdFilterChange}
          onOpenRetryGroupTrace={onOpenRetryGroupTrace}
          onOpenTraceSloScan={onOpenTraceSloScan}
          onOpenManualNotify={onOpenManualNotify}
          onExportEventsCsv={onExportEventsCsv}
          onExportRetryReportCsv={onExportRetryReportCsv}
          onCopyMarkdown={onCopyMarkdown}
          onSendMarkdown={onSendMarkdown}
          onCopyFailedEventIds={onCopyFailedEventIds}
          onCopyFilterLink={onCopyFilterLink}
          onChannelFocusChange={onChannelFocusChange}
          onRetrySelectedReason={onRetrySelectedReason}
          onClearSelectedReason={onClearSelectedReason}
          onCopy={onCopy}
          onSendAlertTemplate={onSendAlertTemplate}
          onApplyReasonFilter={onApplyReasonFilter}
        />
      </article>
    </div>
  );
}
