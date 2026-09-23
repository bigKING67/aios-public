import type {
  DataOpsAuditEvent,
  DataOpsNotificationChannel,
} from '@/config/dataops-hub';
import type {
  DataOpsRuntimePipeline,
} from '@/types/dataops';
import {
  matchesKeyword,
  toTimestamp,
} from './dataops-hub-formatters';

export function buildAuditActionOptions({
  auditEvents,
  currentFilter,
}: {
  auditEvents: DataOpsAuditEvent[];
  currentFilter: string;
}): Array<{ label: string; value: string }> {
  const values = Array.from(new Set(auditEvents.map((item) => item.action)))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'zh-CN'));

  if (currentFilter !== 'all' && currentFilter.trim() && !values.includes(currentFilter)) {
    values.unshift(currentFilter);
  }

  return [
    { label: '全部操作', value: 'all' },
    ...values.map((value) => ({ label: value, value })),
  ];
}

export function buildAuditScopeAliasMap({
  notificationChannels,
  pipelines,
}: {
  notificationChannels: DataOpsNotificationChannel[];
  pipelines: DataOpsRuntimePipeline[];
}): Map<string, string> {
  const aliasMap = new Map<string, string>();
  for (const channel of notificationChannels) {
    aliasMap.set(channel.id, channel.channelName);
  }
  for (const pipeline of pipelines) {
    aliasMap.set(pipeline.id, pipeline.name);
    aliasMap.set(pipeline.flowName, pipeline.name);
    aliasMap.set(pipeline.deploymentName, pipeline.name);
  }
  return aliasMap;
}

export function filterDataOpsAudits({
  auditEvents,
  auditResultFilter,
  auditTimeRangeFilter,
  auditActionFilter,
  normalizedKeyword,
  resolveAuditScopeLabel,
  now = Date.now(),
}: {
  auditEvents: DataOpsAuditEvent[];
  auditResultFilter: DataOpsAuditEvent['result'] | 'all';
  auditTimeRangeFilter: 'all' | '24h' | '7d';
  auditActionFilter: string;
  normalizedKeyword: string;
  resolveAuditScopeLabel: (scope: string) => string;
  now?: number;
}): DataOpsAuditEvent[] {
  const lookbackStartTs =
    auditTimeRangeFilter === '24h'
      ? now - 24 * 60 * 60 * 1000
      : auditTimeRangeFilter === '7d'
        ? now - 7 * 24 * 60 * 60 * 1000
        : 0;

  return auditEvents.filter((item) => {
    if (auditResultFilter !== 'all' && item.result !== auditResultFilter) {
      return false;
    }
    if (auditActionFilter !== 'all' && item.action !== auditActionFilter) {
      return false;
    }
    if (lookbackStartTs > 0) {
      const auditTs = toTimestamp(item.eventAt);
      if (!auditTs || auditTs < lookbackStartTs) {
        return false;
      }
    }

    const targetText = [
      item.action,
      resolveAuditScopeLabel(item.scope),
      item.scope,
      item.operator,
      item.detail,
    ].join(' ');
    return matchesKeyword(normalizedKeyword, targetText);
  });
}
