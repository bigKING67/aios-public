import { useEffect, type Dispatch, type SetStateAction } from 'react';

import type { QueryPlatform } from './dashboard-config';
import { isRequestCanceled } from './dashboard-errors';
import { fetchDashboardNotesForDate } from './dashboard-fetchers';
import type { DashboardDailyNoteRow } from './dashboard-types';

type DashboardSelectedDateNotesRequestEffectArgs = {
  isAuthenticated: boolean;
  isBusinessDimension: boolean;
  isDayMode: boolean;
  activeQueryPlatform: QueryPlatform;
  selectedNoteDate: string | null;
  notesReloadToken: number;
  setDailyNotes: Dispatch<SetStateAction<DashboardDailyNoteRow[]>>;
  setSelectedDateNotesLoading: Dispatch<SetStateAction<boolean>>;
  resetSelectedDateNotesData: () => void;
  resetSelectedDateNotesState: () => void;
};

export function useDashboardSelectedDateNotesRequestEffect({
  isAuthenticated,
  isBusinessDimension,
  isDayMode,
  activeQueryPlatform,
  selectedNoteDate,
  notesReloadToken,
  setDailyNotes,
  setSelectedDateNotesLoading,
  resetSelectedDateNotesData,
  resetSelectedDateNotesState,
}: DashboardSelectedDateNotesRequestEffectArgs) {
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    if (!isAuthenticated || !isBusinessDimension || !isDayMode || !selectedNoteDate) {
      resetSelectedDateNotesState();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    setSelectedDateNotesLoading(true);
    fetchDashboardNotesForDate(
      {
        noteDate: selectedNoteDate,
        platform: activeQueryPlatform,
      },
      {
        signal: controller.signal,
        requestKey: 'dashboard-notes-selected-date',
      }
    )
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setDailyNotes(Array.isArray(payload.rows) ? payload.rows : []);
      })
      .catch((error) => {
        if (cancelled || isRequestCanceled(error)) {
          return;
        }
        resetSelectedDateNotesData();
      })
      .finally(() => {
        if (!cancelled) {
          setSelectedDateNotesLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeQueryPlatform,
    isAuthenticated,
    isBusinessDimension,
    isDayMode,
    notesReloadToken,
    resetSelectedDateNotesData,
    resetSelectedDateNotesState,
    selectedNoteDate,
    setDailyNotes,
    setSelectedDateNotesLoading,
  ]);
}
