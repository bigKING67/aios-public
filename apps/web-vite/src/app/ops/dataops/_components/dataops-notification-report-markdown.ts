import type { DataOpsNotificationEvent } from '@/config/dataops-hub';
import type {
  DataOpsNotificationTraceReasonHashRecoveryItem,
  DataOpsNotificationTraceSloRiskLevel,
  DataOpsNotificationTraceSloScanResponse,
  DataOpsNotificationTraceSummary,
} from '@/types/dataops';

import {
  formatDateTime,
  getNotificationEventTypeLabel,
  getNotificationStatusLabel,
  getNotificationTraceSloRiskLevelLabel,
  truncateText,
  type NotificationTraceSloScanRankedItem,
} from './dataops-hub-formatters';
import type {
  NotificationFailureReasonSummaryItem,
  NotificationFailureStats,
} from './dataops-notification-retry-helpers';
import {
  formatReasonHashLabel,
  resolveChannelName,
  type ChannelNameMap,
} from './dataops-report-channel-labels';

export function buildRetryGroupTraceMarkdownText(options: {
  events: DataOpsNotificationEvent[];
  summary: DataOpsNotificationTraceSummary | null;
  reasonHashRecovery: DataOpsNotificationTraceReasonHashRecoveryItem[];
  retryGroupId: string;
  channelMap: ChannelNameMap;
  generatedAtText: string;
}): string {
  if (!options.events.length) {
    return '';
  }

  const summaryText = options.summary
    ? `总计=${options.summary.totalCount}；成功=${options.summary.sentCount}；失败=${options.summary.failedCount}；跳过=${options.summary.skippedCount}；可重发失败=${options.summary.retryableFailedCount}`
    : '无';
  const rangeText = options.summary
    ? `${formatDateTime(options.summary.earliestAt)} -> ${formatDateTime(options.summary.latestAt)}`
    : '-';
  const channelsText = options.summary?.channelNames.length
    ? options.summary.channelNames.join(' / ')
    : '无';
  const reasonHashRecoveryText = options.reasonHashRecovery.length
    ? options.reasonHashRecovery
        .slice(0, 10)
        .map((item, index) => {
          const reasonLabel = formatReasonHashLabel(item);
          return `${index + 1}. ${reasonLabel}：首次失败=${item.firstFailedCount}；后续成功=${item.recoveredCount}；仍失败=${item.unresolvedCount}；恢复率=${item.recoveryRate}%`;
        })
        .join('\n')
    : '无';

  const detailLines = options.events.map((item, index) => {
    const channelName = resolveChannelName(options.channelMap, item.channelId);
    return [
      `### ${index + 1}. ${item.title}`,
      `- 时间：${formatDateTime(item.sentAt)}`,
      `- 通道：${channelName}`,
      `- 状态：${getNotificationStatusLabel(item.status)}`,
      `- 类型：${getNotificationEventTypeLabel(item.eventType)}`,
      `- reasonHash：${item.reasonHash || '-'}`,
      `- retryGroupId：${item.retryGroupId || '-'}`,
      `- 明细：${truncateText(item.detail, 200)}`,
    ].join('\n');
  });

  return [
    '# DataOps 通知重发链路报告',
    `生成时间：${options.generatedAtText}`,
    `retryGroupId：${options.retryGroupId}`,
    `时间范围：${rangeText}`,
    `通道：${channelsText}`,
    `统计：${summaryText}`,
    '',
    '## reasonHash恢复率',
    reasonHashRecoveryText,
    '',
    '## 明细',
    ...detailLines,
  ].join('\n');
}

export function buildNotificationFailureSummaryText(
  summaryItems: NotificationFailureReasonSummaryItem[]
): string {
  return summaryItems
    .map(
      (item, index) =>
        `${index + 1}. [${item.count}] ${item.reason}\n   可重发：${item.retryableCount}\n   事件ID：${item.eventIds.join(', ')}\n   标题：${item.titles.join(' / ')}`
    )
    .join('\n');
}

export function buildNotificationFailureAlertTemplateText(options: {
  summaryItems: NotificationFailureReasonSummaryItem[];
  summaryText: string;
  stats: NotificationFailureStats;
  generatedAtText: string;
  channelLabel: string;
  eventTypeLabel: string;
  statusLabel: string;
  focusedFailureChannelLabel: string;
  selectedReasonLabel: string;
  reasonHashLabel: string;
  retryGroupIdLabel: string;
  keywordText: string;
  channelMap: ChannelNameMap;
}): string {
  if (!options.summaryItems.length) {
    return '';
  }

  const impactedChannelText = options.stats.impactedChannelIds.length
    ? options.stats.impactedChannelIds
        .map((channelId) => resolveChannelName(options.channelMap, channelId))
        .join(' / ')
    : '无';
  const impactedEventText = options.stats.impactedEventIds.length
    ? options.stats.impactedEventIds.join(', ')
    : '无';

  return [
    '[DataOps Hub] 通知失败告警',
    `时间：${options.generatedAtText}`,
    `筛选条件：通道=${options.channelLabel}；事件类型=${options.eventTypeLabel}；状态=${options.statusLabel}；失败通道聚焦=${options.focusedFailureChannelLabel}；失败原因=${options.selectedReasonLabel}；reasonHash=${options.reasonHashLabel}；retryGroupId=${options.retryGroupIdLabel}；关键字=${options.keywordText}`,
    `范围统计：匹配记录=${options.stats.totalCount}；失败记录=${options.stats.failedCount}；可重发失败=${options.stats.retryableFailedCount}`,
    `影响通道：${impactedChannelText}`,
    `失败事件ID：${impactedEventText}`,
    '失败原因 Top：',
    options.summaryText,
  ].join('\n');
}

export function buildNotificationMarkdownText(options: {
  events: DataOpsNotificationEvent[];
  generatedAtText: string;
  channelLabel: string;
  eventTypeLabel: string;
  statusLabel: string;
  reasonHashLabel: string;
  retryGroupIdLabel: string;
  keywordText: string;
  channelMap: ChannelNameMap;
}): string {
  if (!options.events.length) {
    return '';
  }

  const sentCount = options.events.filter((item) => item.status === 'sent').length;
  const failedCount = options.events.filter((item) => item.status === 'failed').length;
  const skippedCount = options.events.filter((item) => item.status === 'skipped').length;

  const maxDetailCount = 80;
  const notifyDetails = options.events.slice(0, maxDetailCount).map((item, index) => {
    const channelName = resolveChannelName(options.channelMap, item.channelId);
    return [
      `### ${index + 1}. ${item.title}`,
      `- 事件ID：${item.id}`,
      `- 时间：${formatDateTime(item.sentAt)}`,
      `- 通道：${channelName}`,
      `- 类型：${getNotificationEventTypeLabel(item.eventType)}`,
      `- 状态：${getNotificationStatusLabel(item.status)}`,
      `- 级别：${item.level}`,
      `- reasonHash：${item.reasonHash || '-'}`,
      `- retryGroupId：${item.retryGroupId || '-'}`,
      `- 目标表：${item.targetTable}`,
      `- Flow：${item.flowName}`,
      `- 明细：${truncateText(item.detail, 200)}`,
    ].join('\n');
  });
  const truncatedHint =
    options.events.length > maxDetailCount
      ? `\n> 明细已截断：仅展示前 ${maxDetailCount} 条，当前筛选总数 ${options.events.length} 条。`
      : '';

  return [
    '# DataOps 通知筛选报告',
    `生成时间：${options.generatedAtText}`,
    '',
    '## 筛选条件',
    `- 通道：${options.channelLabel}`,
    `- 事件类型：${options.eventTypeLabel}`,
    `- 发送状态：${options.statusLabel}`,
    `- reasonHash：${options.reasonHashLabel}`,
    `- retryGroupId：${options.retryGroupIdLabel}`,
    `- 关键字：${options.keywordText}`,
    '',
    '## 范围统计',
    `- 匹配记录：${options.events.length}`,
    `- 已发送：${sentCount}`,
    `- 发送失败：${failedCount}`,
    `- 已跳过：${skippedCount}`,
    '',
    '## 明细',
    ...notifyDetails,
    truncatedHint,
  ].join('\n');
}

export function buildNotificationTraceSloScanMarkdownText(options: {
  result: DataOpsNotificationTraceSloScanResponse | null;
  rankedItems: NotificationTraceSloScanRankedItem[];
  riskSummary: Record<DataOpsNotificationTraceSloRiskLevel, number>;
  generatedAtText: string;
}): string {
  if (!options.result) {
    return '';
  }

  const warningsText = options.result.warnings.length
    ? options.result.warnings
        .slice(0, 10)
        .map((warning, index) => `${index + 1}. ${warning}`)
        .join('\n')
    : '无';
  const detailText = options.rankedItems.length
    ? options.rankedItems
        .slice(0, 20)
        .map((item) => {
          const riskLabel = getNotificationTraceSloRiskLevelLabel(item.riskLevel);
          const warningText = item.warning ? truncateText(item.warning, 160) : '-';
          return `${item.rank}. [${riskLabel}] retryGroupId=${item.retryGroupId}；风险分=${item.riskScore}；事件数=${item.eventCount}；SLO命中=${item.breached ? '是' : '否'}；触发=${item.triggeredCount}；冷却=${item.cooldownCount}；来源=${item.eventSource}；最新=${formatDateTime(item.latestEventAt)}；告警=${warningText}`;
        })
        .join('\n')
    : '无';

  return [
    '# DataOps 通知链路 SLO 巡检值班摘要',
    `生成时间：${options.generatedAtText}`,
    `执行时间：${options.result.executedAt}`,
    `模式：${options.result.dryRun ? 'dry-run' : 'execute'}`,
    `参数：lookbackHours=${options.result.lookbackHours}；maxGroups=${options.result.maxGroups}；scanConcurrency=${options.result.scanConcurrency}`,
    `结果：处理=${options.result.processedGroups}；命中=${options.result.breachedGroups}；触发=${options.result.triggeredGroups}；耗时=${options.result.durationMs}ms；来源=${options.result.groupSource}`,
    `风险分布：高风险=${options.riskSummary.critical}；中风险=${options.riskSummary.warning}；关注=${options.riskSummary.watch}；正常=${options.riskSummary.normal}`,
    '',
    '## warnings',
    warningsText,
    '',
    '## 风险排行 Top 20',
    detailText,
  ].join('\n');
}
