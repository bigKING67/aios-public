import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';
import type { EChartsCoreOption } from 'echarts/core';
import { formatCompactWanCurrency, formatTableNumber } from './dashboard-formatters';
import type { ShareItem } from './dashboard-types';

type PlatformContributionRow = ShareItem & {
  originalIndex: number;
  gmvShare: number;
  refundRate: number | null;
};

type PlatformContributionSeriesData = {
  value: number;
  row: PlatformContributionRow;
};

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatAmountAxis(value: number): string {
  if (Math.abs(value) >= 10_000) {
    return `${(value / 10_000).toLocaleString('zh-CN', {
      maximumFractionDigits: 1,
    })}万`;
  }

  return Math.round(value).toLocaleString('zh-CN');
}

function formatDirectAmount(value: number): string {
  if (Math.abs(value) < 10_000) {
    return formatCompactWanCurrency(value);
  }

  return `¥${(value / 10_000).toFixed(1)}万`;
}

function formatOverviewShareTooltip(params: unknown): string {
  const seriesParams = Array.isArray(params) ? params : [params];
  const data = seriesParams
    .map((item) => (item as { data?: PlatformContributionSeriesData } | null)?.data)
    .find((item): item is PlatformContributionSeriesData => Boolean(item?.row));

  if (!data) {
    return '';
  }

  const { row } = data;
  const exactGmv = `¥${formatTableNumber(row.gmv, 2)}`;
  const exactGsv = `¥${formatTableNumber(row.gsv, 2)}`;
  const refundAmount = row.gmv - row.gsv;
  const exactRefundAmount = `¥${formatTableNumber(refundAmount, 2)}`;
  const refundRate = row.refundRate === null ? '--' : formatPercent(row.refundRate);

  return [
    `<strong>${row.name}</strong>`,
    `GMV：${exactGmv}`,
    `GMV 占比：${formatPercent(row.gmvShare)}`,
    `GSV（支付时间）：${exactGsv}`,
    `退款金额（支付时间）：${exactRefundAmount}`,
    `退款率（支付时间）：${refundRate}`,
  ].join('<br/>');
}

function buildRows(share: ShareItem[]): PlatformContributionRow[] {
  const totalGmv = share.reduce((sum, item) => sum + item.gmv, 0);

  return share
    .map((item, originalIndex) => ({
      ...item,
      originalIndex,
      gmvShare: totalGmv > 0 ? (item.gmv / totalGmv) * 100 : 0,
      refundRate: item.gmv > 0 ? ((item.gmv - item.gsv) / item.gmv) * 100 : null,
    }))
    .sort((left, right) =>
      right.gmv - left.gmv
      || right.gsv - left.gsv
      || left.originalIndex - right.originalIndex
    );
}

function buildSeriesData(rows: PlatformContributionRow[], metric: 'gmv' | 'gsv') {
  return rows.map((row) => ({
    value: row[metric],
    row,
  }));
}

export function buildDashboardOverviewShareOption({
  share,
  isMobile = false,
}: {
  share: ShareItem[];
  isMobile?: boolean;
}): EChartsCoreOption {
  const tokens = ECHARTS_CHART_TOKENS;
  const rows = buildRows(share);

  return {
    aria: {
      enabled: true,
      label: {
        description: '各平台本期 GMV、GSV（支付时间）及退款率（支付时间），按 GMV 从高到低排序。',
      },
    },
    tooltip: {
      trigger: 'item',
      formatter: formatOverviewShareTooltip,
    },
    legend: {
      top: 0,
      left: 'center',
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 16,
      textStyle: { color: tokens.textSecondary },
      data: ['GMV', 'GSV（支付时间）'],
    },
    grid: {
      left: 8,
      right: isMobile ? 142 : 174,
      top: 34,
      bottom: 20,
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      min: 0,
      splitNumber: isMobile ? 2 : 3,
      axisLabel: {
        formatter: formatAmountAxis,
        color: tokens.textTertiary,
        fontSize: 11,
        hideOverlap: true,
      },
      splitLine: { lineStyle: { color: tokens.gridLine, type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((item) => item.name),
      axisLabel: {
        color: tokens.textSecondary,
        width: 84,
        overflow: 'truncate',
        fontSize: 12,
        fontWeight: 520,
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: 'GMV',
        type: 'bar',
        barMaxWidth: 9,
        barGap: '28%',
        barCategoryGap: '46%',
        itemStyle: {
          color: tokens.primarySeries,
          borderRadius: [0, 6, 6, 0],
        },
        label: {
          show: true,
          position: 'right',
          distance: 7,
          formatter: ({ data }: { data?: PlatformContributionSeriesData }) => {
            const row = data?.row;
            return row
              ? `{amount|${formatDirectAmount(row.gmv)}}{meta|  占比 ${formatPercent(row.gmvShare)}}`
              : '';
          },
          color: tokens.textSecondary,
          rich: {
            amount: { color: tokens.textPrimary, fontSize: 12, fontWeight: 600 },
            meta: { color: tokens.textTertiary, fontSize: 11, fontWeight: 500 },
          },
        },
        data: buildSeriesData(rows, 'gmv'),
      },
      {
        name: 'GSV（支付时间）',
        type: 'bar',
        barMaxWidth: 9,
        barGap: '28%',
        barCategoryGap: '46%',
        itemStyle: {
          color: tokens.secondarySeries,
          borderRadius: [0, 6, 6, 0],
        },
        label: {
          show: true,
          position: 'right',
          distance: 7,
          formatter: ({ data }: { data?: PlatformContributionSeriesData }) => {
            const row = data?.row;
            if (!row) {
              return '';
            }
            const refundRate = row.refundRate === null ? '--' : formatPercent(row.refundRate);
            return `{amount|${formatDirectAmount(row.gsv)}}{meta|  退款率 ${refundRate}}`;
          },
          color: tokens.textSecondary,
          rich: {
            amount: { color: tokens.textPrimary, fontSize: 12, fontWeight: 600 },
            meta: { color: tokens.textTertiary, fontSize: 11, fontWeight: 500 },
          },
        },
        data: buildSeriesData(rows, 'gsv'),
      },
    ],
  };
}
