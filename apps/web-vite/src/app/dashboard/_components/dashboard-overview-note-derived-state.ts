import { useMemo } from 'react';

import type { QueryPlatform } from './dashboard-config';
import { buildDashboardNoteMarkPoints } from './dashboard-note-markers';
import {
  buildOverviewNotePlatformGroups,
  filterDashboardNotesByPlatform,
  type OverviewNotePlatformFilter,
} from './dashboard-note-model';
import type { DashboardDailyNoteRow } from './dashboard-types';

type DashboardOverviewNoteDerivedStateArgs = {
  showNoteMarkers: boolean;
  isDayMode: boolean;
  trendDateKeys: readonly string[];
  trendPrimarySeries: readonly number[];
  dailyNoteCountsByDate: Record<string, number>;
  dailyNotes: readonly DashboardDailyNoteRow[];
  activeQueryPlatform: QueryPlatform;
  overviewNotePlatformFilter: OverviewNotePlatformFilter;
};

export function useDashboardOverviewNoteDerivedState({
  showNoteMarkers,
  isDayMode,
  trendDateKeys,
  trendPrimarySeries,
  dailyNoteCountsByDate,
  dailyNotes,
  activeQueryPlatform,
  overviewNotePlatformFilter,
}: DashboardOverviewNoteDerivedStateArgs) {
  const noteMarkPointData = useMemo(() => {
    return buildDashboardNoteMarkPoints({
      showNoteMarkers,
      isDayMode,
      dateKeys: trendDateKeys,
      primarySeries: trendPrimarySeries,
      countsByDate: dailyNoteCountsByDate,
    });
  }, [dailyNoteCountsByDate, isDayMode, showNoteMarkers, trendDateKeys, trendPrimarySeries]);

  const notesForSelectedDate = dailyNotes;

  const overviewNotesByPlatform = useMemo(() => {
    return buildOverviewNotePlatformGroups({
      activeQueryPlatform,
      notes: notesForSelectedDate,
    });
  }, [activeQueryPlatform, notesForSelectedDate]);

  const visibleNotesForSelectedDate = useMemo(() => {
    return filterDashboardNotesByPlatform({
      activeQueryPlatform,
      notes: notesForSelectedDate,
      overviewNotePlatformFilter,
    });
  }, [activeQueryPlatform, notesForSelectedDate, overviewNotePlatformFilter]);

  return {
    noteMarkPointData,
    overviewNotesByPlatform,
    visibleNotesForSelectedDate,
  };
}
