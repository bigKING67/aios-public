import type {
  DataOpsStatus,
} from '@/config/dataops-hub';
import type {
  DataOpsRuntimeFeishuSyncJob,
  DataOpsRuntimePipeline,
  DataOpsRuntimeSyncStream,
} from '@/types/dataops';
import {
  getStatusPriority,
  matchesKeyword,
  toTimestamp,
} from './dataops-hub-formatters';
import type {
  DataOpsStatusSummary,
} from './dataops-hub-selector-types';

export function filterDataOpsPipelines({
  pipelines,
  statusFilter,
  normalizedKeyword,
}: {
  pipelines: DataOpsRuntimePipeline[];
  statusFilter: DataOpsStatus | 'all';
  normalizedKeyword: string;
}): DataOpsRuntimePipeline[] {
  return pipelines.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) {
      return false;
    }

    const targetText = [
      item.name,
      item.flowName,
      item.deploymentName,
      item.sourceTables.join(' '),
      item.targetTables.join(' '),
      item.watermarkTable || '',
      item.runtime?.flowRunStateName || '',
      item.runtime?.flowRunStateMessage || '',
    ].join(' ');

    return matchesKeyword(normalizedKeyword, targetText);
  });
}

export function filterDataOpsSyncStreams({
  syncStreams,
  statusFilter,
  normalizedKeyword,
}: {
  syncStreams: DataOpsRuntimeSyncStream[];
  statusFilter: DataOpsStatus | 'all';
  normalizedKeyword: string;
}): DataOpsRuntimeSyncStream[] {
  return syncStreams.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) {
      return false;
    }

    const targetText = [
      item.streamName,
      item.layers.join(' '),
      item.source,
      item.target,
      item.checkpointTable,
    ].join(' ');

    return matchesKeyword(normalizedKeyword, targetText);
  });
}

export function sortDataOpsSyncStreams(
  filteredStreams: DataOpsRuntimeSyncStream[]
): DataOpsRuntimeSyncStream[] {
  return filteredStreams.slice().sort((left, right) => {
    const statusDiff = getStatusPriority(left.status) - getStatusPriority(right.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    if (right.computedLagMinutes !== left.computedLagMinutes) {
      return right.computedLagMinutes - left.computedLagMinutes;
    }

    const syncTimeDiff = toTimestamp(right.lastSyncAt) - toTimestamp(left.lastSyncAt);
    if (syncTimeDiff !== 0) {
      return syncTimeDiff;
    }

    return left.streamName.localeCompare(right.streamName, 'zh-CN');
  });
}

export function filterDataOpsFeishuSyncJobs({
  feishuSyncJobs,
  statusFilter,
  normalizedKeyword,
}: {
  feishuSyncJobs: DataOpsRuntimeFeishuSyncJob[];
  statusFilter: DataOpsStatus | 'all';
  normalizedKeyword: string;
}): DataOpsRuntimeFeishuSyncJob[] {
  return feishuSyncJobs.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) {
      return false;
    }

    const targetText = [
      item.jobName,
      item.serviceName,
      item.sourceTable,
      item.target,
      item.lastWatermark || '',
      item.lastPrimaryKey || '',
    ].join(' ');

    return matchesKeyword(normalizedKeyword, targetText);
  });
}

export function sortDataOpsFeishuSyncJobs(
  filteredFeishuSyncJobs: DataOpsRuntimeFeishuSyncJob[]
): DataOpsRuntimeFeishuSyncJob[] {
  return filteredFeishuSyncJobs.slice().sort((left, right) => {
    const statusDiff = getStatusPriority(left.status) - getStatusPriority(right.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }

    const leftLag = typeof left.lagMinutes === 'number' ? left.lagMinutes : -1;
    const rightLag = typeof right.lagMinutes === 'number' ? right.lagMinutes : -1;
    if (leftLag !== rightLag) {
      return rightLag - leftLag;
    }

    const syncTimeDiff = toTimestamp(right.lastSyncedAt) - toTimestamp(left.lastSyncedAt);
    if (syncTimeDiff !== 0) {
      return syncTimeDiff;
    }

    return left.jobName.localeCompare(right.jobName, 'zh-CN');
  });
}

export function summarizeDataOpsStatuses<T extends { status: DataOpsStatus }>(
  items: T[]
): DataOpsStatusSummary {
  return items.reduce(
    (summary, item) => {
      summary.total += 1;
      summary[item.status] += 1;
      return summary;
    },
    {
      total: 0,
      healthy: 0,
      warning: 0,
      error: 0,
      paused: 0,
    }
  );
}
