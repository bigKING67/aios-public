import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { Dayjs } from 'dayjs';

import type { QueryPlatform } from './dashboard-config';
import type { DashboardAvailableDateBounds } from './dashboard-date-bounds-state';
import {
  clampDateToAvailableBounds,
  parseDateLiteral,
} from './dashboard-date-range';
import {
  resolveOverviewNotePlatformFilter,
  type OverviewNotePlatformFilter,
} from './dashboard-note-model';
import type { DashboardDailyNoteRow } from './dashboard-types';

type DashboardSelectedNoteDateStateEffectArgs = {
  isBusinessDimension: boolean;
  isDayMode: boolean;
  dayValue: Dayjs;
  dateBounds: DashboardAvailableDateBounds;
  isDateBoundsReady: boolean;
  selectedNoteDate: string | null;
  closeDailyNoteDrawer: () => void;
  resetSelectedNoteDate: () => void;
  setSelectedNoteDate: Dispatch<SetStateAction<string | null>>;
};

export function useDashboardSelectedNoteDateStateEffect({
  isBusinessDimension,
  isDayMode,
  dayValue,
  dateBounds,
  isDateBoundsReady,
  selectedNoteDate,
  closeDailyNoteDrawer,
  resetSelectedNoteDate,
  setSelectedNoteDate,
}: DashboardSelectedNoteDateStateEffectArgs) {
  useEffect(() => {
    if (!isBusinessDimension || !isDayMode) {
      resetSelectedNoteDate();
      closeDailyNoteDrawer();
      return;
    }

    if (!isDateBoundsReady) {
      return;
    }

    const fallbackDate = clampDateToAvailableBounds(dayValue, dateBounds).format('YYYY-MM-DD');

    if (!selectedNoteDate) {
      setSelectedNoteDate(fallbackDate);
      return;
    }

    const parsedSelectedDate = parseDateLiteral(selectedNoteDate);
    if (!parsedSelectedDate) {
      setSelectedNoteDate(fallbackDate);
      return;
    }

    const clampedSelectedDate = clampDateToAvailableBounds(parsedSelectedDate, dateBounds).format('YYYY-MM-DD');
    if (clampedSelectedDate !== selectedNoteDate) {
      setSelectedNoteDate(clampedSelectedDate);
    }
  }, [
    closeDailyNoteDrawer,
    dateBounds,
    dayValue,
    isDateBoundsReady,
    isBusinessDimension,
    isDayMode,
    resetSelectedNoteDate,
    selectedNoteDate,
    setSelectedNoteDate,
  ]);
}

type DashboardNoteDrawerScopeEffectArgs = {
  isBusinessDimension: boolean;
  closeDailyNoteDrawer: () => void;
};

export function useDashboardNoteDrawerScopeEffect({
  isBusinessDimension,
  closeDailyNoteDrawer,
}: DashboardNoteDrawerScopeEffectArgs) {
  useEffect(() => {
    if (isBusinessDimension) {
      return;
    }
    closeDailyNoteDrawer();
  }, [closeDailyNoteDrawer, isBusinessDimension]);
}

type DashboardNoteDraftDateSyncEffectArgs = {
  selectedNoteDate: string | null;
  setNoteDraftDate: Dispatch<SetStateAction<string>>;
};

export function useDashboardNoteDraftDateSyncEffect({
  selectedNoteDate,
  setNoteDraftDate,
}: DashboardNoteDraftDateSyncEffectArgs) {
  useEffect(() => {
    if (!selectedNoteDate) {
      return;
    }
    setNoteDraftDate(selectedNoteDate);
  }, [selectedNoteDate, setNoteDraftDate]);
}

type DashboardOverviewNotePlatformFilterSyncEffectArgs = {
  activeQueryPlatform: QueryPlatform;
  dailyNotes: DashboardDailyNoteRow[];
  overviewNotePlatformFilter: OverviewNotePlatformFilter;
  setOverviewNotePlatformFilter: Dispatch<SetStateAction<OverviewNotePlatformFilter>>;
};

export function useDashboardOverviewNotePlatformFilterSyncEffect({
  activeQueryPlatform,
  dailyNotes,
  overviewNotePlatformFilter,
  setOverviewNotePlatformFilter,
}: DashboardOverviewNotePlatformFilterSyncEffectArgs) {
  useEffect(() => {
    const nextFilter = resolveOverviewNotePlatformFilter({
      activeQueryPlatform,
      notes: dailyNotes,
      overviewNotePlatformFilter,
    });
    if (nextFilter !== overviewNotePlatformFilter) {
      setOverviewNotePlatformFilter(nextFilter);
    }
  }, [activeQueryPlatform, dailyNotes, overviewNotePlatformFilter, setOverviewNotePlatformFilter]);
}

type DashboardEditingNoteStateEffectArgs = {
  dailyNotes: DashboardDailyNoteRow[];
  editingNoteId: number | null;
  clearEditingNoteId: () => void;
  resetUpdatingNoteState: () => void;
};

export function useDashboardEditingNoteStateEffect({
  dailyNotes,
  editingNoteId,
  clearEditingNoteId,
  resetUpdatingNoteState,
}: DashboardEditingNoteStateEffectArgs) {
  useEffect(() => {
    if (!editingNoteId) {
      return;
    }

    const exists = dailyNotes.some((item) => item.id === editingNoteId);
    if (!exists) {
      clearEditingNoteId();
      resetUpdatingNoteState();
    }
  }, [clearEditingNoteId, dailyNotes, editingNoteId, resetUpdatingNoteState]);
}
