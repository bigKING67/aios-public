import {
  DASHBOARD_DIMENSION_LIBRARY,
  DASHBOARD_DIMENSIONS_BY_TAB,
  PLATFORM_TABS,
} from './dashboard-config';
import type {
  DashboardDimension,
  DateMode,
  PlatformTabKey,
} from './dashboard-config';

export function isDateMode(value?: string): value is DateMode {
  return value === 'day' || value === 'week' || value === 'month' || value === 'year' || value === 'custom';
}

export function isPlatformTabKey(value?: string): value is PlatformTabKey {
  if (!value) {
    return false;
  }
  return PLATFORM_TABS.some((tab) => tab.key === value);
}

export function isDashboardDimension(value?: string): value is DashboardDimension {
  if (!value) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(DASHBOARD_DIMENSION_LIBRARY, value);
}

export function resolveDimensionsByTab(tab: PlatformTabKey): readonly DashboardDimension[] {
  if (tab === 'overview') {
    return ['business'];
  }
  return DASHBOARD_DIMENSIONS_BY_TAB[tab];
}

export function resolveDefaultTabForDimension(dimension: DashboardDimension): PlatformTabKey {
  if (dimension === 'business') {
    return 'overview';
  }

  for (const [tab, dimensions] of Object.entries(DASHBOARD_DIMENSIONS_BY_TAB) as Array<
    [Exclude<PlatformTabKey, 'overview'>, readonly DashboardDimension[]]
  >) {
    if (dimensions.includes(dimension)) {
      return tab;
    }
  }

  return 'overview';
}

export function normalizeDimensionByTab(
  tab: PlatformTabKey,
  dimension: DashboardDimension,
): DashboardDimension {
  const dimensions = resolveDimensionsByTab(tab);
  return dimensions.includes(dimension) ? dimension : dimensions[0];
}
