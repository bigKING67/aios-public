import { useMemo } from 'react';
import type { Dayjs } from 'dayjs';

import type { DateMode } from './dashboard-config';
import {
  formatDashboardDisplayRangeLabel,
  formatDashboardIsoDate,
  resolveCurrentRange,
  resolvePreviousRange,
} from './dashboard-date-range';
import { createSnapshot } from './dashboard-overview-snapshot';
import type { DashboardAvailableDateBounds } from './dashboard-date-bounds-state';

type DashboardRangeDerivedStateArgs = {
  dateMode: DateMode;
  dayValue: Dayjs;
  weekValue: Dayjs;
  monthValue: Dayjs;
  yearValue: Dayjs;
  customRange: [Dayjs, Dayjs];
  dateBounds?: DashboardAvailableDateBounds | null;
};

export function useDashboardRangeDerivedState({
  dateMode,
  dayValue,
  weekValue,
  monthValue,
  yearValue,
  customRange,
  dateBounds,
}: DashboardRangeDerivedStateArgs) {
  const currentRange = useMemo(
    () => resolveCurrentRange(dateMode, dayValue, weekValue, monthValue, yearValue, customRange, dateBounds),
    [customRange, dateBounds, dateMode, dayValue, monthValue, weekValue, yearValue]
  );
  const previousRange = useMemo(
    () => resolvePreviousRange(dateMode, currentRange),
    [currentRange, dateMode]
  );
  const fallbackSnapshot = useMemo(
    () => createSnapshot(dateMode, customRange),
    [customRange, dateMode]
  );

  return {
    currentRange,
    previousRange,
    fallbackSnapshot,
    dashboardRangeLabel: formatDashboardDisplayRangeLabel(currentRange.start, currentRange.end),
    dashboardFallbackAsOfDate: formatDashboardIsoDate(currentRange.end),
  };
}
