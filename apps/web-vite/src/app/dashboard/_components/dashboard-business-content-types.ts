import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { Dayjs } from 'dayjs';

import type { PlatformTabKey, QueryPlatform, NoteMetricKey } from './dashboard-config';
import type { DashboardDateRangeLike } from './dashboard-date-range';
import type { OverviewNotePlatformFilter } from './dashboard-note-model';
import type { DashboardOverviewDetailTableClassNames } from './dashboard-overview-detail-columns';
import type {
  DashboardDailyNoteRow,
  DashboardOverviewDetailRow,
  DashboardOverviewNowcastQuality,
  DashboardOverviewSeriesRow,
  DashboardSnapshot,
} from './dashboard-types';

export type DashboardDetailSectionShellProps = {
  isAuthenticated: boolean;
  isMobile: boolean;
  onNavigateLogin: () => void;
};

export type DashboardBusinessContentArgs = {
  isAuthenticated: boolean;
  isMobile: boolean;
  isBusinessDimension: boolean;
  isDayMode: boolean;
  dateMode: 'day' | 'week' | 'month' | 'year' | 'custom';
  currentRange: DashboardDateRangeLike;
  activeTab: PlatformTabKey;
  activeQueryPlatform: QueryPlatform;
  canWriteDailyNote: boolean;
  messageApi: MessageInstance;
  dayValue: Dayjs;
  detailSectionShellProps: DashboardDetailSectionShellProps;
  overviewLoadError: string | null;
  realSnapshot: DashboardSnapshot | null;
  fallbackSnapshot: DashboardSnapshot;
  detailNowcastAsOfDate: string | null;
  overviewNowcastAsOfDate: string | null;
  overviewNowcastQuality: DashboardOverviewNowcastQuality | null;
  dayYearTrendSeries: readonly DashboardOverviewSeriesRow[];
  weekYearTrendSeries: readonly DashboardOverviewSeriesRow[];
  monthYearTrendSeries: readonly DashboardOverviewSeriesRow[];
  detailRows: DashboardOverviewDetailRow[];
  detailLoading: boolean;
  isExportingDetails: boolean;
  setIsExportingDetails: Dispatch<SetStateAction<boolean>>;
  dailyNoteCountsByDate: Record<string, number>;
  dailyNotes: readonly DashboardDailyNoteRow[];
  dailyNotesLoading: boolean;
  selectedDateNotesLoading: boolean;
  showNoteMarkers: boolean;
  toggleNoteMarkers: () => void;
  overviewNotePlatformFilter: OverviewNotePlatformFilter;
  setOverviewNotePlatformFilter: Dispatch<SetStateAction<OverviewNotePlatformFilter>>;
  isNoteDrawerOpen: boolean;
  selectedNoteDate: string | null;
  setSelectedNoteDate: Dispatch<SetStateAction<string | null>>;
  openNoteDrawer: (noteDate: string) => void;
  closeDailyNoteDrawer: () => void;
  noteDraftDate: string;
  setNoteDraftDate: Dispatch<SetStateAction<string>>;
  noteMetricKey: NoteMetricKey;
  setNoteMetricKey: Dispatch<SetStateAction<NoteMetricKey>>;
  noteActionText: string;
  setNoteActionText: Dispatch<SetStateAction<string>>;
  noteReasonText: string;
  setNoteReasonText: Dispatch<SetStateAction<string>>;
  noteSummaryText: string;
  setNoteSummaryText: Dispatch<SetStateAction<string>>;
  resetNoteDraftText: () => void;
  editingNoteId: number | null;
  editMetricKey: NoteMetricKey;
  setEditMetricKey: Dispatch<SetStateAction<NoteMetricKey>>;
  editActionText: string;
  setEditActionText: Dispatch<SetStateAction<string>>;
  editReasonText: string;
  setEditReasonText: Dispatch<SetStateAction<string>>;
  editSummaryText: string;
  setEditSummaryText: Dispatch<SetStateAction<string>>;
  clearEditingNoteId: () => void;
  startEditingNoteDraft: (note: DashboardDailyNoteRow) => void;
  isSavingNote: boolean;
  setIsSavingNote: Dispatch<SetStateAction<boolean>>;
  isUpdatingNote: boolean;
  setIsUpdatingNote: Dispatch<SetStateAction<boolean>>;
  deletingNoteId: number | null;
  setDeletingNoteId: Dispatch<SetStateAction<number | null>>;
  requestNotesReload: () => void;
  resetEditingNoteState: () => void;
  resetUpdatingNoteState: () => void;
  resetDeletingNoteState: () => void;
  overviewDetailTableClassNames: DashboardOverviewDetailTableClassNames;
};

export type DashboardBusinessContent = {
  businessContent: ReactNode;
  snapshot: DashboardSnapshot;
};
