'use client';

import React, { type CSSProperties, useMemo } from 'react';
import { DOMAIN_TAXONOMY_COLORS } from '@/lib/domain-taxonomy-colors';
import styles from './funnel-chart.module.css';

export interface FunnelChartDataItem {
  name: string;
  value: number;
  prevValue?: number;
  wow?: number;
  conversionText?: string;
  conversionPrevText?: string;
  conversionWoW?: number;
  prevText?: string;
  color?: string;
}

export interface FunnelChartProps {
  data: FunnelChartDataItem[];
  height?: number;
  className?: string;
  loading?: boolean;
}

const FUNNEL_COLORS = DOMAIN_TAXONOMY_COLORS.funnel;

const DEFAULT_STAGE_COLORS = [
  FUNNEL_COLORS.exposure.color,
  FUNNEL_COLORS.visit.color,
  FUNNEL_COLORS.intent.color,
  FUNNEL_COLORS.conversion.color,
  FUNNEL_COLORS.track.color,
];

type FunnelRootStyleVars = CSSProperties & {
  '--funnel-height': string;
  '--funnel-opacity': number;
};

type FunnelStepStyleVars = CSSProperties & {
  '--funnel-step-width': string;
  '--funnel-step-bg': string;
  '--funnel-step-delay': string;
  '--funnel-step-text': string;
};

function formatInteger(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }
  return Math.round(value).toLocaleString('zh-CN');
}

function formatSignedPercent(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${Math.abs(value).toFixed(0)}%`;
}

function resolveTrendClass(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return styles.trendNeutral;
  }
  if (Math.abs(value) < Number.EPSILON) {
    return styles.trendNeutral;
  }
  return value > 0 ? styles.trendUp : styles.trendDown;
}

function normalizeHexColor(input: string): string | null {
  const color = input.trim();
  const hex3 = /^#([a-f\d]{3})$/i.exec(color);
  if (hex3) {
    const expanded = hex3[1]
      .split('')
      .map((part) => `${part}${part}`)
      .join('');
    return `#${expanded}`;
  }

  const hex6 = /^#([a-f\d]{6})$/i.exec(color);
  if (hex6) {
    return `#${hex6[1]}`;
  }

  return null;
}

function getReadableTextColor(background: string): string {
  const normalized = normalizeHexColor(background);
  if (!normalized) {
    return 'var(--text-primary)';
  }

  const red = parseInt(normalized.slice(1, 3), 16);
  const green = parseInt(normalized.slice(3, 5), 16);
  const blue = parseInt(normalized.slice(5, 7), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance >= 145 ? 'var(--text-primary)' : 'var(--text-inverse)';
}

function createFunnelRootStyle(height: number, loading = false): FunnelRootStyleVars {
  return {
    '--funnel-height': `${height}px`,
    '--funnel-opacity': loading ? 0.5 : 1,
  };
}

function createFunnelStepStyle(
  step: { widthPercent: number; color: string; textColor: string },
  index: number,
): FunnelStepStyleVars {
  return {
    '--funnel-step-width': `${step.widthPercent}%`,
    '--funnel-step-bg': step.color,
    '--funnel-step-delay': `${index * 80}ms`,
    '--funnel-step-text': step.textColor,
  };
}

export const FunnelChart: React.FC<FunnelChartProps> = ({
  data,
  height = 360,
  className = '',
  loading = false,
}) => {
  const normalizedData = useMemo(() => {
    const safeData = data
      .map((item, index) => {
        const safeValue = Number.isFinite(item.value) ? Math.max(item.value, 0) : 0;
        const safeColor = item.color || DEFAULT_STAGE_COLORS[index % DEFAULT_STAGE_COLORS.length];
        return {
          ...item,
          value: safeValue,
          color: safeColor,
          textColor: getReadableTextColor(safeColor),
        };
      })
      .filter((item) => Boolean(item.name));

    if (safeData.length === 0 || !safeData.some((item) => item.value > 0)) {
      return [];
    }

    const maxValue = Math.max(...safeData.map((item) => item.value), 1);
    const minWidth = 30;
    const maxWidth = 100;
    const stepGapWidth = 6;
    let previousWidth = maxWidth;

    return safeData.map((item, index) => {
      const logRatio = Math.log10(item.value + 1) / Math.log10(maxValue + 1);
      let widthPercent = minWidth + logRatio * (maxWidth - minWidth);

      if (index === 0) {
        widthPercent = maxWidth;
      } else if (item.value < safeData[index - 1].value) {
        widthPercent = Math.min(widthPercent, previousWidth - stepGapWidth);
      } else {
        widthPercent = Math.min(widthPercent, previousWidth);
      }

      widthPercent = Math.max(minWidth, widthPercent);
      previousWidth = widthPercent;

      return {
        ...item,
        widthPercent,
      };
    });
  }, [data]);

  if (normalizedData.length === 0) {
    return (
      <div className={`${styles.funnelRoot} ${className}`} style={createFunnelRootStyle(height)}>
        <div className={styles.emptyState}>暂无漏斗数据</div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.funnelRoot} ${className}`}
      style={createFunnelRootStyle(height, loading)}
    >
      <div className={styles.funnelStack}>
        {normalizedData.map((step, index) => {
          const wowClassName = resolveTrendClass(step.wow);
          const isNeutralTrend = wowClassName === styles.trendNeutral;
          const isFirstStage = index === 0;
          const nextStep = normalizedData[index + 1];
          const connectorTrendClass = resolveTrendClass(nextStep?.conversionWoW);
          const connectorTrendNeutral = connectorTrendClass === styles.trendNeutral;
          const connectorWoWText =
            typeof nextStep?.conversionWoW === 'number' && Number.isFinite(nextStep.conversionWoW)
              ? `同期环比 ${formatSignedPercent(nextStep.conversionWoW)}`
              : '同期环比 --';

          return (
            <React.Fragment key={`${step.name}-${index}`}>
              <div className={styles.stepBlock}>
                <div className={styles.funnelStepWrap}>
                  <div
                    className={styles.funnelStep}
                    style={createFunnelStepStyle(step, index)}
                  >
                    <div className={styles.stepHighlight} />
                    <div className={styles.stepPrimaryRow}>
                      <span className={styles.stepLabel}>
                        {step.name}
                      </span>
                      <span className={styles.stepValue}>
                        {formatInteger(step.value)}
                      </span>
                    </div>
                    <div className={styles.stepSecondaryRow}>
                      {isFirstStage ? (
                        <span className={styles.stepMetaHint}>
                          行为流起点
                        </span>
                      ) : null}
                      <div className={styles.stepMetaRight}>
                        <span className={styles.stepMetaPrev}>
                          {step.prevText || `上周 ${formatInteger(step.prevValue)}`}
                        </span>
                        <span
                          className={`${styles.stepMetaWow} ${isNeutralTrend ? styles.stepTextTone : wowClassName}`}
                        >
                          {formatSignedPercent(step.wow)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {index < normalizedData.length - 1 ? (
                <div className={styles.connector}>
                  <div className={styles.connectorMetric}>
                    <span className={styles.connectorLabel}>{nextStep?.conversionText || '--'}</span>
                    <span className={styles.connectorPrev}>
                      {nextStep?.conversionPrevText || '上周 --'}
                    </span>
                    <span
                      className={`${styles.connectorWoW} ${
                        connectorTrendNeutral ? styles.connectorNeutralTone : connectorTrendClass
                      }`}
                    >
                      {connectorWoWText}
                    </span>
                  </div>
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
