import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { Dayjs } from 'dayjs';

import type { QueryPlatform } from './dashboard-config';
import { isRequestCanceled } from './dashboard-errors';
import { fetchDashboardNoteCounts } from './dashboard-fetchers';

type DashboardNoteCountsRequestEffectArgs = {
  isAuthenticated: boolean;
  isBusinessDimension: boolean;
  isDayMode: boolean;
  activeQueryPlatform: QueryPlatform;
  dayValue: Dayjs;
  notesReloadToken: number;
  setDailyNoteCountsByDate: Dispatch<SetStateAction<Record<string, number>>>;
  setDailyNotesLoading: Dispatch<SetStateAction<boolean>>;
  resetDailyNoteCountsData: () => void;
  resetDailyNoteCountsState: () => void;
};

export function useDashboardNoteCountsRequestEffect({
  isAuthenticated,
  isBusinessDimension,
  isDayMode,
  activeQueryPlatform,
  dayValue,
  notesReloadToken,
  setDailyNoteCountsByDate,
  setDailyNotesLoading,
  resetDailyNoteCountsData,
  resetDailyNoteCountsState,
}: DashboardNoteCountsRequestEffectArgs) {
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isAuthenticated || !isBusinessDimension || !isDayMode) {
      resetDailyNoteCountsState();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const yearStartDate = dayValue.startOf('year').format('YYYY-MM-DD');
    const selectedDate = dayValue.startOf('day').format('YYYY-MM-DD');

    setDailyNotesLoading(true);
    fetchDashboardNoteCounts(
      {
        startDate: yearStartDate,
        endDate: selectedDate,
        platform: activeQueryPlatform,
      },
      {
        signal: controller.signal,
        requestKey: 'dashboard-notes-counts',
      }
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setDailyNoteCountsByDate(payload.countsByDate || {});
      })
      .catch((error) => {
        if (cancelled || isRequestCanceled(error)) {
          return;
        }
        resetDailyNoteCountsData();
      })
      .finally(() => {
        if (!cancelled) {
          setDailyNotesLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeQueryPlatform,
    dayValue,
    isAuthenticated,
    isBusinessDimension,
    isDayMode,
    notesReloadToken,
    resetDailyNoteCountsData,
    resetDailyNoteCountsState,
    setDailyNoteCountsByDate,
    setDailyNotesLoading,
  ]);
}
