import type { EChartsCoreOption } from 'echarts/core';

import {
  GOODS_MATRIX_WOW_BASELINE,
  GOODS_QUADRANT_META,
  GOODS_QUADRANT_ORDER,
} from './dashboard-config';
import type { GoodsQuadrantKey } from './dashboard-config';
import {
  buildGoodsMatrixTooltipHtml,
  classifyGoodsQuadrant,
  computeMedian,
} from './dashboard-goods-score-model';
import type { DashboardGoodsScoreClassNames } from './dashboard-goods-score-model';
import type {
  DashboardGoodsMatrixItem,
  DashboardGoodsScoreRankingItem,
  GoodsMatrixTooltipData,
} from './dashboard-types';

export interface DashboardGoodsMatrixClassNames extends DashboardGoodsScoreClassNames {
  goodsMatrixTooltip: string;
}

export interface DashboardGoodsMatrixChartTokens {
  surface: string;
  textTertiary: string;
  axisLine: string;
  gridLine: string;
}

export function buildDashboardGoodsMatrixOption({
  rows,
  visibleQuadrants,
  scoreRankingByProductId,
  chartTokens,
  classNames,
}: {
  rows: DashboardGoodsMatrixItem[];
  visibleQuadrants: GoodsQuadrantKey[];
  scoreRankingByProductId: Map<string, DashboardGoodsScoreRankingItem>;
  chartTokens: DashboardGoodsMatrixChartTokens;
  classNames: DashboardGoodsMatrixClassNames;
}): EChartsCoreOption {
  const yThreshold = GOODS_MATRIX_WOW_BASELINE;
  const visibleQuadrantSet = new Set(visibleQuadrants);
  const points = rows.map((row) => {
    const scoreRanking = scoreRankingByProductId.get(row.productId);
    return {
      name: row.productName,
      value: [
        (row.salesShare ?? 0) * 100,
        (row.gmvWow ?? 0) * 100,
        row.currGmv,
      ],
      productId: row.productId,
      productName: row.productName,
      salesShare: row.salesShare,
      gmvWow: row.gmvWow,
      currGmv: row.currGmv,
      prevGmv: row.prevGmv,
      gmvDelta: row.gmvDelta,
      topsisScore: scoreRanking?.topsisScore ?? null,
      topsisRank: scoreRanking?.topsisRank ?? null,
      scoreConfidence: scoreRanking?.scoreConfidence ?? null,
    };
  });

  const shareValues = points.map((item) => Number(item.value[0] || 0));
  const wowValues = points.map((item) => Number(item.value[1] || 0));
  const xThreshold = computeMedian(shareValues);

  const xMaxObserved = shareValues.length > 0 ? Math.max(...shareValues) : 0;
  const xPadding = Math.max(1.2, xMaxObserved * 0.1);
  const xMin = 0;
  const xMax = Math.max(10, xThreshold + xPadding, xMaxObserved + xPadding);

  const yMinObserved = wowValues.length > 0 ? Math.min(...wowValues, yThreshold) : -10;
  const yMaxObserved = wowValues.length > 0 ? Math.max(...wowValues, yThreshold) : 10;
  const yPadding = Math.max(8, (yMaxObserved - yMinObserved) * 0.18);
  const yMin = Math.min(-10, yMinObserved - yPadding);
  const yMax = Math.max(10, yMaxObserved + yPadding);
  const yAxisLabelCandidates = [yMin, yMax, yThreshold, 0];
  const yAxisLongestLabelLength = yAxisLabelCandidates.reduce((max, value) => {
    const normalized = Number.isFinite(value) ? Math.round(value) : 0;
    return Math.max(max, `${normalized}%`.length);
  }, 0);
  const yAxisNameGap = Math.max(44, Math.min(84, 20 + yAxisLongestLabelLength * 7));

  const gmvValues = points.map((item) => Number(item.value[2] || 0));
  const maxGmv = gmvValues.length > 0 ? Math.max(...gmvValues) : 0;
  const minGmv = gmvValues.length > 0 ? Math.min(...gmvValues) : 0;
  const gmvSpan = Math.max(1, maxGmv - minGmv);

  const pointsWithQuadrant = points.map((item) => {
    const sharePct = Number(item.value[0] || 0);
    const wowPct = Number(item.value[1] || 0);
    const quadrant = classifyGoodsQuadrant(sharePct, wowPct, xThreshold, yThreshold);

    const gmvValue = Number(item.value[2] || 0);
    const symbolSize = 12 + ((gmvValue - minGmv) / gmvSpan) * 18;

    return {
      ...item,
      quadrant,
      quadrantLabel: GOODS_QUADRANT_META[quadrant].label,
      symbolSize: Number.isFinite(symbolSize) ? Math.max(10, Math.min(symbolSize, 30)) : 12,
    };
  });

  const quadrantSeries = GOODS_QUADRANT_ORDER.map((quadrantKey) => {
    const meta = GOODS_QUADRANT_META[quadrantKey];
    const isVisible = visibleQuadrantSet.has(quadrantKey);
    return {
      name: meta.label,
      type: 'scatter' as const,
      data: isVisible ? pointsWithQuadrant.filter((item) => item.quadrant === quadrantKey) : [],
      itemStyle: {
        color: meta.color,
        opacity: 0.86,
        borderColor: chartTokens.surface,
        borderWidth: 1,
        shadowBlur: 8,
        shadowColor: meta.shadowColor,
      },
      emphasis: {
        scale: true,
        itemStyle: {
          opacity: 1,
        },
      },
    };
  });

  return {
    grid: {
      left: '6%',
      right: '6%',
      top: '12%',
      bottom: '10%',
      containLabel: true,
    },
    legend: {
      show: false,
    },
    tooltip: {
      trigger: 'item',
      className: classNames.goodsMatrixTooltip,
      confine: true,
      appendToBody: true,
      backgroundColor: 'transparent',
      borderWidth: 0,
      padding: 0,
      transitionDuration: 0.08,
      extraCssText: 'box-shadow:none;',
      formatter: (params: unknown) => {
        const payload = params as {
          data?: GoodsMatrixTooltipData;
        };
        const item = payload.data;
        if (!item) {
          return '';
        }
        return buildGoodsMatrixTooltipHtml({
          item,
          classNames,
        });
      },
    },
    xAxis: {
      type: 'value',
      name: '销售额占比',
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: {
        formatter: (value: number) => `${value.toFixed(0)}%`,
        color: chartTokens.textTertiary,
      },
      axisLine: {
        lineStyle: { color: chartTokens.axisLine },
      },
      splitLine: {
        lineStyle: { color: chartTokens.gridLine, type: 'dashed' },
      },
      min: xMin,
      max: xMax,
    },
    yAxis: {
      type: 'value',
      name: '销售额同期环比',
      nameLocation: 'middle',
      nameGap: yAxisNameGap,
      axisLabel: {
        formatter: (value: number) => `${value.toFixed(0)}%`,
        color: chartTokens.textTertiary,
      },
      axisLine: {
        lineStyle: { color: chartTokens.axisLine },
      },
      splitLine: {
        lineStyle: { color: chartTokens.gridLine, type: 'dashed' },
      },
      min: yMin,
      max: yMax,
    },
    series: [
      {
        name: '象限分区',
        type: 'scatter',
        data: [],
        symbolSize: 0,
        silent: true,
        tooltip: {
          show: false,
        },
        itemStyle: {
          opacity: 0,
        },
        markArea: {
          silent: true,
          label: {
            show: true,
            color: chartTokens.textTertiary,
            fontSize: 11,
            fontWeight: 500,
          },
          data: [
            [
              {
                name: GOODS_QUADRANT_META.opportunity.label,
                xAxis: xMin,
                yAxis: yThreshold,
                itemStyle: {
                  color: GOODS_QUADRANT_META.opportunity.areaColor,
                },
              },
              { xAxis: xThreshold, yAxis: yMax },
            ],
            [
              {
                name: GOODS_QUADRANT_META.star.label,
                xAxis: xThreshold,
                yAxis: yThreshold,
                itemStyle: {
                  color: GOODS_QUADRANT_META.star.areaColor,
                },
              },
              { xAxis: xMax, yAxis: yMax },
            ],
            [
              {
                name: GOODS_QUADRANT_META.longtail.label,
                xAxis: xMin,
                yAxis: yMin,
                itemStyle: {
                  color: GOODS_QUADRANT_META.longtail.areaColor,
                },
              },
              { xAxis: xThreshold, yAxis: yThreshold },
            ],
            [
              {
                name: GOODS_QUADRANT_META.stable.label,
                xAxis: xThreshold,
                yAxis: yMin,
                itemStyle: {
                  color: GOODS_QUADRANT_META.stable.areaColor,
                },
              },
              { xAxis: xMax, yAxis: yThreshold },
            ],
          ],
        },
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          label: {
            color: chartTokens.textTertiary,
            fontSize: 11,
          },
          lineStyle: {
            type: 'dashed',
            color: chartTokens.textTertiary,
          },
          data: [
            {
              xAxis: xThreshold,
              name: `占比中位数 ${xThreshold.toFixed(2)}%`,
            },
            {
              yAxis: yThreshold,
              name: '环比基准 0%',
            },
          ],
        },
      },
      ...quadrantSeries.map((series) => ({
        ...series,
        z: series.name === GOODS_QUADRANT_META.star.label ? 5 : 4,
        tooltip: {
          show: true,
        },
      })),
    ],
  };
}
