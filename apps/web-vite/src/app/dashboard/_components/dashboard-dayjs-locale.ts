import dayjs from 'dayjs';
import zhCnDayjsLocale from 'dayjs/locale/zh-cn';
import isoWeek from 'dayjs/plugin/isoWeek';

import {
  BUSINESS_WEEK_LOCALE,
  WEEKDAY_LABELS_SUN_FIRST,
} from './dashboard-date-range';

let hasConfiguredDashboardDayjsLocale = false;

export function configureDashboardDayjsLocale() {
  if (hasConfiguredDashboardDayjsLocale) {
    return;
  }

  dayjs.extend(isoWeek);
  dayjs.locale(
    {
      ...zhCnDayjsLocale,
      name: BUSINESS_WEEK_LOCALE,
      weekStart: 6,
      weekdaysMin: WEEKDAY_LABELS_SUN_FIRST,
    },
    undefined,
    true
  );
  hasConfiguredDashboardDayjsLocale = true;
}
