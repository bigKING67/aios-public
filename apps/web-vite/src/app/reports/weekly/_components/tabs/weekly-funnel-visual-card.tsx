import type { ReactNode } from 'react';
import styles from './weekly-modern.module.css';

export interface WeeklyFunnelVisualCardProps {
  badge: string;
  children: ReactNode;
}

export function WeeklyFunnelVisualCard({
  badge,
  children,
}: WeeklyFunnelVisualCardProps) {
  return (
    <div className={styles.funnelVisualCard}>
      <div className={styles.funnelVisualHeader}>
        <span className={styles.funnelVisualBadge}>{badge}</span>
      </div>
      {children}
    </div>
  );
}
