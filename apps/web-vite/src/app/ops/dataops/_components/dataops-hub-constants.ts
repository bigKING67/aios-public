import type { DataOpsNotificationEvent, DataOpsPipeline } from '@/config/dataops-hub';
import type { DataOpsRuntimeStoreStatus } from '@/types/dataops';
import type { BatchOperationAction, TabKey } from './dataops-hub-types';

export const BATCH_HISTORY_QUERY_KEYS = {
  tab: 'dataops_tab',
  open: 'dataops_batch_history',
  action: 'dataops_bh_action',
  failure: 'dataops_bh_failure',
  range: 'dataops_bh_range',
  keyword: 'dataops_bh_keyword',
  notifyChannel: 'dataops_notify_channel',
  notifyEventType: 'dataops_notify_event_type',
  notifyStatus: 'dataops_notify_status',
  notifyFailureChannelFocus: 'dataops_notify_failure_channel',
  notifyFailureReason: 'dataops_notify_failure_reason',
  notifyReasonHash: 'dataops_notify_reason_hash',
  notifyRetryGroupId: 'dataops_notify_retry_group_id',
  notifyTraceGroup: 'dataops_notify_trace_group',
} as const;

export const TAB_ITEMS: Array<{ key: TabKey; label: string }> = [
  { key: 'orchestration', label: '任务编排' },
  { key: 'sync', label: '数据同步' },
  { key: 'notify', label: '告警通知' },
  { key: 'audit', label: '运行审计' },
];

export const LEVEL_TAG_COLOR: Record<DataOpsNotificationEvent['level'], string> = {
  info: 'blue',
  warning: 'gold',
  error: 'red',
};

export const STATUS_TAG_COLOR: Record<DataOpsNotificationEvent['status'], string> = {
  sent: 'green',
  failed: 'red',
  skipped: 'default',
};

export const BATCH_OPERATION_CONCURRENCY = 4;
export const MISSING_REASON_HASH_KEY = '__missing__';
export const NOTIFICATION_TRACE_SLO_SCAN_LOOKBACK_MIN_HOURS = 1;
export const NOTIFICATION_TRACE_SLO_SCAN_LOOKBACK_MAX_HOURS = 24 * 30;
export const NOTIFICATION_TRACE_SLO_SCAN_GROUP_MIN_COUNT = 1;
export const NOTIFICATION_TRACE_SLO_SCAN_GROUP_MAX_COUNT = 200;
export const NOTIFICATION_TRACE_SLO_SCAN_CONCURRENCY_MIN = 1;
export const NOTIFICATION_TRACE_SLO_SCAN_CONCURRENCY_MAX = 12;

export const STORE_MODE_TEXT: Record<DataOpsRuntimeStoreStatus['storageMode'], string> = {
  postgres: 'Postgres',
  file: '本地文件',
  memory: '进程内存',
};

export const LOCK_MODE_TEXT: Record<DataOpsRuntimeStoreStatus['lockMode'], string> = {
  postgres: 'Postgres 行锁表',
  memory: '进程内存锁',
};

export const DOMAIN_TAG_COLOR: Record<DataOpsPipeline['domain'], string> = {
  ADS: 'cyan',
  DWD: 'geekblue',
  DWS: 'blue',
  OPS: 'orange',
};

export const TAB_FILTER_VALUES = new Set<TabKey>(['orchestration', 'sync', 'notify', 'audit']);
export const BATCH_HISTORY_ACTION_FILTER_VALUES = new Set<BatchOperationAction | 'all'>([
  'all',
  'trigger_pipeline',
  'pause_deployment',
  'resume_deployment',
]);
export const BATCH_HISTORY_FAILURE_FILTER_VALUES = new Set(['all', 'has_failed']);
export const BATCH_HISTORY_TIME_RANGE_FILTER_VALUES = new Set(['all', '24h', '7d']);
export const NOTIFICATION_STATUS_FILTER_VALUES = new Set(['all', 'sent', 'failed', 'skipped']);
