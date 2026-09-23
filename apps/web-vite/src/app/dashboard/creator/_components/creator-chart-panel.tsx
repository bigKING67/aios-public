'use client';

import { Empty, Skeleton } from 'antd';
import type { EChartsCoreOption } from 'echarts/core';
import shellStyles from './creator-dashboard.module.css';
import styles from './creator-live-dashboard.module.css';
import { useCreatorChartInstance } from './creator-chart-instance';

export interface CreatorChartPanelProps {
  title: string;
  subtitle: string;
  option?: EChartsCoreOption;
  loading?: boolean;
  emptyText?: string;
  className?: string;
  onChartClick?: (params: unknown) => void;
}

export function CreatorChartPanel({
  title,
  subtitle,
  option,
  loading,
  emptyText,
  className,
  onChartClick,
}: CreatorChartPanelProps) {
  const containerRef = useCreatorChartInstance({ option, onChartClick });
  const hasOption = Boolean(option);
  const showSkeleton = Boolean(loading && !hasOption);
  const showEmpty = Boolean(!loading && !hasOption);

  return (
    <article className={`${shellStyles.chartPanel}${className ? ` ${className}` : ''}`}>
      <header className={shellStyles.chartHead}>
        <div className={shellStyles.chartHeadMain}>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </header>
      <div className={styles.chartFrame}>
        <div
          ref={containerRef}
          className={`${styles.chartCanvas}${hasOption ? '' : ` ${styles.chartCanvasHidden}`}`}
          aria-hidden={!hasOption}
        />
        {showSkeleton ? (
          <div className={styles.chartOverlay}>
            <div className={styles.chartSkeleton}>
              <Skeleton active title={false} paragraph={{ rows: 7 }} />
            </div>
          </div>
        ) : null}
        {showEmpty ? (
          <div className={styles.chartOverlay}>
            <div className={styles.chartEmptyState}>
              <Empty description={emptyText || '当前区间暂无数据'} />
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
