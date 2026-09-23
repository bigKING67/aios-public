import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';

import { buildLiveRowsByDate } from './dashboard-live-detail-groups';
import { buildLiveFunnelSteps } from './dashboard-live-funnel-steps';
import {
  formatLiveFunnelSessionOptionLabel,
  getLiveFunnelOverallRate,
} from './dashboard-live-funnel-formatters';
import {
  getLiveDetailBusinessSessionKey,
  getLiveDetailDateKey,
} from './dashboard-live-detail-formatters';
import type {
  DashboardLiveDetailRow,
  LiveFunnelStep,
} from './dashboard-types';

type DashboardLiveFunnelDerivedStateArgs = {
  activeLiveDetailRows: DashboardLiveDetailRow[];
  selectedLiveFunnelRow: DashboardLiveDetailRow | null;
};

type DashboardLiveFunnelSessionOption = {
  label: string;
  value: string;
};

type LiveRowsByDate = ReturnType<typeof buildLiveRowsByDate>;

type DashboardLiveFunnelDerivedState = {
  liveRowsByDate: LiveRowsByDate;
  selectedLiveFunnelDateKey: string | null;
  selectedLiveFunnelDayRows: DashboardLiveDetailRow[];
  selectedLiveFunnelSessionKey: string | undefined;
  selectedLiveFunnelSessionOptions: DashboardLiveFunnelSessionOption[];
  selectedLiveFunnelSteps: LiveFunnelStep[];
  selectedLiveFunnelOverallRate: string;
};

export function useDashboardLiveFunnelDerivedState({
  activeLiveDetailRows,
  selectedLiveFunnelRow,
}: DashboardLiveFunnelDerivedStateArgs): DashboardLiveFunnelDerivedState {
  const liveRowsByDate = useMemo(() => buildLiveRowsByDate(activeLiveDetailRows), [activeLiveDetailRows]);
  const selectedLiveFunnelDateKey = selectedLiveFunnelRow ? getLiveDetailDateKey(selectedLiveFunnelRow) : null;
  const selectedLiveFunnelDayRows = useMemo(() => {
    if (!selectedLiveFunnelRow) {
      return [];
    }
    return selectedLiveFunnelDateKey ? liveRowsByDate.get(selectedLiveFunnelDateKey) || [] : [selectedLiveFunnelRow];
  }, [liveRowsByDate, selectedLiveFunnelDateKey, selectedLiveFunnelRow]);
  const selectedLiveFunnelSessionKey = selectedLiveFunnelRow
    ? getLiveDetailBusinessSessionKey(selectedLiveFunnelRow)
    : undefined;
  const selectedLiveFunnelSessionOptions = useMemo(
    () =>
      selectedLiveFunnelDayRows.map((row) => ({
        label: formatLiveFunnelSessionOptionLabel(row),
        value: getLiveDetailBusinessSessionKey(row),
      })),
    [selectedLiveFunnelDayRows]
  );
  const selectedLiveFunnelSteps = useMemo(
    () => (selectedLiveFunnelRow ? buildLiveFunnelSteps(selectedLiveFunnelRow) : []),
    [selectedLiveFunnelRow]
  );
  const selectedLiveFunnelOverallRate = useMemo(
    () => (selectedLiveFunnelRow ? getLiveFunnelOverallRate(selectedLiveFunnelRow) : '--'),
    [selectedLiveFunnelRow]
  );

  return {
    liveRowsByDate,
    selectedLiveFunnelDateKey,
    selectedLiveFunnelDayRows,
    selectedLiveFunnelSessionKey,
    selectedLiveFunnelSessionOptions,
    selectedLiveFunnelSteps,
    selectedLiveFunnelOverallRate,
  };
}

type DashboardLiveFunnelSelectedRowReconcileEffectArgs = {
  activeLiveDetailRowsCount: number;
  isLiveFunnelDrawerOpen: boolean;
  liveRowsByDate: LiveRowsByDate;
  selectedLiveFunnelRow: DashboardLiveDetailRow | null;
  setSelectedLiveFunnelRow: Dispatch<SetStateAction<DashboardLiveDetailRow | null>>;
};

export function useDashboardLiveFunnelSelectedRowReconcileEffect({
  activeLiveDetailRowsCount,
  isLiveFunnelDrawerOpen,
  liveRowsByDate,
  selectedLiveFunnelRow,
  setSelectedLiveFunnelRow,
}: DashboardLiveFunnelSelectedRowReconcileEffectArgs) {
  useEffect(() => {
    if (!isLiveFunnelDrawerOpen || !selectedLiveFunnelRow || !activeLiveDetailRowsCount) {
      return;
    }

    const dateKey = getLiveDetailDateKey(selectedLiveFunnelRow);
    const dayRows = dateKey ? liveRowsByDate.get(dateKey) || [] : [];
    if (!dayRows.length) {
      setSelectedLiveFunnelRow(null);
      return;
    }

    const currentKey = getLiveDetailBusinessSessionKey(selectedLiveFunnelRow);
    if (!dayRows.some((row) => getLiveDetailBusinessSessionKey(row) === currentKey)) {
      setSelectedLiveFunnelRow(dayRows[0]);
    }
  }, [
    activeLiveDetailRowsCount,
    isLiveFunnelDrawerOpen,
    liveRowsByDate,
    selectedLiveFunnelRow,
    setSelectedLiveFunnelRow,
  ]);
}
