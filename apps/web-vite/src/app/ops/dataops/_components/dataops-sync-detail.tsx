'use client';

import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  PlayCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { Button, Empty } from 'antd';
import type {
  DataOpsRuntimeFeishuSyncJob,
  DataOpsRuntimeSyncStream,
} from '@/types/dataops';
import { DataOpsStatusTag } from './dataops-status-tag';
import { formatDateTime } from './dataops-hub-formatters';
import styles from './dataops-hub.module.css';
import syncStyles from './dataops-sync-section.module.css';

interface DataOpsSyncStatusSummary {
  total: number;
  healthy: number;
  warning: number;
  error: number;
  paused: number;
}

interface DataOpsSyncDetailProps {
  streams: DataOpsRuntimeSyncStream[];
  streamSummary: DataOpsSyncStatusSummary;
  feishuSyncJobs: DataOpsRuntimeFeishuSyncJob[];
  feishuSyncSummary: DataOpsSyncStatusSummary;
  activeFeishuSyncJobKey: string | null;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  onRunFeishuSyncJob: (job: DataOpsRuntimeFeishuSyncJob) => void;
}

export function DataOpsSyncDetail({
  streams,
  streamSummary,
  feishuSyncJobs,
  feishuSyncSummary,
  activeFeishuSyncJobKey,
  hasOperatePermission,
  globalActionBusy,
  onRunFeishuSyncJob,
}: DataOpsSyncDetailProps) {
  if (!streams.length && !feishuSyncJobs.length) {
    return <Empty description="当前筛选条件下没有匹配到同步链路" />;
  }

  return (
    <div className={syncStyles.syncSection}>
      {streams.length ? (
        <>
          <div className={syncStyles.syncSummaryBar}>
            <span className={styles.notifyDataBadge}>链路 {streamSummary.total}</span>
            <span className={styles.notifyDataBadge}>异常 {streamSummary.error}</span>
            <span className={styles.notifyDataBadge}>关注 {streamSummary.warning}</span>
            <span className={styles.notifyDataBadge}>停用 {streamSummary.paused}</span>
            <span className={styles.notifyDataBadge}>健康 {streamSummary.healthy}</span>
            <span className={syncStyles.syncSummaryHint}>
              ETL链路展示顺序：异常优先，其次按延迟从高到低
            </span>
          </div>
          <div className={syncStyles.syncGrid}>
            {streams.map((stream) => (
              <article key={stream.id} className={syncStyles.syncCard}>
                <div className={syncStyles.syncCardHead}>
                  <div>
                    <h3>{stream.streamName}</h3>
                    <p>{stream.source} {'->'} {stream.target}</p>
                  </div>
                  <DataOpsStatusTag status={stream.status} />
                </div>

                <div className={syncStyles.layerRail}>
                  {stream.layers.map((layer, index) => (
                    <span key={`${stream.id}-${layer}-${index}`} className={syncStyles.layerChip}>
                      {layer}
                    </span>
                  ))}
                </div>

                <div className={syncStyles.syncMeta}>
                  <p><DatabaseOutlined /> Checkpoint：{stream.checkpointTable}</p>
                  <p><ClockCircleOutlined /> 延迟：{stream.computedLagMinutes} 分钟</p>
                  <p><CheckCircleOutlined /> 最近同步：{formatDateTime(stream.lastSyncAt)}</p>
                </div>

                {stream.note ? (
                  <p className={syncStyles.syncNote}>{stream.note}</p>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}

      {feishuSyncJobs.length ? (
        <>
          <div className={syncStyles.syncSummaryBar}>
            <span className={styles.notifyDataBadge}>飞书同步 {feishuSyncSummary.total}</span>
            <span className={styles.notifyDataBadge}>异常 {feishuSyncSummary.error}</span>
            <span className={styles.notifyDataBadge}>关注 {feishuSyncSummary.warning}</span>
            <span className={styles.notifyDataBadge}>停用 {feishuSyncSummary.paused}</span>
            <span className={styles.notifyDataBadge}>健康 {feishuSyncSummary.healthy}</span>
            <span className={syncStyles.syncSummaryHint}>
              状态基于 sync_state.updated_at（24h内健康，48h内关注）
            </span>
          </div>
          <div className={syncStyles.syncGrid}>
            {feishuSyncJobs.map((job) => {
              const isLoading = activeFeishuSyncJobKey === job.serviceName;
              const shouldDisableAction = globalActionBusy || !hasOperatePermission;

              return (
                <article key={job.id} className={syncStyles.syncCard}>
                  <div className={syncStyles.syncCardHead}>
                    <div>
                      <h3>{job.jobName}</h3>
                      <p>{job.sourceTable} {'->'} {job.target}</p>
                    </div>
                    <DataOpsStatusTag status={job.status} />
                  </div>

                  <div className={syncStyles.layerRail}>
                    <span className={syncStyles.layerChip}>ODS</span>
                    <span className={syncStyles.layerChip}>Feishu</span>
                  </div>

                  <div className={syncStyles.syncMeta}>
                    <p><DatabaseOutlined /> 服务键：{job.serviceName}</p>
                    <p>
                      <ClockCircleOutlined /> 延迟：
                      {typeof job.lagMinutes === 'number' ? ` ${job.lagMinutes} 分钟` : ' -'}
                    </p>
                    <p><CheckCircleOutlined /> 最近同步：{formatDateTime(job.lastSyncedAt)}</p>
                    <p><SyncOutlined /> 最新水位：{job.lastWatermark || '-'}</p>
                  </div>

                  <div className={syncStyles.syncActionGroup}>
                    <Button
                      size="small"
                      icon={<PlayCircleOutlined />}
                      loading={isLoading}
                      disabled={shouldDisableAction}
                      onClick={() => onRunFeishuSyncJob(job)}
                    >
                      立即运行
                    </Button>
                  </div>

                  <p className={syncStyles.syncNote}>
                    最近主键：{job.lastPrimaryKey || '-'}
                    {job.note ? ` ｜ ${job.note}` : ''}
                  </p>
                </article>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
