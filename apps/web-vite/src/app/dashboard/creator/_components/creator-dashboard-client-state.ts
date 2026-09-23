'use client';

import { message } from 'antd';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-media-query';
import { selectIsAuthenticated, useAuthStore } from '@/stores/auth.store';
import { useCreatorDateBoundsInitializer } from './creator-date-bounds';
import { useCreatorDashboardDateControls } from './creator-date-controls';
import { useCreatorDashboardData } from './creator-dashboard-data';
import { useCreatorDetailFilters } from './creator-detail-filters';
import { EMPTY_CREATOR_DATE_BOUNDS } from './creator-date-range';

export interface CreatorDashboardClientDataConfig {
  dateBoundsEndpoint: string;
  dateBoundsRequestKey: string;
  overviewEndpoint: string;
  overviewRequestKey: string;
  detailsEndpoint: string;
  detailsRequestKey: string;
  includePreviousDetails?: boolean;
  previousDetailsRequestKey?: string;
  errorFallbackMessage: string;
}

export function useCreatorDashboardClientState<TOverview, TDetails>({
  dateBoundsEndpoint,
  dateBoundsRequestKey,
  overviewEndpoint,
  overviewRequestKey,
  detailsEndpoint,
  detailsRequestKey,
  includePreviousDetails,
  previousDetailsRequestKey,
  errorFallbackMessage,
}: CreatorDashboardClientDataConfig) {
  const isMobile = useIsMobile();
  const [messageApi, messageContextHolder] = message.useMessage();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const [availableDateBounds, setAvailableDateBounds] = useState(EMPTY_CREATOR_DATE_BOUNDS);
  const dateControls = useCreatorDashboardDateControls(availableDateBounds);
  const detailFilters = useCreatorDetailFilters();

  const isDateBoundsReady = useCreatorDateBoundsInitializer({
    endpoint: dateBoundsEndpoint,
    requestKey: dateBoundsRequestKey,
    onDateModeChange: dateControls.setDateMode,
    onDayValueChange: dateControls.setDayValue,
    onWeekValueChange: dateControls.setWeekValue,
    onMonthValueChange: dateControls.setMonthValue,
    onYearValueChange: dateControls.setYearValue,
    onCustomRangeChange: dateControls.setCustomRange,
    onDateBoundsChange: setAvailableDateBounds,
  });

  const data = useCreatorDashboardData<TOverview, TDetails>({
    isDateBoundsReady,
    currentRange: dateControls.currentRange,
    previousRange: dateControls.previousRange,
    overviewEndpoint,
    overviewRequestKey,
    detailsEndpoint,
    detailsRequestKey,
    includePreviousDetails,
    previousDetailsRequestKey,
    errorFallbackMessage,
    messageApi,
  });

  return {
    isMobile,
    messageApi,
    messageContextHolder,
    isAuthenticated,
    dateControls,
    detailFilters,
    data,
  };
}
