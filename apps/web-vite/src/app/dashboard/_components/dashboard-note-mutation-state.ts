import { useCallback, useState } from 'react';

export function useDashboardNoteMutationState() {
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  const [notesReloadToken, setNotesReloadToken] = useState(0);

  const requestNotesReload = useCallback(() => {
    setNotesReloadToken((value) => value + 1);
  }, []);

  const resetUpdatingNoteState = useCallback(() => {
    setIsUpdatingNote(false);
  }, []);

  const resetDeletingNoteState = useCallback(() => {
    setDeletingNoteId(null);
  }, []);

  return {
    isSavingNote,
    setIsSavingNote,
    isUpdatingNote,
    setIsUpdatingNote,
    deletingNoteId,
    setDeletingNoteId,
    notesReloadToken,
    requestNotesReload,
    resetUpdatingNoteState,
    resetDeletingNoteState,
  };
}
