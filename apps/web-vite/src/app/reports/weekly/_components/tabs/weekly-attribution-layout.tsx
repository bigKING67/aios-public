import type { ReactNode } from 'react';
import { WeeklyChartFrame } from './weekly-chart-layout';
import styles from './weekly-modern.module.css';

export interface WeeklyAttributionGridProps {
  children: ReactNode;
}

export function WeeklyAttributionGrid({
  children,
}: WeeklyAttributionGridProps) {
  return <div className={styles.goodsAttributionGrid}>{children}</div>;
}

export interface WeeklyAttributionTableCardProps {
  children: ReactNode;
}

export function WeeklyAttributionTableCard({
  children,
}: WeeklyAttributionTableCardProps) {
  return <article className={styles.goodsTableCard}>{children}</article>;
}

export interface WeeklyWaterfallChartFrameProps {
  children: ReactNode;
}

export function WeeklyWaterfallChartFrame({
  children,
}: WeeklyWaterfallChartFrameProps) {
  return <WeeklyChartFrame variant="waterfall">{children}</WeeklyChartFrame>;
}
