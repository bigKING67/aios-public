import type {
  BatchExecutionSummary,
  BatchFailureReasonSummaryItem,
  BatchHistoryFailureStats,
} from './dataops-batch-helpers';
import {
  formatDateTime,
  getBatchActionText,
} from './dataops-hub-formatters';

export function buildBatchHistoryFailureSummaryText(
  summaryItems: BatchFailureReasonSummaryItem[]
): string {
  return summaryItems
    .map(
      (item, index) =>
        `${index + 1}. [${item.count}] ${item.reason}\n   任务：${item.pipelineNames.join(' / ')}`
    )
    .join('\n');
}

export function buildBatchHistoryAlertTemplateText(options: {
  summaryItems: BatchFailureReasonSummaryItem[];
  summaryText: string;
  stats: BatchHistoryFailureStats;
  generatedAtText: string;
  actionFilterLabel: string;
  failureFilterLabel: string;
  timeRangeFilterLabel: string;
  keywordText: string;
}): string {
  if (!options.summaryItems.length) {
    return '';
  }

  const impactedPipelineIdsText = options.stats.impactedPipelineIds.length
    ? options.stats.impactedPipelineIds.join(', ')
    : '无';

  return [
    '[DataOps Hub] 批量执行失败告警',
    `时间：${options.generatedAtText}`,
    `筛选条件：动作=${options.actionFilterLabel}；结果=${options.failureFilterLabel}；时间=${options.timeRangeFilterLabel}；关键字=${options.keywordText}`,
    `范围统计：批次总数=${options.stats.totalBatchCount}；含失败批次=${options.stats.failedBatchCount}；失败任务数=${options.stats.failedTaskCount}`,
    `影响任务ID：${impactedPipelineIdsText}`,
    '失败原因 Top：',
    options.summaryText,
  ].join('\n');
}

export function buildBatchHistoryMarkdownText(options: {
  items: BatchExecutionSummary[];
  generatedAtText: string;
  actionFilterLabel: string;
  failureFilterLabel: string;
  timeRangeFilterLabel: string;
  keywordText: string;
  stats: BatchHistoryFailureStats;
  failureSummary: BatchFailureReasonSummaryItem[];
}): string {
  if (!options.items.length) {
    return '';
  }

  const impactedPipelineIdsText = options.stats.impactedPipelineIds.length
    ? options.stats.impactedPipelineIds.join(', ')
    : '无';
  const topReasonsText = options.failureSummary.length
    ? options.failureSummary
        .map((item, index) => `${index + 1}. [${item.count}] ${item.reason}`)
        .join('\n')
    : '无失败原因（当前筛选结果下无失败记录）';

  const maxDetailCount = 60;
  const batchDetailItems = options.items.slice(0, maxDetailCount);
  const batchDetailLines = batchDetailItems.map((item, index) => {
    const failedItems = item.items.filter((executionItem) => executionItem.status === 'failed');
    const failedPipelineIds = Array.from(
      new Set(failedItems.map((executionItem) => executionItem.pipelineId))
    );
    const failedReasons = Array.from(
      new Set(failedItems.map((executionItem) => executionItem.message.trim()).filter(Boolean))
    );

    return [
      `### ${index + 1}. ${item.label}`,
      `- 时间：${formatDateTime(item.executedAt)}`,
      `- 动作：${getBatchActionText(item.action)}`,
      `- 执行人：${item.operator || '-'}`,
      `- 结果：成功 ${item.successCount} / 失败 ${item.failedCount} / 跳过 ${item.skippedCount}`,
      `- 失败任务ID：${failedPipelineIds.length ? failedPipelineIds.join(', ') : '无'}`,
      `- 失败原因：${failedReasons.length ? failedReasons.join(' | ') : '无'}`,
    ].join('\n');
  });

  const truncatedHint =
    options.items.length > maxDetailCount
      ? `\n> 明细已截断：仅展示前 ${maxDetailCount} 条，当前筛选总数 ${options.items.length} 条。`
      : '';

  return [
    '# DataOps 批量历史筛选报告',
    `生成时间：${options.generatedAtText}`,
    '',
    '## 筛选条件',
    `- 动作：${options.actionFilterLabel}`,
    `- 结果：${options.failureFilterLabel}`,
    `- 时间范围：${options.timeRangeFilterLabel}`,
    `- 关键字：${options.keywordText}`,
    '',
    '## 范围统计',
    `- 匹配批次：${options.stats.totalBatchCount}`,
    `- 含失败批次：${options.stats.failedBatchCount}`,
    `- 失败任务数：${options.stats.failedTaskCount}`,
    `- 影响任务ID：${impactedPipelineIdsText}`,
    '',
    '## 失败原因 Top',
    topReasonsText,
    '',
    '## 批次明细',
    ...batchDetailLines,
    truncatedHint,
  ].join('\n');
}
