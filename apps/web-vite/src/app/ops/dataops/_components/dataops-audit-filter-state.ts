import { useCallback, useMemo, useState } from 'react';

import type { DataOpsAuditEvent } from '@/config/dataops-hub';
import type { AuditResultFilter, AuditTimeRangeFilter } from './dataops-hub-formatters';
import {
  buildAuditActionOptions,
  filterDataOpsAudits,
} from './dataops-hub-selectors';
import { buildDataOpsAuditQuickFilterState } from './dataops-overview-selectors';

export function useDataOpsAuditFilterState(options: {
  auditEvents: DataOpsAuditEvent[];
  auditScopeAliasMap: Map<string, string>;
  normalizedKeyword: string;
}) {
  const { auditEvents, auditScopeAliasMap, normalizedKeyword } = options;

  const [auditResultFilter, setAuditResultFilter] = useState<AuditResultFilter>('all');
  const [auditTimeRangeFilter, setAuditTimeRangeFilter] =
    useState<AuditTimeRangeFilter>('all');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');

  const resolveAuditScopeLabel = useCallback(
    (scope: string) => {
      const normalized = scope.trim();
      if (!normalized) {
        return '-';
      }
      return auditScopeAliasMap.get(normalized) || normalized;
    },
    [auditScopeAliasMap]
  );

  const auditActionOptions = useMemo(
    () => buildAuditActionOptions({ auditEvents, currentFilter: auditActionFilter }),
    [auditActionFilter, auditEvents]
  );
  const filteredAudits = useMemo(
    () =>
      filterDataOpsAudits({
        auditEvents,
        auditResultFilter,
        auditTimeRangeFilter,
        auditActionFilter,
        normalizedKeyword,
        resolveAuditScopeLabel,
      }),
    [
      auditActionFilter,
      auditEvents,
      auditResultFilter,
      auditTimeRangeFilter,
      normalizedKeyword,
      resolveAuditScopeLabel,
    ]
  );
  const auditQuickFilterState = useMemo(
    () =>
      buildDataOpsAuditQuickFilterState({
        auditResultFilter,
        auditTimeRangeFilter,
        auditActionFilter,
      }),
    [auditActionFilter, auditResultFilter, auditTimeRangeFilter]
  );

  const resetAuditFilters = useCallback(() => {
    setAuditResultFilter('all');
    setAuditTimeRangeFilter('all');
    setAuditActionFilter('all');
  }, []);
  const applyAuditFailedOnly = useCallback(() => {
    setAuditResultFilter('失败');
    setAuditTimeRangeFilter('all');
    setAuditActionFilter('all');
  }, []);
  const applyAudit24hFailed = useCallback(() => {
    setAuditResultFilter('失败');
    setAuditTimeRangeFilter('24h');
    setAuditActionFilter('all');
  }, []);
  const applyAudit7dFailed = useCallback(() => {
    setAuditResultFilter('失败');
    setAuditTimeRangeFilter('7d');
    setAuditActionFilter('all');
  }, []);

  return {
    auditActionFilter,
    auditActionOptions,
    auditQuickFilterState,
    auditResultFilter,
    auditTimeRangeFilter,
    applyAudit24hFailed,
    applyAudit7dFailed,
    applyAuditFailedOnly,
    filteredAudits,
    resetAuditFilters,
    resolveAuditScopeLabel,
    setAuditActionFilter,
    setAuditResultFilter,
    setAuditTimeRangeFilter,
  };
}
