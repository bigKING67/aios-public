import dayjs from 'dayjs';
import type { EChartsCoreOption } from 'echarts/core';
import { CHART_SERIES_COLORS } from '@/lib/domain-taxonomy-colors';
import {
  CREATOR_CHART_STRUCTURAL_COLORS,
  CREATOR_CHART_TEXT_COLORS,
} from './creator-chart-colors';
import type { DateRange } from './creator-date-range';
import {
  escapeTooltipHtml,
  formatCompactCurrency,
  formatInteger,
  formatTooltipCurrency,
} from './creator-formatters';
import type { CreatorShortVideoDetailRow } from './creator-short-video-dashboard-types';
import {
  formatShortVideoRoi,
  resolveShortVideoAdCost,
  resolveShortVideoGmv,
  resolveShortVideoGsv,
  resolveShortVideoOrderCount,
  resolveShortVideoQianchuanGmv,
  resolveShortVideoQianchuanGsv,
} from './creator-short-video-metrics';
import type { CreatorTrendTooltipStyles } from './creator-trend-tooltip';

interface ShortVideoTrendContributor {
  key: string;
  name: string;
  qianchuanGmv: number;
  qianchuanGsv: number;
  qianchuanCost: number;
  qianchuanOrderCount: number;
  cartGmv: number;
  cartGsv: number;
}

export interface CreatorShortVideoTrendChartRow {
  date: string;
  qianchuanGmv: number;
  qianchuanGsv: number;
  qianchuanCost: number;
  qianchuanOrderCount: number;
  cartGmv: number;
  cartGsv: number;
  contributors: ShortVideoTrendContributor[];
}

interface MutableShortVideoTrendRow {
  date: string;
  qianchuanGmv: number;
  qianchuanGsv: number;
  qianchuanCost: number;
  qianchuanOrderCount: number;
  cartGmv: number;
  cartGsv: number;
  contributors: Map<string, ShortVideoTrendContributor>;
}

interface BuildCreatorShortVideoTrendChartOptionParams {
  rows: readonly CreatorShortVideoDetailRow[];
  currentRange: DateRange;
  styles: CreatorTrendTooltipStyles;
}

const SHORT_VIDEO_COMBO_CHART_COLORS = {
  qianchuanGmv: CHART_SERIES_COLORS.series1,
  qianchuanGsv: CHART_SERIES_COLORS.series2,
  cartGmv: CHART_SERIES_COLORS.series4,
  cartGsv: CHART_SERIES_COLORS.series5,
} as const;

function createMutableTrendRow(date: string): MutableShortVideoTrendRow {
  return {
    date,
    qianchuanGmv: 0,
    qianchuanGsv: 0,
    qianchuanCost: 0,
    qianchuanOrderCount: 0,
    cartGmv: 0,
    cartGsv: 0,
    contributors: new Map(),
  };
}

function normalizeShortVideoTrendDate(value: string | null | undefined): string | null {
  const parsed = dayjs(String(value ?? '').slice(0, 10));
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
}

function resolveShortVideoContributorKey(row: CreatorShortVideoDetailRow): string {
  return (
    row.author_douyin_id ||
    row.influencer_id ||
    row.author_nickname ||
    row.influencer_name ||
    'unknown'
  ).trim();
}

function resolveShortVideoContributorName(row: CreatorShortVideoDetailRow): string {
  return (
    row.author_nickname ||
    row.influencer_name ||
    row.author_name_snapshot ||
    row.author_douyin_id ||
    row.influencer_id ||
    '未知达人'
  ).trim();
}

function addContributorMetrics(row: MutableShortVideoTrendRow, source: CreatorShortVideoDetailRow): void {
  const key = resolveShortVideoContributorKey(source);
  const contributor = row.contributors.get(key) ?? {
    key,
    name: resolveShortVideoContributorName(source),
    qianchuanGmv: 0,
    qianchuanGsv: 0,
    qianchuanCost: 0,
    qianchuanOrderCount: 0,
    cartGmv: 0,
    cartGsv: 0,
  };

  contributor.qianchuanGmv += resolveShortVideoQianchuanGmv(source);
  contributor.qianchuanGsv += resolveShortVideoQianchuanGsv(source);
  contributor.qianchuanCost += resolveShortVideoAdCost(source);
  contributor.qianchuanOrderCount += resolveShortVideoOrderCount(source);
  contributor.cartGmv += resolveShortVideoGmv(source);
  contributor.cartGsv += resolveShortVideoGsv(source);
  row.contributors.set(key, contributor);
}

function addRowMetrics(target: MutableShortVideoTrendRow, source: CreatorShortVideoDetailRow): void {
  target.qianchuanGmv += resolveShortVideoQianchuanGmv(source);
  target.qianchuanGsv += resolveShortVideoQianchuanGsv(source);
  target.qianchuanCost += resolveShortVideoAdCost(source);
  target.qianchuanOrderCount += resolveShortVideoOrderCount(source);
  target.cartGmv += resolveShortVideoGmv(source);
  target.cartGsv += resolveShortVideoGsv(source);
  addContributorMetrics(target, source);
}

function collectDateKeys(rows: readonly CreatorShortVideoDetailRow[], currentRange: DateRange): string[] {
  const start = currentRange.start.startOf('day');
  const end = currentRange.end.startOf('day');
  const daySpan = end.diff(start, 'day');

  if (start.isValid() && end.isValid() && daySpan >= 0 && daySpan <= 370) {
    return Array.from({ length: daySpan + 1 }, (_, index) => start.add(index, 'day').format('YYYY-MM-DD'));
  }

  return Array.from(
    new Set(rows.map((row) => normalizeShortVideoTrendDate(row.stat_date)).filter((date): date is string => Boolean(date)))
  ).sort((left, right) => left.localeCompare(right));
}

function finalizeContributorRows(contributors: Map<string, ShortVideoTrendContributor>): ShortVideoTrendContributor[] {
  return Array.from(contributors.values()).sort((left, right) => {
    const qianchuanGsvDiff = right.qianchuanGsv - left.qianchuanGsv;
    if (Math.abs(qianchuanGsvDiff) > Number.EPSILON) {
      return qianchuanGsvDiff;
    }

    const cartGmvDiff = right.cartGmv - left.cartGmv;
    if (Math.abs(cartGmvDiff) > Number.EPSILON) {
      return cartGmvDiff;
    }

    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

export function buildCreatorShortVideoTrendRows({
  rows,
  currentRange,
}: Pick<BuildCreatorShortVideoTrendChartOptionParams, 'rows' | 'currentRange'>): CreatorShortVideoTrendChartRow[] {
  if (!rows.length) {
    return [];
  }

  const rowsByDate = new Map<string, MutableShortVideoTrendRow>();
  for (const dateKey of collectDateKeys(rows, currentRange)) {
    rowsByDate.set(dateKey, createMutableTrendRow(dateKey));
  }

  rows.forEach((row) => {
    const dateKey = normalizeShortVideoTrendDate(row.stat_date);
    if (!dateKey) {
      return;
    }

    const targetRow = rowsByDate.get(dateKey) ?? createMutableTrendRow(dateKey);
    addRowMetrics(targetRow, row);
    rowsByDate.set(dateKey, targetRow);
  });

  return Array.from(rowsByDate.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((row) => ({
      date: row.date,
      qianchuanGmv: row.qianchuanGmv,
      qianchuanGsv: row.qianchuanGsv,
      qianchuanCost: row.qianchuanCost,
      qianchuanOrderCount: row.qianchuanOrderCount,
      cartGmv: row.cartGmv,
      cartGsv: row.cartGsv,
      contributors: finalizeContributorRows(row.contributors),
    }));
}

function formatAxisCurrency(value: number): string {
  return formatCompactCurrency(value).replace('¥', '');
}

function formatShortVideoRoiFromParts(gmv: number, cost: number): string {
  return formatShortVideoRoi(cost > 0 ? gmv / cost : null);
}

function buildMetricCardHtml(label: string, value: string, styles: CreatorTrendTooltipStyles): string {
  return `
    <div class="${styles.trendTooltipMetricItem}">
      <span>${escapeTooltipHtml(label)}</span>
      <strong>${escapeTooltipHtml(value)}</strong>
    </div>
  `;
}

function buildShortVideoTrendTooltipHtml({
  row,
  dateLabel,
  styles,
}: {
  row: CreatorShortVideoTrendChartRow;
  dateLabel: string;
  styles: CreatorTrendTooltipStyles;
}): string {
  const visibleContributors = row.contributors.slice(0, 8);
  const contributorHtml = visibleContributors.length
    ? visibleContributors
        .map((item) => {
          const metricText = [
            `千川GMV ${formatTooltipCurrency(item.qianchuanGmv)}`,
            `千川GSV ${formatTooltipCurrency(item.qianchuanGsv)}`,
            `千川订单 ${formatInteger(item.qianchuanOrderCount)}`,
            `千川ROI ${formatShortVideoRoiFromParts(item.qianchuanGmv, item.qianchuanCost)}`,
            `挂车GMV ${formatTooltipCurrency(item.cartGmv)}`,
            `挂车GSV ${formatTooltipCurrency(item.cartGsv)}`,
          ].join('，');
          return `
            <div class="${styles.trendTooltipContributorRow}">
              <span class="${styles.trendTooltipContributorName}">${escapeTooltipHtml(item.name)}</span>
              <span class="${styles.trendTooltipContributorMetrics}">${escapeTooltipHtml(metricText)}</span>
            </div>
          `;
        })
        .join('')
    : `<div class="${styles.trendTooltipEmpty}">当日暂无匹配达人</div>`;
  const moreHtml =
    row.contributors.length > visibleContributors.length
      ? `<div class="${styles.trendTooltipMore}">等 ${row.contributors.length - visibleContributors.length} 位达人</div>`
      : '';

  return `
    <div class="${styles.trendTooltipCard}">
      <div class="${styles.trendTooltipDate}">${escapeTooltipHtml(dateLabel)}</div>
      <div class="${styles.trendTooltipMetrics}">
        ${buildMetricCardHtml('千川GMV', formatTooltipCurrency(row.qianchuanGmv), styles)}
        ${buildMetricCardHtml('千川GSV', formatTooltipCurrency(row.qianchuanGsv), styles)}
        ${buildMetricCardHtml('千川订单', formatInteger(row.qianchuanOrderCount), styles)}
        ${buildMetricCardHtml('千川ROI', formatShortVideoRoiFromParts(row.qianchuanGmv, row.qianchuanCost), styles)}
        ${buildMetricCardHtml('挂车GMV', formatTooltipCurrency(row.cartGmv), styles)}
        ${buildMetricCardHtml('挂车GSV', formatTooltipCurrency(row.cartGsv), styles)}
      </div>
      <section class="${styles.trendTooltipSection}">
        <h4 class="${styles.trendTooltipSectionTitle}">当日达人明细</h4>
        <div class="${styles.trendTooltipContributorList}">
          ${contributorHtml}
        </div>
        ${moreHtml}
      </section>
    </div>
  `;
}

export function buildCreatorShortVideoTrendChartOption({
  rows,
  currentRange,
  styles,
}: BuildCreatorShortVideoTrendChartOptionParams): EChartsCoreOption | undefined {
  const trendRows = buildCreatorShortVideoTrendRows({ rows, currentRange });
  if (!trendRows.length) {
    return undefined;
  }

  const labels = trendRows.map((row) => dayjs(row.date).format('MM-DD'));

  return {
    color: [
      SHORT_VIDEO_COMBO_CHART_COLORS.qianchuanGmv,
      SHORT_VIDEO_COMBO_CHART_COLORS.qianchuanGsv,
      SHORT_VIDEO_COMBO_CHART_COLORS.cartGmv,
      SHORT_VIDEO_COMBO_CHART_COLORS.cartGsv,
    ],
    legend: {
      top: 4,
      textStyle: {
        color: CREATOR_CHART_TEXT_COLORS.legend,
        fontSize: 12,
      },
      data: ['千川GMV', '千川GSV', '挂车GMV', '挂车GSV'],
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
        const row = trendRows[dataIndex] ?? trendRows[0];
        const dateLabel = labels[dataIndex] || first?.axisValueLabel || '--';
        return buildShortVideoTrendTooltipHtml({ row, dateLabel, styles });
      },
    },
    grid: {
      left: 20,
      right: 28,
      top: 48,
      bottom: 28,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: true,
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
    yAxis: [
      {
        type: 'value',
        name: '千川',
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
          formatter: formatAxisCurrency,
        },
      },
      {
        type: 'value',
        name: '挂车',
        axisLine: {
          show: false,
        },
        splitLine: {
          show: false,
        },
        axisLabel: {
          color: CREATOR_CHART_TEXT_COLORS.axis,
          formatter: formatAxisCurrency,
        },
      },
    ],
    series: [
      {
        name: '千川GMV',
        type: 'bar',
        yAxisIndex: 0,
        barMaxWidth: 18,
        data: trendRows.map((row) => row.qianchuanGmv),
      },
      {
        name: '千川GSV',
        type: 'bar',
        yAxisIndex: 0,
        barMaxWidth: 18,
        data: trendRows.map((row) => row.qianchuanGsv),
      },
      {
        name: '挂车GMV',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: {
          width: 2,
        },
        data: trendRows.map((row) => row.cartGmv),
      },
      {
        name: '挂车GSV',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: {
          width: 2,
        },
        data: trendRows.map((row) => row.cartGsv),
      },
    ],
  };
}
