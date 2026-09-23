import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';

import { NOTE_TEXT_MAX_LENGTH } from './dashboard-config';
import type { NoteMetricKey, QueryPlatform } from './dashboard-config';
import {
  buildCreateNotePayload,
  buildUpdateNotePayload,
  validateDashboardNoteDraft,
} from './dashboard-note-actions';
import {
  createDashboardNote,
  deleteDashboardNote,
  updateDashboardNote,
} from './dashboard-fetchers';

type DashboardNoteMutationHandlersArgs = {
  activeQueryPlatform: QueryPlatform;
  canWriteDailyNote: boolean;
  messageApi: MessageInstance;
  noteDraftDate: string;
  selectedNoteDate: string | null;
  noteMetricKey: NoteMetricKey;
  noteActionText: string;
  noteReasonText: string;
  noteSummaryText: string;
  editMetricKey: NoteMetricKey;
  editActionText: string;
  editReasonText: string;
  editSummaryText: string;
  editingNoteId: number | null;
  isSavingNote: boolean;
  isUpdatingNote: boolean;
  deletingNoteId: number | null;
  setIsSavingNote: Dispatch<SetStateAction<boolean>>;
  setIsUpdatingNote: Dispatch<SetStateAction<boolean>>;
  setDeletingNoteId: Dispatch<SetStateAction<number | null>>;
  setSelectedNoteDate: Dispatch<SetStateAction<string | null>>;
  requestNotesReload: () => void;
  resetNoteDraftText: () => void;
  resetEditingNoteState: () => void;
  resetUpdatingNoteState: () => void;
  resetDeletingNoteState: () => void;
};

export function useDashboardNoteMutationHandlers({
  activeQueryPlatform,
  canWriteDailyNote,
  messageApi,
  noteDraftDate,
  selectedNoteDate,
  noteMetricKey,
  noteActionText,
  noteReasonText,
  noteSummaryText,
  editMetricKey,
  editActionText,
  editReasonText,
  editSummaryText,
  editingNoteId,
  isSavingNote,
  isUpdatingNote,
  deletingNoteId,
  setIsSavingNote,
  setIsUpdatingNote,
  setDeletingNoteId,
  setSelectedNoteDate,
  requestNotesReload,
  resetNoteDraftText,
  resetEditingNoteState,
  resetUpdatingNoteState,
  resetDeletingNoteState,
}: DashboardNoteMutationHandlersArgs) {
  const handleCreateDailyNote = useCallback(async () => {
    if (!canWriteDailyNote) {
      messageApi.info('仅运营/管理员/超级管理员可写日报，请切换到具体平台后再填写。');
      return;
    }

    if (isSavingNote) {
      return;
    }

    const targetDate = noteDraftDate || selectedNoteDate;
    if (!targetDate) {
      messageApi.warning('请先选择日报日期。');
      return;
    }

    const validation = validateDashboardNoteDraft(
      {
        actionText: noteActionText,
        reasonText: noteReasonText,
        summaryText: noteSummaryText,
      },
      NOTE_TEXT_MAX_LENGTH
    );
    if (!validation.ok) {
      messageApi.warning(validation.message);
      return;
    }

    setIsSavingNote(true);
    try {
      await createDashboardNote(
        buildCreateNotePayload({
          noteDate: targetDate,
          platform: activeQueryPlatform,
          metricKey: noteMetricKey,
          values: validation.values,
        })
      );

      messageApi.success('日报已保存');
      resetNoteDraftText();
      setSelectedNoteDate(targetDate);
      requestNotesReload();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '保存日报失败，请稍后重试';
      messageApi.error(messageText);
    } finally {
      setIsSavingNote(false);
    }
  }, [
    activeQueryPlatform,
    canWriteDailyNote,
    isSavingNote,
    messageApi,
    noteActionText,
    noteDraftDate,
    noteMetricKey,
    noteReasonText,
    noteSummaryText,
    requestNotesReload,
    resetNoteDraftText,
    selectedNoteDate,
    setIsSavingNote,
    setSelectedNoteDate,
  ]);

  const handleCancelEditDailyNote = useCallback(() => {
    resetEditingNoteState();
  }, [resetEditingNoteState]);

  const handleSaveEditDailyNote = useCallback(async (noteId: number) => {
    if (isUpdatingNote) {
      return;
    }

    const validation = validateDashboardNoteDraft(
      {
        actionText: editActionText,
        reasonText: editReasonText,
        summaryText: editSummaryText,
      },
      NOTE_TEXT_MAX_LENGTH
    );
    if (!validation.ok) {
      messageApi.warning(validation.message);
      return;
    }

    setIsUpdatingNote(true);
    try {
      await updateDashboardNote(
        noteId,
        buildUpdateNotePayload({
          metricKey: editMetricKey,
          values: validation.values,
        })
      );
      messageApi.success('日报已更新');
      handleCancelEditDailyNote();
      requestNotesReload();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '更新日报失败，请稍后重试';
      messageApi.error(messageText);
      resetUpdatingNoteState();
    }
  }, [
    editActionText,
    editMetricKey,
    editReasonText,
    editSummaryText,
    handleCancelEditDailyNote,
    isUpdatingNote,
    messageApi,
    requestNotesReload,
    resetUpdatingNoteState,
    setIsUpdatingNote,
  ]);

  const handleDeleteDailyNote = useCallback(async (noteId: number) => {
    if (deletingNoteId) {
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('确认删除这条日报？删除后不可恢复。');
      if (!confirmed) {
        return;
      }
    }

    setDeletingNoteId(noteId);
    try {
      await deleteDashboardNote(noteId);
      messageApi.success('日报已删除');
      if (editingNoteId === noteId) {
        handleCancelEditDailyNote();
      }
      requestNotesReload();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '删除日报失败，请稍后重试';
      messageApi.error(messageText);
    } finally {
      resetDeletingNoteState();
    }
  }, [
    deletingNoteId,
    editingNoteId,
    handleCancelEditDailyNote,
    messageApi,
    requestNotesReload,
    resetDeletingNoteState,
    setDeletingNoteId,
  ]);

  return {
    handleCreateDailyNote,
    handleCancelEditDailyNote,
    handleSaveEditDailyNote,
    handleDeleteDailyNote,
  };
}
