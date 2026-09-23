'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { request } from '@/lib/request';
import {
  BUSINESS_WEEK_LOCALE,
  EMPTY_CREATOR_DATE_BOUNDS,
  type CreatorAvailableDateBounds,
  type DateMode,
} from './creator-date-range';
import { isValidDateLiteral } from './creator-helpers';

export interface CreatorDateBoundsPayload {
  minDate: string | null;
  maxDate: string | null;
}

export interface UseCreatorDateBoundsInitializerParams {
  endpoint: string;
  requestKey: string;
  onDateModeChange: (value: DateMode) => void;
  onDayValueChange: Dispatch<SetStateAction<Dayjs>>;
  onWeekValueChange: Dispatch<SetStateAction<Dayjs>>;
  onMonthValueChange: Dispatch<SetStateAction<Dayjs>>;
  onYearValueChange: Dispatch<SetStateAction<Dayjs>>;
  onCustomRangeChange: Dispatch<SetStateAction<[Dayjs, Dayjs]>>;
  onDateBoundsChange: Dispatch<SetStateAction<CreatorAvailableDateBounds>>;
}

export function useCreatorDateBoundsInitializer({
  endpoint,
  requestKey,
  onDateModeChange,
  onDayValueChange,
  onWeekValueChange,
  onMonthValueChange,
  onYearValueChange,
  onCustomRangeChange,
  onDateBoundsChange,
}: UseCreatorDateBoundsInitializerParams): boolean {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isDisposed = false;

    const initializeDateBounds = async () => {
      setIsReady(false);
      onDateBoundsChange(EMPTY_CREATOR_DATE_BOUNDS);

      try {
        const boundsPayload = await request.get<CreatorDateBoundsPayload>(endpoint, {
          requestKey,
          cancelPrevious: true,
        });

        if (isDisposed) {
          return;
        }

        const minDate = boundsPayload?.minDate;
        const maxDate = boundsPayload?.maxDate;
        if (!isValidDateLiteral(minDate) || !isValidDateLiteral(maxDate)) {
          return;
        }

        const minBound = dayjs(minDate, 'YYYY-MM-DD').startOf('day');
        const maxBound = dayjs(maxDate, 'YYYY-MM-DD').startOf('day');
        if (!minBound.isValid() || !maxBound.isValid() || minBound.isAfter(maxBound)) {
          return;
        }

        const defaultEnd = maxBound;
        const defaultStartCandidate = defaultEnd.subtract(364, 'day').startOf('day');
        const defaultStart = defaultStartCandidate.isBefore(minBound, 'day') ? minBound : defaultStartCandidate;

        onDateBoundsChange({ minDate: minBound, maxDate: maxBound });
        onDayValueChange(maxBound);
        onWeekValueChange(maxBound.locale(BUSINESS_WEEK_LOCALE));
        onMonthValueChange(maxBound.startOf('month'));
        onYearValueChange(maxBound.startOf('year'));
        onDateModeChange('month');
        onCustomRangeChange((previousValue) => {
          if (previousValue[0].isSame(defaultStart, 'day') && previousValue[1].isSame(defaultEnd, 'day')) {
            return previousValue;
          }
          return [defaultStart, defaultEnd];
        });
        setIsReady(true);
      } catch {
        if (!isDisposed) {
          onDateBoundsChange(EMPTY_CREATOR_DATE_BOUNDS);
          setIsReady(false);
        }
      }
    };

    void initializeDateBounds();
    return () => {
      isDisposed = true;
    };
  }, [
    endpoint,
    onCustomRangeChange,
    onDateBoundsChange,
    onDateModeChange,
    onDayValueChange,
    onMonthValueChange,
    onWeekValueChange,
    onYearValueChange,
    requestKey,
  ]);

  return isReady;
}
