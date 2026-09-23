import type {
  AuditResultFilter,
  AuditTimeRangeFilter,
  BatchHistoryFailureFilter,
  BatchHistoryTimeRangeFilter,
  BatchOperationAction,
} from './dataops-hub-types';

export function getAuditResultFilterLabel(value: AuditResultFilter): string {
  if (value === 'all') {
    return '全部结果';
  }
  return value;
}

export function getAuditTimeRangeFilterLabel(value: AuditTimeRangeFilter): string {
  if (value === '24h') {
    return '近 24 小时';
  }
  if (value === '7d') {
    return '近 7 天';
  }
  return '全部时间';
}

export function getBatchActionText(action: BatchOperationAction): string {
  if (action === 'trigger_pipeline') {
    return '触发';
  }
  if (action === 'pause_deployment') {
    return '暂停';
  }
  return '恢复';
}

export function getBatchHistoryActionFilterLabel(value: BatchOperationAction | 'all'): string {
  if (value === 'all') {
    return '全部动作';
  }

  return getBatchActionText(value);
}

export function getBatchHistoryFailureFilterLabel(value: BatchHistoryFailureFilter): string {
  if (value === 'has_failed') {
    return '仅含失败';
  }

  return '全部结果';
}

export function getBatchHistoryTimeRangeFilterLabel(value: BatchHistoryTimeRangeFilter): string {
  if (value === '24h') {
    return '近 24 小时';
  }

  if (value === '7d') {
    return '近 7 天';
  }

  return '全部时间';
}
