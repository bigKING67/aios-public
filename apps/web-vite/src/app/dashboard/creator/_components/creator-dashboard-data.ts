'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import { request } from '@/lib/request';
import type { DateRange } from './creator-date-range';
import { normalizeErrorMessage } from './creator-helpers';

export interface UseCreatorDashboardDataParams {
  isDateBoundsReady: boolean;
  currentRange: DateRange;
  previousRange: DateRange;
  overviewEndpoint: string;
  overviewRequestKey: string;
  detailsEndpoint: string;
  detailsRequestKey: string;
  includePreviousDetails?: boolean;
  previousDetailsRequestKey?: string;
  errorFallbackMessage: string;
  messageApi: MessageInstance;
}

export interface UseCreatorDashboardDataResult<TOverview, TDetails> {
  overviewData: TOverview | null;
  detailsData: TDetails | null;
  previousDetailsData: TDetails | null;
  loading: boolean;
  loadError: string;
  reload: () => Promise<void>;
}

export function useCreatorDashboardData<TOverview, TDetails>({
  isDateBoundsReady,
  currentRange,
  previousRange,
  overviewEndpoint,
  overviewRequestKey,
  detailsEndpoint,
  detailsRequestKey,
  includePreviousDetails = false,
  previousDetailsRequestKey,
  errorFallbackMessage,
  messageApi,
}: UseCreatorDashboardDataParams): UseCreatorDashboardDataResult<TOverview, TDetails> {
  const [overviewData, setOverviewData] = useState<TOverview | null>(null);
  const [detailsData, setDetailsData] = useState<TDetails | null>(null);
  const [previousDetailsData, setPreviousDetailsData] = useState<TDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    const startDate = currentRange.start.format('YYYY-MM-DD');
    const endDate = currentRange.end.format('YYYY-MM-DD');
    const prevStartDate = previousRange.start.format('YYYY-MM-DD');
    const prevEndDate = previousRange.end.format('YYYY-MM-DD');

    try {
      const [overviewPayload, detailsPayload, previousDetailsPayload] = await Promise.all([
        request.get<TOverview>(overviewEndpoint, {
          params: {
            start_date: startDate,
            end_date: endDate,
            prev_start_date: prevStartDate,
            prev_end_date: prevEndDate,
          },
          requestKey: overviewRequestKey,
          cancelPrevious: true,
        }),
        request.get<TDetails>(detailsEndpoint, {
          params: {
            start_date: startDate,
            end_date: endDate,
          },
          requestKey: detailsRequestKey,
          cancelPrevious: true,
        }),
        includePreviousDetails
          ? request.get<TDetails>(detailsEndpoint, {
              params: {
                start_date: prevStartDate,
                end_date: prevEndDate,
              },
              requestKey: previousDetailsRequestKey ?? `${detailsRequestKey}-previous`,
              cancelPrevious: true,
            })
          : Promise.resolve(null),
      ]);

      setOverviewData(overviewPayload);
      setDetailsData(detailsPayload);
      setPreviousDetailsData(previousDetailsPayload);
    } catch (error) {
      const messageText = normalizeErrorMessage(error, errorFallbackMessage);
      if (messageText) {
        setLoadError(messageText);
        messageApi.error(messageText);
      }
    } finally {
      setLoading(false);
    }
  }, [
    currentRange.end,
    currentRange.start,
    detailsEndpoint,
    detailsRequestKey,
    errorFallbackMessage,
    includePreviousDetails,
    messageApi,
    overviewEndpoint,
    overviewRequestKey,
    previousDetailsRequestKey,
    previousRange.end,
    previousRange.start,
  ]);

  useEffect(() => {
    if (!isDateBoundsReady) {
      return;
    }
    void reload();
  }, [isDateBoundsReady, reload]);

  return {
    overviewData,
    detailsData,
    previousDetailsData,
    loading,
    loadError,
    reload,
  };
}
