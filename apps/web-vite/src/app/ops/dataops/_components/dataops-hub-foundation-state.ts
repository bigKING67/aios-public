'use client';
import { useState } from 'react';
import { App } from 'antd';
import type { DataOpsStatus } from '@/config/dataops-hub';
import { DATAOPS_OPERATE_PERMISSIONS } from '@/lib/dataops-permissions';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useDataOpsActions } from '@/hooks/use-dataops-actions';
import { usePermission } from '@/hooks/use-permission';
import { useDataOpsRuntime } from '@/hooks/use-dataops-runtime';
import {
  type NotificationStatusFilter,
  type TabKey,
} from './dataops-hub-formatters';
import { useDataOpsTriggerModalState } from './dataops-trigger-modal-state';
import { useDataOpsBatchHistoryModalState } from './dataops-batch-history-modal-state';
import { useDataOpsRuntimeHubState } from './dataops-runtime-hub-state';
import { useDataOpsAuditFilterState } from './dataops-audit-filter-state';
import { useDataOpsActionExecutorState } from './dataops-action-executor-state';
import { useDataOpsCoreFilterState } from './dataops-core-filter-state';
import { useDataOpsClientUtilityState } from './dataops-client-utility-state';

export function useDataOpsHubFoundationState() {
  const { message, modal } = App.useApp();
  const runtimeQuery = useDataOpsRuntime();
  const actionMutation = useDataOpsActions();
  const hasOperatePermission = usePermission(DATAOPS_OPERATE_PERMISSIONS, 'any');
  const isCompactViewport = useMediaQuery('(max-width: 980px)');

  const [activeTab, setActiveTab] = useState<TabKey>('orchestration');
  const [keywordInput, setKeywordInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<DataOpsStatus | 'all'>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [notificationEventTypeFilter, setNotificationEventTypeFilter] = useState<string>('all');
  const [notificationStatusFilter, setNotificationStatusFilter] =
    useState<NotificationStatusFilter>('all');
  const [notifyReasonHashFilter, setNotifyReasonHashFilter] = useState<string>('');
  const [notifyRetryGroupIdFilter, setNotifyRetryGroupIdFilter] = useState<string>('');
  const [selectedPipelineIds, setSelectedPipelineIds] = useState<string[]>([]);
  const [notifyFailureChannelFocus, setNotifyFailureChannelFocus] = useState<string>('all');
  const [selectedNotifyFailureReason, setSelectedNotifyFailureReason] = useState<string>('');
  const [runtimeDetailDrawerOpen, setRuntimeDetailDrawerOpen] = useState(false);

  const {
    copyTextToClipboard,
    currentNotifyShareFilters,
    exportDataOpsCsv,
    getCurrentNotifyShareFilters,
    normalizedKeyword,
    normalizedNotifyReasonHashFilter,
    normalizedNotifyRetryGroupIdFilter,
  } = useDataOpsClientUtilityState({
    channelFilter,
    keywordInput,
    message,
    notificationEventTypeFilter,
    notificationStatusFilter,
    notifyFailureChannelFocus,
    notifyReasonHashFilter,
    notifyRetryGroupIdFilter,
    selectedNotifyFailureReason,
  });
  const { activeActionKey, executeAction } = useDataOpsActionExecutorState({
    message,
    mutateAction: actionMutation.mutateAsync,
    refetchRuntime: runtimeQuery.refetch,
  });

  const {
    auditEvents,
    auditScopeAliasMap,
    availableAlertChannelIdSet,
    availableAlertChannels,
    batchExecutionHistory,
    channelHealthSummary,
    defaultAlertChannel,
    feishuSyncJobs,
    metrics,
    notificationChannelMap,
    notificationChannelSelectOptions,
    notificationEvents,
    notificationEventTypeOptions,
    orderedNotificationChannels,
    pipelineMap,
    pipelines,
    runtimeStore,
    runtimeWarnings,
    syncStreams,
  } = useDataOpsRuntimeHubState({
    notificationEventTypeFilter,
    runtimeData: runtimeQuery.data,
  });
  const {
    auditActionFilter,
    auditActionOptions,
    auditQuickFilterState,
    auditResultFilter,
    auditTimeRangeFilter,
    applyAudit24hFailed,
    applyAudit7dFailed,
    applyAuditFailedOnly,
    filteredAudits,
    resetAuditFilters,
    resolveAuditScopeLabel,
    setAuditActionFilter,
    setAuditResultFilter,
    setAuditTimeRangeFilter,
  } = useDataOpsAuditFilterState({
    auditEvents,
    auditScopeAliasMap,
    normalizedKeyword,
  });

  const {
    applyQuickPipelineSelection,
    feishuSyncStatusSummary,
    filteredPipelines,
    prioritizedFeishuSyncJobs,
    prioritizedStreams,
    selectedPipelines,
    syncStatusSummary,
  } = useDataOpsCoreFilterState({
    feishuSyncJobs,
    message,
    normalizedKeyword,
    pipelineMap,
    pipelines,
    selectedPipelineIds,
    setSelectedPipelineIds,
    statusFilter,
    syncStreams,
  });
  const {
    triggerModalPipeline,
    triggerForm,
    triggerModalSpecs,
    batchTriggerModalPipelineIds,
    batchTriggerForm,
    batchTriggerModalPipelines,
    batchTriggerModalSpecs,
    batchTriggerPayloadPreview,
    batchTriggerExecutionPreview,
    commandModalPipeline,
    commandForm,
    commandModalSpecs,
    commandModalCommandPreview,
    openTriggerModal,
    closeTriggerModal,
    openBatchTriggerModal,
    closeBatchTriggerModal,
    openCommandModal,
    closeCommandModal,
  } = useDataOpsTriggerModalState({
    hasOperatePermission,
    message,
    pipelineMap,
    selectedPipelines,
  });

  const {
    batchHistoryModalOpen,
    setBatchHistoryModalOpen,
    batchHistoryAlertModalOpen,
    batchHistoryAlertSubmitting,
    batchHistoryActionFilter,
    setBatchHistoryActionFilter,
    batchHistoryFailureFilter,
    setBatchHistoryFailureFilter,
    batchHistoryTimeRangeFilter,
    setBatchHistoryTimeRangeFilter,
    batchHistoryKeyword,
    setBatchHistoryKeyword,
    batchHistoryAlertForm,
    batchHistoryAlertModalCopy,
    resetBatchHistoryFilters,
    openBatchHistoryModal,
    closeBatchHistoryModal,
    openBatchHistoryAlertDraftModal,
    applyBatchHistoryReasonFilter,
    closeBatchHistoryAlertModal,
    submitBatchHistoryAlertModal,
  } = useDataOpsBatchHistoryModalState({
    availableAlertChannels,
    executeAction,
    hasOperatePermission,
    message,
  });

  return {
    actionMutation,
    activeActionKey,
    activeTab,
    applyAudit24hFailed,
    applyAudit7dFailed,
    applyAuditFailedOnly,
    applyBatchHistoryReasonFilter,
    applyQuickPipelineSelection,
    auditActionFilter,
    auditActionOptions,
    auditEvents,
    auditQuickFilterState,
    auditResultFilter,
    auditTimeRangeFilter,
    availableAlertChannelIdSet,
    availableAlertChannels,
    batchExecutionHistory,
    batchHistoryActionFilter,
    batchHistoryAlertForm,
    batchHistoryAlertModalCopy,
    batchHistoryAlertModalOpen,
    batchHistoryAlertSubmitting,
    batchHistoryFailureFilter,
    batchHistoryKeyword,
    batchHistoryModalOpen,
    batchHistoryTimeRangeFilter,
    batchTriggerExecutionPreview,
    batchTriggerForm,
    batchTriggerModalPipelineIds,
    batchTriggerModalPipelines,
    batchTriggerModalSpecs,
    batchTriggerPayloadPreview,
    channelFilter,
    channelHealthSummary,
    closeBatchHistoryAlertModal,
    closeBatchHistoryModal,
    closeBatchTriggerModal,
    closeCommandModal,
    closeTriggerModal,
    commandForm,
    commandModalCommandPreview,
    commandModalPipeline,
    commandModalSpecs,
    copyTextToClipboard,
    currentNotifyShareFilters,
    defaultAlertChannel,
    executeAction,
    exportDataOpsCsv,
    feishuSyncStatusSummary,
    filteredAudits,
    filteredPipelines,
    getCurrentNotifyShareFilters,
    hasOperatePermission,
    isCompactViewport,
    keywordInput,
    message,
    metrics,
    modal,
    normalizedKeyword,
    normalizedNotifyReasonHashFilter,
    normalizedNotifyRetryGroupIdFilter,
    notificationChannelMap,
    notificationChannelSelectOptions,
    notificationEventTypeFilter,
    notificationEventTypeOptions,
    notificationEvents,
    notificationStatusFilter,
    notifyFailureChannelFocus,
    notifyReasonHashFilter,
    notifyRetryGroupIdFilter,
    openBatchHistoryAlertDraftModal,
    openBatchHistoryModal,
    openBatchTriggerModal,
    openCommandModal,
    openTriggerModal,
    orderedNotificationChannels,
    pipelineMap,
    prioritizedFeishuSyncJobs,
    prioritizedStreams,
    resetAuditFilters,
    resetBatchHistoryFilters,
    resolveAuditScopeLabel,
    runtimeDetailDrawerOpen,
    runtimeQuery,
    runtimeStore,
    runtimeWarnings,
    selectedNotifyFailureReason,
    selectedPipelineIds,
    selectedPipelines,
    setActiveTab,
    setAuditActionFilter,
    setAuditResultFilter,
    setAuditTimeRangeFilter,
    setBatchHistoryActionFilter,
    setBatchHistoryFailureFilter,
    setBatchHistoryKeyword,
    setBatchHistoryModalOpen,
    setBatchHistoryTimeRangeFilter,
    setChannelFilter,
    setKeywordInput,
    setNotificationEventTypeFilter,
    setNotificationStatusFilter,
    setNotifyFailureChannelFocus,
    setNotifyReasonHashFilter,
    setNotifyRetryGroupIdFilter,
    setRuntimeDetailDrawerOpen,
    setSelectedNotifyFailureReason,
    setSelectedPipelineIds,
    setStatusFilter,
    statusFilter,
    submitBatchHistoryAlertModal,
    syncStatusSummary,
    triggerForm,
    triggerModalPipeline,
    triggerModalSpecs,
  };
}
