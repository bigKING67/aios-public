import type { BatchOperationAction } from './dataops-hub-formatters';

export interface BatchOperationOptions {
  pipelineIds?: string[];
  parameters?: Record<string, string | number | boolean>;
  requireConfirm?: boolean;
  requestKeySuffix?: string;
}

export interface BatchOperationFailureContext {
  action: BatchOperationAction;
  label: string;
  failedPipelineIds: string[];
  retryableFailedPipelineIds: string[];
  parameters?: Record<string, string | number | boolean>;
  executedAt: string;
}

export interface BatchExecutionResultItem {
  pipelineId: string;
  pipelineName: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  retryable: boolean;
}

export interface BatchOperationPipelineSnapshot {
  id: string;
  name: string;
  runtime?: {
    deploymentId?: string;
  };
}

export interface BatchOperationPipelineGroups<T extends BatchOperationPipelineSnapshot> {
  executablePipelines: T[];
  skippedPipelines: T[];
}

export interface BatchExecutionSummary {
  id?: string;
  action: BatchOperationAction;
  label: string;
  executedAt: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  operator?: string;
  parameters?: Record<string, string | number | boolean>;
  items: BatchExecutionResultItem[];
}

export interface BatchFailureReasonSummaryItem {
  reason: string;
  count: number;
  pipelineNames: string[];
}

export interface BatchHistoryFailureStats {
  totalBatchCount: number;
  failedBatchCount: number;
  failedTaskCount: number;
  impactedPipelineIds: string[];
}

export interface BatchHistoryRetryGroup {
  action: BatchOperationAction;
  parameters?: Record<string, string | number | boolean>;
  pipelineIds: string[];
  sourceBatchCount: number;
  latestExecutedAtTs: number;
}

export interface BatchHistoryRetryOperationPlan {
  action: BatchOperationAction;
  label: string;
  pipelineIds: string[];
  parameters?: Record<string, string | number | boolean>;
  requestKeySuffix: string;
}

export interface BatchHistoryRetryPlan {
  retryLabel: string;
  targetPipelineCount: number;
  operations: BatchHistoryRetryOperationPlan[];
}

export interface BatchOperationExecutionOutcome {
  summaryPayload: BatchExecutionSummary;
  failureContext: BatchOperationFailureContext | null;
  completionText: string;
}

export interface BatchHistoryAlertSendFormValues {
  channelId: string;
  messageTitle: string;
  messageText: string;
}
