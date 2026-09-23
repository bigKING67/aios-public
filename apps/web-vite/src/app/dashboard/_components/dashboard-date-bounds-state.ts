import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { Dayjs } from 'dayjs';

import {
  MAX_DASHBOARD_QUERY_DAYS,
  type DashboardDimension,
  type QueryPlatform,
} from './dashboard-config';
import {
  clampCustomRangeToAvailableBounds,
  clampDateToAvailableBounds,
  clampPickerValueToAvailableBounds,
  parseDateLiteral,
} from './dashboard-date-range';
import { fetchDashboardDateBounds } from './dashboard-fetchers';
import type { DashboardDateBoundsApiResponse } from './dashboard-fetcher-types';

export type DashboardAvailableDateBounds = {
  minDate: Dayjs | null;
  maxDate: Dayjs | null;
};

export type DashboardDateBoundsStatus = 'loading' | 'ready' | 'empty' | 'error';

export type DashboardDateBoundsState = {
  dateBounds: DashboardAvailableDateBounds;
  isDateBoundsReady: boolean;
  dateBoundsStatus: DashboardDateBoundsStatus;
  dateBoundsError: unknown;
};

type UseDashboardDateBoundsClampEffectParams = {
  dateBounds: DashboardAvailableDateBounds;
  isDateBoundsReady: boolean;
  dayValue: Dayjs;
  weekValue: Dayjs;
  monthValue: Dayjs;
  yearValue: Dayjs;
  customRange: [Dayjs, Dayjs];
  setDayValue: Dispatch<SetStateAction<Dayjs>>;
  setWeekValue: Dispatch<SetStateAction<Dayjs>>;
  setMonthValue: Dispatch<SetStateAction<Dayjs>>;
  setYearValue: Dispatch<SetStateAction<Dayjs>>;
  setCustomRange: Dispatch<SetStateAction<[Dayjs, Dayjs]>>;
};

const EMPTY_DASHBOARD_DATE_BOUNDS: DashboardAvailableDateBounds = {
  minDate: null,
  maxDate: null,
};

function normalizeDashboardDateBounds(
  payload: DashboardDateBoundsApiResponse | null | undefined
): DashboardAvailableDateBounds {
  const minDate = parseDateLiteral(payload?.minDate || undefined);
  const maxDate = parseDateLiteral(payload?.maxDate || undefined);

  if (minDate && maxDate && minDate.isAfter(maxDate, 'day')) {
    return EMPTY_DASHBOARD_DATE_BOUNDS;
  }

  return {
    minDate,
    maxDate,
  };
}

function hasUsableDashboardDateBounds(bounds: DashboardAvailableDateBounds): boolean {
  return Boolean(bounds.minDate && bounds.maxDate);
}

export function useDashboardDateBounds({
  dimension,
  platform,
}: {
  dimension: DashboardDimension;
  platform: QueryPlatform;
}): DashboardDateBoundsState {
  const dateBoundsKey = `${platform}:${dimension}`;
  const [dateBounds, setDateBounds] = useState<DashboardAvailableDateBounds>(EMPTY_DASHBOARD_DATE_BOUNDS);
  const [dateBoundsStatus, setDateBoundsStatus] = useState<DashboardDateBoundsStatus>('loading');
  const [dateBoundsError, setDateBoundsError] = useState<unknown>(null);
  const [loadedDateBoundsKey, setLoadedDateBoundsKey] = useState<string | null>(null);

  useEffect(() => {
    let isDisposed = false;
    const controller = new AbortController();
    setDateBoundsStatus('loading');
    setDateBounds(EMPTY_DASHBOARD_DATE_BOUNDS);
    setDateBoundsError(null);
    setLoadedDateBoundsKey(null);

    void fetchDashboardDateBounds(
      { dimension, platform },
      {
        signal: controller.signal,
        requestKey: `dashboard-date-bounds:${dateBoundsKey}`,
      }
    )
      .then((payload) => {
        if (isDisposed) {
          return;
        }
        const nextBounds = normalizeDashboardDateBounds(payload);
        setDateBounds(nextBounds);
        setLoadedDateBoundsKey(dateBoundsKey);
        setDateBoundsStatus(hasUsableDashboardDateBounds(nextBounds) ? 'ready' : 'empty');
        setDateBoundsError(null);
      })
      .catch((error) => {
        if (isDisposed || controller.signal.aborted) {
          return;
        }
        setDateBounds(EMPTY_DASHBOARD_DATE_BOUNDS);
        setLoadedDateBoundsKey(dateBoundsKey);
        setDateBoundsError(error);
        setDateBoundsStatus('error');
      });

    return () => {
      isDisposed = true;
      controller.abort();
    };
  }, [dateBoundsKey, dimension, platform]);

  return useMemo(() => {
    const isCurrentDateBounds = loadedDateBoundsKey === dateBoundsKey;
    const effectiveDateBounds = isCurrentDateBounds ? dateBounds : EMPTY_DASHBOARD_DATE_BOUNDS;
    const effectiveDateBoundsStatus = isCurrentDateBounds ? dateBoundsStatus : 'loading';

    return {
      dateBounds: effectiveDateBounds,
      isDateBoundsReady: effectiveDateBoundsStatus === 'ready',
      dateBoundsStatus: effectiveDateBoundsStatus,
      dateBoundsError: isCurrentDateBounds ? dateBoundsError : null,
    };
  }, [dateBounds, dateBoundsError, dateBoundsKey, dateBoundsStatus, loadedDateBoundsKey]);
}

export function useDashboardDateBoundsClampEffect({
  dateBounds,
  isDateBoundsReady,
  dayValue,
  weekValue,
  monthValue,
  yearValue,
  customRange,
  setDayValue,
  setWeekValue,
  setMonthValue,
  setYearValue,
  setCustomRange,
}: UseDashboardDateBoundsClampEffectParams): void {
  useEffect(() => {
    if (!isDateBoundsReady) {
      return;
    }

    setDayValue((previousValue) => {
      const nextValue = clampDateToAvailableBounds(previousValue, dateBounds);
      return previousValue.isSame(nextValue, 'day') ? previousValue : nextValue;
    });

    setWeekValue((previousValue) => {
      const nextValue = clampPickerValueToAvailableBounds(previousValue, 'week', dateBounds);
      return previousValue.isSame(nextValue, 'day') ? previousValue : nextValue;
    });

    setMonthValue((previousValue) => {
      const nextValue = clampPickerValueToAvailableBounds(previousValue, 'month', dateBounds);
      return previousValue.isSame(nextValue, 'day') ? previousValue : nextValue;
    });

    setYearValue((previousValue) => {
      const nextValue = clampPickerValueToAvailableBounds(previousValue, 'year', dateBounds);
      return previousValue.isSame(nextValue, 'day') ? previousValue : nextValue;
    });

    setCustomRange((previousValue) => {
      const nextValue = clampCustomRangeToAvailableBounds(
        previousValue,
        dateBounds,
        MAX_DASHBOARD_QUERY_DAYS
      );
      return previousValue[0].isSame(nextValue[0], 'day') &&
        previousValue[1].isSame(nextValue[1], 'day')
        ? previousValue
        : nextValue;
    });
  }, [
    customRange,
    dateBounds,
    dayValue,
    isDateBoundsReady,
    monthValue,
    setCustomRange,
    setDayValue,
    setMonthValue,
    setWeekValue,
    setYearValue,
    weekValue,
    yearValue,
  ]);
}
