import type { DataOpsStatus } from '@/config/dataops-hub';
import type { DataOpsRuntimeStoreStatus } from '@/types/dataops';
import { LOCK_MODE_TEXT, STORE_MODE_TEXT } from './dataops-hub-formatters';

export interface DataOpsRuntimeStoreDerivedState {
  runtimeStorageModeLabel: string;
  runtimeLockModeLabel: string;
  runtimeStoreDatabase: string;
  runtimeStoreSchema: string;
  postgresConnected: boolean;
  postgresEnabled: boolean;
  schemaReady: boolean;
  auditTableReady: boolean;
  notificationTableReady: boolean;
  triggerLocksTableReady: boolean;
  batchExecutionTableReady: boolean;
  retentionDays: number;
  cleanupStateReady: boolean;
  runtimeLastCleanupAt: string;
  runtimeLastAuditDeleted: number;
  runtimeLastNotificationDeleted: number;
  runtimeLastBatchExecutionDeleted: number;
  runtimeMaxAuditEvents: number;
  runtimeMaxNotificationEvents: number;
  runtimeMaxBatchExecutionEvents: number;
}

export interface DataOpsRuntimeNoticeState {
  systemNoticeCount: number;
}

export interface DataOpsPipelineFilterLabels {
  statusFilterLabel: string;
  keywordFilterText: string;
  hasPipelineFilter: boolean;
}

export function buildDataOpsRuntimeStoreDerivedState(
  runtimeStore: DataOpsRuntimeStoreStatus | undefined
): DataOpsRuntimeStoreDerivedState {
  return {
    runtimeStorageModeLabel: runtimeStore ? STORE_MODE_TEXT[runtimeStore.storageMode] : '未知',
    runtimeLockModeLabel: runtimeStore ? LOCK_MODE_TEXT[runtimeStore.lockMode] : '未知',
    runtimeStoreDatabase: runtimeStore?.postgres.database || '-',
    runtimeStoreSchema: runtimeStore?.postgres.schema || 'dataops',
    postgresConnected: Boolean(runtimeStore?.postgres.connected),
    postgresEnabled: Boolean(runtimeStore?.postgres.enabled),
    schemaReady: Boolean(runtimeStore?.postgres.schemaExists),
    auditTableReady: Boolean(runtimeStore?.postgres.auditTableExists),
    notificationTableReady: Boolean(runtimeStore?.postgres.notificationTableExists),
    triggerLocksTableReady: Boolean(runtimeStore?.postgres.triggerLocksTableExists),
    batchExecutionTableReady: Boolean(runtimeStore?.postgres.batchExecutionTableExists),
    retentionDays: runtimeStore?.retention.retainDays ?? 90,
    cleanupStateReady: Boolean(runtimeStore?.retention.cleanupStateAvailable),
    runtimeLastCleanupAt: runtimeStore?.retention.lastCleanupAt || '未执行',
    runtimeLastAuditDeleted: runtimeStore?.retention.lastAuditDeleted ?? 0,
    runtimeLastNotificationDeleted: runtimeStore?.retention.lastNotificationDeleted ?? 0,
    runtimeLastBatchExecutionDeleted: runtimeStore?.retention.lastBatchExecutionDeleted ?? 0,
    runtimeMaxAuditEvents: runtimeStore?.retention.maxAuditEvents ?? 80,
    runtimeMaxNotificationEvents: runtimeStore?.retention.maxNotificationEvents ?? 120,
    runtimeMaxBatchExecutionEvents: runtimeStore?.retention.maxBatchExecutionEvents ?? 40,
  };
}

export function buildDataOpsRuntimeNoticeState({
  hasRuntimeError,
  runtimeWarningCount,
  hasOperatePermission,
  hasImportantRisk,
}: {
  hasRuntimeError: boolean;
  runtimeWarningCount: number;
  hasOperatePermission: boolean;
  hasImportantRisk: boolean;
}): DataOpsRuntimeNoticeState {
  return {
    systemNoticeCount:
      (hasRuntimeError ? 1 : 0) +
      (runtimeWarningCount ? 1 : 0) +
      (!hasOperatePermission ? 1 : 0) +
      (hasImportantRisk ? 1 : 0),
  };
}

export function buildDataOpsPipelineFilterLabels({
  statusFilter,
  keyword,
}: {
  statusFilter: DataOpsStatus | 'all';
  keyword: string;
}): DataOpsPipelineFilterLabels {
  const normalizedKeyword = keyword.trim();
  return {
    statusFilterLabel:
      statusFilter === 'all'
        ? '全部状态'
        : statusFilter === 'healthy'
          ? '健康'
          : statusFilter === 'warning'
            ? '关注'
            : statusFilter === 'error'
              ? '异常'
              : '停用',
    keywordFilterText: normalizedKeyword || '无',
    hasPipelineFilter: statusFilter !== 'all' || Boolean(normalizedKeyword),
  };
}
