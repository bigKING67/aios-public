import type {
  DataOpsAuditEvent,
  DataOpsNotificationChannel,
  DataOpsNotificationEvent,
  DataOpsPipeline,
  DataOpsStatus,
  DataSyncStream,
} from '@/config/dataops-hub';

export interface DataOpsPipelineRuntime {
  deploymentId?: string;
  deploymentPaused?: boolean;
  deploymentStatus?: string;
  workPoolName?: string;
  flowRunId?: string;
  flowRunStateType?: string;
  flowRunStateName?: string;
  flowRunStateMessage?: string;
  flowRunAt?: string;
  operationError?: string;
}

export interface DataOpsRuntimePipeline extends DataOpsPipeline {
  runtime?: DataOpsPipelineRuntime;
}

export interface DataOpsRuntimeSyncStream extends DataSyncStream {
  computedLagMinutes: number;
}

export interface DataOpsRuntimeFeishuSyncJob {
  id: string;
  serviceName: string;
  jobName: string;
  sourceTable: string;
  target: string;
  status: DataOpsStatus;
  lastSyncedAt?: string;
  lagMinutes?: number;
  lastWatermark?: string;
  lastPrimaryKey?: string;
  note?: string;
}

export type DataOpsBatchExecutionAction = Exclude<
  DataOpsActionType,
  'test_channel_webhook' | 'trigger_feishu_sync'
>;

export interface DataOpsBatchExecutionItem {
  pipelineId: string;
  pipelineName: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  retryable: boolean;
}

export interface DataOpsBatchExecutionRecord {
  id: string;
  action: DataOpsBatchExecutionAction;
  label: string;
  executedAt: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  operator: string;
  parameters?: Record<string, string | number | boolean>;
  items: DataOpsBatchExecutionItem[];
}

export interface DataOpsRuntimeStorePostgresStatus {
  enabled: boolean;
  connected: boolean;
  host: string;
  port: string;
  user: string;
  database: string;
  schema: string;
  schemaExists: boolean;
  auditTableExists: boolean;
  notificationTableExists: boolean;
  triggerLocksTableExists: boolean;
  batchExecutionTableExists: boolean;
}

export interface DataOpsRuntimeStoreStatus {
  storageMode: 'postgres' | 'file' | 'memory';
  lockMode: 'postgres' | 'memory';
  postgres: DataOpsRuntimeStorePostgresStatus;
  fileStore: {
    directory: string;
    available: boolean;
  };
  retention: {
    retainDays: number;
    cleanupStateAvailable: boolean;
    lastCleanupAt?: string;
    lastAuditDeleted?: number;
    lastNotificationDeleted?: number;
    lastBatchExecutionDeleted?: number;
    updatedAt?: string;
    maxAuditEvents: number;
    maxNotificationEvents: number;
    maxBatchExecutionEvents: number;
  };
}

export interface DataOpsRuntimeResponse {
  snapshotAt: string;
  pipelines: DataOpsRuntimePipeline[];
  syncStreams: DataOpsRuntimeSyncStream[];
  feishuSyncJobs: DataOpsRuntimeFeishuSyncJob[];
  notificationChannels: DataOpsNotificationChannel[];
  notificationEvents: DataOpsNotificationEvent[];
  auditEvents: DataOpsAuditEvent[];
  batchExecutions: DataOpsBatchExecutionRecord[];
  metrics: {
    totalPipelines: number;
    healthyPipelines: number;
    warningPipelines: number;
    errorPipelines: number;
    pausedPipelines: number;
    avgLagMinutes: number;
    notificationFailureCount24h: number;
    healthyRate: number;
  };
  runtimeStore: DataOpsRuntimeStoreStatus;
  prefectReachable: boolean;
  warnings: string[];
}

export interface DataOpsNotificationTraceReasonHashRecoveryItem {
  reasonHashKey: string;
  reasonHashLabel: string;
  firstFailedCount: number;
  recoveredCount: number;
  unresolvedCount: number;
  recoveryRate: number;
  sampleReason: string;
  traceGroupKeys: string[];
}

export interface DataOpsNotificationTraceSummary {
  totalCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  retryableFailedCount: number;
  earliestAt: string;
  latestAt: string;
  channelNames: string[];
}

export interface DataOpsNotificationTraceSloItem {
  reasonHashKey: string;
  reasonHashLabel: string;
  firstFailedCount: number;
  recoveredCount: number;
  unresolvedCount: number;
  recoveryRate: number;
  sampleReason: string;
  triggered: boolean;
  cooldownActive: boolean;
}

export interface DataOpsNotificationTraceSloStatus {
  enabled: boolean;
  checkedAt: string;
  thresholdRecoveryRate: number;
  minFirstFailedCount: number;
  cooldownMinutes: number;
  breached: boolean;
  autoNotifyEnabled: boolean;
  notificationTriggered: boolean;
  notificationChannelId?: string;
  warning?: string;
  items: DataOpsNotificationTraceSloItem[];
}

export interface DataOpsNotificationTraceResponse {
  snapshotAt: string;
  retryGroupId: string;
  events: DataOpsNotificationEvent[];
  summary: DataOpsNotificationTraceSummary | null;
  reasonHashRecovery: DataOpsNotificationTraceReasonHashRecoveryItem[];
  slo: DataOpsNotificationTraceSloStatus;
  source: 'postgres' | 'runtime_store';
  warnings: string[];
}

export type DataOpsNotificationTraceSloRiskLevel = 'critical' | 'warning' | 'watch' | 'normal';

export interface DataOpsNotificationTraceSloScanItem {
  retryGroupId: string;
  latestEventAt: string;
  eventCount: number;
  eventSource: 'postgres' | 'runtime_store';
  breached: boolean;
  triggeredCount: number;
  cooldownCount: number;
  riskScore: number;
  riskLevel: DataOpsNotificationTraceSloRiskLevel;
  warning?: string;
}

export interface DataOpsNotificationTraceSloScanResponse {
  executedAt: string;
  dryRun: boolean;
  lookbackHours: number;
  maxGroups: number;
  scanConcurrency: number;
  durationMs: number;
  processedGroups: number;
  breachedGroups: number;
  triggeredGroups: number;
  groupSource: 'postgres' | 'runtime_store';
  items: DataOpsNotificationTraceSloScanItem[];
  warnings: string[];
}

export type DataOpsActionType =
  | 'trigger_pipeline'
  | 'pause_deployment'
  | 'resume_deployment'
  | 'test_channel_webhook'
  | 'trigger_feishu_sync';

export interface DataOpsActionRequest {
  action: DataOpsActionType;
  pipelineId?: string;
  channelId?: string;
  parameters?: Record<string, unknown>;
  batchExecution?: boolean;
}

export interface DataOpsActionResponse {
  success: boolean;
  action: DataOpsActionType;
  message: string;
  pipelineId?: string;
  channelId?: string;
  runtimeStatus?: DataOpsStatus;
  flowRunId?: string;
  flowRunName?: string;
  lockMode?: 'postgres' | 'memory';
  lockWarning?: string;
}
