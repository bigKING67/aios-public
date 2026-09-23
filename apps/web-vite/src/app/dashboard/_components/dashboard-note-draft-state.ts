import { useCallback, useState } from 'react';

import { NOTE_METRIC_OPTIONS } from './dashboard-config';
import type { NoteMetricKey } from './dashboard-config';
import { resolveDashboardNoteMetricKey } from './dashboard-note-actions';
import type { DashboardDailyNoteRow } from './dashboard-types';

const DEFAULT_NOTE_METRIC_KEY: NoteMetricKey = 'gmv';

export function useDashboardCreateNoteDraftState() {
  const [noteDraftDate, setNoteDraftDate] = useState('');
  const [noteMetricKey, setNoteMetricKey] = useState<NoteMetricKey>(DEFAULT_NOTE_METRIC_KEY);
  const [noteActionText, setNoteActionText] = useState('');
  const [noteReasonText, setNoteReasonText] = useState('');
  const [noteSummaryText, setNoteSummaryText] = useState('');

  const resetNoteDraftText = useCallback(() => {
    setNoteActionText('');
    setNoteReasonText('');
    setNoteSummaryText('');
  }, []);

  return {
    noteDraftDate,
    setNoteDraftDate,
    noteMetricKey,
    setNoteMetricKey,
    noteActionText,
    setNoteActionText,
    noteReasonText,
    setNoteReasonText,
    noteSummaryText,
    setNoteSummaryText,
    resetNoteDraftText,
  };
}

export function useDashboardEditNoteDraftState() {
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editMetricKey, setEditMetricKey] = useState<NoteMetricKey>(DEFAULT_NOTE_METRIC_KEY);
  const [editActionText, setEditActionText] = useState('');
  const [editReasonText, setEditReasonText] = useState('');
  const [editSummaryText, setEditSummaryText] = useState('');

  const clearEditingNoteId = useCallback(() => {
    setEditingNoteId(null);
  }, []);

  const resetEditNoteDraft = useCallback(() => {
    setEditMetricKey(DEFAULT_NOTE_METRIC_KEY);
    setEditActionText('');
    setEditReasonText('');
    setEditSummaryText('');
  }, []);

  const resetEditingNoteDraftState = useCallback(() => {
    clearEditingNoteId();
    resetEditNoteDraft();
  }, [clearEditingNoteId, resetEditNoteDraft]);

  const startEditingNoteDraft = useCallback((note: DashboardDailyNoteRow) => {
    setEditingNoteId(note.id);
    setEditMetricKey(resolveDashboardNoteMetricKey(note.metric_key, NOTE_METRIC_OPTIONS));
    setEditActionText(note.action_text);
    setEditReasonText(note.reason_text);
    setEditSummaryText(note.summary_text);
  }, []);

  return {
    editingNoteId,
    editMetricKey,
    setEditMetricKey,
    editActionText,
    setEditActionText,
    editReasonText,
    setEditReasonText,
    editSummaryText,
    setEditSummaryText,
    clearEditingNoteId,
    resetEditingNoteDraftState,
    startEditingNoteDraft,
  };
}
