import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { Dayjs } from 'dayjs';

import { DATE_LITERAL_PATTERN } from './dashboard-config';
import { resolveDashboardNoteMarkerClickDate } from './dashboard-note-markers';

type DashboardNoteDrawerHandlersArgs = {
  isBusinessDimension: boolean;
  isDayMode: boolean;
  showNoteMarkers: boolean;
  dayValue: Dayjs;
  selectedNoteDate: string | null;
  dailyNoteCountsByDate: Record<string, number>;
  trendDateKeys: readonly string[];
  clearEditingNoteId: () => void;
  setNoteDraftDate: Dispatch<SetStateAction<string>>;
  setSelectedNoteDate: Dispatch<SetStateAction<string | null>>;
  openNoteDrawer: (noteDate: string) => void;
  closeDailyNoteDrawer: () => void;
  handleCreateDailyNote: () => Promise<void>;
  handleSaveEditDailyNote: (noteId: number) => Promise<void>;
  handleDeleteDailyNote: (noteId: number) => Promise<void>;
};

type DashboardNoteResetHandlersArgs = {
  closeNoteDrawer: () => void;
  resetEditingNoteDraftState: () => void;
  resetUpdatingNoteState: () => void;
  resetSelectedDateNotesBaseState: () => void;
  resetDeletingNoteState: () => void;
};

export function useDashboardNoteResetHandlers({
  closeNoteDrawer,
  resetEditingNoteDraftState,
  resetUpdatingNoteState,
  resetSelectedDateNotesBaseState,
  resetDeletingNoteState,
}: DashboardNoteResetHandlersArgs) {
  const resetEditingNoteState = useCallback(() => {
    resetEditingNoteDraftState();
    resetUpdatingNoteState();
  }, [resetEditingNoteDraftState, resetUpdatingNoteState]);

  const resetSelectedDateNotesState = useCallback(() => {
    resetSelectedDateNotesBaseState();
    resetEditingNoteState();
    resetDeletingNoteState();
  }, [resetDeletingNoteState, resetEditingNoteState, resetSelectedDateNotesBaseState]);

  const closeDailyNoteDrawer = useCallback(() => {
    closeNoteDrawer();
    resetEditingNoteState();
  }, [closeNoteDrawer, resetEditingNoteState]);

  return {
    resetEditingNoteState,
    resetSelectedDateNotesState,
    closeDailyNoteDrawer,
  };
}

export function useDashboardNoteDrawerHandlers({
  isBusinessDimension,
  isDayMode,
  showNoteMarkers,
  dayValue,
  selectedNoteDate,
  dailyNoteCountsByDate,
  trendDateKeys,
  clearEditingNoteId,
  setNoteDraftDate,
  setSelectedNoteDate,
  openNoteDrawer,
  closeDailyNoteDrawer,
  handleCreateDailyNote,
  handleSaveEditDailyNote,
  handleDeleteDailyNote,
}: DashboardNoteDrawerHandlersArgs) {
  const handleOpenDailyNoteDrawer = useCallback((nextDate?: string) => {
    if (!isBusinessDimension) {
      return;
    }
    const fallbackDate = dayValue.startOf('day').format('YYYY-MM-DD');
    const resolvedDate = nextDate || selectedNoteDate || fallbackDate;
    clearEditingNoteId();
    setNoteDraftDate(resolvedDate);
    openNoteDrawer(resolvedDate);
  }, [clearEditingNoteId, dayValue, isBusinessDimension, openNoteDrawer, selectedNoteDate, setNoteDraftDate]);

  const handleTrendPointClick = useCallback((params: unknown) => {
    if (!isBusinessDimension || !isDayMode || !showNoteMarkers) {
      return;
    }

    const dateKey = resolveDashboardNoteMarkerClickDate({
      payload: params,
      dateKeys: trendDateKeys,
      countsByDate: dailyNoteCountsByDate,
      dateLiteralPattern: DATE_LITERAL_PATTERN,
    });
    if (!dateKey) {
      return;
    }

    handleOpenDailyNoteDrawer(dateKey);
  }, [dailyNoteCountsByDate, handleOpenDailyNoteDrawer, isBusinessDimension, isDayMode, showNoteMarkers, trendDateKeys]);

  const handleCloseDailyNoteDrawer = useCallback(() => {
    closeDailyNoteDrawer();
  }, [closeDailyNoteDrawer]);

  const handleNoteDraftDateChange = useCallback((nextDate: string) => {
    setNoteDraftDate(nextDate);
    setSelectedNoteDate(nextDate);
  }, [setNoteDraftDate, setSelectedNoteDate]);

  const handleSaveEditDailyNoteAction = useCallback(
    (noteId: number) => {
      void handleSaveEditDailyNote(noteId);
    },
    [handleSaveEditDailyNote]
  );

  const handleDeleteDailyNoteAction = useCallback(
    (noteId: number) => {
      void handleDeleteDailyNote(noteId);
    },
    [handleDeleteDailyNote]
  );

  const handleCreateDailyNoteAction = useCallback(() => {
    void handleCreateDailyNote();
  }, [handleCreateDailyNote]);

  const handleOpenDailyNoteDrawerAction = useCallback(() => {
    handleOpenDailyNoteDrawer();
  }, [handleOpenDailyNoteDrawer]);

  return {
    handleOpenDailyNoteDrawer,
    handleTrendPointClick,
    handleCloseDailyNoteDrawer,
    handleNoteDraftDateChange,
    handleSaveEditDailyNoteAction,
    handleDeleteDailyNoteAction,
    handleCreateDailyNoteAction,
    handleOpenDailyNoteDrawerAction,
  };
}
