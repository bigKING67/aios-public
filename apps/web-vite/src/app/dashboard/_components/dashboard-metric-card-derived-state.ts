import { useMemo } from 'react';

import {
  buildDashboardLiveMetricCardGroups,
  buildDashboardShortVideoMetricCardGroups,
} from './dashboard-metric-cards';
import type { LiveMetricCard } from './dashboard-types';

type DashboardMetricCardDerivedStateArgs = {
  activeLiveMetricCards: LiveMetricCard[];
  activeShortVideoMetricCards: LiveMetricCard[];
};

type DashboardMetricCardGroupState = {
  topMetricCards: LiveMetricCard[];
  bottomMetricCards: LiveMetricCard[];
};

export function useDashboardLiveMetricCardGroupState(
  activeLiveMetricCards: DashboardMetricCardDerivedStateArgs['activeLiveMetricCards']
): DashboardMetricCardGroupState {
  return useMemo(() => buildDashboardLiveMetricCardGroups(activeLiveMetricCards), [activeLiveMetricCards]);
}

export function useDashboardShortVideoMetricCardGroupState(
  activeShortVideoMetricCards: DashboardMetricCardDerivedStateArgs['activeShortVideoMetricCards']
): DashboardMetricCardGroupState {
  return useMemo(
    () => buildDashboardShortVideoMetricCardGroups(activeShortVideoMetricCards),
    [activeShortVideoMetricCards]
  );
}
