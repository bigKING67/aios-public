import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { buildCreatorTrendShareChartPanels } from './creator-chart-panels';
import type { CreatorChartLayoutPanel } from './creator-chart-layout';
import {
  CREATOR_COOPERATION_PLATFORM_PRIORITY_ORDER,
  normalizeCreatorCooperationPlatform,
} from './creator-cooperation-normalizers';
import { readCreatorArray } from './creator-helpers';
import {
  buildCreatorPlatformMetricItems,
  buildCreatorPlatformShareOption,
} from './creator-platform-chart';
import type { NumericInput } from './creator-formatters';
import {
  buildCreatorTrendChartOption,
  buildCreatorTrendChartRows,
} from './creator-trend-chart';
import type { CreatorTrendTooltipStyles } from './creator-trend-tooltip';

export interface CreatorDashboardTrendShareChartConfig<TSeriesRow, TContributor, TPlatformShareRow> {
  countLabel: string;
  platformLabel: string;
  trendTitle?: string;
  trendSubtitle: string;
  gsvSeriesLabel?: string;
  shareSubtitle: string;
  includeSharePanel?: boolean;
  resolveDate: (row: TSeriesRow) => string | null;
  resolveGmvValue: (row: TSeriesRow) => NumericInput;
  resolveGsvBaseValue: (row: TSeriesRow) => NumericInput;
  resolveRefundAmount: (row: TSeriesRow) => NumericInput;
  resolveContributorCount: (row: TSeriesRow) => NumericInput;
  resolveContributors: (row: TSeriesRow) => readonly TContributor[] | null | undefined;
  resolveContributorPlatform: (contributor: TContributor) => string | null | undefined;
  resolveContributorName: (contributor: TContributor) => string | null | undefined;
  resolveContributorGmv: (contributor: TContributor) => NumericInput;
  resolveContributorRefundAmount?: (contributor: TContributor) => NumericInput;
  resolveContributorGsv: (contributor: TContributor) => NumericInput;
  resolvePlatformSharePlatform: (row: TPlatformShareRow) => string | null | undefined;
  resolvePlatformShareGmv: (row: TPlatformShareRow) => NumericInput;
}

interface UseCreatorDashboardTrendShareChartStateParams<TSeriesRow, TContributor, TPlatformShareRow> {
  seriesRows: readonly TSeriesRow[] | null | undefined;
  platformShareRows: readonly TPlatformShareRow[] | null | undefined;
  loading: boolean;
  styles: CreatorTrendTooltipStyles;
  config: CreatorDashboardTrendShareChartConfig<TSeriesRow, TContributor, TPlatformShareRow>;
}

interface UseCreatorDashboardTrendShareChartStateResult {
  trendShareChartPanels: CreatorChartLayoutPanel[];
}

export function useCreatorDashboardTrendShareChartState<TSeriesRow, TContributor, TPlatformShareRow>({
  seriesRows,
  platformShareRows,
  loading,
  styles,
  config,
}: UseCreatorDashboardTrendShareChartStateParams<
  TSeriesRow,
  TContributor,
  TPlatformShareRow
>): UseCreatorDashboardTrendShareChartStateResult {
  const currentSeries = useMemo<TSeriesRow[]>(() => {
    return [...readCreatorArray(seriesRows)];
  }, [seriesRows]);
  const shouldIncludeSharePanel = config.includeSharePanel !== false;

  const trendOption = useMemo(
    () =>
      buildCreatorTrendChartOption({
        rows: buildCreatorTrendChartRows({
          rows: currentSeries,
          resolveDate: config.resolveDate,
          resolveGmvValue: config.resolveGmvValue,
          resolveGsvBaseValue: config.resolveGsvBaseValue,
          resolveRefundAmount: config.resolveRefundAmount,
          resolveContributorCount: config.resolveContributorCount,
          resolveContributors: config.resolveContributors,
          resolveContributorPlatform: (item) =>
            normalizeCreatorCooperationPlatform(config.resolveContributorPlatform(item) ?? null),
          resolveContributorName: config.resolveContributorName,
          resolveContributorGmv: config.resolveContributorGmv,
          resolveContributorRefundAmount: config.resolveContributorRefundAmount,
          resolveContributorGsv: config.resolveContributorGsv,
        }),
        countLabel: config.countLabel,
        gsvSeriesLabel: config.gsvSeriesLabel,
        styles,
      }),
    [config, currentSeries, styles]
  );

  const platformShareData = useMemo<TPlatformShareRow[]>(() => {
    if (!shouldIncludeSharePanel) {
      return [];
    }

    return [...readCreatorArray(platformShareRows)];
  }, [platformShareRows, shouldIncludeSharePanel]);

  const shareOption = useMemo<EChartsCoreOption | undefined>(() => {
    if (!shouldIncludeSharePanel) {
      return undefined;
    }

    return buildCreatorPlatformShareOption({
      items: buildCreatorPlatformMetricItems({
        rows: platformShareData,
        resolvePlatform: (row) =>
          normalizeCreatorCooperationPlatform(config.resolvePlatformSharePlatform(row) ?? null),
        resolveValue: config.resolvePlatformShareGmv,
      }),
      priorityOrder: CREATOR_COOPERATION_PLATFORM_PRIORITY_ORDER,
      platformLabel: config.platformLabel,
    });
  }, [config, platformShareData, shouldIncludeSharePanel]);

  const trendShareChartPanels = useMemo(
    () =>
      buildCreatorTrendShareChartPanels({
        trendOption,
        shareOption,
        loading,
        trendTitle: config.trendTitle,
        trendSubtitle: config.trendSubtitle,
        shareSubtitle: config.shareSubtitle,
        includeSharePanel: config.includeSharePanel,
      }),
    [config, loading, shareOption, trendOption]
  );

  return {
    trendShareChartPanels,
  };
}
