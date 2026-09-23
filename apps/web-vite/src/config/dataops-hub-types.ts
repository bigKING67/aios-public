/**
 * DataOps Hub 配置
 *
 * 数据来源：
 * - etl/groland_postgres/scripts/*.py
 * - etl/groland_postgres/scripts/deploy_prefect_*.sh
 *
 * 说明：
 * 1. 结构化静态配置用于描述 ETL 链路，避免运维信息散落在脚本内
 * 2. 运行时页面优先使用后端 DataOps Runtime 接口，接口无数据时回退到这份静态配置
 */

export type DataOpsStatus = 'healthy' | 'warning' | 'error' | 'paused';

export interface DataOpsPipeline {
  id: string;
  name: string;
  domain: 'DWD' | 'DWS' | 'ADS' | 'OPS';
  flowName: string;
  deploymentName: string;
  cron: string;
  timezone: string;
  fallbackWindowDays?: number;
  sourceTables: string[];
  targetTables: string[];
  procedures: string[];
  watermarkTable?: string;
  owner: string;
  status: DataOpsStatus;
  lastRunAt: string;
  lastSuccessAt?: string;
  avgDurationSec: number;
  linuxDeployScript?: string;
  linuxDeployCommand?: string;
  /** false means the built-in bulk-trigger path must reject this pipeline. */
  batchTriggerAllowed?: boolean;
  note?: string;
}

export interface DataSyncStream {
  id: string;
  streamName: string;
  layers: string[];
  source: string;
  target: string;
  checkpointTable: string;
  lagMinutes: number;
  lastSyncAt: string;
  status: DataOpsStatus;
  note?: string;
}

export interface DataOpsNotificationChannel {
  id: string;
  channelName: string;
  protocol: 'webhook';
  provider: 'feishu';
  endpointMasked: string;
  enabled: boolean;
  status: DataOpsStatus;
  retryPolicy: string;
  lastDeliveredAt?: string;
  failureCount24h: number;
}

export interface DataOpsNotificationEvent {
  id: string;
  channelId: string;
  level: 'info' | 'warning' | 'error';
  eventType: string;
  title: string;
  targetTable: string;
  flowName: string;
  status: 'sent' | 'failed' | 'skipped';
  sentAt: string;
  detail: string;
  reasonHash?: string;
  retryGroupId?: string;
}

export interface DataOpsAuditEvent {
  id: string;
  action: string;
  operator: string;
  scope: string;
  result: '成功' | '失败';
  eventAt: string;
  detail: string;
}
