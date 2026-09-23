'use client';

import { Empty, Table } from 'antd';
import type { DataOpsNotificationEvent } from '@/config/dataops-hub';
import type { DataOpsNotificationDetailProps } from './dataops-notification-detail-types';
import { DataOpsNotificationFailureSummaryPanel } from './dataops-notification-failure-summary-panel';
import { notificationTableComponents } from './dataops-notification-table-components';
import { DataOpsNotificationToolbar } from './dataops-notification-toolbar';
import notificationTableStyles from './dataops-notification-table.module.css';

export function DataOpsNotificationDetail({
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
  defaultAlertChannel,
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
  columns,
  isCompactViewport,
  renderExpandedRow,
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
}: DataOpsNotificationDetailProps) {
  return (
    <>
      <DataOpsNotificationToolbar
        matchedEventCount={filteredEvents.length}
        totalEventCount={notificationEvents.length}
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
      />

      <DataOpsNotificationFailureSummaryPanel
        items={notificationFailureSummary}
        channelFocus={notifyFailureChannelFocus}
        channelOptions={notifyFailureChannelOptions}
        selectedReason={selectedNotifyFailureReason}
        selectedReasonFailedCount={selectedReasonFailedCount}
        selectedReasonRetryableCount={selectedReasonRetryableCount}
        hasOperatePermission={hasOperatePermission}
        globalActionBusy={globalActionBusy}
        summaryText={notificationFailureSummaryText}
        alertTemplateText={notificationFailureAlertTemplateText}
        markdownText={notificationMarkdownText}
        defaultAlertChannelName={defaultAlertChannel?.channelName || null}
        hasDefaultAlertChannel={Boolean(defaultAlertChannel)}
        onChannelFocusChange={onChannelFocusChange}
        onRetrySelectedReason={onRetrySelectedReason}
        onClearSelectedReason={onClearSelectedReason}
        onCopy={onCopy}
        onSendAlertTemplate={onSendAlertTemplate}
        onSendMarkdown={onSendMarkdown}
        onApplyReasonFilter={onApplyReasonFilter}
      />

      {filteredEvents.length ? (
        <Table<DataOpsNotificationEvent>
          className={notificationTableStyles.notificationTable}
          rowKey="id"
          columns={columns}
          components={notificationTableComponents}
          dataSource={filteredEvents}
          expandable={
            isCompactViewport
              ? undefined
              : {
                  expandedRowRender: renderExpandedRow,
                  columnWidth: 32,
                }
          }
          pagination={{
            defaultPageSize: isCompactViewport ? 8 : 10,
            pageSizeOptions: ['8', '10', '20', '50'],
            showSizeChanger: true,
            showQuickJumper: true,
            hideOnSinglePage: true,
            showTotal: renderPaginationTotal,
          }}
          size="small"
          tableLayout={isCompactViewport ? undefined : 'fixed'}
        />
      ) : (
        <Empty description="没有匹配到通知记录" />
      )}
    </>
  );
}
