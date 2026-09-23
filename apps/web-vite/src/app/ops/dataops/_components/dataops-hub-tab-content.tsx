'use client';
import { DataOpsAuditDetail } from './dataops-audit-detail';
import { DataOpsNotificationSection } from './dataops-notification-section';
import { DataOpsOrchestrationDetail } from './dataops-orchestration-detail';
import { DataOpsSyncDetail } from './dataops-sync-detail';
import type { DataOpsHubTabContentProps } from './dataops-hub-view-contracts';
import shellStyles from './dataops-shell.module.css';

export function DataOpsHubTabContent(props: DataOpsHubTabContentProps) {
  const {
    activeFeishuSyncJobKey,
    activeTab,
    applyAudit24hFailed,
    applyAudit7dFailed,
    applyAuditFailedOnly,
    applyNotifyReasonFilter,
    applyQuickPipelineSelection,
    auditActionFilter,
    auditActionOptions,
    auditColumns,
    auditEvents,
    auditMobileColumns,
    auditResultFilter,
    auditTimeRangeFilter,
    batchActionKey,
    batchExecutionHistory,
    channelColumns,
    channelFilter,
    channelHealthSummary,
    channelMobileColumns,
    copyCurrentNotifyFilterLink,
    copyFilteredFailedNotificationEventIds,
    copyTextToClipboard,
    defaultAlertChannel,
    exportFilteredNotificationEventsCsv,
    exportNotificationRetryReportCsv,
    feishuSyncStatusSummary,
    filteredAudits,
    filteredEvents,
    filteredFailedNotificationEventIds,
    filteredFailedNotificationEvents,
    filteredPipelines,
    filteredRetryableFailedNotificationEvents,
    globalActionBusy,
    handleBatchOperation,
    handleFeishuSyncJobAction,
    hasOperatePermission,
    hasPipelineFilter,
    isAudit24hFailed,
    isAudit7dFailed,
    isAuditFailedOnly,
    isCompactViewport,
    keywordFilterText,
    lastBatchExecutionSummary,
    lastBatchFailureContext,
    notificationBatchRetrySubmitting,
    notificationChannelSelectOptions,
    notificationColumns,
    notificationEventTypeFilter,
    notificationEventTypeOptions,
    notificationEvents,
    notificationFailureAlertTemplateText,
    notificationFailureSummary,
    notificationFailureSummaryText,
    notificationMarkdownText,
    notificationMobileColumns,
    notificationRetryConcurrency,
    notificationRetryReport,
    notificationStatusFilter,
    notificationTraceSloScanRunning,
    notifyFailureChannelFocus,
    notifyFailureChannelOptions,
    notifyReasonHashFilter,
    notifyRetryGroupIdFilter,
    openBatchHistoryModal,
    openBatchResultModal,
    openBatchTriggerModal,
    openChannelManualNotifyModal,
    openNotificationTraceSloScanModal,
    openNotifyFailureSummaryAlertModal,
    openNotifyMarkdownAlertModal,
    openRetryGroupTraceModalById,
    orderedNotificationChannels,
    pipelineColumns,
    pipelineMobileColumns,
    prioritizedFeishuSyncJobs,
    prioritizedStreams,
    renderNotificationExpandedRow,
    renderPaginationTotal,
    renderPipelineExpandedRow,
    resetAuditFilters,
    resetNotifyFilters,
    retryableFailedCount,
    retryFilteredFailedNotifications,
    retryLastFailedBatch,
    retryLastRetryableFailedBatch,
    retrySelectedNotifyFailureReason,
    selectedNotifyFailureReason,
    selectedPipelineIds,
    selectedReasonFailedNotificationEvents,
    selectedReasonRetryableFailedNotificationEvents,
    setAuditActionFilter,
    setAuditResultFilter,
    setAuditTimeRangeFilter,
    setChannelFilter,
    setKeywordInput,
    setNotificationEventTypeFilter,
    setNotificationRetryConcurrency,
    setNotificationStatusFilter,
    setNotifyFailureChannelFocus,
    setNotifyReasonHashFilter,
    setNotifyRetryGroupIdFilter,
    setSelectedNotifyFailureReason,
    setSelectedPipelineIds,
    setStatusFilter,
    statusFilterLabel,
    syncStatusSummary,
  } = props;

  return (
    <section className={shellStyles.contentBlock}>
      {activeTab === 'orchestration' ? (
        <DataOpsOrchestrationDetail
          filteredPipelines={filteredPipelines}
          selectedPipelineIds={selectedPipelineIds}
          lastBatchExecutionSummary={lastBatchExecutionSummary}
          lastBatchFailureContext={lastBatchFailureContext}
          retryableFailedCount={retryableFailedCount}
          statusFilterLabel={statusFilterLabel}
          keywordFilterText={keywordFilterText}
          hasPipelineFilter={hasPipelineFilter}
          hasOperatePermission={hasOperatePermission}
          globalActionBusy={globalActionBusy}
          batchActionKey={batchActionKey}
          batchExecutionHistoryCount={batchExecutionHistory.length}
          columns={isCompactViewport ? pipelineMobileColumns : pipelineColumns}
          isCompactViewport={isCompactViewport}
          renderExpandedRow={renderPipelineExpandedRow}
          renderPaginationTotal={renderPaginationTotal}
          onSelectExecutable={() =>
            applyQuickPipelineSelection(() => true, '当前筛选条件下没有可执行任务。')
          }
          onClearSelected={() => setSelectedPipelineIds([])}
          onBatchOperation={handleBatchOperation}
          onOpenBatchTrigger={openBatchTriggerModal}
          onRetryFailed={retryLastFailedBatch}
          onRetryRetryableFailed={retryLastRetryableFailedBatch}
          onOpenBatchResult={openBatchResultModal}
          onOpenBatchHistory={openBatchHistoryModal}
          onClearFilters={() => {
            setStatusFilter('all');
            setKeywordInput('');
          }}
          onSelectedPipelineIdsChange={setSelectedPipelineIds}
        />
      ) : null}

      {activeTab === 'sync' ? (
        <DataOpsSyncDetail
          streams={prioritizedStreams}
          streamSummary={syncStatusSummary}
          feishuSyncJobs={prioritizedFeishuSyncJobs}
          feishuSyncSummary={feishuSyncStatusSummary}
          activeFeishuSyncJobKey={activeFeishuSyncJobKey}
          hasOperatePermission={hasOperatePermission}
          globalActionBusy={globalActionBusy}
          onRunFeishuSyncJob={handleFeishuSyncJobAction}
        />
      ) : null}

      {activeTab === 'notify' ? (
        <DataOpsNotificationSection
          channels={orderedNotificationChannels}
          channelSummary={channelHealthSummary}
          defaultAlertChannel={defaultAlertChannel}
          channelColumns={isCompactViewport ? channelMobileColumns : channelColumns}
          notificationColumns={isCompactViewport ? notificationMobileColumns : notificationColumns}
          filteredEvents={filteredEvents}
          notificationEvents={notificationEvents}
          filteredFailedCount={filteredFailedNotificationEvents.length}
          filteredRetryableFailedCount={filteredRetryableFailedNotificationEvents.length}
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
          notificationMarkdownText={notificationMarkdownText}
          failedNotificationEventIdCount={filteredFailedNotificationEventIds.length}
          notifyReasonHashFilter={notifyReasonHashFilter}
          notifyRetryGroupIdFilter={notifyRetryGroupIdFilter}
          notificationFailureSummary={notificationFailureSummary}
          notifyFailureChannelFocus={notifyFailureChannelFocus}
          notifyFailureChannelOptions={notifyFailureChannelOptions}
          selectedNotifyFailureReason={selectedNotifyFailureReason}
          selectedReasonFailedCount={selectedReasonFailedNotificationEvents.length}
          selectedReasonRetryableCount={selectedReasonRetryableFailedNotificationEvents.length}
          notificationFailureSummaryText={notificationFailureSummaryText}
          notificationFailureAlertTemplateText={notificationFailureAlertTemplateText}
          isCompactViewport={isCompactViewport}
          renderNotificationExpandedRow={renderNotificationExpandedRow}
          renderPaginationTotal={renderPaginationTotal}
          onChannelFilterChange={setChannelFilter}
          onEventTypeFilterChange={setNotificationEventTypeFilter}
          onStatusFilterChange={setNotificationStatusFilter}
          onResetFilters={resetNotifyFilters}
          onRetryConcurrencyChange={setNotificationRetryConcurrency}
          onRetryFilteredFailed={retryFilteredFailedNotifications}
          onReasonHashFilterChange={setNotifyReasonHashFilter}
          onRetryGroupIdFilterChange={setNotifyRetryGroupIdFilter}
          onOpenRetryGroupTrace={openRetryGroupTraceModalById}
          onOpenTraceSloScan={openNotificationTraceSloScanModal}
          onOpenManualNotify={openChannelManualNotifyModal}
          onExportEventsCsv={exportFilteredNotificationEventsCsv}
          onExportRetryReportCsv={exportNotificationRetryReportCsv}
          onCopyMarkdown={() =>
            copyTextToClipboard(notificationMarkdownText, '通知筛选Markdown报告')
          }
          onSendMarkdown={openNotifyMarkdownAlertModal}
          onCopyFailedEventIds={copyFilteredFailedNotificationEventIds}
          onCopyFilterLink={copyCurrentNotifyFilterLink}
          onChannelFocusChange={setNotifyFailureChannelFocus}
          onRetrySelectedReason={retrySelectedNotifyFailureReason}
          onClearSelectedReason={() => {
            setSelectedNotifyFailureReason('');
          }}
          onCopy={copyTextToClipboard}
          onSendAlertTemplate={openNotifyFailureSummaryAlertModal}
          onApplyReasonFilter={applyNotifyReasonFilter}
        />
      ) : null}

      {activeTab === 'audit' ? (
        <DataOpsAuditDetail
          auditEvents={auditEvents}
          filteredAudits={filteredAudits}
          auditResultFilter={auditResultFilter}
          auditTimeRangeFilter={auditTimeRangeFilter}
          auditActionFilter={auditActionFilter}
          auditActionOptions={auditActionOptions}
          isAuditFailedOnly={isAuditFailedOnly}
          isAudit24hFailed={isAudit24hFailed}
          isAudit7dFailed={isAudit7dFailed}
          columns={isCompactViewport ? auditMobileColumns : auditColumns}
          isCompactViewport={isCompactViewport}
          onResultFilterChange={setAuditResultFilter}
          onTimeRangeFilterChange={setAuditTimeRangeFilter}
          onActionFilterChange={setAuditActionFilter}
          onResetFilters={resetAuditFilters}
          onApplyFailedOnly={applyAuditFailedOnly}
          onApply24hFailed={applyAudit24hFailed}
          onApply7dFailed={applyAudit7dFailed}
          renderPaginationTotal={renderPaginationTotal}
        />
      ) : null}
    </section>
  );
}
