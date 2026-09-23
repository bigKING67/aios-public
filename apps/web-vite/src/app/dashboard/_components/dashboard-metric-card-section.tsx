import { InfoCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { ReactNode } from 'react';

import { SPOTLIGHT_TREND_COLOR } from './dashboard-config';
import {
  formatCompactWanCurrency,
  formatCompactWanInteger,
  formatSignedRatePercent,
  formatTableNumber,
  formatTableRate,
} from './dashboard-formatters';
import metricCardStyles from './dashboard-metric-card-grid.module.css';
import metricStyles from './dashboard-metric-section.module.css';
import spotlightStyles from './dashboard-metric-spotlight.module.css';
import { MiniTrend } from './dashboard-mini-trend';
import trafficSectionStyles from './dashboard-traffic-section.module.css';
import type { LiveMetricCard, MiniTrendProps } from './dashboard-types';

type DashboardMetricCardHeading = {
  title: string;
  subtitle?: string;
};

export type DashboardMetricCardSectionProps = {
  header: ReactNode;
  topCards: LiveMetricCard[];
  bottomCards: LiveMetricCard[];
  bottomCardRows?: LiveMetricCard[][];
  bottomGridColumnCounts?: number[];
  trendIdPrefix: string;
  resolveTopHeading: (item: LiveMetricCard) => DashboardMetricCardHeading;
  getTrendClassNameByRate: (value: number | null | undefined) => string;
  topGridClassName?: string;
  topCardClassName?: string;
  miniTrendVariant?: MiniTrendProps['variant'];
};

function formatMetricTrendValue(item: LiveMetricCard, value: number): string {
  if (item.format === 'rate') {
    return formatTableRate(value);
  }
  if (item.format === 'currency') {
    return formatCompactWanCurrency(value);
  }
  if (item.format === 'number') {
    return formatTableNumber(value, 2);
  }
  return formatCompactWanInteger(value);
}

function resolveSpotlightGridCountClassName(count: number): string | undefined {
  if (count === 1) {
    return spotlightStyles.spotlightGridOne;
  }
  if (count === 2) {
    return spotlightStyles.spotlightGridTwo;
  }
  if (count === 3) {
    return spotlightStyles.spotlightGridThree;
  }
  return undefined;
}

function resolveMetricGridCountClassName(count: number | undefined): string | undefined {
  if (count === 3) {
    return metricCardStyles.metricGridThree;
  }
  if (count === 4) {
    return metricCardStyles.metricGridFour;
  }
  return undefined;
}

export function DashboardMetricCardSection({
  header,
  topCards,
  bottomCards,
  bottomCardRows,
  bottomGridColumnCounts,
  trendIdPrefix,
  resolveTopHeading,
  getTrendClassNameByRate,
  topGridClassName,
  topCardClassName,
  miniTrendVariant,
}: DashboardMetricCardSectionProps) {
  const spotlightGridCountClassName = topGridClassName ? undefined : resolveSpotlightGridCountClassName(topCards.length);
  const spotlightGridClassName = [spotlightStyles.spotlightGrid, spotlightGridCountClassName, topGridClassName]
    .filter(Boolean)
    .join(' ');
  const spotlightCardClassName = [spotlightStyles.spotlightCard, topCardClassName].filter(Boolean).join(' ');
  const resolvedBottomRows = bottomCardRows && bottomCardRows.length > 0 ? bottomCardRows : [bottomCards];

  return (
    <section className={trafficSectionStyles.panel}>
      <div className={metricStyles.sectionStack}>
        <section className={metricStyles.sectionBlock}>
          {header}
          <section className={spotlightGridClassName}>
            {topCards.map((item) => {
              const heading = resolveTopHeading(item);
              const miniTrendValues =
                item.previousRaw !== null && item.currentRaw !== null
                  ? ([item.previousRaw, item.currentRaw] as [number, number])
                  : null;
              return (
                <article key={item.key} className={spotlightCardClassName}>
                  <div className={spotlightStyles.spotlightHeading}>
                    <span>{heading.title}</span>
                    {item.tooltip ? (
                      <Tooltip title={item.tooltip}>
                        <span
                          className={spotlightStyles.spotlightTooltipIcon}
                          aria-label={`${heading.title}口径说明`}
                          role="img"
                        >
                          <InfoCircleOutlined />
                        </span>
                      </Tooltip>
                    ) : null}
                    {heading.subtitle ? (
                      <span className={spotlightStyles.spotlightSubtitle}>{heading.subtitle}</span>
                    ) : null}
                  </div>
                  <div className={spotlightStyles.spotlightValue}>{item.value}</div>
                  <div className={spotlightStyles.spotlightMeta}>
                    <span className={getTrendClassNameByRate(item.wow)}>{formatSignedRatePercent(item.wow, 2)}</span>
                    <span>较上周期</span>
                  </div>
                  {miniTrendValues ? (
                    <MiniTrend
                      id={`${trendIdPrefix}-${item.key}`}
                      values={miniTrendValues}
                      labels={['上周期', '本周期']}
                      color={SPOTLIGHT_TREND_COLOR}
                      formatValue={(value) => formatMetricTrendValue(item, value)}
                      variant={miniTrendVariant}
                    />
                  ) : (
                    <div className={spotlightStyles.spotlightTrendUnavailable}>上周期对比不足</div>
                  )}
                </article>
              );
            })}
          </section>
          <div className={metricCardStyles.secondaryGridStack}>
            {resolvedBottomRows.map((row, rowIndex) => {
              const gridCountClassName = resolveMetricGridCountClassName(bottomGridColumnCounts?.[rowIndex]);
              return (
                <section
                  key={row.map((item) => item.key).join('-') || `metric-row-${rowIndex}`}
                  className={[metricCardStyles.metricGrid, metricCardStyles.liveMetricSecondaryGrid, gridCountClassName]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {row.map((item) => (
                    <article key={item.key} className={metricCardStyles.metricCard}>
                      <p className={metricCardStyles.metricCardLabel}>{item.label}</p>
                      <strong className={metricCardStyles.metricCardValue}>{item.value}</strong>
                      <div className={spotlightStyles.spotlightMeta}>
                        <span className={getTrendClassNameByRate(item.wow)}>
                          {formatSignedRatePercent(item.wow, 2)}
                        </span>
                        <span>较上周期</span>
                      </div>
                    </article>
                  ))}
                </section>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
