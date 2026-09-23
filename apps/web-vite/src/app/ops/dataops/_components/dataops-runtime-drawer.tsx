'use client';

import { Drawer } from 'antd';
import { ClockCircleOutlined, DatabaseOutlined, SyncOutlined } from '@ant-design/icons';
import hubStyles from './dataops-hub.module.css';
import styles from './dataops-runtime-drawer.module.css';

interface DataOpsRuntimeDrawerProps {
  open: boolean;
  compact: boolean;
  onClose: () => void;
  runtimeStorageModeLabel: string;
  runtimeLockModeLabel: string;
  runtimeStoreDatabase: string;
  runtimeStoreSchema: string;
  retentionDays: number;
  runtimeLastCleanupAt: string;
  runtimeMaxAuditEvents: number;
  runtimeMaxNotificationEvents: number;
  runtimeMaxBatchExecutionEvents: number;
  postgresEnabled: boolean;
  postgresConnected: boolean;
  schemaReady: boolean;
  auditTableReady: boolean;
  notificationTableReady: boolean;
  triggerLocksTableReady: boolean;
  batchExecutionTableReady: boolean;
  cleanupStateReady: boolean;
  runtimeLastAuditDeleted: number;
  runtimeLastNotificationDeleted: number;
  runtimeLastBatchExecutionDeleted: number;
  runtimeWarnings: string[];
}

function getBooleanStateLabel(value: boolean): string {
  return value ? '已就绪' : '未就绪';
}

function resolveStoreBadgeClassName(value: boolean): string {
  return `${styles.runtimeStoreBadge} ${
    value ? styles.runtimeStoreBadgeOk : styles.runtimeStoreBadgeWarn
  }`;
}

export function DataOpsRuntimeDrawer({
  open,
  compact,
  onClose,
  runtimeStorageModeLabel,
  runtimeLockModeLabel,
  runtimeStoreDatabase,
  runtimeStoreSchema,
  retentionDays,
  runtimeLastCleanupAt,
  runtimeMaxAuditEvents,
  runtimeMaxNotificationEvents,
  runtimeMaxBatchExecutionEvents,
  postgresEnabled,
  postgresConnected,
  schemaReady,
  auditTableReady,
  notificationTableReady,
  triggerLocksTableReady,
  batchExecutionTableReady,
  cleanupStateReady,
  runtimeLastAuditDeleted,
  runtimeLastNotificationDeleted,
  runtimeLastBatchExecutionDeleted,
  runtimeWarnings,
}: DataOpsRuntimeDrawerProps) {
  return (
    <Drawer
      title="运行态与排障信息"
      open={open}
      onClose={onClose}
      width={compact ? 'calc(100vw - 24px)' : 620}
      destroyOnHidden
    >
      <div className={styles.runtimeDrawerBody}>
        <section className={styles.runtimeDrawerSection}>
          <div className={styles.runtimeDrawerHead}>
            <DatabaseOutlined />
            <strong>运行态存储</strong>
          </div>
          <div className={styles.runtimeStoreOverview}>
            <strong className={styles.metricTextStrong}>{runtimeStorageModeLabel}</strong>
            <span className={styles.runtimeStoreOverviewHint}>锁模式：{runtimeLockModeLabel}</span>
          </div>
          <div className={styles.runtimeStoreDetailsBody}>
            <p>
              库/Schema：{runtimeStoreDatabase}.{runtimeStoreSchema}
            </p>
            <p>
              保留策略：{retentionDays} 天；最近清理：{runtimeLastCleanupAt}
            </p>
            <p>
              条数裁剪：审计 {runtimeMaxAuditEvents} 条，通知 {runtimeMaxNotificationEvents}
              条，批量历史 {runtimeMaxBatchExecutionEvents} 条。
            </p>
            <div className={styles.runtimeStoreMeta}>
              <span
                className={`${styles.runtimeStoreBadge} ${
                  !postgresEnabled
                    ? styles.runtimeStoreBadgeNeutral
                    : postgresConnected
                      ? styles.runtimeStoreBadgeOk
                      : styles.runtimeStoreBadgeWarn
                }`}
              >
                {!postgresEnabled ? 'PG已关闭' : postgresConnected ? 'PG已连接' : 'PG未连接'}
              </span>
              <span className={resolveStoreBadgeClassName(schemaReady)}>
                Schema：{getBooleanStateLabel(schemaReady)}
              </span>
              <span className={resolveStoreBadgeClassName(auditTableReady)}>
                审计表：{getBooleanStateLabel(auditTableReady)}
              </span>
              <span className={resolveStoreBadgeClassName(notificationTableReady)}>
                通知表：{getBooleanStateLabel(notificationTableReady)}
              </span>
              <span className={resolveStoreBadgeClassName(triggerLocksTableReady)}>
                锁表：{getBooleanStateLabel(triggerLocksTableReady)}
              </span>
              <span className={resolveStoreBadgeClassName(batchExecutionTableReady)}>
                批量历史表：{getBooleanStateLabel(batchExecutionTableReady)}
              </span>
              <span className={resolveStoreBadgeClassName(cleanupStateReady)}>
                清理状态：{getBooleanStateLabel(cleanupStateReady)}
              </span>
              <span className={`${styles.runtimeStoreBadge} ${styles.runtimeStoreBadgeNeutral}`}>
                最近删除：审计 {runtimeLastAuditDeleted} / 通知 {runtimeLastNotificationDeleted} /
                批量历史 {runtimeLastBatchExecutionDeleted}
              </span>
            </div>
          </div>
        </section>

        <section className={styles.runtimeDrawerSection}>
          <div className={styles.runtimeDrawerHead}>
            <SyncOutlined />
            <strong>运行上下文</strong>
          </div>
          <div className={styles.snapshotBar}>
            <span>数据源：Prefect API + ETL 映射配置 + Webhook 通道状态</span>
            <span>Linux 运维：bash etl/groland_postgres/scripts/start_prefect_server.sh</span>
            <span>Worker：bash etl/groland_postgres/scripts/start_prefect_worker.sh</span>
          </div>
        </section>

        {runtimeWarnings.length ? (
          <section className={styles.runtimeDrawerSection}>
            <div className={styles.runtimeDrawerHead}>
              <ClockCircleOutlined />
              <strong>运行态提示</strong>
            </div>
            <ul className={hubStyles.noticeWarningList}>
              {runtimeWarnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}
