import dayjs from 'dayjs';
import type { EChartsCoreOption } from 'echarts/core';
import {
  CREATOR_CHART_STRUCTURAL_COLORS,
  CREATOR_CHART_TEXT_COLORS,
  CREATOR_TREND_CHART_COLORS,
} from './creator-chart-colors';
import { formatCompactCurrency, toNullableNumber, type NumericInput } from './creator-formatters';
import { isValidDateLiteral } from './creator-helpers';
import {
  buildCreatorTrendTooltipHtml,
  type CreatorTrendTooltipContributor,
  type CreatorTrendTooltipStyles,
} from './creator-trend-tooltip';

export interface CreatorTrendChartRow {
  date: string | null;
  gmvValue: number;
  gsvValue: number;
  contributorCount: NumericInput;
  contributors: readonly CreatorTrendTooltipContributor[];
}

export interface BuildCreatorTrendChartOptionParams {
  rows: readonly CreatorTrendChartRow[];
  countLabel: string;
  gsvSeriesLabel?: string;
  styles: CreatorTrendTooltipStyles;
}

interface BuildCreatorTrendChartRowsParams<TRow, TContributor> {
  rows: readonly TRow[];
  resolveDate: (row: TRow) => string | null;
  resolveGmvValue: (row: TRow) => NumericInput;
  resolveGsvBaseValue: (row: TRow) => NumericInput;
  resolveRefundAmount: (row: TRow) => NumericInput;
  resolveContributorCount: (row: TRow) => NumericInput;
  resolveContributors: (row: TRow) => readonly TContributor[] | null | undefined;
  resolveContributorPlatform: (contributor: TContributor) => string | null | undefined;
  resolveContributorName: (contributor: TContributor) => string | null | undefined;
  resolveContributorGmv: (contributor: TContributor) => NumericInput;
  resolveContributorRefundAmount?: (contributor: TContributor) => NumericInput;
  resolveContributorGsv: (contributor: TContributor) => NumericInput;
}

export function buildCreatorTrendChartRows<TRow, TContributor>({
  rows,
  resolveDate,
  resolveGmvValue,
  resolveGsvBaseValue,
  resolveRefundAmount,
  resolveContributorCount,
  resolveContributors,
  resolveContributorPlatform,
  resolveContributorName,
  resolveContributorGmv,
  resolveContributorRefundAmount,
  resolveContributorGsv,
}: BuildCreatorTrendChartRowsParams<TRow, TContributor>): CreatorTrendChartRow[] {
  return rows.map((row) => {
    const contributors = resolveContributors(row);
    const contributorRows = Array.isArray(contributors) ? contributors : [];

    return {
      date: resolveDate(row),
      gmvValue: toNullableNumber(resolveGmvValue(row)) ?? 0,
      gsvValue: (toNullableNumber(resolveGsvBaseValue(row)) ?? 0) - (toNullableNumber(resolveRefundAmount(row)) ?? 0),
      contributorCount: resolveContributorCount(row),
      contributors: contributorRows.map((contributor) => {
        const refundAmount = resolveContributorRefundAmount
          ? toNullableNumber(resolveContributorRefundAmount(contributor)) ?? 0
          : undefined;

        return {
          platform: resolveContributorPlatform(contributor) || '--',
          influencerName: (resolveContributorName(contributor) || '').trim() || '未知达人',
          liveGmv: toNullableNumber(resolveContributorGmv(contributor)) ?? 0,
          ...(refundAmount === undefined ? {} : { refundAmount }),
          liveGsv: toNullableNumber(resolveContributorGsv(contributor)) ?? 0,
        };
      }),
    };
  });
}

export function buildCreatorTrendChartOption({
  rows,
  countLabel,
  gsvSeriesLabel = 'GSV（支付时间）',
  styles,
}: BuildCreatorTrendChartOptionParams): EChartsCoreOption | undefined {
  if (!rows.length) {
    return undefined;
  }

  const labels = rows.map((row, index) => {
    if (isValidDateLiteral(row.date)) {
      return dayjs(row.date).format('MM-DD');
    }
    return `#${index + 1}`;
  });
  const gmvValues = rows.map((row) => row.gmvValue);
  const gsvValues = rows.map((row) => row.gsvValue);
  const contributorRowsByIndex = rows.map((row) => row.contributors);
  const contributorCountByIndex = rows.map((row, index) => {
    const parsed = toNullableNumber(row.contributorCount);
    const fallback = contributorRowsByIndex[index].length;
    if (parsed === null) {
      return fallback;
    }
    return Math.max(Math.round(parsed), fallback);
  });

  return {
    color: [CREATOR_TREND_CHART_COLORS.gmvSeries, CREATOR_TREND_CHART_COLORS.gsvSeries],
    legend: {
      top: 4,
      textStyle: {
        color: CREATOR_CHART_TEXT_COLORS.legend,
        fontSize: 12,
      },
      data: ['GMV', gsvSeriesLabel],
    },
    tooltip: {
      trigger: 'axis',
      triggerOn: 'mousemove|click',
      confine: true,
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      padding: 0,
      extraCssText: 'box-shadow:none;',
      textStyle: {
        color: CREATOR_CHART_TEXT_COLORS.tooltip,
        fontSize: 12,
      },
      formatter: (params: unknown) => {
        const payload = Array.isArray(params) ? params : [params];
        const first = payload[0] as { dataIndex?: number; axisValueLabel?: string } | undefined;
        const dataIndex = typeof first?.dataIndex === 'number' ? first.dataIndex : 0;
        const dateLabel = labels[dataIndex] || first?.axisValueLabel || '--';
        const gmvValue = gmvValues[dataIndex] ?? 0;
        const gsvValue = gsvValues[dataIndex] ?? 0;
        const contributors = contributorRowsByIndex[dataIndex] || [];
        const contributorCount = contributorCountByIndex[dataIndex] || 0;

        return buildCreatorTrendTooltipHtml({
          dateLabel,
          gmvValue,
          gsvValue,
          gsvLabel: gsvSeriesLabel,
          contributors,
          contributorCount,
          countLabel,
          styles,
        });
      },
    },
    grid: {
      left: 20,
      right: 20,
      top: 44,
      bottom: 28,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLine: {
        lineStyle: {
          color: CREATOR_CHART_STRUCTURAL_COLORS.axisLine,
        },
      },
      axisLabel: {
        color: CREATOR_CHART_TEXT_COLORS.axis,
        fontSize: 12,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: {
        show: false,
      },
      splitLine: {
        lineStyle: {
          color: CREATOR_CHART_STRUCTURAL_COLORS.gridLine,
          type: 'dashed',
        },
      },
      axisLabel: {
        color: CREATOR_CHART_TEXT_COLORS.axis,
        formatter: (value: number) => formatCompactCurrency(value).replace('¥', ''),
      },
    },
    series: [
      {
        name: 'GMV',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: {
          width: 2,
        },
        areaStyle: {
          color: CREATOR_TREND_CHART_COLORS.gmvArea,
        },
        data: gmvValues,
      },
      {
        name: gsvSeriesLabel,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: {
          width: 2,
        },
        data: gsvValues,
      },
    ],
  };
}
