import type { DataOpsRuntimeResponse } from '@/types/dataops';
import type {
  AuditResultFilter,
  AuditTimeRangeFilter,
} from './dataops-hub-formatters';

export type DataOpsMetricStatusKey = 'healthy' | 'warning' | 'error' | 'paused';

export interface DataOpsMetricStatusItem {
  key: DataOpsMetricStatusKey;
  segmentRatio: number;
}

export interface DataOpsOverviewMetricDerivedState {
  hasImportantRisk: boolean;
  metricStatusItems: readonly DataOpsMetricStatusItem[];
}

export interface DataOpsAuditQuickFilterState {
  isAuditFailedOnly: boolean;
  isAudit24hFailed: boolean;
  isAudit7dFailed: boolean;
}

export function buildDataOpsOverviewMetricDerivedState(
  metrics: DataOpsRuntimeResponse['metrics']
): DataOpsOverviewMetricDerivedState {
  const metricTotalPipelines = Math.max(metrics.totalPipelines, 0);
  const buildRatio = (count: number) =>
    metricTotalPipelines ? (count / metricTotalPipelines) * 100 : 0;

  return {
    hasImportantRisk: metrics.warningPipelines > 0 || metrics.errorPipelines > 0,
    metricStatusItems: [
      {
        key: 'healthy',
        segmentRatio: buildRatio(metrics.healthyPipelines),
      },
      {
        key: 'warning',
        segmentRatio: buildRatio(metrics.warningPipelines),
      },
      {
        key: 'error',
        segmentRatio: buildRatio(metrics.errorPipelines),
      },
      {
        key: 'paused',
        segmentRatio: buildRatio(metrics.pausedPipelines),
      },
    ],
  };
}

export function buildDataOpsAuditQuickFilterState({
  auditResultFilter,
  auditTimeRangeFilter,
  auditActionFilter,
}: {
  auditResultFilter: AuditResultFilter;
  auditTimeRangeFilter: AuditTimeRangeFilter;
  auditActionFilter: string;
}): DataOpsAuditQuickFilterState {
  return {
    isAuditFailedOnly:
      auditResultFilter === '失败' && auditTimeRangeFilter === 'all' && auditActionFilter === 'all',
    isAudit24hFailed:
      auditResultFilter === '失败' && auditTimeRangeFilter === '24h' && auditActionFilter === 'all',
    isAudit7dFailed:
      auditResultFilter === '失败' && auditTimeRangeFilter === '7d' && auditActionFilter === 'all',
  };
}
