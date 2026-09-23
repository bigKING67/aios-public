import { useEffect, useRef, useState } from 'react';
import type { Dayjs } from 'dayjs';

import type { DashboardDimension, DateMode, PlatformTabKey } from './dashboard-config';
import { normalizeDimensionByTab } from './dashboard-date-range';
import type { DashboardInitialState } from './dashboard-types';

type DashboardFilterStateOptions = {
  enforceAllowedTabs?: boolean;
  preserveDisallowedInitialTab?: boolean;
};

export function shouldPreserveInitialPlatformDeepLink({
  activeTab,
  allowedTabs,
  initialActiveTab,
  preserveDisallowedInitialTab,
}: {
  activeTab: PlatformTabKey;
  allowedTabs: readonly PlatformTabKey[];
  initialActiveTab: PlatformTabKey;
  preserveDisallowedInitialTab: boolean;
}): boolean {
  return (
    preserveDisallowedInitialTab &&
    activeTab !== 'overview' &&
    activeTab === initialActiveTab &&
    !allowedTabs.includes(activeTab)
  );
}

export function useDashboardFilterState(
  initialState: DashboardInitialState,
  allowedTabs: PlatformTabKey[],
  options: DashboardFilterStateOptions = {}
) {
  const enforceAllowedTabs = options.enforceAllowedTabs ?? true;
  const preserveDisallowedInitialTab = options.preserveDisallowedInitialTab ?? false;
  const initialActiveTabRef = useRef(initialState.activeTab);
  const [activeDimension, setActiveDimension] = useState<DashboardDimension>(initialState.activeDimension);
  const [activeTab, setActiveTab] = useState<PlatformTabKey>(initialState.activeTab);
  const [dateMode, setDateMode] = useState<DateMode>(initialState.dateMode);
  const [dayValue, setDayValue] = useState<Dayjs>(initialState.dayValue);
  const [weekValue, setWeekValue] = useState<Dayjs>(initialState.weekValue);
  const [monthValue, setMonthValue] = useState<Dayjs>(initialState.monthValue);
  const [yearValue, setYearValue] = useState<Dayjs>(initialState.yearValue);
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs]>(initialState.customRange);

  useEffect(() => {
    if (!enforceAllowedTabs) {
      return;
    }
    if (allowedTabs.includes(activeTab)) {
      return;
    }
    if (
      shouldPreserveInitialPlatformDeepLink({
        activeTab,
        allowedTabs,
        initialActiveTab: initialActiveTabRef.current,
        preserveDisallowedInitialTab,
      })
    ) {
      return;
    }

    setActiveTab(allowedTabs[0] || 'overview');
  }, [activeTab, allowedTabs, enforceAllowedTabs, preserveDisallowedInitialTab]);

  useEffect(() => {
    const normalized = normalizeDimensionByTab(activeTab, activeDimension);
    if (normalized === activeDimension) {
      return;
    }
    setActiveDimension(normalized);
  }, [activeDimension, activeTab]);

  return {
    activeDimension,
    setActiveDimension,
    activeTab,
    setActiveTab,
    dateMode,
    setDateMode,
    dayValue,
    setDayValue,
    weekValue,
    setWeekValue,
    monthValue,
    setMonthValue,
    yearValue,
    setYearValue,
    customRange,
    setCustomRange,
  };
}
