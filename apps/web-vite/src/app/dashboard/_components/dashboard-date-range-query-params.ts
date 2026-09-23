import type { Dayjs } from 'dayjs';
import type {
  DashboardDimension,
  DateMode,
  PlatformTabKey,
} from './dashboard-config';

export type DashboardDateRangeLike = {
  start: Dayjs;
  end: Dayjs;
};

export type DashboardQueryDateRangeParams = {
  startDate: string;
  endDate: string;
};

export type DashboardCompareQueryDateRangeParams = DashboardQueryDateRangeParams & {
  prevStartDate: string;
  prevEndDate: string;
};

export function buildDashboardFilterSearchParams(state: {
  activeDimension: DashboardDimension;
  activeTab: PlatformTabKey;
  dateMode: DateMode;
  dayValue: Dayjs;
  weekValue: Dayjs;
  monthValue: Dayjs;
  yearValue: Dayjs;
  customRange: [Dayjs, Dayjs];
}): string {
  const params = new URLSearchParams();
  params.set('dimension', state.activeDimension);
  params.set('tab', state.activeTab);
  params.set('mode', state.dateMode);
  params.set('day', state.dayValue.format('YYYY-MM-DD'));
  params.set('week', state.weekValue.startOf('day').format('YYYY-MM-DD'));
  params.set('month', state.monthValue.format('YYYY-MM'));
  params.set('year', state.yearValue.format('YYYY'));
  params.set('start', state.customRange[0].format('YYYY-MM-DD'));
  params.set('end', state.customRange[1].format('YYYY-MM-DD'));
  return params.toString();
}

export function formatDashboardIsoDate(date: Dayjs): string {
  return date.format('YYYY-MM-DD');
}

export function buildDashboardQueryDateRangeParams(dateRange: DashboardDateRangeLike): DashboardQueryDateRangeParams {
  return {
    startDate: formatDashboardIsoDate(dateRange.start),
    endDate: formatDashboardIsoDate(dateRange.end),
  };
}

export function buildDashboardCompareQueryDateRangeParams(
  currentRange: DashboardDateRangeLike,
  previousRange: DashboardDateRangeLike,
): DashboardCompareQueryDateRangeParams {
  const { startDate, endDate } = buildDashboardQueryDateRangeParams(currentRange);
  return {
    startDate,
    endDate,
    prevStartDate: formatDashboardIsoDate(previousRange.start),
    prevEndDate: formatDashboardIsoDate(previousRange.end),
  };
}

export function formatDashboardDisplayDate(date: Dayjs): string {
  return date.format('YYYY/MM/DD');
}

export function formatDashboardDisplayRangeLabel(startDate: Dayjs, endDate: Dayjs): string {
  return `${formatDashboardDisplayDate(startDate)} - ${formatDashboardDisplayDate(endDate)}`;
}
