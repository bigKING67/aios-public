import type { ReactNode } from 'react';
import styles from './weekly-modern.module.css';

export interface WeeklyChartFrameProps {
  children: ReactNode;
  variant?: 'default' | 'singleFrame' | 'waterfall' | 'douyinChannelDonut';
}

const chartFrameVariantClassName: Record<
  NonNullable<WeeklyChartFrameProps['variant']>,
  string | undefined
> = {
  default: undefined,
  singleFrame: styles.singleFrameChartScope,
  waterfall: styles.goodsWaterfallScope,
  douyinChannelDonut: styles.douyinChannelDonutScope,
};

export function WeeklyChartFrame({
  children,
  variant = 'default',
}: WeeklyChartFrameProps) {
  const variantClassName = chartFrameVariantClassName[variant];
  const className = variantClassName
    ? `${styles.chartScope} ${variantClassName}`
    : styles.chartScope;

  return <div className={className}>{children}</div>;
}

export interface WeeklyChartGridProps {
  children: ReactNode;
}

export function WeeklyChartGrid({ children }: WeeklyChartGridProps) {
  return <div className={styles.chartGrid}>{children}</div>;
}
