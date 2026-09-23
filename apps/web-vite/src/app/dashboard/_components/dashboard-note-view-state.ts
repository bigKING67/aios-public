import { useCallback, useState } from 'react';

import type { OverviewNotePlatformFilter } from './dashboard-note-model';

export function useDashboardNoteViewState() {
  const [showNoteMarkers, setShowNoteMarkers] = useState(false);
  const [overviewNotePlatformFilter, setOverviewNotePlatformFilter] =
    useState<OverviewNotePlatformFilter>('all');

  const toggleNoteMarkers = useCallback(() => {
    setShowNoteMarkers((value) => !value);
  }, []);

  return {
    showNoteMarkers,
    toggleNoteMarkers,
    overviewNotePlatformFilter,
    setOverviewNotePlatformFilter,
  };
}
