'use client';

import { Skeleton } from 'antd';
import shellStyles from './creator-dashboard.module.css';
import metricStyles from './creator-live-dashboard-metrics.module.css';
import { resolveMetricValueSize } from './creator-ui-utils';

export interface CreatorMetricGridItem {
  label: string;
  value: string;
  featured?: boolean;
  comparison?: {
    value: string;
    tone: 'up' | 'down' | 'neutral';
    label: string;
  };
}

export interface CreatorMetricGridProps {
  metrics: ReadonlyArray<CreatorMetricGridItem>;
  loading: boolean;
  skeletonCount?: number;
  featuredSkeletonCount?: number;
  layout?: 'default' | 'fourColumn' | 'featuredPlusFourColumn' | 'shortVideoBusinessGroups';
}

function buildMetricCardClassName(featured: boolean, extraClassName?: string): string {
  return [
    shellStyles.metricCard,
    metricStyles.liveMetricCard,
    featured ? metricStyles.liveMetricCardFeatured : null,
    extraClassName,
  ]
    .filter(Boolean)
    .join(' ');
}

function CreatorMetricSkeletonCard({ featured = false }: { featured?: boolean }) {
  return (
    <article className={buildMetricCardClassName(featured, metricStyles.liveMetricSkeletonCard)}>
      <Skeleton active title={{ width: '62%' }} paragraph={{ rows: 1, width: ['76%'] }} />
    </article>
  );
}

function CreatorMetricCard({ metric }: { metric: CreatorMetricGridItem }) {
  const valueSize = resolveMetricValueSize(metric.value);
  const metricValueClassName =
    valueSize === 'compact'
      ? metricStyles.liveMetricValueCompact
      : valueSize === 'medium'
        ? metricStyles.liveMetricValueMedium
        : metricStyles.liveMetricValueRegular;
  const trendClassName =
    metric.comparison?.tone === 'up'
      ? metricStyles.liveMetricTrendUp
      : metric.comparison?.tone === 'down'
        ? metricStyles.liveMetricTrendDown
        : metricStyles.liveMetricTrendNeutral;

  return (
    <article className={buildMetricCardClassName(Boolean(metric.featured))}>
      <p>{metric.label}</p>
      <strong className={metricValueClassName}>{metric.value}</strong>
      {metric.comparison ? (
        <div className={metricStyles.liveMetricMeta}>
          <span className={trendClassName}>{metric.comparison.value}</span>
          <span>{metric.comparison.label}</span>
        </div>
      ) : null}
    </article>
  );
}

export function CreatorMetricGrid({
  metrics,
  loading,
  skeletonCount = 6,
  featuredSkeletonCount = 0,
  layout = 'default',
}: CreatorMetricGridProps) {
  const gridClassName = [
    shellStyles.metricGrid,
    metricStyles.liveMetricGrid,
    layout === 'fourColumn' ? metricStyles.liveMetricGridFourColumn : undefined,
    layout === 'featuredPlusFourColumn'
      ? metricStyles.liveMetricGridFeaturedPlusFourColumn
      : undefined,
    layout === 'shortVideoBusinessGroups'
      ? metricStyles.liveMetricGridShortVideoBusinessGroups
      : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={gridClassName}>
      {loading
        ? Array.from({ length: skeletonCount }, (_, index) => (
            <CreatorMetricSkeletonCard
              key={`metric-skeleton-${index + 1}`}
              featured={index < featuredSkeletonCount}
            />
          ))
        : metrics.map((metric) => <CreatorMetricCard key={metric.label} metric={metric} />)}
    </section>
  );
}
