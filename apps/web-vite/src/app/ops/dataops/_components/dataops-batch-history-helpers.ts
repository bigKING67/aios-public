import type {
  BatchHistoryFailureFilter,
  BatchHistoryTimeRangeFilter,
  BatchOperationAction,
} from './dataops-hub-formatters';
import {
  getBatchActionText,
  matchesKeyword,
  normalizeText,
  toTimestamp,
} from './dataops-hub-formatters';
import { resolveFailedPipelineIdsFromSummary } from './dataops-batch-result-helpers';
import type {
  BatchExecutionSummary,
  BatchFailureReasonSummaryItem,
  BatchHistoryFailureStats,
  BatchHistoryRetryGroup,
  BatchHistoryRetryPlan,
} from './dataops-batch-types';

export const BATCH_HISTORY_CSV_HEADERS = [
  'executed_at',
  'action',
  'label',
  'operator',
  'total_count',
  'success_count',
  'failed_count',
  'skipped_count',
  'failed_pipeline_ids',
  'failed_reasons',
];

export function filterBatchHistoryItems(
  batchHistoryItems: BatchExecutionSummary[],
  filters: {
    actionFilter: BatchOperationAction | 'all';
    failureFilter: BatchHistoryFailureFilter;
    timeRangeFilter: BatchHistoryTimeRangeFilter;
    keyword: string;
    nowMs?: number;
  }
): BatchExecutionSummary[] {
  const normalizedHistoryKeyword = normalizeText(filters.keyword);
  const now = filters.nowMs ?? Date.now();
  const timeRangeThresholdMs =
    filters.timeRangeFilter === '24h'
      ? 24 * 60 * 60 * 1000
      : filters.timeRangeFilter === '7d'
        ? 7 * 24 * 60 * 60 * 1000
        : 0;

  return batchHistoryItems.filter((item) => {
    if (filters.actionFilter !== 'all' && item.action !== filters.actionFilter) {
      return false;
    }
    if (filters.failureFilter === 'has_failed' && item.failedCount <= 0) {
      return false;
    }
    if (timeRangeThresholdMs > 0) {
      const executedAtTs = toTimestamp(item.executedAt);
      if (!executedAtTs || now - executedAtTs > timeRangeThresholdMs) {
        return false;
      }
    }

    if (normalizedHistoryKeyword) {
      const executionDetails = item.items
        .map(
          (executionItem) =>
            `${executionItem.pipelineId} ${executionItem.pipelineName} ${executionItem.message}`
        )
        .join(' ');
      const targetText = [
        item.label,
        item.operator || '',
        getBatchActionText(item.action),
        executionDetails,
      ].join(' ');
      return matchesKeyword(normalizedHistoryKeyword, targetText);
    }

    return true;
  });
}

export function buildBatchHistoryFailureSummary(
  batchHistoryItems: BatchExecutionSummary[],
  options: { limit?: number } = {}
): BatchFailureReasonSummaryItem[] {
  const reasonMap = new Map<string, { count: number; pipelineNames: Set<string> }>();

  for (const historyRecord of batchHistoryItems) {
    for (const item of historyRecord.items) {
      if (item.status !== 'failed') {
        continue;
      }

      const reason = item.message.trim() || '未知失败原因';
      const current = reasonMap.get(reason);
      if (!current) {
        reasonMap.set(reason, {
          count: 1,
          pipelineNames: new Set([item.pipelineName]),
        });
        continue;
      }

      current.count += 1;
      current.pipelineNames.add(item.pipelineName);
    }
  }

  return Array.from(reasonMap.entries())
    .map(([reason, stats]) => ({
      reason,
      count: stats.count,
      pipelineNames: Array.from(stats.pipelineNames),
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, options.limit ?? 8);
}

export function buildBatchHistoryFailureStats(
  batchHistoryItems: BatchExecutionSummary[]
): BatchHistoryFailureStats {
  const failedBatchCount = batchHistoryItems.filter((item) => item.failedCount > 0).length;
  const failedTaskCount = batchHistoryItems.reduce((sum, item) => sum + item.failedCount, 0);

  return {
    totalBatchCount: batchHistoryItems.length,
    failedBatchCount,
    failedTaskCount,
    impactedPipelineIds: resolveBatchHistoryFailedPipelineIds(batchHistoryItems, {
      retryableOnly: false,
    }),
  };
}

export function resolveBatchHistoryFailedPipelineIds(
  batchHistoryItems: BatchExecutionSummary[],
  options: { retryableOnly: boolean }
): string[] {
  return Array.from(
    new Set(
      batchHistoryItems.flatMap((item) =>
        item.items
          .filter(
            (executionItem) =>
              executionItem.status === 'failed' && (!options.retryableOnly || executionItem.retryable)
          )
          .map((executionItem) => executionItem.pipelineId)
      )
    )
  );
}

function serializeBatchParameters(
  parameters?: Record<string, string | number | boolean>
): string {
  if (!parameters) {
    return '{}';
  }

  const normalizedEntries = Object.entries(parameters).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return JSON.stringify(normalizedEntries);
}

export function buildBatchHistoryRetryGroups(
  batchHistoryItems: BatchExecutionSummary[],
  options: { retryableOnly: boolean }
): BatchHistoryRetryGroup[] {
  const groupMap = new Map<
    string,
    Omit<BatchHistoryRetryGroup, 'pipelineIds'> & { pipelineIdSet: Set<string> }
  >();

  for (const batchItem of batchHistoryItems) {
    const failedPipelineIds = resolveFailedPipelineIdsFromSummary(batchItem, options);
    if (!failedPipelineIds.length) {
      continue;
    }

    const groupKey = `${batchItem.action}:${serializeBatchParameters(batchItem.parameters)}`;
    const existedGroup = groupMap.get(groupKey);
    if (!existedGroup) {
      groupMap.set(groupKey, {
        action: batchItem.action,
        parameters: batchItem.parameters,
        sourceBatchCount: 1,
        latestExecutedAtTs: toTimestamp(batchItem.executedAt),
        pipelineIdSet: new Set(failedPipelineIds),
      });
      continue;
    }

    existedGroup.sourceBatchCount += 1;
    existedGroup.latestExecutedAtTs = Math.max(
      existedGroup.latestExecutedAtTs,
      toTimestamp(batchItem.executedAt)
    );
    for (const pipelineId of failedPipelineIds) {
      existedGroup.pipelineIdSet.add(pipelineId);
    }
  }

  return Array.from(groupMap.values())
    .map((item) => ({
      action: item.action,
      parameters: item.parameters,
      pipelineIds: Array.from(item.pipelineIdSet),
      sourceBatchCount: item.sourceBatchCount,
      latestExecutedAtTs: item.latestExecutedAtTs,
    }))
    .sort((left, right) => {
      if (right.latestExecutedAtTs !== left.latestExecutedAtTs) {
        return right.latestExecutedAtTs - left.latestExecutedAtTs;
      }
      return left.action.localeCompare(right.action);
    });
}

export function buildBatchHistoryRetryPlan(
  groups: BatchHistoryRetryGroup[],
  options: { retryableOnly: boolean }
): BatchHistoryRetryPlan {
  const retryLabel = options.retryableOnly ? '按筛选重试可重试失败' : '按筛选重试失败';
  const targetPipelineCount = Array.from(
    new Set(groups.flatMap((group) => group.pipelineIds))
  ).length;

  return {
    retryLabel,
    targetPipelineCount,
    operations: groups.map((group, index) => {
      const actionText = getBatchActionText(group.action);
      const groupNumber = index + 1;

      return {
        action: group.action,
        label: `${retryLabel}-${actionText}(${groupNumber}/${groups.length})`,
        pipelineIds: group.pipelineIds,
        parameters: group.parameters,
        requestKeySuffix: options.retryableOnly
          ? `history-filter-retryable-${groupNumber}`
          : `history-filter-retry-${groupNumber}`,
      };
    }),
  };
}

export function buildBatchHistoryRetryCompletionText(options: {
  retryLabel: string;
  successGroupCount: number;
  totalGroupCount: number;
}): string {
  if (options.successGroupCount === options.totalGroupCount) {
    return `${options.retryLabel}完成：${options.successGroupCount} / ${options.totalGroupCount} 组成功。`;
  }

  return `${options.retryLabel}完成：成功 ${options.successGroupCount} / ${options.totalGroupCount} 组，请查看批量结果与审计日志。`;
}

export function buildBatchHistoryCsvRows(
  batchHistoryItems: BatchExecutionSummary[]
): (string | number | boolean)[][] {
  return batchHistoryItems.map((item) => {
    const failedItems = item.items.filter((executionItem) => executionItem.status === 'failed');
    const failedPipelineIds = Array.from(
      new Set(failedItems.map((executionItem) => executionItem.pipelineId))
    ).join('|');
    const failedReasons = Array.from(
      new Set(failedItems.map((executionItem) => executionItem.message.trim()).filter(Boolean))
    ).join(' | ');

    return [
      item.executedAt,
      item.action,
      item.label,
      item.operator || '',
      item.totalCount,
      item.successCount,
      item.failedCount,
      item.skippedCount,
      failedPipelineIds,
      failedReasons,
    ];
  });
}
