import type { EChartsCoreOption } from 'echarts/core';
import {
  CREATOR_ANCHOR_LEVEL_GRADIENT_MAP,
  CREATOR_ANCHOR_LEVEL_ORDER,
  CREATOR_CHART_STRUCTURAL_COLORS,
  CREATOR_CHART_TEXT_COLORS,
  normalizeCreatorAnchorLevel,
  resolveCreatorAnchorLevelTooltipThemeFromLabel,
  type CreatorAnchorLevel,
} from './creator-chart-colors';
import type { CreatorAnchorLevelRow } from './creator-cooperation-stages';

export interface BuildCreatorAnchorLevelDistributionOptionParams<TRow extends CreatorAnchorLevelRow> {
  rows: readonly TRow[];
  selectedAnchorLevel: CreatorAnchorLevel | null;
  normalizeAnchorLevel?: (level: string | null) => CreatorAnchorLevel | null;
}

export function buildCreatorAnchorLevelDistributionOption<TRow extends CreatorAnchorLevelRow>({
  rows,
  selectedAnchorLevel,
  normalizeAnchorLevel = normalizeCreatorAnchorLevel,
}: BuildCreatorAnchorLevelDistributionOptionParams<TRow>): EChartsCoreOption | undefined {
  const levelCountMap = CREATOR_ANCHOR_LEVEL_ORDER.reduce<Record<CreatorAnchorLevel, number>>(
    (result, level) => ({
      ...result,
      [level]: 0,
    }),
    {} as Record<CreatorAnchorLevel, number>
  );

  for (const row of rows) {
    const level = normalizeAnchorLevel(row.anchor_level);
    if (!level) {
      continue;
    }
    levelCountMap[level] += 1;
  }

  const hasLevelData = CREATOR_ANCHOR_LEVEL_ORDER.some((level) => levelCountMap[level] > 0);
  if (!hasLevelData) {
    return undefined;
  }

  const maxCount = Math.max(...CREATOR_ANCHOR_LEVEL_ORDER.map((level) => levelCountMap[level]), 1);
  const totalCount = CREATOR_ANCHOR_LEVEL_ORDER.reduce((sum, level) => sum + levelCountMap[level], 0);
  const axisMax = maxCount + Math.max(2, Math.ceil(maxCount * 0.18));

  return {
    tooltip: {
      trigger: 'item',
      confine: true,
      borderWidth: 0,
      backgroundColor: 'transparent',
      padding: 0,
      extraCssText: 'box-shadow:none;',
      formatter: (params: unknown) => {
        const payload = params as { name?: string; value?: number };
        const value = Number.isFinite(payload.value) ? Number(payload.value) : 0;
        const levelName = payload.name || '--';
        const percent = totalCount > 0 ? (value / totalCount) * 100 : 0;
        const theme = resolveCreatorAnchorLevelTooltipThemeFromLabel(levelName);
        return [
          '<div style="min-width:184px;padding:12px 14px;border-radius:14px;',
          `border:1px solid ${theme.borderColor};`,
          `background:${theme.background};`,
          `box-shadow:${theme.shadow};">`,
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">',
          `<span style="font-size:12px;line-height:1;color:${theme.labelColor};">达人等级</span>`,
          `<span style="font-size:14px;font-weight:700;line-height:1;color:${theme.titleColor};">${levelName}</span>`,
          '</div>',
          `<div style="height:1px;margin:10px 0;background:${theme.dividerColor};"></div>`,
          '<div style="display:grid;grid-template-columns:1fr auto;column-gap:12px;row-gap:8px;align-items:end;">',
          `<span style="font-size:12px;color:${theme.labelColor};">达人数量</span>`,
          `<strong style="font-size:20px;line-height:1.1;color:${theme.valueColor};">${value.toLocaleString('zh-CN')} 人</strong>`,
          `<span style="font-size:12px;color:${theme.labelColor};">等级占比</span>`,
          `<strong style="font-size:18px;line-height:1.1;color:${theme.accentValueColor};">${percent.toFixed(1)}%</strong>`,
          '</div>',
          '</div>',
        ].join('');
      },
    },
    grid: {
      left: 16,
      right: 126,
      top: 14,
      bottom: 10,
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: axisMax,
      axisTick: {
        show: false,
      },
      axisLine: {
        show: false,
      },
      axisLabel: {
        show: false,
      },
      splitLine: {
        show: false,
      },
    },
    yAxis: {
      type: 'category',
      data: CREATOR_ANCHOR_LEVEL_ORDER.map((level) => `${level}级`),
      inverse: true,
      axisTick: {
        show: false,
      },
      axisLine: {
        show: false,
      },
      axisLabel: {
        color: CREATOR_CHART_TEXT_COLORS.legend,
        fontSize: 13,
        fontWeight: 620,
      },
    },
    series: [
      {
        name: '达人等级分布',
        type: 'bar',
        barWidth: 28,
        showBackground: true,
        backgroundStyle: {
          color: CREATOR_CHART_STRUCTURAL_COLORS.levelTrack,
          borderRadius: 999,
        },
        label: {
          show: true,
          position: 'right',
          distance: 12,
          formatter: (params: unknown) => {
            const payload = params as { name?: string; value?: number };
            const value = Number.isFinite(payload.value) ? Number(payload.value) : 0;
            return `{valueBadge|${value.toLocaleString('zh-CN')} 人}`;
          },
          rich: {
            valueBadge: {
              color: CREATOR_CHART_TEXT_COLORS.strong,
              fontSize: 14,
              fontWeight: 680,
              padding: [4, 10],
              backgroundColor: CREATOR_CHART_STRUCTURAL_COLORS.valueBadgeBackground,
              borderRadius: 999,
              shadowColor: CREATOR_CHART_STRUCTURAL_COLORS.valueBadgeShadow,
              shadowBlur: 8,
              shadowOffsetY: 2,
            },
          },
        },
        emphasis: {
          scale: false,
        },
        data: CREATOR_ANCHOR_LEVEL_ORDER.map((level) => {
          const hasSelection = Boolean(selectedAnchorLevel);
          const isSelected = selectedAnchorLevel === level;
          const gradient = CREATOR_ANCHOR_LEVEL_GRADIENT_MAP[level];
          return {
            name: `${level}级`,
            value: levelCountMap[level],
            itemStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 1,
                y2: 0,
                colorStops: [
                  { offset: 0, color: gradient.from },
                  { offset: 1, color: gradient.to },
                ],
                global: false,
              },
              opacity: hasSelection && !isSelected ? 0.28 : 1,
              borderRadius: 999,
              shadowBlur: isSelected ? 16 : 10,
              shadowColor: isSelected
                ? CREATOR_CHART_STRUCTURAL_COLORS.levelShadowSelected
                : CREATOR_CHART_STRUCTURAL_COLORS.levelShadowDefault,
              shadowOffsetY: isSelected ? 6 : 4,
            },
          };
        }),
      },
    ],
  };
}
