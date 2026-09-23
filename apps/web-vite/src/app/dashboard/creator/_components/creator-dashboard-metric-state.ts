import { useMemo } from 'react';
import type { CreatorMetricGridItem } from './creator-metric-grid';
import {
  buildCreatorPerformanceMetricCards,
  type CreatorPerformanceMetricLabels,
} from './creator-metric-cards';
import type { NumericInput } from './creator-formatters';

export interface CreatorDashboardMetricSource {
  rosterInfluencerCount: NumericInput;
  activeInfluencerCount: NumericInput;
  activeContentCount: NumericInput;
  gmv: NumericInput;
  refundAmount: NumericInput;
}

interface UseCreatorDashboardMetricStateParams {
  labels: CreatorPerformanceMetricLabels;
  source: CreatorDashboardMetricSource;
  loading: boolean;
  hasOverviewData: boolean;
  hasDetailsData: boolean;
}

interface UseCreatorDashboardMetricStateResult {
  metricCards: CreatorMetricGridItem[];
  showMetricSkeleton: boolean;
}

export function useCreatorDashboardMetricState({
  labels,
  source,
  loading,
  hasOverviewData,
  hasDetailsData,
}: UseCreatorDashboardMetricStateParams): UseCreatorDashboardMetricStateResult {
  const metricCards = useMemo(
    () =>
      buildCreatorPerformanceMetricCards({
        labels,
        rosterInfluencerCount: source.rosterInfluencerCount,
        activeInfluencerCount: source.activeInfluencerCount,
        activeContentCount: source.activeContentCount,
        gmv: source.gmv,
        refundAmount: source.refundAmount,
      }),
    [
      labels,
      source.activeContentCount,
      source.activeInfluencerCount,
      source.gmv,
      source.refundAmount,
      source.rosterInfluencerCount,
    ]
  );

  return {
    metricCards,
    showMetricSkeleton: loading && !hasOverviewData && !hasDetailsData,
  };
}
