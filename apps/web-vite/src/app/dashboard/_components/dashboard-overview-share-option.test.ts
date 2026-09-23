import { describe, expect, it } from 'vitest';

import { buildDashboardOverviewShareOption } from './dashboard-overview-share-option';

type SeriesData = {
  value: number;
  row: {
    name: string;
    gmvShare: number;
    refundRate: number | null;
  };
};

type ChartOption = {
  aria: { label: { description: string } };
  tooltip: { trigger: string; formatter: (params: unknown) => string };
  legend: { left: number | string };
  grid: { right: number };
  xAxis: {
    type: string;
    splitNumber: number;
    axisLabel: {
      formatter: (value: number) => string;
      hideOverlap: boolean;
    };
  };
  yAxis: { data: string[] };
  series: Array<{
    name: string;
    data: SeriesData[];
    label: { formatter: (params: { data: SeriesData }) => string };
  }>;
};

function buildOption(): ChartOption {
  return buildDashboardOverviewShareOption({
    share: [
      { name: '天猫', gmv: 439, gsv: 350 },
      { name: '抖音', gmv: 334, gsv: 240 },
      { name: '小红书', gmv: 46, gsv: 40 },
      { name: '京东', gmv: 33, gsv: 25 },
      { name: '微信小程序', gmv: 149, gsv: 130 },
    ],
  }) as ChartOption;
}

function buildMobileOption(): ChartOption {
  return buildDashboardOverviewShareOption({
    isMobile: true,
    share: [
      { name: '抖音', gmv: 1_521_700, gsv: 1_197_412 },
      { name: '天猫', gmv: 109_895.93, gsv: 92_926.33 },
    ],
  }) as ChartOption;
}

function buildWideOption(): ChartOption {
  return buildDashboardOverviewShareOption({
    share: [
      { name: '抖音', gmv: 4_320_700, gsv: 2_674_900 },
      { name: '天猫', gmv: 3_793_500, gsv: 2_896_500 },
    ],
  }) as ChartOption;
}

describe('dashboard overview platform contribution option', () => {
  it('sorts platforms by GMV descending and uses an amount axis', () => {
    const option = buildOption();

    expect(option.xAxis.type).toBe('value');
    expect(option.xAxis.splitNumber).toBe(3);
    expect(option.xAxis.axisLabel.hideOverlap).toBe(true);
    expect(option.xAxis.axisLabel.formatter(300_000)).toBe('30万');
    expect(option.yAxis.data).toEqual(['天猫', '抖音', '微信小程序', '小红书', '京东']);
    expect(option.series.map((series) => series.name)).toEqual(['GMV', 'GSV（支付时间）']);
    expect(option.legend.left).toBe('center');
  });

  it('keeps GMV, GSV, contribution, and pay-time refund rate visible without hover', () => {
    const option = buildOption();
    const gmvLabel = option.series[0].label.formatter({ data: option.series[0].data[0] });
    const gsvLabel = option.series[1].label.formatter({ data: option.series[1].data[0] });

    expect(gmvLabel).toContain('¥439');
    expect(gmvLabel).toContain('占比 43.9%');
    expect(gsvLabel).toContain('¥350');
    expect(gsvLabel).toContain('退款率 20.3%');
    expect(gmvLabel).not.toContain('·');
    expect(gsvLabel).not.toContain('·');
    expect(option.series[1].data[0].row.refundRate).toBeCloseTo(20.3, 1);
  });

  it('uses one-decimal wan amounts and explicit rate labels on wide layouts', () => {
    const option = buildWideOption();
    const gmvLabel = option.series[0].label.formatter({ data: option.series[0].data[0] });
    const gsvLabel = option.series[1].label.formatter({ data: option.series[1].data[0] });

    expect(option.grid.right).toBe(174);
    expect(gmvLabel).toContain('¥432.1万');
    expect(gmvLabel).toContain('占比 53.2%');
    expect(gsvLabel).toContain('¥267.5万');
    expect(gsvLabel).toContain('退款率 38.1%');
  });

  it('exposes exact values, GMV contribution, and pay-time refund metrics in the tooltip', () => {
    const option = buildOption();
    const tooltip = option.tooltip.formatter([
      { data: option.series[0].data[0] },
      { data: option.series[1].data[0] },
    ]);

    expect(option.tooltip.trigger).toBe('item');
    expect(tooltip).toContain('GMV：¥439.00');
    expect(tooltip).toContain('GMV 占比：43.9%');
    expect(tooltip).toContain('GSV（支付时间）：¥350.00');
    expect(tooltip).toContain('退款金额（支付时间）：¥89.00');
    expect(tooltip).toContain('退款率（支付时间）：20.3%');
    expect(option.aria.label.description).toContain('退款率（支付时间）');
  });

  it('uses fewer amount ticks and shorter direct amounts on mobile', () => {
    const option = buildMobileOption();
    const gmvLabel = option.series[0].label.formatter({ data: option.series[0].data[0] });
    const gsvLabel = option.series[1].label.formatter({ data: option.series[1].data[0] });

    expect(option.grid.right).toBe(142);
    expect(option.legend.left).toBe('center');
    expect(option.xAxis.splitNumber).toBe(2);
    expect(gmvLabel).toContain('¥152.2万');
    expect(gsvLabel).toContain('¥119.7万');
  });
});
