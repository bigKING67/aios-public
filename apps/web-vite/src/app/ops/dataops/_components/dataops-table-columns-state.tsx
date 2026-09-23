'use client';

import { useCallback, useMemo } from 'react';

import type {
  DataOpsNotificationChannel,
  DataOpsNotificationEvent,
} from '@/config/dataops-hub';
import type { DataOpsActionRequest, DataOpsRuntimePipeline } from '@/types/dataops';
import {
  buildDataOpsAuditColumns,
  buildDataOpsAuditMobileColumns,
} from './dataops-audit-columns';
import {
  buildDataOpsBatchHistoryColumns,
  buildDataOpsBatchHistoryMobileColumns,
  buildDataOpsBatchResultColumns,
  buildDataOpsBatchResultMobileColumns,
} from './dataops-batch-columns';
import {
  buildDataOpsChannelColumns,
  buildDataOpsChannelMobileColumns,
} from './dataops-channel-columns';
import {
  buildDataOpsNotificationColumns,
  buildDataOpsNotificationMobileColumns,
} from './dataops-notification-columns';
import { DataOpsNotificationExpandedRow } from './dataops-notification-expanded-row';
import { buildDataOpsPipelineColumns } from './dataops-pipeline-columns';
import { buildDataOpsPipelineMobileColumns } from './dataops-pipeline-mobile-columns';
import { DataOpsPipelineExpandedRow } from './dataops-pipeline-expanded-row';

type PipelineColumnsOptions = Parameters<typeof buildDataOpsPipelineColumns>[0];
type ChannelColumnsOptions = Parameters<typeof buildDataOpsChannelColumns>[0];
type NotificationColumnsOptions = Parameters<typeof buildDataOpsNotificationColumns>[0];
type BatchHistoryColumnsOptions = Parameters<typeof buildDataOpsBatchHistoryColumns>[0];

export function useDataOpsTableColumnsState(options: {
  actionPending: boolean;
  activeActionKey: string | null;
  availableAlertChannels: DataOpsNotificationChannel[];
  globalActionBusy: boolean;
  hasOperatePermission: boolean;
  notificationChannelMap: Map<string, DataOpsNotificationChannel>;
  onApplyReasonHashFilter: (reasonHash: string) => void;
  onApplyRetryGroupFilter: (retryGroupId: string) => void;
  onChannelWebhookTest: ChannelColumnsOptions['onChannelWebhookTest'];
  onCopy: (text: string, label: string) => Promise<void>;
  onOpenChannelManualNotifyModal: ChannelColumnsOptions['onOpenChannelManualNotifyModal'];
  onOpenCommandModal: PipelineColumnsOptions['onOpenCommandModal'];
  onOpenNotificationEventRetryModal: NotificationColumnsOptions['onOpenNotificationEventRetryModal'];
  onOpenRetryGroupTrace: (retryGroupId: string) => void;
  onOpenTriggerModal: PipelineColumnsOptions['onOpenTriggerModal'];
  onPipelineAction: (
    pipeline: DataOpsRuntimePipeline,
    action: DataOpsActionRequest['action']
  ) => void;
  onRetryBatchHistory: BatchHistoryColumnsOptions['onRetryBatchHistory'];
  onViewBatchResult: BatchHistoryColumnsOptions['onViewBatchResult'];
  resolveAuditScopeLabel: (scope: string) => string;
}) {
  const {
    actionPending,
    activeActionKey,
    availableAlertChannels,
    globalActionBusy,
    hasOperatePermission,
    notificationChannelMap,
    onApplyReasonHashFilter,
    onApplyRetryGroupFilter,
    onChannelWebhookTest,
    onCopy,
    onOpenChannelManualNotifyModal,
    onOpenCommandModal,
    onOpenNotificationEventRetryModal,
    onOpenRetryGroupTrace,
    onOpenTriggerModal,
    onPipelineAction,
    onRetryBatchHistory,
    onViewBatchResult,
    resolveAuditScopeLabel,
  } = options;

  const pipelineColumns = useMemo(
    () =>
      buildDataOpsPipelineColumns({
        actionPending,
        activeActionKey,
        globalActionBusy,
        hasOperatePermission,
        onPipelineAction,
        onOpenCommandModal,
        onOpenTriggerModal,
      }),
    [
      actionPending,
      activeActionKey,
      globalActionBusy,
      hasOperatePermission,
      onPipelineAction,
      onOpenCommandModal,
      onOpenTriggerModal,
    ]
  );
  const renderPipelineExpandedRow = useCallback(
    (record: DataOpsRuntimePipeline) => <DataOpsPipelineExpandedRow record={record} />,
    []
  );

  const channelColumns = useMemo(
    () =>
      buildDataOpsChannelColumns({
        actionPending,
        activeActionKey,
        globalActionBusy,
        hasOperatePermission,
        onChannelWebhookTest,
        onOpenChannelManualNotifyModal,
      }),
    [
      actionPending,
      activeActionKey,
      globalActionBusy,
      hasOperatePermission,
      onChannelWebhookTest,
      onOpenChannelManualNotifyModal,
    ]
  );

  const notificationColumns = useMemo(
    () =>
      buildDataOpsNotificationColumns({
        availableAlertChannels,
        globalActionBusy,
        hasOperatePermission,
        onOpenNotificationEventRetryModal,
      }),
    [
      availableAlertChannels,
      globalActionBusy,
      hasOperatePermission,
      onOpenNotificationEventRetryModal,
    ]
  );
  const renderNotificationExpandedRow = useCallback(
    (record: DataOpsNotificationEvent) => (
      <DataOpsNotificationExpandedRow
        record={record}
        notificationChannelMap={notificationChannelMap}
        onApplyReasonHashFilter={onApplyReasonHashFilter}
        onApplyRetryGroupFilter={onApplyRetryGroupFilter}
        onOpenRetryGroupTrace={onOpenRetryGroupTrace}
        onCopy={onCopy}
      />
    ),
    [
      notificationChannelMap,
      onApplyReasonHashFilter,
      onApplyRetryGroupFilter,
      onCopy,
      onOpenRetryGroupTrace,
    ]
  );

  const auditColumns = useMemo(
    () => buildDataOpsAuditColumns({ resolveAuditScopeLabel }),
    [resolveAuditScopeLabel]
  );
  const batchResultColumns = useMemo(
    () => buildDataOpsBatchResultColumns(),
    []
  );
  const batchHistoryColumns = useMemo(
    () =>
      buildDataOpsBatchHistoryColumns({
        hasOperatePermission,
        globalActionBusy,
        onViewBatchResult,
        onRetryBatchHistory,
      }),
    [globalActionBusy, hasOperatePermission, onRetryBatchHistory, onViewBatchResult]
  );

  const pipelineMobileColumns = useMemo(
    () =>
      buildDataOpsPipelineMobileColumns({
        actionPending,
        activeActionKey,
        globalActionBusy,
        hasOperatePermission,
        onPipelineAction,
        onOpenCommandModal,
        onOpenTriggerModal,
      }),
    [
      actionPending,
      activeActionKey,
      globalActionBusy,
      hasOperatePermission,
      onPipelineAction,
      onOpenCommandModal,
      onOpenTriggerModal,
    ]
  );

  const channelMobileColumns = useMemo(
    () =>
      buildDataOpsChannelMobileColumns({
        actionPending,
        activeActionKey,
        globalActionBusy,
        hasOperatePermission,
        onChannelWebhookTest,
        onOpenChannelManualNotifyModal,
      }),
    [
      actionPending,
      activeActionKey,
      globalActionBusy,
      hasOperatePermission,
      onChannelWebhookTest,
      onOpenChannelManualNotifyModal,
    ]
  );

  const notificationMobileColumns = useMemo(
    () =>
      buildDataOpsNotificationMobileColumns({
        availableAlertChannels,
        globalActionBusy,
        hasOperatePermission,
        onApplyReasonHashFilter,
        onApplyRetryGroupFilter,
        onCopy,
        onOpenNotificationEventRetryModal,
        onOpenRetryGroupTrace,
      }),
    [
      availableAlertChannels,
      globalActionBusy,
      hasOperatePermission,
      onApplyReasonHashFilter,
      onApplyRetryGroupFilter,
      onCopy,
      onOpenNotificationEventRetryModal,
      onOpenRetryGroupTrace,
    ]
  );

  const auditMobileColumns = useMemo(
    () => buildDataOpsAuditMobileColumns({ resolveAuditScopeLabel }),
    [resolveAuditScopeLabel]
  );
  const batchHistoryMobileColumns = useMemo(
    () =>
      buildDataOpsBatchHistoryMobileColumns({
        hasOperatePermission,
        globalActionBusy,
        onViewBatchResult,
        onRetryBatchHistory,
      }),
    [globalActionBusy, hasOperatePermission, onRetryBatchHistory, onViewBatchResult]
  );
  const batchResultMobileColumns = useMemo(
    () => buildDataOpsBatchResultMobileColumns(),
    []
  );
  const renderPaginationTotal = useCallback(
    (total: number, range: [number, number]) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`,
    []
  );

  return {
    auditColumns,
    auditMobileColumns,
    batchHistoryColumns,
    batchHistoryMobileColumns,
    batchResultColumns,
    batchResultMobileColumns,
    channelColumns,
    channelMobileColumns,
    notificationColumns,
    notificationMobileColumns,
    pipelineColumns,
    pipelineMobileColumns,
    renderNotificationExpandedRow,
    renderPaginationTotal,
    renderPipelineExpandedRow,
  };
}
