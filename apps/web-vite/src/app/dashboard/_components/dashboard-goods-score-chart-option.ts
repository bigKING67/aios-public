import type { EChartsCoreOption } from 'echarts/core';
import { buildGoodsScoreTooltipHtml } from './dashboard-goods-score-model';
import type { DashboardGoodsScoreClassNames } from './dashboard-goods-score-model';
import type {
  DashboardGoodsScoreDetailItem,
  DashboardGoodsScoreRankingItem,
} from './dashboard-types';

export interface DashboardGoodsScoreChartClassNames extends DashboardGoodsScoreClassNames {
  goodsScoreTooltip: string;
}

export interface DashboardGoodsScoreChartTokens {
  textPrimary: string;
  textTertiary: string;
  axisLine: string;
  gridLine: string;
  primarySeries: string;
  primaryRadarArea: string;
  radarSplitAreaA: string;
  radarSplitAreaB: string;
}

export function buildDashboardGoodsScoreOption({
  rows,
  isMobile,
  chartTokens,
  classNames,
}: {
  rows: DashboardGoodsScoreRankingItem[];
  isMobile: boolean;
  chartTokens: DashboardGoodsScoreChartTokens;
  classNames: DashboardGoodsScoreChartClassNames;
}): EChartsCoreOption {
  const categoryLabels = rows.map((item) => item.productName);
  const scoreValues = rows.map((item) => item.topsisScore);

  return {
    grid: {
      left: isMobile ? '7%' : '5%',
      right: '6%',
      top: '10%',
      bottom: '10%',
      containLabel: true,
    },
    tooltip: {
      trigger: 'item',
      className: classNames.goodsScoreTooltip,
      confine: true,
      appendToBody: true,
      backgroundColor: 'transparent',
      borderWidth: 0,
      padding: 0,
      transitionDuration: 0.08,
      extraCssText: 'box-shadow:none;',
      formatter: (params: unknown) => {
        const payload = params as {
          dataIndex?: number;
        };
        const row = rows[payload.dataIndex || 0];
        if (!row) {
          return '';
        }
        return buildGoodsScoreTooltipHtml({
          row,
          classNames,
        });
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 10,
      axisLabel: {
        color: chartTokens.textTertiary,
      },
      splitLine: {
        lineStyle: { color: chartTokens.gridLine, type: 'dashed' },
      },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: categoryLabels,
      axisLabel: {
        color: chartTokens.textPrimary,
        fontSize: 11,
      },
      axisTick: {
        show: false,
      },
      axisLine: {
        show: false,
      },
    },
    series: [
      {
        type: 'bar',
        data: scoreValues,
        barWidth: 14,
        itemStyle: {
          color: chartTokens.primarySeries,
          borderRadius: [0, 8, 8, 0],
        },
        label: {
          show: true,
          position: 'right',
          color: chartTokens.textPrimary,
          formatter: (params: unknown) => {
            const payload = params as {
              value?: number;
            };
            const value = Number(payload.value ?? 0);
            return value.toFixed(1);
          },
        },
      },
    ],
  };
}

export function buildDashboardGoodsScoreRadarOption({
  detail,
  chartTokens,
}: {
  detail: DashboardGoodsScoreDetailItem | null;
  chartTokens: DashboardGoodsScoreChartTokens;
}): EChartsCoreOption {
  const values = detail
    ? [
        Number(detail.scoreBreakdown.scale.toFixed(1)),
        Number(detail.scoreBreakdown.efficiency.toFixed(1)),
        Number(detail.scoreBreakdown.growth.toFixed(1)),
        Number(detail.scoreBreakdown.risk.toFixed(1)),
      ]
    : [0, 0, 0, 0];
  const dimensions = ['规模', '效率', '增长', '风险'];

  return {
    grid: {
      left: 8,
      right: 36,
      top: 8,
      bottom: 8,
      containLabel: true,
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const payload = params as {
          name?: unknown;
          value?: unknown;
        };
        return `${String(payload.name ?? '评分维度')}：${Number(payload.value ?? 0).toFixed(1)}`;
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 10,
      axisLabel: { color: chartTokens.textTertiary },
      splitLine: {
        lineStyle: { color: chartTokens.gridLine, type: 'dashed' },
      },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: dimensions,
      axisLabel: { color: chartTokens.textPrimary },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: detail?.productName || '评分分解',
        type: 'bar',
        barMaxWidth: 20,
        itemStyle: {
          color: chartTokens.primarySeries,
          borderRadius: [0, 8, 8, 0],
        },
        label: {
          show: true,
          position: 'right',
          color: chartTokens.textPrimary,
          formatter: ({ value }: { value?: unknown }) => Number(value ?? 0).toFixed(1),
        },
        data: values,
      },
    ],
  };
}
