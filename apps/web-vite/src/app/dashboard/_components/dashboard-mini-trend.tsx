'use client';

import { useMemo, useState } from 'react';
import { ECHARTS_CHART_TOKENS } from '@/styles/echarts-theme';
import type { MiniTrendProps } from './dashboard-types';
import styles from './dashboard-mini-trend.module.css';

export function MiniTrend({ id, values, labels, color, formatValue, variant = 'default' }: MiniTrendProps) {
  const gradientId = `mini-trend-gradient-${id}`;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const rootClassName = [
    styles.wrap,
    variant === 'compact' ? styles.compact : undefined,
    variant === 'dense' ? styles.dense : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const points = useMemo(() => {
    const maxValue = values.length > 0 ? Math.max(...values) : 1;
    const minValue = values.length > 0 ? Math.min(...values) : 0;
    const gap = maxValue - minValue;
    const width = 220;
    const height = 66;
    const verticalPadding = 5;
    const plotHeight = height - verticalPadding * 2;

    const detailPoints = values.map((value, index) => {
      const ratio = values.length === 1 ? 0.5 : index / Math.max(1, values.length - 1);
      const x = ratio * width;
      const normalized = gap === 0 ? 0.5 : (value - minValue) / gap;
      const y = verticalPadding + (1 - normalized) * plotHeight;
      return {
        x,
        y,
        xRatio: ratio * 100,
        label: labels[index] || `#${index + 1}`,
        value,
      };
    });

    const linePath = (() => {
      if (detailPoints.length === 0) {
        return '';
      }
      if (detailPoints.length === 1) {
        const only = detailPoints[0];
        return `M ${only.x.toFixed(2)} ${only.y.toFixed(2)}`;
      }
      if (detailPoints.length === 2) {
        const first = detailPoints[0];
        const last = detailPoints[1];
        return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
      }

      let path = `M ${detailPoints[0].x.toFixed(2)} ${detailPoints[0].y.toFixed(2)}`;
      for (let index = 1; index < detailPoints.length - 1; index += 1) {
        const current = detailPoints[index];
        const next = detailPoints[index + 1];
        const controlX = ((current.x + next.x) / 2).toFixed(2);
        const controlY = ((current.y + next.y) / 2).toFixed(2);
        path += ` Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${controlX} ${controlY}`;
      }
      const prev = detailPoints[detailPoints.length - 2];
      const last = detailPoints[detailPoints.length - 1];
      path += ` Q ${prev.x.toFixed(2)} ${prev.y.toFixed(2)} ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
      return path;
    })();

    const areaPath = (() => {
      if (!linePath || detailPoints.length === 0) {
        return '';
      }
      const start = detailPoints[0];
      const end = detailPoints[detailPoints.length - 1];
      return `${linePath} L ${end.x.toFixed(2)} ${height.toFixed(2)} L ${start.x.toFixed(2)} ${height.toFixed(2)} Z`;
    })();

    return {
      linePath,
      areaPath,
      detailPoints,
    };
  }, [labels, values]);

  const activePoint = hoverIndex === null ? null : points.detailPoints[hoverIndex] || null;

  return (
    <div className={rootClassName} onMouseLeave={() => setHoverIndex(null)}>
      <svg className={styles.chart} viewBox="0 0 220 66" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={points.areaPath} fill={`url(#${gradientId})`} />
        <path
          d={points.linePath}
          fill="none"
          stroke={color}
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.detailPoints.map((point, index) => (
          <circle
            key={`${point.label}-${index}`}
            className={styles.hit}
            cx={point.x}
            cy={point.y}
            r={8}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(index)}
          />
        ))}
        {activePoint ? (
          <circle
            cx={activePoint.x}
            cy={activePoint.y}
            r={3.4}
            fill={ECHARTS_CHART_TOKENS.textInverse}
            stroke={color}
            strokeWidth={1.6}
          />
        ) : null}
      </svg>
      {activePoint ? (
        <div className={styles.tooltip} style={{ left: `${activePoint.xRatio}%` }}>
          <span>{activePoint.label}</span>
          <strong className={styles.tooltipValue}>{formatValue(activePoint.value)}</strong>
        </div>
      ) : null}
    </div>
  );
}
