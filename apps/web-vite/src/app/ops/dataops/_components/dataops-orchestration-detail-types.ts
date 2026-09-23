import type { ReactNode } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { DataOpsRuntimePipeline } from '@/types/dataops';
import type { BatchOperationAction } from './dataops-hub-formatters';
import type {
  BatchExecutionSummary,
  BatchOperationFailureContext,
} from './dataops-batch-helpers';

export interface DataOpsOrchestrationDetailProps {
  filteredPipelines: DataOpsRuntimePipeline[];
  selectedPipelineIds: string[];
  lastBatchExecutionSummary: BatchExecutionSummary | null;
  lastBatchFailureContext: BatchOperationFailureContext | null;
  retryableFailedCount: number;
  statusFilterLabel: string;
  keywordFilterText: string;
  hasPipelineFilter: boolean;
  hasOperatePermission: boolean;
  globalActionBusy: boolean;
  batchActionKey: BatchOperationAction | null;
  batchExecutionHistoryCount: number;
  columns: ColumnsType<DataOpsRuntimePipeline>;
  isCompactViewport: boolean;
  renderExpandedRow: (record: DataOpsRuntimePipeline) => ReactNode;
  renderPaginationTotal: (total: number, range: [number, number]) => string;
  onSelectExecutable: () => void;
  onClearSelected: () => void;
  onBatchOperation: (action: BatchOperationAction, label: string) => void | Promise<unknown>;
  onOpenBatchTrigger: () => void;
  onRetryFailed: () => void | Promise<void>;
  onRetryRetryableFailed: () => void | Promise<void>;
  onOpenBatchResult: () => void;
  onOpenBatchHistory: () => void;
  onClearFilters: () => void;
  onSelectedPipelineIdsChange: (ids: string[]) => void;
}
