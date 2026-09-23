import { getQueryPlatformLabel } from './dashboard-config';
import type { QueryPlatform } from './dashboard-config';
import type { DashboardDailyNoteRow } from './dashboard-types';

export type DashboardNotePlatform = Exclude<QueryPlatform, 'overview'>;
export type OverviewNotePlatformFilter = 'all' | DashboardNotePlatform;
export type DashboardNotePlatformGroup = [DashboardNotePlatform, DashboardDailyNoteRow[]];

export function getDashboardNoteDrawerTitle(selectedNoteDate: string | null): string {
  return selectedNoteDate ? `日报 · ${selectedNoteDate}` : '日报';
}

export function getDashboardNoteCount(
  selectedNoteDate: string | null,
  countsByDate: Record<string, number>
): number {
  return selectedNoteDate ? countsByDate[selectedNoteDate] || 0 : 0;
}

export function getDashboardNoteCountLabel(count: number): string {
  return `当日 ${count} 条`;
}

export function getDashboardNoteCountTagColor(count: number): 'processing' | 'default' {
  return count > 0 ? 'processing' : 'default';
}

export function getDashboardNoteEmptyText(params: {
  activeQueryPlatform: QueryPlatform;
  overviewNotePlatformFilter: OverviewNotePlatformFilter;
}): string {
  if (params.activeQueryPlatform === 'overview' && params.overviewNotePlatformFilter !== 'all') {
    return '当前平台筛选下暂无日报记录。';
  }
  return '当天暂无日报记录。';
}

export function buildOverviewNotePlatformGroups(params: {
  activeQueryPlatform: QueryPlatform;
  notes: readonly DashboardDailyNoteRow[];
}): DashboardNotePlatformGroup[] {
  if (params.activeQueryPlatform !== 'overview') {
    return [];
  }

  const grouped = new Map<DashboardNotePlatform, DashboardDailyNoteRow[]>();
  for (const note of params.notes) {
    const list = grouped.get(note.platform);
    if (list) {
      list.push(note);
    } else {
      grouped.set(note.platform, [note]);
    }
  }

  return Array.from(grouped.entries()).sort(([left], [right]) =>
    getQueryPlatformLabel(left).localeCompare(getQueryPlatformLabel(right), 'zh-CN')
  );
}

export function filterDashboardNotesByPlatform(params: {
  activeQueryPlatform: QueryPlatform;
  notes: readonly DashboardDailyNoteRow[];
  overviewNotePlatformFilter: OverviewNotePlatformFilter;
}): readonly DashboardDailyNoteRow[] {
  if (params.activeQueryPlatform !== 'overview') {
    return params.notes;
  }
  if (params.overviewNotePlatformFilter === 'all') {
    return params.notes;
  }
  return params.notes.filter((item) => item.platform === params.overviewNotePlatformFilter);
}

export function resolveOverviewNotePlatformFilter(params: {
  activeQueryPlatform: QueryPlatform;
  notes: readonly DashboardDailyNoteRow[];
  overviewNotePlatformFilter: OverviewNotePlatformFilter;
}): OverviewNotePlatformFilter {
  if (params.activeQueryPlatform !== 'overview') {
    return 'all';
  }
  if (params.overviewNotePlatformFilter === 'all') {
    return 'all';
  }
  return params.notes.some((item) => item.platform === params.overviewNotePlatformFilter)
    ? params.overviewNotePlatformFilter
    : 'all';
}
