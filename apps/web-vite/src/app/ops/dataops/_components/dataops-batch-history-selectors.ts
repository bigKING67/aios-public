import type {
  BatchHistoryFailureFilter,
  BatchHistoryTimeRangeFilter,
  BatchOperationAction,
} from './dataops-hub-formatters';
import {
  getBatchHistoryActionFilterLabel,
  getBatchHistoryFailureFilterLabel,
  getBatchHistoryTimeRangeFilterLabel,
} from './dataops-hub-formatters';
import {
  buildBatchHistoryFailureStats,
  buildBatchHistoryFailureSummary,
  buildBatchHistoryRetryGroups,
  filterBatchHistoryItems,
  resolveBatchHistoryFailedPipelineIds,
  type BatchExecutionSummary,
  type BatchFailureReasonSummaryItem,
  type BatchHistoryFailureStats,
  type BatchHistoryRetryGroup,
} from './dataops-batch-helpers';
import {
  buildBatchHistoryAlertTemplateText,
  buildBatchHistoryFailureSummaryText,
  buildBatchHistoryMarkdownText,
} from './dataops-report-helpers';

export interface DataOpsBatchHistoryFilterLabels {
  actionFilterLabel: string;
  failureFilterLabel: string;
  timeRangeFilterLabel: string;
  keywordText: string;
}

export interface DataOpsBatchHistoryDerivedState {
  items: BatchExecutionSummary[];
  failureSummary: BatchFailureReasonSummaryItem[];
  failureSummaryText: string;
  failureStats: BatchHistoryFailureStats;
  alertTemplateText: string;
  markdownText: string;
  failedPipelineIds: string[];
  retryableFailedPipelineIds: string[];
  retryGroups: BatchHistoryRetryGroup[];
  retryableGroups: BatchHistoryRetryGroup[];
}

export function buildDataOpsBatchHistoryFilterLabels({
  actionFilter,
  failureFilter,
  timeRangeFilter,
  keyword,
}: {
  actionFilter: BatchOperationAction | 'all';
  failureFilter: BatchHistoryFailureFilter;
  timeRangeFilter: BatchHistoryTimeRangeFilter;
  keyword: string;
}): DataOpsBatchHistoryFilterLabels {
  return {
    actionFilterLabel: getBatchHistoryActionFilterLabel(actionFilter),
    failureFilterLabel: getBatchHistoryFailureFilterLabel(failureFilter),
    timeRangeFilterLabel: getBatchHistoryTimeRangeFilterLabel(timeRangeFilter),
    keywordText: keyword.trim() || '无',
  };
}

export function buildDataOpsBatchHistoryDerivedState({
  batchHistoryItems,
  actionFilter,
  failureFilter,
  timeRangeFilter,
  keyword,
  labels,
  generatedAtText,
}: {
  batchHistoryItems: BatchExecutionSummary[];
  actionFilter: BatchOperationAction | 'all';
  failureFilter: BatchHistoryFailureFilter;
  timeRangeFilter: BatchHistoryTimeRangeFilter;
  keyword: string;
  labels: DataOpsBatchHistoryFilterLabels;
  generatedAtText: string;
}): DataOpsBatchHistoryDerivedState {
  const items = filterBatchHistoryItems(batchHistoryItems, {
    actionFilter,
    failureFilter,
    timeRangeFilter,
    keyword,
  });
  const failureSummary = buildBatchHistoryFailureSummary(items);
  const failureSummaryText = buildBatchHistoryFailureSummaryText(failureSummary);
  const failureStats = buildBatchHistoryFailureStats(items);

  return {
    items,
    failureSummary,
    failureSummaryText,
    failureStats,
    alertTemplateText: buildBatchHistoryAlertTemplateText({
      summaryItems: failureSummary,
      summaryText: failureSummaryText,
      stats: failureStats,
      generatedAtText,
      actionFilterLabel: labels.actionFilterLabel,
      failureFilterLabel: labels.failureFilterLabel,
      timeRangeFilterLabel: labels.timeRangeFilterLabel,
      keywordText: labels.keywordText,
    }),
    markdownText: buildBatchHistoryMarkdownText({
      items,
      generatedAtText,
      actionFilterLabel: labels.actionFilterLabel,
      failureFilterLabel: labels.failureFilterLabel,
      timeRangeFilterLabel: labels.timeRangeFilterLabel,
      keywordText: labels.keywordText,
      stats: failureStats,
      failureSummary,
    }),
    failedPipelineIds: resolveBatchHistoryFailedPipelineIds(items, {
      retryableOnly: false,
    }),
    retryableFailedPipelineIds: resolveBatchHistoryFailedPipelineIds(items, {
      retryableOnly: true,
    }),
    retryGroups: buildBatchHistoryRetryGroups(items, {
      retryableOnly: false,
    }),
    retryableGroups: buildBatchHistoryRetryGroups(items, {
      retryableOnly: true,
    }),
  };
}
