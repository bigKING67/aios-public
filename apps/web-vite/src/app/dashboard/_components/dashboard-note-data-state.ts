import { useCallback, useState } from 'react';

import type { DashboardDailyNoteRow } from './dashboard-types';

export function useDashboardDailyNoteCountsState() {
  const [dailyNoteCountsByDate, setDailyNoteCountsByDate] = useState<Record<string, number>>({});
  const [dailyNotesLoading, setDailyNotesLoading] = useState(false);

  const resetDailyNoteCountsData = useCallback(() => {
    setDailyNoteCountsByDate({});
  }, []);

  const resetDailyNoteCountsState = useCallback(() => {
    resetDailyNoteCountsData();
    setDailyNotesLoading(false);
  }, [resetDailyNoteCountsData]);

  return {
    dailyNoteCountsByDate,
    setDailyNoteCountsByDate,
    dailyNotesLoading,
    setDailyNotesLoading,
    resetDailyNoteCountsData,
    resetDailyNoteCountsState,
  };
}

export function useDashboardSelectedDateNotesState() {
  const [dailyNotes, setDailyNotes] = useState<DashboardDailyNoteRow[]>([]);
  const [selectedDateNotesLoading, setSelectedDateNotesLoading] = useState(false);

  const resetSelectedDateNotesData = useCallback(() => {
    setDailyNotes([]);
  }, []);

  const resetSelectedDateNotesBaseState = useCallback(() => {
    resetSelectedDateNotesData();
    setSelectedDateNotesLoading(false);
  }, [resetSelectedDateNotesData]);

  return {
    dailyNotes,
    setDailyNotes,
    selectedDateNotesLoading,
    setSelectedDateNotesLoading,
    resetSelectedDateNotesData,
    resetSelectedDateNotesBaseState,
  };
}
