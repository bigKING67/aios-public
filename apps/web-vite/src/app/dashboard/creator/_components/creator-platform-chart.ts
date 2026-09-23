import type { EChartsCoreOption } from 'echarts/core';
import {
  CREATOR_CHART_TEXT_COLORS,
  resolveCreatorCooperationPlatformColor,
  resolveCreatorCooperationPlatformTooltipTheme,
} from './creator-chart-colors';
import { formatCurrency, toNumber, type NumericInput } from './creator-formatters';

export interface CreatorPlatformChartItem {
  name: string;
  value: number;
}

interface BuildCreatorPlatformChartDataParams {
  items: readonly CreatorPlatformChartItem[];
  priorityOrder: readonly string[];
}

interface BuildCreatorPlatformShareOptionParams extends BuildCreatorPlatformChartDataParams {
  platformLabel: string;
}

interface BuildCreatorCooperationPlatformDistributionOptionParams extends BuildCreatorPlatformChartDataParams {
  percentLabel: string;
}

interface BuildCreatorPlatformMetricItemsParams<TRow> {
  rows: readonly TRow[];
  resolvePlatform: (row: TRow) => string;
  resolveValue?: (row: TRow) => NumericInput;
}

export function buildCreatorPlatformMetricItems<TRow>({
  rows,
  resolvePlatform,
  resolveValue,
}: BuildCreatorPlatformMetricItemsParams<TRow>): CreatorPlatformChartItem[] {
  const platformValueMap = new Map<string, number>();

  for (const row of rows) {
    const platform = resolvePlatform(row);
    const value = resolveValue ? toNumber(resolveValue(row)) : 1;
    platformValueMap.set(platform, (platformValueMap.get(platform) || 0) + value);
  }

  return Array.from(platformValueMap.entries()).map(([name, value]) => ({ name, value }));
}

function buildSortedCreatorPlatformChartData({
  items,
  priorityOrder,
}: BuildCreatorPlatformChartDataParams): CreatorPlatformChartItem[] {
  return items
    .filter((item) => item.value > 0)
    .slice()
    .sort((left, right) => {
      const leftPriority = priorityOrder.indexOf(left.name);
      const rightPriority = priorityOrder.indexOf(right.name);
      const leftScore = leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority;
      const rightScore = rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority;
      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }
      if (right.value !== left.value) {
        return right.value - left.value;
      }
      return left.name.localeCompare(right.name, 'zh-CN');
    });
}

function buildCreatorPlatformTooltipHtml({
  platformName,
  titleLabel,
  valueLabel,
  valueText,
  percent,
  percentLabel,
}: {
  platformName: string;
  titleLabel: string;
  valueLabel: string;
  valueText: string;
  percent: number;
  percentLabel: string;
}): string {
  const theme = resolveCreatorCooperationPlatformTooltipTheme(platformName);
  return [
    '<div style="min-width:188px;padding:12px 14px;border-radius:14px;',
    `border:1px solid ${theme.borderColor};`,
    `background:${theme.background};`,
    `box-shadow:${theme.shadow};">`,
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">',
    `<span style="font-size:12px;line-height:1;color:${theme.labelColor};">${titleLabel}</span>`,
    `<span style="font-size:14px;font-weight:700;line-height:1;color:${theme.titleColor};">${platformName}</span>`,
    '</div>',
    `<div style="height:1px;margin:10px 0;background:${theme.dividerColor};"></div>`,
    '<div style="display:grid;grid-template-columns:1fr auto;column-gap:12px;row-gap:8px;align-items:end;">',
    `<span style="font-size:12px;color:${theme.labelColor};">${valueLabel}</span>`,
    `<strong style="font-size:20px;line-height:1.1;color:${theme.valueColor};">${valueText}</strong>`,
    `<span style="font-size:12px;color:${theme.labelColor};">${percentLabel}</span>`,
    `<strong style="font-size:18px;line-height:1.1;color:${theme.accentValueColor};">${percent.toFixed(1)}%</strong>`,
    '</div>',
    '</div>',
  ].join('');
}

export function buildCreatorPlatformShareOption({
  items,
  priorityOrder,
  platformLabel,
}: BuildCreatorPlatformShareOptionParams): EChartsCoreOption | undefined {
  const data = buildSortedCreatorPlatformChartData({ items, priorityOrder });
  if (!data.length) {
    return undefined;
  }

  const totalValue = data.reduce((sum, item) => sum + item.value, 0);

  return {
    tooltip: {
      trigger: 'item',
      confine: true,
      borderWidth: 0,
      backgroundColor: 'transparent',
      padding: 0,
      extraCssText: 'box-shadow:none;',
      formatter: (params: unknown) => {
        const payload = params as {
          name?: string;
          value?: number;
          percent?: number;
        };
        const platformName = payload.name || '--';
        const value = Number.isFinite(payload.value) ? Number(payload.value) : 0;
        const percent = totalValue > 0 ? (value / totalValue) * 100 : 0;
        return buildCreatorPlatformTooltipHtml({
          platformName,
          titleLabel: platformLabel,
          valueLabel: '平台GMV',
          valueText: formatCurrency(value, 2),
          percent,
          percentLabel: '占比',
        });
      },
    },
    grid: {
      left: 8,
      right: 52,
      top: 8,
      bottom: 8,
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: CREATOR_CHART_TEXT_COLORS.meta },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: data.map((item) => item.name),
      axisLabel: { color: CREATOR_CHART_TEXT_COLORS.legend },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: '平台GMV占比',
        type: 'bar',
        barMaxWidth: 22,
        label: {
          show: true,
          position: 'right',
          formatter: ({ value }: { value?: unknown }) => formatCurrency(Number(value ?? 0), 2),
          color: CREATOR_CHART_TEXT_COLORS.meta,
        },
        data: data.map((item) => ({
          ...item,
          itemStyle: {
            color: resolveCreatorCooperationPlatformColor(item.name),
            borderRadius: [0, 8, 8, 0],
          },
        })),
      },
    ],
  };
}

export function buildCreatorCooperationPlatformDistributionOption({
  items,
  priorityOrder,
  percentLabel,
}: BuildCreatorCooperationPlatformDistributionOptionParams): EChartsCoreOption | undefined {
  const data = buildSortedCreatorPlatformChartData({ items, priorityOrder });
  if (!data.length) {
    return undefined;
  }
  const totalValue = data.reduce((sum, item) => sum + item.value, 0);

  return {
    tooltip: {
      trigger: 'item',
      confine: true,
      borderWidth: 0,
      backgroundColor: 'transparent',
      padding: 0,
      extraCssText: 'box-shadow:none;',
      formatter: (params: unknown) => {
        const payload = params as { name?: string; value?: number; percent?: number };
        const platformName = payload.name || '--';
        const value = Number.isFinite(payload.value) ? Number(payload.value) : 0;
        const percent = totalValue > 0 ? (value / totalValue) * 100 : 0;
        return buildCreatorPlatformTooltipHtml({
          platformName,
          titleLabel: '合作平台',
          valueLabel: '达人数量',
          valueText: `${value.toLocaleString('zh-CN')} 人`,
          percent,
          percentLabel,
        });
      },
    },
    grid: {
      left: 8,
      right: 52,
      top: 8,
      bottom: 8,
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: CREATOR_CHART_TEXT_COLORS.meta },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: data.map((item) => item.name),
      axisLabel: { color: CREATOR_CHART_TEXT_COLORS.legend },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: '合作平台分布',
        type: 'bar',
        barMaxWidth: 22,
        label: {
          show: true,
          position: 'right',
          formatter: (params: unknown) => {
            const payload = params as { name?: string; value?: number };
            const percent = totalValue > 0 ? (Number(payload.value ?? 0) / totalValue) * 100 : 0;
            return `{platformName|${payload.name || '--'}}  {platformMeta|${percent.toFixed(1)}%}`;
          },
          rich: {
            platformName: {
              color: CREATOR_CHART_TEXT_COLORS.legend,
              fontSize: 12,
              fontWeight: 620,
            },
            platformMeta: {
              color: CREATOR_CHART_TEXT_COLORS.meta,
              fontSize: 12,
              fontWeight: 560,
            },
          },
        },
        data: data.map((item) => ({
          name: item.name,
          value: item.value,
          itemStyle: {
            color: resolveCreatorCooperationPlatformColor(item.name),
            borderRadius: [0, 8, 8, 0],
          },
        })),
      },
    ],
  };
}
