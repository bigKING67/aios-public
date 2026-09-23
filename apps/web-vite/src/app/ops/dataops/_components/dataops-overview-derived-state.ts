import { useMemo } from 'react';

import type { DataOpsStatus } from '@/config/dataops-hub';
import type { DataOpsRuntimeResponse, DataOpsRuntimeStoreStatus } from '@/types/dataops';
import { buildDataOpsOverviewMetricDerivedState } from './dataops-overview-selectors';
import {
  buildDataOpsPipelineFilterLabels,
  buildDataOpsRuntimeNoticeState,
  buildDataOpsRuntimeStoreDerivedState,
} from './dataops-runtime-selectors';

export type DataOpsOverviewDerivedStateOptions = {
  hasOperatePermission: boolean;
  hasRuntimeError: boolean;
  keywordInput: string;
  metrics: DataOpsRuntimeResponse['metrics'];
  runtimeStore: DataOpsRuntimeStoreStatus | undefined;
  runtimeWarningCount: number;
  snapshotAt: string | undefined;
  statusFilter: DataOpsStatus | 'all';
};

export function useDataOpsOverviewDerivedState(options: DataOpsOverviewDerivedStateOptions) {
  const {
    hasOperatePermission,
    hasRuntimeError,
    keywordInput,
    metrics,
    runtimeStore,
    runtimeWarningCount,
    snapshotAt: runtimeSnapshotAt,
    statusFilter,
  } = options;

  const overviewMetricState = useMemo(
    () => buildDataOpsOverviewMetricDerivedState(metrics),
    [metrics]
  );
  const runtimeStoreDerivedState = useMemo(
    () => buildDataOpsRuntimeStoreDerivedState(runtimeStore),
    [runtimeStore]
  );
  const runtimeNoticeState = useMemo(
    () =>
      buildDataOpsRuntimeNoticeState({
        hasRuntimeError,
        runtimeWarningCount,
        hasOperatePermission,
        hasImportantRisk: overviewMetricState.hasImportantRisk,
      }),
    [
      hasOperatePermission,
      hasRuntimeError,
      overviewMetricState.hasImportantRisk,
      runtimeWarningCount,
    ]
  );
  const pipelineFilterLabels = useMemo(
    () =>
      buildDataOpsPipelineFilterLabels({
        statusFilter,
        keyword: keywordInput,
      }),
    [keywordInput, statusFilter]
  );

  return {
    hasImportantRisk: overviewMetricState.hasImportantRisk,
    hasPipelineFilter: pipelineFilterLabels.hasPipelineFilter,
    keywordFilterText: pipelineFilterLabels.keywordFilterText,
    metricStatusItems: overviewMetricState.metricStatusItems,
    runtimeStoreDerivedState,
    snapshotAt: runtimeSnapshotAt || new Date().toLocaleString('zh-CN', { hour12: false }),
    statusFilterLabel: pipelineFilterLabels.statusFilterLabel,
    systemNoticeCount: runtimeNoticeState.systemNoticeCount,
  };
}
