import type { DataOpsNotificationEvent, DataOpsStatus } from '@/config/dataops-hub';
import type { DataOpsNotificationTraceSloRiskLevel } from '@/types/dataops';
import { normalizeToken } from './dataops-hub-text-utils';
import type {
  NotificationStatusFilter,
  NotificationTraceSloScanQuickFilter,
} from './dataops-hub-types';

interface NotificationChannelProfile {
  roleLabel: string;
  usageHint: string;
  priority: number;
}

const NOTIFICATION_STATUS_TEXT: Record<DataOpsNotificationEvent['status'], string> = {
  sent: '已发送',
  failed: '发送失败',
  skipped: '已跳过',
};

const NOTIFICATION_EVENT_TYPE_LABEL: Record<string, string> = {
  pipeline_succeeded: '任务执行成功',
  pipeline_failed: '任务执行失败',
  pipeline_skipped: '任务执行跳过',
  snapshot_mismatch: '快照不一致',
  channel_webhook_test: 'Webhook 连通性测试',
  channel_webhook_manual: 'Webhook 手动通知',
  trace_slo_breach: '通知链路SLO告警',
};

const NOTIFICATION_CHANNEL_PROFILES: Record<string, NotificationChannelProfile> = {
  feishu_default_bot: {
    roleLabel: '运维告警主通道',
    usageHint: 'Aios 运维值班告警、失败重发和巡检报告统一入口。',
    priority: 0,
  },
  feishu_dataops_backup: {
    roleLabel: '运营同步通道',
    usageHint: '运营团队同步通知与应急兜底广播。',
    priority: 1,
  },
};

const DEFAULT_NOTIFICATION_CHANNEL_PROFILE: NotificationChannelProfile = {
  roleLabel: '通知通道',
  usageHint: '自定义通知目标',
  priority: 99,
};

const STATUS_PRIORITY: Record<DataOpsStatus, number> = {
  error: 0,
  warning: 1,
  paused: 2,
  healthy: 3,
};

export function buildNotificationTraceGroupKey(event: DataOpsNotificationEvent): string {
  return [
    normalizeToken(event.channelId),
    normalizeToken(event.eventType),
    normalizeToken(event.targetTable),
    normalizeToken(event.flowName),
    normalizeToken(event.title),
  ].join('|');
}

export function getNotificationEventTypeLabel(eventType: string): string {
  return NOTIFICATION_EVENT_TYPE_LABEL[eventType] || eventType;
}

export function getNotificationEventTypeTagColor(eventType: string): string {
  if (eventType === 'channel_webhook_manual') {
    return 'processing';
  }
  if (eventType === 'channel_webhook_test') {
    return 'blue';
  }
  if (eventType === 'pipeline_failed') {
    return 'red';
  }
  if (eventType === 'pipeline_succeeded') {
    return 'green';
  }
  if (eventType === 'snapshot_mismatch') {
    return 'gold';
  }
  return 'default';
}

export function getNotificationStatusLabel(
  status: DataOpsNotificationEvent['status']
): string {
  return NOTIFICATION_STATUS_TEXT[status];
}

export function getNotificationStatusFilterLabel(value: NotificationStatusFilter): string {
  if (value === 'all') {
    return '全部状态';
  }
  return getNotificationStatusLabel(value);
}

export function getNotificationChannelRoleLabel(channelId: string): string {
  return getNotificationChannelProfile(channelId).roleLabel;
}

export function getNotificationChannelUsageHint(channelId: string): string {
  return getNotificationChannelProfile(channelId).usageHint;
}

export function getNotificationChannelPriority(channelId: string): number {
  return getNotificationChannelProfile(channelId).priority;
}

export function getStatusPriority(status: DataOpsStatus): number {
  return STATUS_PRIORITY[status] ?? 99;
}

export function getNotificationTraceSloScanQuickFilterLabel(
  value: NotificationTraceSloScanQuickFilter
): string {
  if (value === 'critical') {
    return '仅高风险';
  }
  if (value === 'breached') {
    return '仅已命中';
  }
  if (value === 'triggered') {
    return '仅已触发';
  }
  return '全部分组';
}

export function getNotificationTraceSloRiskLevelLabel(
  level: DataOpsNotificationTraceSloRiskLevel
): string {
  if (level === 'critical') {
    return '高风险';
  }
  if (level === 'warning') {
    return '中风险';
  }
  if (level === 'watch') {
    return '关注';
  }
  return '正常';
}

export function getNotificationTraceSloRiskLevelColor(
  level: DataOpsNotificationTraceSloRiskLevel
): string {
  if (level === 'critical') {
    return 'red';
  }
  if (level === 'warning') {
    return 'gold';
  }
  if (level === 'watch') {
    return 'processing';
  }
  return 'green';
}

function getNotificationChannelProfile(channelId: string): NotificationChannelProfile {
  return NOTIFICATION_CHANNEL_PROFILES[channelId] || DEFAULT_NOTIFICATION_CHANNEL_PROFILE;
}
