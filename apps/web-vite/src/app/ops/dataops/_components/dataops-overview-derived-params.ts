import type { useDataOpsHubFoundationState } from './dataops-hub-foundation-state';
import type { DataOpsOverviewDerivedStateOptions } from './dataops-overview-derived-state';

type DataOpsHubFoundationState = ReturnType<typeof useDataOpsHubFoundationState>;

export function buildDataOpsOverviewDerivedStateOptions({
  hasOperatePermission,
  keywordInput,
  metrics,
  runtimeQuery,
  runtimeStore,
  runtimeWarnings,
  statusFilter,
}: DataOpsHubFoundationState): DataOpsOverviewDerivedStateOptions {
  return {
    hasOperatePermission,
    hasRuntimeError: Boolean(runtimeQuery.error),
    keywordInput,
    metrics,
    runtimeStore,
    runtimeWarningCount: runtimeWarnings.length,
    snapshotAt: runtimeQuery.data?.snapshotAt,
    statusFilter,
  };
}
