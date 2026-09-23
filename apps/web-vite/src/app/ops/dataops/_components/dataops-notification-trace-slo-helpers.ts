import type {
  DataOpsNotificationTraceSloScanItem,
  DataOpsNotificationTraceSloScanResponse,
} from '@/types/dataops';
import {
  getDataOpsNotificationTraceSloRiskScore,
  resolveDataOpsNotificationTraceSloRiskLevel,
} from '@/lib/dataops-notification-trace-slo-risk';
import {
  NOTIFICATION_TRACE_SLO_SCAN_CONCURRENCY_MAX,
  NOTIFICATION_TRACE_SLO_SCAN_CONCURRENCY_MIN,
  NOTIFICATION_TRACE_SLO_SCAN_GROUP_MAX_COUNT,
  NOTIFICATION_TRACE_SLO_SCAN_GROUP_MIN_COUNT,
  NOTIFICATION_TRACE_SLO_SCAN_LOOKBACK_MAX_HOURS,
  NOTIFICATION_TRACE_SLO_SCAN_LOOKBACK_MIN_HOURS,
  toTimestamp,
  truncateText,
  type NotificationTraceSloScanQuickFilter,
  type NotificationTraceSloScanRankedItem,
} from './dataops-hub-formatters';
import {
  DATAOPS_ALERT_MESSAGE_MAX_LENGTH,
  prepareDataOpsAlertMessage,
} from './dataops-alert-helpers';
import { clampIntegerValue } from './dataops-trigger-helpers';
import type {
  NotificationAlertDraft,
  NotificationTraceSloScanAlertDraft,
  NotificationTraceSloScanInputValues,
  NotificationTraceSloScanRequestOptions,
  NotificationTraceSloScanRiskSummary,
} from './dataops-notification-retry-types';

export function buildNotificationTraceSloScanRankedItems(
  items: DataOpsNotificationTraceSloScanItem[]
): NotificationTraceSloScanRankedItem[] {
  if (!items.length) {
    return [];
  }

  return items
    .map((item) => {
      const riskScore = Number.isFinite(item.riskScore)
        ? item.riskScore
        : getDataOpsNotificationTraceSloRiskScore(item);
      const riskLevel =
        item.riskLevel || resolveDataOpsNotificationTraceSloRiskLevel(item, riskScore);
      return {
        ...item,
        riskScore,
        riskLevel,
        rank: 0,
      };
    })
    .sort((left, right) => {
      if (right.riskScore !== left.riskScore) {
        return right.riskScore - left.riskScore;
      }
      const timeDiff = toTimestamp(right.latestEventAt) - toTimestamp(left.latestEventAt);
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return left.retryGroupId.localeCompare(right.retryGroupId, 'zh-CN');
    })
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
}

export function filterNotificationTraceSloScanItems(
  items: NotificationTraceSloScanRankedItem[],
  quickFilter: NotificationTraceSloScanQuickFilter
): NotificationTraceSloScanRankedItem[] {
  if (quickFilter === 'critical') {
    return items.filter((item) => item.riskLevel === 'critical');
  }
  if (quickFilter === 'breached') {
    return items.filter((item) => item.breached);
  }
  if (quickFilter === 'triggered') {
    return items.filter((item) => item.triggeredCount > 0);
  }
  return items;
}

export function buildNotificationTraceSloScanRiskSummary(
  items: NotificationTraceSloScanRankedItem[]
): NotificationTraceSloScanRiskSummary {
  const summary: NotificationTraceSloScanRiskSummary = {
    critical: 0,
    warning: 0,
    watch: 0,
    normal: 0,
  };

  for (const item of items) {
    summary[item.riskLevel] += 1;
  }

  return summary;
}

export function normalizeNotificationTraceSloScanRequestOptions(
  values: NotificationTraceSloScanInputValues
): NotificationTraceSloScanRequestOptions {
  return {
    lookbackHours: clampIntegerValue(values.lookbackHours, 24, {
      min: NOTIFICATION_TRACE_SLO_SCAN_LOOKBACK_MIN_HOURS,
      max: NOTIFICATION_TRACE_SLO_SCAN_LOOKBACK_MAX_HOURS,
    }),
    maxGroups: clampIntegerValue(values.maxGroups, 30, {
      min: NOTIFICATION_TRACE_SLO_SCAN_GROUP_MIN_COUNT,
      max: NOTIFICATION_TRACE_SLO_SCAN_GROUP_MAX_COUNT,
    }),
    scanConcurrency: clampIntegerValue(values.scanConcurrency, 4, {
      min: NOTIFICATION_TRACE_SLO_SCAN_CONCURRENCY_MIN,
      max: NOTIFICATION_TRACE_SLO_SCAN_CONCURRENCY_MAX,
    }),
  };
}

export function buildNotificationTraceSloScanSuccessMessage(
  result: DataOpsNotificationTraceSloScanResponse
): string {
  const modeText = result.dryRun ? '模拟巡检' : '执行巡检';
  return `${modeText}完成：处理 ${result.processedGroups} 组，命中 ${result.breachedGroups} 组，触发 ${result.triggeredGroups} 组，耗时 ${result.durationMs}ms。`;
}

export function buildNotificationTraceSloScanWarningMessage(
  result: DataOpsNotificationTraceSloScanResponse
): string {
  if (!result.warnings.length) {
    return '';
  }
  return `巡检告警：${truncateText(result.warnings[0], 120)}`;
}

function buildNotificationAlertDraft(options: {
  templateText: string;
  targetChannelId: string;
  messageTitle: string;
  truncatedSubject: string;
}): NotificationAlertDraft | null {
  const trimmedTemplateText = options.templateText.trim();
  if (!trimmedTemplateText || !options.targetChannelId) {
    return null;
  }

  const { messageText, wasTruncated } = prepareDataOpsAlertMessage(trimmedTemplateText);

  return {
    formValues: {
      channelId: options.targetChannelId,
      messageTitle: options.messageTitle,
      messageText,
    },
    wasTruncated,
    truncatedWarningText: wasTruncated
      ? `${options.truncatedSubject}超过 ${DATAOPS_ALERT_MESSAGE_MAX_LENGTH} 字符，已自动截断。发送前可在弹窗中继续编辑。`
      : '',
  };
}

export function buildNotificationMarkdownAlertDraft(options: {
  markdownText: string;
  targetChannelId: string;
}): NotificationAlertDraft | null {
  return buildNotificationAlertDraft({
    templateText: options.markdownText,
    targetChannelId: options.targetChannelId,
    messageTitle: '[DataOps Hub] 通知筛选报告',
    truncatedSubject: '报告长度',
  });
}

export function buildNotificationFailureSummaryAlertDraft(options: {
  templateText: string;
  targetChannelId: string;
}): NotificationAlertDraft | null {
  return buildNotificationAlertDraft({
    templateText: options.templateText,
    targetChannelId: options.targetChannelId,
    messageTitle: '[DataOps Hub] 通知失败告警',
    truncatedSubject: '告警模板',
  });
}

export function buildNotificationTraceSloScanAlertDraft(options: {
  templateText: string;
  targetChannelId: string;
}): NotificationTraceSloScanAlertDraft | null {
  return buildNotificationAlertDraft({
    ...options,
    messageTitle: '[DataOps Hub] 通知链路SLO巡检摘要',
    truncatedSubject: '巡检摘要',
  });
}
