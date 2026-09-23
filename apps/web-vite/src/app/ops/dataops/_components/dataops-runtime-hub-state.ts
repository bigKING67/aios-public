import { useMemo } from 'react';

import type {
  DataOpsAuditEvent,
  DataOpsNotificationChannel,
  DataOpsNotificationEvent,
} from '@/config/dataops-hub';
import type {
  DataOpsRuntimeFeishuSyncJob,
  DataOpsRuntimePipeline,
  DataOpsRuntimeResponse,
  DataOpsRuntimeSyncStream,
} from '@/types/dataops';
import { toBatchExecutionSummary } from './dataops-batch-helpers';
import {
  buildAuditScopeAliasMap,
  buildDataOpsNotificationChannelSummary,
  buildFallbackDataOpsMetrics,
  buildNotificationEventTypeOptions,
  sortDataOpsNotificationChannels,
} from './dataops-hub-selectors';

const EMPTY_AUDIT_EVENTS: DataOpsAuditEvent[] = [];
const EMPTY_FEISHU_SYNC_JOBS: DataOpsRuntimeFeishuSyncJob[] = [];
const EMPTY_NOTIFICATION_CHANNELS: DataOpsNotificationChannel[] = [];
const EMPTY_NOTIFICATION_EVENTS: DataOpsNotificationEvent[] = [];
const EMPTY_PIPELINES: DataOpsRuntimePipeline[] = [];
const EMPTY_SYNC_STREAMS: DataOpsRuntimeSyncStream[] = [];

export function useDataOpsRuntimeHubState(options: {
  notificationEventTypeFilter: string;
  runtimeData: DataOpsRuntimeResponse | undefined;
}) {
  const { notificationEventTypeFilter, runtimeData } = options;

  const pipelines = runtimeData?.pipelines || EMPTY_PIPELINES;
  const syncStreams = runtimeData?.syncStreams || EMPTY_SYNC_STREAMS;
  const feishuSyncJobs = useMemo<DataOpsRuntimeFeishuSyncJob[]>(
    () => runtimeData?.feishuSyncJobs || EMPTY_FEISHU_SYNC_JOBS,
    [runtimeData?.feishuSyncJobs]
  );
  const notificationChannels = runtimeData?.notificationChannels || EMPTY_NOTIFICATION_CHANNELS;
  const notificationEvents = runtimeData?.notificationEvents || EMPTY_NOTIFICATION_EVENTS;
  const auditEvents: DataOpsAuditEvent[] = runtimeData?.auditEvents || EMPTY_AUDIT_EVENTS;
  const runtimeWarnings = runtimeData?.warnings || [];
  const runtimeStore = runtimeData?.runtimeStore;

  const orderedNotificationChannels = useMemo(
    () => sortDataOpsNotificationChannels(notificationChannels),
    [notificationChannels]
  );
  const defaultAlertChannel = useMemo(
    () =>
      orderedNotificationChannels.find(
        (channel) => channel.enabled && channel.status !== 'paused'
      ) || null,
    [orderedNotificationChannels]
  );
  const availableAlertChannels = useMemo(
    () =>
      orderedNotificationChannels.filter(
        (channel) => channel.enabled && channel.status !== 'paused'
      ),
    [orderedNotificationChannels]
  );
  const availableAlertChannelIdSet = useMemo(
    () => new Set(availableAlertChannels.map((channel) => channel.id)),
    [availableAlertChannels]
  );
  const notificationChannelMap = useMemo<Map<string, DataOpsNotificationChannel>>(
    () => new Map(orderedNotificationChannels.map((item) => [item.id, item])),
    [orderedNotificationChannels]
  );
  const channelHealthSummary = useMemo(
    () => buildDataOpsNotificationChannelSummary(orderedNotificationChannels),
    [orderedNotificationChannels]
  );
  const notificationChannelSelectOptions = useMemo(
    () => [
      { label: '全部通道', value: 'all' },
      ...orderedNotificationChannels.map((item) => ({
        label: item.channelName,
        value: item.id,
      })),
    ],
    [orderedNotificationChannels]
  );
  const notificationEventTypeOptions = useMemo(
    () =>
      buildNotificationEventTypeOptions({
        notificationEvents,
        currentFilter: notificationEventTypeFilter,
      }),
    [notificationEventTypeFilter, notificationEvents]
  );
  const batchExecutionHistory = useMemo(
    () => (runtimeData?.batchExecutions || []).map((item) => toBatchExecutionSummary(item)),
    [runtimeData?.batchExecutions]
  );
  const pipelineMap = useMemo(
    () => new Map(pipelines.map((item) => [item.id, item])),
    [pipelines]
  );
  const auditScopeAliasMap = useMemo(
    () => buildAuditScopeAliasMap({ notificationChannels, pipelines }),
    [notificationChannels, pipelines]
  );
  const metrics = useMemo(() => {
    if (runtimeData) {
      return runtimeData.metrics;
    }

    return buildFallbackDataOpsMetrics({
      pipelines,
      syncStreams,
      notificationChannels,
    });
  }, [notificationChannels, pipelines, runtimeData, syncStreams]);

  return {
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
    notificationChannels,
    notificationChannelSelectOptions,
    notificationEvents,
    notificationEventTypeOptions,
    orderedNotificationChannels,
    pipelineMap,
    pipelines,
    runtimeStore,
    runtimeWarnings,
    syncStreams,
  };
}
