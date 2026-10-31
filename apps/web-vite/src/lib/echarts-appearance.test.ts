import { describe, expect, it } from 'vitest';
import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';
import { adaptChartOptionToAppearance, ECHARTS_DARK_COLOR_PAIRS } from './echarts-appearance';

const darkOf = (light: string) => ECHARTS_DARK_COLOR_PAIRS.find(([from]) => from === light)?.[1];

describe('adaptChartOptionToAppearance', () => {
  const tokens = ECHARTS_CHART_TOKENS;
  const option = {
    color: [tokens.primarySeries, tokens.secondarySeries],
    textStyle: { color: tokens.textSecondary },
    tooltip: { backgroundColor: tokens.tooltipBackground, textStyle: { color: tokens.textInverse } },
    xAxis: { axisLine: { lineStyle: { color: tokens.axisLine } }, data: ['周一', '周二'] },
    series: [{ data: [1, 2, 3], itemStyle: { borderColor: tokens.surface, shadowColor: tokens.softShadow } }],
  };

  it('returns the light option untouched', () => {
    expect(adaptChartOptionToAppearance(option, 'light')).toBe(option);
  });

  it('swaps light tokens for their dark values and keeps alpha', () => {
    const dark = adaptChartOptionToAppearance(option, 'dark');
    expect(dark.color).toEqual([darkOf(tokens.primarySeries), darkOf(tokens.secondarySeries)]);
    expect(dark.textStyle.color).toBe(darkOf(tokens.textSecondary));
    expect(dark.xAxis.axisLine.lineStyle.color).toBe(darkOf(tokens.axisLine));
    expect(dark.xAxis.data).toEqual(['周一', '周二']);
    expect(dark.series[0].data).toBe(option.series[0].data);
    expect(option.color).toEqual([tokens.primarySeries, tokens.secondarySeries]);
  });

  it('keeps tooltips dark under white text, white text white, and shadows black', () => {
    const dark = adaptChartOptionToAppearance(option, 'dark');
    expect(dark.tooltip.textStyle.color).toBe(tokens.textInverse);
    expect(dark.tooltip.backgroundColor).toMatch(/^rgba\(46, 46, 46, 0\.88\)$/);
    expect(dark.series[0].itemStyle.borderColor).not.toBe(tokens.surface);
    expect(dark.series[0].itemStyle.shadowColor).toMatch(/^rgba\(0, 0, 0, /);
  });

  it('turns a white item fill into the dark card so hollow marks stay hollow', () => {
    const hollow = {
      series: [{
        data: [{ value: 1, itemStyle: { color: tokens.surface } }],
        label: { color: tokens.textInverse },
      }],
    };
    const dark = adaptChartOptionToAppearance(hollow, 'dark');
    const darkCard = adaptChartOptionToAppearance(option, 'dark').series[0].itemStyle.borderColor;
    expect(dark.series[0].data[0].itemStyle.color).toBe(darkCard);
    expect(dark.series[0].label.color).toBe(tokens.textInverse);
  });
});
