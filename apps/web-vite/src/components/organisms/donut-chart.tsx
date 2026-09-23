'use client';

import { useMemo, type CSSProperties } from 'react';
import { resolvePlatformLegendColor } from '@/lib/platform-colors';
import { ChartContainer } from '../molecules/chart-container';
import styles from './donut-chart.module.css';

export interface DonutChartDataItem {
  name: string;
  value: number;
  prevValue?: number;
  color?: string;
}

export interface DonutChartProps {
  title?: string;
  data: DonutChartDataItem[];
  totalLabel?: string;
  loading?: boolean;
  height?: number;
}

interface DonutSegmentStyle extends CSSProperties {
  '--donut-color': string;
  '--donut-dash': string;
  '--donut-offset': number;
}

interface DonutLegendStyle extends CSSProperties {
  '--donut-color': string;
}

function formatCurrencyCompact(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (safeValue >= 10_000) {
    return `¥${(safeValue / 10_000).toFixed(2)}万`;
  }
  return `¥${safeValue.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

function formatWoW(value: number, prevValue: number): string {
  if (prevValue === 0) {
    return value === 0 ? '0% WoW' : '--';
  }
  const rate = ((value - prevValue) / Math.abs(prevValue)) * 100;
  const rounded = Math.round(Math.abs(rate));
  return rounded === 0 ? '0% WoW' : `${rate >= 0 ? '+' : '-'} ${rounded}% WoW`;
}

function toTransparentColor(color: string): string {
  const normalized = color.trim();
  const hex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
  if (!hex) {
    return color;
  }
  return `rgba(${parseInt(hex[1], 16)}, ${parseInt(hex[2], 16)}, ${parseInt(hex[3], 16)}, 0.38)`;
}

function buildSegments(items: readonly { value: number; color: string }[]) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  return items.map((item) => {
    const percent = total > 0 ? (item.value / total) * 100 : 0;
    const segment = { color: item.color, offset, percent };
    offset += percent;
    return segment;
  });
}

export function DonutChart({
  title,
  data,
  totalLabel = 'GMV总计',
  loading = false,
  height = 280,
}: DonutChartProps) {
  const computed = useMemo(() => {
    const items = data.map((item) => ({
      color: item.color || resolvePlatformLegendColor(item.name) || 'var(--chart-series-1)',
      name: item.name,
      prevValue: Number.isFinite(item.prevValue) ? Number(item.prevValue) : 0,
      value: Number.isFinite(item.value) ? item.value : 0,
    }));
    return {
      currentSegments: buildSegments(items),
      items,
      previousSegments: buildSegments(
        items.map((item) => ({ color: toTransparentColor(item.color), value: item.prevValue })),
      ),
      total: items.reduce((sum, item) => sum + item.value, 0),
    };
  }, [data]);

  return (
    <ChartContainer title={title} loading={loading} height={height}>
      <div className={styles.root} style={{ '--donut-height': `${height}px` } as CSSProperties}>
        <svg className={styles.chart} viewBox="0 0 100 100" role="img" aria-label={`${totalLabel}双环贡献图`}>
          <circle className={styles.track} cx="50" cy="50" r="39" />
          {computed.currentSegments.map((segment, index) => (
            <circle
              key={`current-${computed.items[index]?.name}`}
              className={styles.currentSegment}
              cx="50"
              cy="50"
              r="39"
              pathLength="100"
              style={{
                '--donut-color': segment.color,
                '--donut-dash': `${segment.percent} ${100 - segment.percent}`,
                '--donut-offset': -segment.offset,
              } as DonutSegmentStyle}
            />
          ))}
          {computed.previousSegments.map((segment, index) => (
            <circle
              key={`previous-${computed.items[index]?.name}`}
              className={styles.previousSegment}
              cx="50"
              cy="50"
              r="27"
              pathLength="100"
              style={{
                '--donut-color': segment.color,
                '--donut-dash': `${segment.percent} ${100 - segment.percent}`,
                '--donut-offset': -segment.offset,
              } as DonutSegmentStyle}
            />
          ))}
          <text className={styles.totalLabel} x="50" y="47">{totalLabel}</text>
          <text className={styles.totalValue} x="50" y="58">{formatCurrencyCompact(computed.total)}</text>
        </svg>

        <ul className={styles.legend} aria-label="贡献明细">
          {computed.items.map((item) => (
            <li key={item.name} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ '--donut-color': item.color } as DonutLegendStyle} />
              <span className={styles.legendName}>{item.name}</span>
              <span>{formatCurrencyCompact(item.value)}</span>
              <span>上周 {formatCurrencyCompact(item.prevValue)}</span>
              <span>{formatWoW(item.value, item.prevValue)}</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartContainer>
  );
}

export default DonutChart;
