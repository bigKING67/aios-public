import { useCallback, useState } from 'react';

export function useDashboardNoteDrawerState() {
  const [isNoteDrawerOpen, setIsNoteDrawerOpen] = useState(false);
  const [selectedNoteDate, setSelectedNoteDate] = useState<string | null>(null);

  const openNoteDrawer = useCallback((noteDate: string) => {
    setSelectedNoteDate(noteDate);
    setIsNoteDrawerOpen(true);
  }, []);

  const closeNoteDrawer = useCallback(() => {
    setIsNoteDrawerOpen(false);
  }, []);

  const resetSelectedNoteDate = useCallback(() => {
    setSelectedNoteDate(null);
  }, []);

  return {
    isNoteDrawerOpen,
    selectedNoteDate,
    setSelectedNoteDate,
    openNoteDrawer,
    closeNoteDrawer,
    resetSelectedNoteDate,
  };
}
