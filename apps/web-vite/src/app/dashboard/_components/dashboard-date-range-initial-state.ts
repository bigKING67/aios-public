import dayjs from 'dayjs';
import {
  MAX_DASHBOARD_QUERY_DAYS,
} from './dashboard-config';
import type {
  DashboardInitialState,
  DashboardPageClientInitialFilters,
} from './dashboard-types';
import {
  BUSINESS_WEEK_LOCALE,
} from './dashboard-date-range-constants';
import {
  isDashboardDimension,
  isDateMode,
  isPlatformTabKey,
  normalizeDimensionByTab,
  resolveDefaultTabForDimension,
} from './dashboard-date-range-filters';
import {
  clampCustomRangeToLimit,
  parseDateLiteral,
  parseMonthLiteral,
  parseYearLiteral,
} from './dashboard-date-range-literals';

export function resolveInitialDashboardState(initialFilters?: DashboardPageClientInitialFilters): DashboardInitialState {
  const today = dayjs().startOf('day');
  const defaultDayValue = today.subtract(1, 'day');
  const defaultCustomRange: [dayjs.Dayjs, dayjs.Dayjs] = [today.subtract(6, 'day'), today];
  const parsedMode = initialFilters?.mode?.trim().toLowerCase();

  const candidateDimension = isDashboardDimension(initialFilters?.dimension)
    ? initialFilters.dimension
    : 'business';
  const activeTab = isPlatformTabKey(initialFilters?.tab)
    ? initialFilters.tab
    : resolveDefaultTabForDimension(candidateDimension);
  const activeDimension = normalizeDimensionByTab(activeTab, candidateDimension);
  const dateMode = isDateMode(parsedMode) ? parsedMode : 'month';
  const dayValue = parseDateLiteral(initialFilters?.day) || defaultDayValue;
  const weekValue = (parseDateLiteral(initialFilters?.week) || today).locale(BUSINESS_WEEK_LOCALE);
  const monthValue = parseMonthLiteral(initialFilters?.month) || today.startOf('month');
  const yearValue = parseYearLiteral(initialFilters?.year) || today.startOf('year');

  const parsedCustomStart = parseDateLiteral(initialFilters?.start);
  const parsedCustomEnd = parseDateLiteral(initialFilters?.end);
  const parsedCustomRange =
    parsedCustomStart && parsedCustomEnd && !parsedCustomStart.isAfter(parsedCustomEnd, 'day')
      ? clampCustomRangeToLimit([parsedCustomStart, parsedCustomEnd], MAX_DASHBOARD_QUERY_DAYS)
      : {
          range: defaultCustomRange,
          exceeded: false,
        };

  return {
    activeDimension,
    activeTab,
    dateMode,
    dayValue,
    weekValue,
    monthValue,
    yearValue,
    customRange: parsedCustomRange.range,
    customRangeExceededLimit: parsedCustomRange.exceeded,
  };
}
